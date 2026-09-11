import { MessagingValidationError } from "@/lib/messaging";

const CASE_TYPES = new Set([
  "unknown",
  "availability",
  "reservation",
  "payment",
  "arrival",
  "departure",
  "incident",
  "cancellation",
  "guarantee",
  "complaint",
  "property_management",
]);
const CASE_STATUSES = new Set([
  "new",
  "waiting_info",
  "quote_ready",
  "awaiting_customer",
  "awaiting_payment",
  "confirmed",
  "pre_arrival",
  "checked_in",
  "incident_open",
  "checkout",
  "refund_pending",
  "human_assigned",
  "resolved",
  "closed",
]);
const ACTIVE_CASE_STATUSES = new Set(
  [...CASE_STATUSES].filter(
    (status) => !["human_assigned", "resolved", "closed"].includes(status),
  ),
);
const CASE_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const CASE_ACTIONS = new Set([
  "update",
  "assign_human",
  "resolve",
  "close",
  "reopen",
]);

export type CaseInput = {
  conversationId: number;
  messageIds: number[];
  reservationId: number | null;
  propertyId: number | null;
  type: string;
  status: string;
  priority: string;
  summary: string;
};

export type CasePatchInput = {
  action: "update" | "assign_human" | "resolve" | "close" | "reopen";
  messageIds?: number[];
  reservationId?: number | null;
  propertyId?: number | null;
  type?: string;
  status?: string;
  priority?: string;
  summary?: string;
  resolution?: string | null;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MessagingValidationError("Invalid case data");
  }
  return value as Record<string, unknown>;
}

function positiveId(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return value as number;
}

function nullableId(value: unknown, field: string): number | null {
  return value === null ? null : positiveId(value, field);
}

function enumField(
  value: unknown,
  field: string,
  allowed: Set<string>,
): string {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new MessagingValidationError(`${field} is invalid`);
  }
  return value;
}

function textField(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new MessagingValidationError(`${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new MessagingValidationError(`${field} is too long`);
  }
  return normalized;
}

function messageIds(value: unknown, required: boolean): number[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) {
    throw new MessagingValidationError("messageIds must contain between 1 and 100 IDs");
  }
  const ids = value.map((id) => positiveId(id, "messageId"));
  if (new Set(ids).size !== ids.length) {
    throw new MessagingValidationError("messageIds must not contain duplicates");
  }
  return ids;
}

export function parseCaseInput(value: unknown): CaseInput {
  const body = record(value);
  return {
    conversationId: positiveId(body.conversationId, "conversationId"),
    messageIds: messageIds(body.messageIds, true)!,
    reservationId:
      body.reservationId === undefined ? null : nullableId(body.reservationId, "reservationId"),
    propertyId:
      body.propertyId === undefined ? null : nullableId(body.propertyId, "propertyId"),
    type:
      body.type === undefined
        ? "unknown"
        : enumField(body.type, "type", CASE_TYPES),
    status:
      body.status === undefined
        ? "new"
        : enumField(body.status, "status", ACTIVE_CASE_STATUSES),
    priority:
      body.priority === undefined
        ? "normal"
        : enumField(body.priority, "priority", CASE_PRIORITIES),
    summary:
      body.summary === undefined ? "" : textField(body.summary, "summary", 10_000),
  };
}

export function parseCasePatchInput(value: unknown): CasePatchInput {
  const body = record(value);
  const action = enumField(body.action, "action", CASE_ACTIONS) as CasePatchInput["action"];
  const parsed: CasePatchInput = { action };

  if (body.messageIds !== undefined) parsed.messageIds = messageIds(body.messageIds, false);
  if (body.reservationId !== undefined) {
    parsed.reservationId = nullableId(body.reservationId, "reservationId");
  }
  if (body.propertyId !== undefined) {
    parsed.propertyId = nullableId(body.propertyId, "propertyId");
  }
  if (body.type !== undefined) parsed.type = enumField(body.type, "type", CASE_TYPES);
  if (body.status !== undefined) {
    parsed.status = enumField(body.status, "status", CASE_STATUSES);
  }
  if (body.priority !== undefined) {
    parsed.priority = enumField(body.priority, "priority", CASE_PRIORITIES);
  }
  if (body.summary !== undefined) {
    parsed.summary = textField(body.summary, "summary", 10_000);
  }
  if (body.resolution !== undefined) {
    parsed.resolution =
      body.resolution === null
        ? null
        : textField(body.resolution, "resolution", 10_000);
  }

  if (action === "update" && Object.keys(parsed).length === 1) {
    throw new MessagingValidationError("At least one case field is required");
  }
  if (
    action === "update" &&
    parsed.status !== undefined &&
    !ACTIVE_CASE_STATUSES.has(parsed.status)
  ) {
    throw new MessagingValidationError(
      "Use assign_human, resolve, or close for that status",
    );
  }
  return parsed;
}
