import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  conversationFindFirst: vi.fn(),
  messageFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
}));

vi.mock("@/lib/messaging-auth", () => ({
  getMessagingAccess: mocks.getMessagingAccess,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: { findFirst: mocks.conversationFindFirst },
    conversationMessage: {
      findFirst: mocks.messageFindFirst,
      findMany: mocks.messageFindMany,
    },
  },
}));

import { GET } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "session",
  });
  mocks.conversationFindFirst.mockResolvedValue({
    id: 20,
    userId: 7,
    contact: { id: 10 },
    cases: [],
  });
});

describe("GET /api/messaging/conversations/[id]/context", () => {
  it("returns messages chronologically and a cursor when more history exists", async () => {
    mocks.messageFindMany.mockResolvedValue([
      { id: 5, textContent: "nuevo" },
      { id: 4, textContent: "medio" },
      { id: 3, textContent: "más antiguo" },
    ]);

    const response = await GET(
      new NextRequest("http://localhost/api/messaging/conversations/20/context?limit=2"),
      { params: Promise.resolve({ id: "20" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.messages.map((message: { id: number }) => message.id)).toEqual([4, 5]);
    expect(body.pagination).toEqual({
      hasMore: true,
      historyExhausted: false,
      nextBeforeMessageId: 4,
    });
  });

  it("reports exhausted history so the caller can assign a human", async () => {
    mocks.messageFindMany.mockResolvedValue([{ id: 1, textContent: "único" }]);

    const response = await GET(
      new NextRequest("http://localhost/api/messaging/conversations/20/context"),
      { params: Promise.resolve({ id: "20" }) },
    );
    const body = await response.json();

    expect(body.pagination.historyExhausted).toBe(true);
    expect(body.pagination.nextBeforeMessageId).toBeNull();
  });
});
