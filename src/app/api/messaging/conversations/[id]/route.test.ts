import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  conversationFindFirst: vi.fn(),
  conversationUpdate: vi.fn(),
}));

vi.mock("@/lib/messaging-auth", () => ({
  getMessagingAccess: mocks.getMessagingAccess,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    conversation: {
      findFirst: mocks.conversationFindFirst,
      update: mocks.conversationUpdate,
    },
  },
}));

import { PATCH } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "session",
  });
  mocks.conversationFindFirst.mockResolvedValue({ id: 20 });
  mocks.conversationUpdate.mockResolvedValue({
    id: 20,
    status: "human_assigned",
    assignedToUserId: 7,
  });
});

it("assigns the conversation to a human when context is insufficient", async () => {
  const response = await PATCH(
    new NextRequest("http://localhost/api/messaging/conversations/20", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "assign_human",
        reason: "No hay más historial disponible",
      }),
    }),
    { params: Promise.resolve({ id: "20" }) },
  );

  expect(response.status).toBe(200);
  expect(mocks.conversationUpdate).toHaveBeenCalledWith({
    where: { id: 20 },
    data: {
      status: "human_assigned",
      assignedToUserId: 7,
      assignmentReason: "No hay más historial disponible",
    },
  });
});
