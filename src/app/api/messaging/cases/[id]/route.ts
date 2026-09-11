import { NextRequest, NextResponse } from "next/server";
import { logAudit } from "@/lib/audit";
import { getMessagingAccess, type MessagingAccess } from "@/lib/messaging-auth";
import { parseCasePatchInput } from "@/lib/messaging-cases";
import { MessagingValidationError, parsePositiveId } from "@/lib/messaging";
import { canManageProperty } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const caseId = parsePositiveId((await params).id, "caseId");
    const input = parseCasePatchInput(await request.json());
    const existing = await prisma.conversationCase.findFirst({
      where: { id: caseId, conversation: { userId: access.userId } },
      select: {
        id: true,
        conversationId: true,
        reservationId: true,
        propertyId: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    const reservationId =
      input.reservationId === undefined ? existing.reservationId : input.reservationId;
    if (input.propertyId === null && reservationId !== null) {
      throw new MessagingValidationError("A case with a reservation must keep its property");
    }
    const requestedPropertyId =
      input.propertyId !== undefined
        ? input.propertyId
        : input.reservationId !== undefined && reservationId !== null
          ? null
          : existing.propertyId;
    const propertyId = await resolveLinkedProperty(
      reservationId,
      requestedPropertyId,
      access,
    );

    const result = await prisma.$transaction(async (tx) => {
      if (input.messageIds) {
        const messages = await tx.conversationMessage.findMany({
          where: { id: { in: input.messageIds }, conversationId: existing.conversationId },
          select: { id: true, caseId: true },
        });
        if (
          messages.length !== input.messageIds.length ||
          messages.some((message) => message.caseId && message.caseId !== caseId)
        ) {
          throw new MessageConflictError();
        }
      }

      const data: Record<string, unknown> = {
        ...(input.reservationId !== undefined ? { reservationId } : {}),
        ...(input.propertyId !== undefined || input.reservationId !== undefined
          ? { propertyId }
          : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.resolution !== undefined ? { resolution: input.resolution } : {}),
      };

      if (input.action === "assign_human") {
        Object.assign(data, {
          status: "human_assigned",
          assignedToUserId: access.userId,
          closedAt: null,
        });
      } else if (input.action === "resolve" || input.action === "close") {
        Object.assign(data, {
          status: input.action === "resolve" ? "resolved" : "closed",
          assignedToUserId: null,
          closedAt: new Date(),
        });
      } else if (input.action === "reopen") {
        Object.assign(data, {
          status: "new",
          assignedToUserId: null,
          resolution: null,
          closedAt: null,
        });
      }

      const conversationCase = await tx.conversationCase.update({
        where: { id: caseId },
        data,
      });
      if (input.messageIds) {
        await tx.conversationMessage.updateMany({
          where: {
            id: { in: input.messageIds },
            conversationId: existing.conversationId,
            OR: [{ caseId: null }, { caseId }],
          },
          data: { caseId },
        });
      }

      if (input.action === "assign_human") {
        await tx.conversation.update({
          where: { id: existing.conversationId },
          data: {
            status: "human_assigned",
            assignedToUserId: access.userId,
            assignmentReason: `Case ${caseId} requires human attention`,
          },
        });
      } else if (input.action === "resolve" || input.action === "close") {
        const otherHumanCases = await tx.conversationCase.count({
          where: {
            conversationId: existing.conversationId,
            id: { not: caseId },
            status: "human_assigned",
          },
        });
        if (otherHumanCases === 0) {
          await tx.conversation.updateMany({
            where: {
              id: existing.conversationId,
              status: "human_assigned",
              assignmentReason: { startsWith: "Case " },
            },
            data: { status: "active", assignedToUserId: null, assignmentReason: null },
          });
        }
      }
      return conversationCase;
    });

    await logAudit(access.userId, "update", "conversationCase", caseId, {
      action: input.action,
      messageIds: input.messageIds,
    });
    return NextResponse.json({ conversationCase: result });
  } catch (error) {
    if (error instanceof MessagingValidationError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof SyntaxError ? "Invalid JSON body" : error.message },
        { status: 400 },
      );
    }
    if (error instanceof LinkedResourceNotFoundError) {
      return NextResponse.json({ error: "Reservation or property not found" }, { status: 404 });
    }
    if (error instanceof MessageConflictError) {
      return NextResponse.json(
        { error: "Messages must belong to this conversation and case" },
        { status: 409 },
      );
    }
    console.error("Conversation case update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
