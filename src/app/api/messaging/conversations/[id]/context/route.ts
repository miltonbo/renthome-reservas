import { NextRequest, NextResponse } from "next/server";
import { getMessagingAccess } from "@/lib/messaging-auth";
import {
  MessagingValidationError,
  parseHistoryLimit,
  parsePositiveId,
} from "@/lib/messaging";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const conversationId = parsePositiveId((await params).id, "conversationId");
    const limit = parseHistoryLimit(request.nextUrl.searchParams.get("limit"));
    const beforeValue = request.nextUrl.searchParams.get("beforeMessageId");
    const beforeMessageId = beforeValue
      ? parsePositiveId(beforeValue, "beforeMessageId")
      : null;

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: access.userId },
      include: {
        contact: true,
        cases: {
          orderBy: { updatedAt: "desc" },
          include: {
            reservation: {
              select: {
                id: true,
                name: true,
                checkIn: true,
                checkOut: true,
                status: true,
                propertyId: true,
              },
            },
            property: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (beforeMessageId) {
      const cursor = await prisma.conversationMessage.findFirst({
        where: { id: beforeMessageId, conversationId },
        select: { id: true },
      });
      if (!cursor) {
        throw new MessagingValidationError("beforeMessageId is not in this conversation");
      }
    }

    const page = await prisma.conversationMessage.findMany({
      where: {
        conversationId,
        ...(beforeMessageId ? { id: { lt: beforeMessageId } } : {}),
      },
      orderBy: { id: "desc" },
      take: limit + 1,
    });
    const hasMore = page.length > limit;
    const selectedDescending = page.slice(0, limit);
    const messages = [...selectedDescending].reverse();

    return NextResponse.json(
      {
        conversation,
        messages,
        pagination: {
          hasMore,
          historyExhausted: !hasMore,
          nextBeforeMessageId: hasMore
            ? selectedDescending[selectedDescending.length - 1]?.id ?? null
            : null,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof MessagingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Conversation context route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
