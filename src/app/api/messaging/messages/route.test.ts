import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  transaction: vi.fn(),
  contactUpsert: vi.fn(),
  conversationUpsert: vi.fn(),
  conversationUpdate: vi.fn(),
  messageFindFirst: vi.fn(),
  messageCreate: vi.fn(),
  caseFindFirst: vi.fn(),
}));

vi.mock("@/lib/messaging-auth", () => ({
  getMessagingAccess: mocks.getMessagingAccess,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { POST } from "./route";

const tx = {
  messagingContact: { upsert: mocks.contactUpsert },
  conversation: {
    upsert: mocks.conversationUpsert,
    update: mocks.conversationUpdate,
  },
  conversationMessage: {
    findFirst: mocks.messageFindFirst,
    create: mocks.messageCreate,
  },
  conversationCase: { findFirst: mocks.caseFindFirst },
};

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/messaging/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      externalContactId: "59170000000",
      providerMessageId: "wamid.123",
      direction: "inbound",
      textContent: "¿Tiene disponibilidad para hoy?",
      occurredAt: "2026-09-11T12:00:00.000Z",
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "session",
  });
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.contactUpsert.mockResolvedValue({ id: 10, userId: 7 });
  mocks.conversationUpsert.mockResolvedValue({
    id: 20,
    userId: 7,
    contactId: 10,
    lastMessageAt: null,
  });
  mocks.messageFindFirst.mockResolvedValue(null);
  mocks.messageCreate.mockResolvedValue({ id: 30, conversationId: 20 });
  mocks.conversationUpdate.mockResolvedValue({ id: 20 });
});

describe("POST /api/messaging/messages", () => {
  it("creates a lightweight message and updates the conversation", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.messageCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 20,
        providerMessageId: "wamid.123",
        messageType: "text",
        textContent: "¿Tiene disponibilidad para hoy?",
      }),
    });
    expect(mocks.conversationUpdate).toHaveBeenCalled();
  });

  it("returns the existing row when Meta retries the same webhook", async () => {
    mocks.messageFindFirst.mockResolvedValue({
      id: 31,
      conversationId: 20,
      providerMessageId: "wamid.123",
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(mocks.messageCreate).not.toHaveBeenCalled();
  });

  it("rejects binary media-shaped input", async () => {
    const response = await POST(request({ mediaBase64: "abc" }));

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
