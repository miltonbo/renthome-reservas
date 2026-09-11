import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  canManageProperty: vi.fn(),
  logAudit: vi.fn(),
  reservationFindUnique: vi.fn(),
  caseFindFirst: vi.fn(),
  transaction: vi.fn(),
  caseUpdate: vi.fn(),
  caseCount: vi.fn(),
  messageFindMany: vi.fn(),
  messageUpdateMany: vi.fn(),
  conversationUpdate: vi.fn(),
  conversationUpdateMany: vi.fn(),
}));

vi.mock("@/lib/messaging-auth", () => ({
  getMessagingAccess: mocks.getMessagingAccess,
}));
vi.mock("@/lib/ownership", () => ({
  canManageProperty: mocks.canManageProperty,
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    reservation: { findUnique: mocks.reservationFindUnique },
    conversationCase: { findFirst: mocks.caseFindFirst },
    $transaction: mocks.transaction,
  },
}));

import { PATCH } from "./route";

const tx = {
  conversationCase: {
    update: mocks.caseUpdate,
    count: mocks.caseCount,
  },
  conversationMessage: {
    findMany: mocks.messageFindMany,
    updateMany: mocks.messageUpdateMany,
  },
  conversation: {
    update: mocks.conversationUpdate,
    updateMany: mocks.conversationUpdateMany,
  },
};

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/messaging/cases/40", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: "40" }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "api_key",
  });
  mocks.caseFindFirst.mockResolvedValue({
    id: 40,
    conversationId: 20,
    reservationId: null,
    propertyId: null,
  });
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.caseUpdate.mockResolvedValue({ id: 40, conversationId: 20 });
  mocks.caseCount.mockResolvedValue(0);
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.canManageProperty.mockResolvedValue(true);
});

describe("PATCH /api/messaging/cases/:id", () => {
  it("assigns both the case and conversation to a human", async () => {
    const response = await PATCH(request({ action: "assign_human" }), params);

    expect(response.status).toBe(200);
    expect(mocks.caseUpdate).toHaveBeenCalledWith({
      where: { id: 40 },
      data: expect.objectContaining({
        status: "human_assigned",
        assignedToUserId: 7,
        closedAt: null,
      }),
    });
    expect(mocks.conversationUpdate).toHaveBeenCalledWith({
      where: { id: 20 },
      data: expect.objectContaining({ status: "human_assigned" }),
    });
  });

  it("resolves the case and reactivates the conversation when no human case remains", async () => {
    const response = await PATCH(
      request({ action: "resolve", resolution: "La administradora respondió" }),
      params,
    );

    expect(response.status).toBe(200);
    expect(mocks.caseCount).toHaveBeenCalled();
    expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
      where: {
        id: 20,
        status: "human_assigned",
        assignmentReason: { startsWith: "Case " },
      },
      data: { status: "active", assignedToUserId: null, assignmentReason: null },
    });
  });

  it("keeps the conversation assigned while another human case remains", async () => {
    mocks.caseCount.mockResolvedValue(1);

    const response = await PATCH(request({ action: "close" }), params);

    expect(response.status).toBe(200);
    expect(mocks.conversationUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects attaching a message owned by another case", async () => {
    mocks.messageFindMany.mockResolvedValue([{ id: 31, caseId: 41 }]);

    const response = await PATCH(
      request({ action: "update", messageIds: [31] }),
      params,
    );

    expect(response.status).toBe(409);
    expect(mocks.caseUpdate).not.toHaveBeenCalled();
  });
});
