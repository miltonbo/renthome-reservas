import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getMessagingAccess, type MessagingAccess } from "@/lib/messaging-auth";
import { parseCaseInput } from "@/lib/messaging-cases";
import { MessagingValidationError } from "@/lib/messaging";
import { canManageProperty } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class ConversationNotFoundError extends Error {}
class LinkedResourceNotFoundError extends Error {}
class MessageConflictError extends Error {}

async function resolveLinkedProperty(
  reservationId: number | null,
  propertyId: number | null,
  access: MessagingAccess,
): Promise<number | null> {
  let reservationPropertyId: number | null = null;
  if (reservationId) {
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: { propertyId: true },
    });
    if (
      !reservation ||
      !(await canManageProperty(reservation.propertyId, access.userId, access.role))
    ) {
      throw new LinkedResourceNotFoundError();
    }
    reservationPropertyId = reservation.propertyId;
  }

  if (propertyId && !(await canManageProperty(propertyId, access.userId, access.role))) {
    throw new LinkedResourceNotFoundError();
  }
  if (reservationPropertyId && propertyId && reservationPropertyId !== propertyId) {
    throw new MessagingValidationError("Reservation does not belong to property");
  }
  return propertyId ?? reservationPropertyId;
}
export async function POST(request: NextRequest) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const input = parseCaseInput(await request.json());
    const propertyId = await resolveLinkedProperty(
      input.reservationId,
      input.propertyId,
      access,
    );

    const result = await prisma.$transaction(async (tx) => {
      const conversation = await tx.conversation.findFirst({
        where: { id: input.conversationId, userId: access.userId },
        select: { id: true },
      });
      if (!conversation) throw new ConversationNotFoundError();

      const messages = await tx.conversationMessage.findMany({
        where: { id: { in: input.messageIds }, conversationId: input.conversationId },
        select: { id: true, caseId: true },
      });
      if (messages.length !== input.messageIds.length) {
        throw new MessageConflictError();
      }

      const assignedCaseIds = new Set(
        messages.flatMap((message) => (message.caseId ? [message.caseId] : [])),
      );
      if (assignedCaseIds.size === 1 && messages.every((message) => message.caseId)) {
        const existingCase = await tx.conversationCase.findFirst({
          where: {
            id: [...assignedCaseIds][0],
            conversationId: input.conversationId,
          },
        });
        if (existingCase) return { conversationCase: existingCase, duplicate: true };
      }
      if (assignedCaseIds.size > 0) throw new MessageConflictError();

      const conversationCase = await tx.conversationCase.create({
        data: {
          conversationId: input.conversationId,
          reservationId: input.reservationId,
          propertyId,
          type: input.type,
          status: input.status,
          priority: input.priority,
          summary: input.summary,
        },
      });
      const attached = await tx.conversationMessage.updateMany({
        where: {
          id: { in: input.messageIds },
          conversationId: input.conversationId,
          caseId: null,
        },
        data: { caseId: conversationCase.id },
      });
      if (attached.count !== input.messageIds.length) throw new MessageConflictError();
      return { conversationCase, duplicate: false };
    });

    if (!result.duplicate) {
      await logAudit(access.userId, "create", "conversationCase", result.conversationCase.id, {
        conversationId: input.conversationId,
        messageIds: input.messageIds,
        type: input.type,
      });
    }
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof MessagingValidationError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof SyntaxError ? "Invalid JSON body" : error.message },
        { status: 400 },
      );
    }
    if (error instanceof ConversationNotFoundError) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    if (error instanceof LinkedResourceNotFoundError) {
      return NextResponse.json({ error: "Reservation or property not found" }, { status: 404 });
    }
    if (error instanceof MessageConflictError) {
      return NextResponse.json(
        { error: "Messages must belong to this conversation and be unassigned" },
        { status: 409 },
      );
    }
    console.error("Conversation case create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
