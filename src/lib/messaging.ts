const CHANNELS = new Set(["whatsapp"]);
const DIRECTIONS = new Set(["inbound", "outbound"]);
const AUTHOR_TYPES = new Set(["customer", "human", "ai", "system"]);
const MESSAGE_TYPES = new Set([
  "text",
  "audio",
  "image",
  "video",
  "document",
  "unknown",
]);
const PROCESSING_STATUSES = new Set(["completed", "failed", "not_required"]);

// Deliberately reject binary/media-shaped fields. The messaging database is a
// text-only memory; integrations must transcribe/interpret media and discard
// their temporary files before calling this API.
const FORBIDDEN_MEDIA_FIELDS = [
  "media",
  "mediaUrl",
  "mediaData",
  "mediaBase64",
  "file",
  "attachment",
  "buffer",
] as const;

export class MessagingValidationError extends Error {}

export type MessageInput = {
  channel: "whatsapp";
  externalContactId: string;
  displayName: string;
  providerMessageId: string | null;
  direction: "inbound" | "outbound";
  authorType: "customer" | "human" | "ai" | "system";
  messageType: "text" | "audio" | "image" | "video" | "document" | "unknown";
  textContent: string;
  language: string | null;
  interpretationConfidence: number | null;
  processingStatus: "completed" | "failed" | "not_required";
  requiresHumanReview: boolean;
  replyToProviderMessageId: string | null;
  occurredAt: Date;
  caseId: number | null;
};

function optionalString(
  value: unknown,
  field: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new MessagingValidationError(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return normalized;
}

function enumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: Set<string>,
  fallback?: T,
): T {
  const candidate = value === undefined ? fallback : value;
  if (typeof candidate !== "string" || !allowed.has(candidate)) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return candidate as T;
}

export function parseMessageInput(value: unknown): MessageInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MessagingValidationError("Invalid message data");
  }
  const body = value as Record<string, unknown>;

  for (const field of FORBIDDEN_MEDIA_FIELDS) {
    if (body[field] !== undefined) {
      throw new MessagingValidationError(
        `${field} is not accepted; store only the textual interpretation`,
      );
    }
  }

  const channel = enumValue<"whatsapp">(
    body.channel,
    "channel",
    CHANNELS,
    "whatsapp",
  );
  const externalContactId = optionalString(
    body.externalContactId,
    "externalContactId",
    200,
  );
  if (!externalContactId) {
    throw new MessagingValidationError("externalContactId is required");
  }

  const direction = enumValue<MessageInput["direction"]>(
    body.direction,
    "direction",
    DIRECTIONS,
  );
  const authorType = enumValue<MessageInput["authorType"]>(
    body.authorType,
    "authorType",
    AUTHOR_TYPES,
    direction === "inbound" ? "customer" : "human",
  );
  const messageType = enumValue<MessageInput["messageType"]>(
    body.messageType,
    "messageType",
    MESSAGE_TYPES,
    "text",
  );
  const processingStatus = enumValue<MessageInput["processingStatus"]>(
    body.processingStatus,
    "processingStatus",
    PROCESSING_STATUSES,
    messageType === "text" ? "not_required" : "completed",
  );

  if (body.textContent !== undefined && typeof body.textContent !== "string") {
    throw new MessagingValidationError("textContent must be a string");
  }
  const textContent = (body.textContent as string | undefined)?.trim() ?? "";
  if (textContent.length > 50_000) {
    throw new MessagingValidationError("textContent is too long");
  }
  if (!textContent && processingStatus !== "failed") {
    throw new MessagingValidationError(
      "textContent is required unless processingStatus is failed",
    );
  }

  let interpretationConfidence: number | null = null;
  if (body.interpretationConfidence !== undefined && body.interpretationConfidence !== null) {
    if (
      typeof body.interpretationConfidence !== "number" ||
      !Number.isFinite(body.interpretationConfidence) ||
      body.interpretationConfidence < 0 ||
      body.interpretationConfidence > 1
    ) {
      throw new MessagingValidationError(
        "interpretationConfidence must be between 0 and 1",
      );
    }
    interpretationConfidence = body.interpretationConfidence;
  }

  if (
    body.requiresHumanReview !== undefined &&
    typeof body.requiresHumanReview !== "boolean"
  ) {
    throw new MessagingValidationError("requiresHumanReview must be a boolean");
  }

  const rawOccurredAt = body.occurredAt ?? new Date().toISOString();
  if (typeof rawOccurredAt !== "string") {
    throw new MessagingValidationError("occurredAt must be an ISO date string");
  }
  const occurredAt = new Date(rawOccurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    throw new MessagingValidationError("occurredAt is invalid");
  }

  let caseId: number | null = null;
  if (body.caseId !== undefined && body.caseId !== null) {
    if (!Number.isInteger(body.caseId) || (body.caseId as number) <= 0) {
      throw new MessagingValidationError("caseId is invalid");
    }
    caseId = body.caseId as number;
  }

  return {
    channel,
    externalContactId,
    displayName: optionalString(body.displayName, "displayName", 200) ?? "",
    providerMessageId: optionalString(
      body.providerMessageId,
      "providerMessageId",
      500,
    ),
    direction,
    authorType,
    messageType,
    textContent,
    language: optionalString(body.language, "language", 20),
    interpretationConfidence,
    processingStatus,
    requiresHumanReview: body.requiresHumanReview ?? processingStatus === "failed",
    replyToProviderMessageId: optionalString(
      body.replyToProviderMessageId,
      "replyToProviderMessageId",
      500,
    ),
    occurredAt,
    caseId,
  };
}

export function parseHistoryLimit(value: string | null): number {
  if (value === null) return 20;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new MessagingValidationError("limit must be between 1 and 100");
  }
  return limit;
}

export function parsePositiveId(value: string, field: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return id;
}
