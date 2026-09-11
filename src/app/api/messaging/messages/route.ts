import { NextRequest, NextResponse } from "next/server";
import { getMessagingAccess } from "@/lib/messaging-auth";
import {
  MessagingValidationError,
  parseMessageInput,
} from "@/lib/messaging";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

class RelatedCaseNotFoundError extends Error {}

export async function POST(request: NextRequest) {
  try {
    const access = await getMessagingAccess(request);
    if (!access) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input = parseMessageInput(await request.json());
    const result = await prisma.$transaction(async (tx) => {
      const contact = await tx.messagingContact.upsert({
        where: {
          userId_channel_externalId: {
            userId: access.userId,
            channel: input.channel,
            externalId: input.externalContactId,
          },
        },
        create: {
          userId: access.userId,
          channel: input.channel,
          externalId: input.externalContactId,
          displayName: input.displayName,
          language: input.language,
        },
        update: {
          ...(input.displayName ? { displayName: input.displayName } : {}),
          ...(input.language ? { language: input.language } : {}),
        },
      });

      const conversation = await tx.conversation.upsert({
        where: {
          userId_channel_contactId: {
            userId: access.userId,
            channel: input.channel,
            contactId: contact.id,
          },
        },
        create: {
          userId: access.userId,
          contactId: contact.id,
          channel: input.channel,
          lastMessageAt: input.occurredAt,
        },
        update: {},
      });

      if (input.providerMessageId) {
        const existing = await tx.conversationMessage.findFirst({
          where: {
            conversationId: conversation.id,
            providerMessageId: input.providerMessageId,
          },
        });
        if (existing) {
          return { contact, conversation, message: existing, duplicate: true };
        }
      }

      if (input.caseId) {
        const relatedCase = await tx.conversationCase.findFirst({
          where: { id: input.caseId, conversationId: conversation.id },
          select: { id: true },
        });
        if (!relatedCase) throw new RelatedCaseNotFoundError();
      }

      const message = await tx.conversationMessage.create({
        data: {
          conversationId: conversation.id,
          caseId: input.caseId,
          providerMessageId: input.providerMessageId,
          direction: input.direction,
          authorType: input.authorType,
          messageType: input.messageType,
          textContent: input.textContent,
          language: input.language,
          interpretationConfidence: input.interpretationConfidence,
          processingStatus: input.processingStatus,
          requiresHumanReview: input.requiresHumanReview,
          replyToProviderMessageId: input.replyToProviderMessageId,
          occurredAt: input.occurredAt,
        },
      });

      if (!conversation.lastMessageAt || input.occurredAt > conversation.lastMessageAt) {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: input.occurredAt },
        });
      }

      return { contact, conversation, message, duplicate: false };
    });

    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof MessagingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof RelatedCaseNotFoundError) {
      return NextResponse.json(
        { error: "Case does not belong to this conversation" },
        { status: 404 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    console.error("Messaging route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
