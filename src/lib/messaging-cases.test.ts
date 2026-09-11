import { describe, expect, it } from "vitest";
import { MessagingValidationError } from "./messaging";
import { parseCaseInput, parseCasePatchInput } from "./messaging-cases";

describe("parseCaseInput", () => {
  it("normalizes a case created from its triggering messages", () => {
    expect(
      parseCaseInput({
        conversationId: 20,
        messageIds: [30, 31],
        type: "availability",
        summary: "  Consulta para hoy  ",
      }),
    ).toMatchObject({
      conversationId: 20,
      messageIds: [30, 31],
      type: "availability",
      status: "new",
      priority: "normal",
      summary: "Consulta para hoy",
    });
  });

  it("requires a triggering message so retries can be idempotent", () => {
    expect(() => parseCaseInput({ conversationId: 20, messageIds: [] })).toThrow(
      MessagingValidationError,
    );
  });

  it("rejects unsupported workflow values", () => {
    expect(() =>
      parseCaseInput({ conversationId: 20, messageIds: [30], type: "invented" }),
    ).toThrow(MessagingValidationError);
    expect(() =>
      parseCaseInput({ conversationId: 20, messageIds: [30], status: "resolved" }),
    ).toThrow(MessagingValidationError);
  });
});

describe("parseCasePatchInput", () => {
  it("accepts controlled human and lifecycle actions", () => {
    expect(parseCasePatchInput({ action: "assign_human" })).toEqual({
      action: "assign_human",
    });
    expect(
      parseCasePatchInput({ action: "resolve", resolution: "Respondido por Telegram" }),
    ).toMatchObject({ action: "resolve", resolution: "Respondido por Telegram" });
  });

  it("does not accept an empty generic update", () => {
    expect(() => parseCasePatchInput({ action: "update" })).toThrow(
      MessagingValidationError,
    );
  });

  it("requires explicit lifecycle actions for terminal states", () => {
    expect(() =>
      parseCasePatchInput({ action: "update", status: "human_assigned" }),
    ).toThrow(MessagingValidationError);
  });
});
