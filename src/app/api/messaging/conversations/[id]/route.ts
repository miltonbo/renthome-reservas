import { NextRequest, NextResponse } from "next/server";
import { getMessagingAccess } from "@/lib/messaging-auth";
import {
  MessagingValidationError,
  parsePositiveId,
} from "@/lib/messaging";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["assign_human", "reactivate", "close"]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const conversationId = parsePositiveId((await params).id, "conversationId");
    const body = await request.json();
    if (!body || typeof body !== "object" || !ACTIONS.has(body.action)) {
      throw new MessagingValidationError("action is invalid");
    }

    const existing = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: access.userId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    let data: {
      status: string;
      assignedToUserId: number | null;
      assignmentReason: string | null;
    };
    if (body.action === "assign_human") {
      if (body.reason !== undefined && typeof body.reason !== "string") {
        throw new MessagingValidationError("reason must be a string");
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length > 1_000) {
        throw new MessagingValidationError("reason is too long");
      }
      data = {
        status: "human_assigned",
        assignedToUserId: access.userId,
        assignmentReason: reason || "Insufficient conversation history",
      };
    } else {
      data = {
        status: body.action === "close" ? "closed" : "active",
        assignedToUserId: null,
        assignmentReason: null,
      };
    }

    const conversation = await prisma.conversation.update({
      where: { id: conversationId },
      data,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    if (error instanceof MessagingValidationError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof SyntaxError ? "Invalid JSON body" : error.message },
        { status: 400 },
      );
    }
    console.error("Conversation assignment route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
