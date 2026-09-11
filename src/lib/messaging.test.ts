import { describe, expect, it } from "vitest";
import {
  MessagingValidationError,
  parseHistoryLimit,
  parseMessageInput,
} from "./messaging";

describe("parseMessageInput", () => {
  it("accepts a text-only interpretation of an audio message", () => {
    const parsed = parseMessageInput({
      externalContactId: "59170000000",
      providerMessageId: "wamid.123",
      direction: "inbound",
      messageType: "audio",
      textContent: "El huésped indica que no puede ingresar.",
      interpretationConfidence: 0.92,
      occurredAt: "2026-09-11T12:00:00.000Z",
    });

    expect(parsed).toMatchObject({
      channel: "whatsapp",
      authorType: "customer",
      messageType: "audio",
      processingStatus: "completed",
      requiresHumanReview: false,
    });
  });

  it("rejects media content and URLs", () => {
    expect(() =>
      parseMessageInput({
        externalContactId: "59170000000",
        direction: "inbound",
        messageType: "image",
        textContent: "Comprobante pendiente de revisión.",
        mediaUrl: "https://example.test/file.jpg",
      }),
    ).toThrow(MessagingValidationError);
  });

  it("allows a failed media analysis without invented text and flags review", () => {
    const parsed = parseMessageInput({
      externalContactId: "59170000000",
      direction: "inbound",
      messageType: "video",
      processingStatus: "failed",
      textContent: "",
    });

    expect(parsed.requiresHumanReview).toBe(true);
    expect(parsed.textContent).toBe("");
  });
});

describe("parseHistoryLimit", () => {
  it("defaults to 20 and accepts up to 100 messages", () => {
    expect(parseHistoryLimit(null)).toBe(20);
    expect(parseHistoryLimit("100")).toBe(100);
  });

  it("rejects unbounded history requests", () => {
    expect(() => parseHistoryLimit("101")).toThrow(MessagingValidationError);
  });
});
