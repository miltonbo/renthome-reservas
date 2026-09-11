import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getMessagingAccess: vi.fn(),
  canManageProperty: vi.fn(),
  logAudit: vi.fn(),
  reservationFindUnique: vi.fn(),
  transaction: vi.fn(),
  conversationFindFirst: vi.fn(),
  messageFindMany: vi.fn(),
  messageUpdateMany: vi.fn(),
  caseFindFirst: vi.fn(),
  caseCreate: vi.fn(),
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
    $transaction: mocks.transaction,
  },
}));

import { POST } from "./route";

const tx = {
  conversation: { findFirst: mocks.conversationFindFirst },
  conversationMessage: {
    findMany: mocks.messageFindMany,
    updateMany: mocks.messageUpdateMany,
  },
  conversationCase: {
    findFirst: mocks.caseFindFirst,
    create: mocks.caseCreate,
  },
};

function request(overrides: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/messaging/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      conversationId: 20,
      messageIds: [30],
      type: "availability",
      summary: "Consulta para hoy",
      ...overrides,
    }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getMessagingAccess.mockResolvedValue({
    userId: 7,
    role: "user",
    authType: "api_key",
  });
  mocks.transaction.mockImplementation((callback) => callback(tx));
  mocks.conversationFindFirst.mockResolvedValue({ id: 20 });
  mocks.messageFindMany.mockResolvedValue([{ id: 30, caseId: null }]);
  mocks.caseCreate.mockResolvedValue({ id: 40, conversationId: 20 });
  mocks.messageUpdateMany.mockResolvedValue({ count: 1 });
  mocks.logAudit.mockResolvedValue(undefined);
  mocks.canManageProperty.mockResolvedValue(true);
});
describe("POST /api/messaging/cases", () => {
  it("creates a case and atomically attaches its triggering message", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    expect(mocks.caseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: 20,
        type: "availability",
        status: "new",
      }),
    });
    expect(mocks.messageUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ conversationId: 20, caseId: null }),
      data: { caseId: 40 },
    });
  });

  it("returns the existing case when n8n retries the same triggering message", async () => {
    mocks.messageFindMany.mockResolvedValue([{ id: 30, caseId: 40 }]);
    mocks.caseFindFirst.mockResolvedValue({ id: 40, conversationId: 20 });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.duplicate).toBe(true);
    expect(mocks.caseCreate).not.toHaveBeenCalled();
  });

  it("rejects a message from another conversation", async () => {
    mocks.messageFindMany.mockResolvedValue([]);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.caseCreate).not.toHaveBeenCalled();
  });

  it("does not reveal an inaccessible linked reservation", async () => {
    mocks.reservationFindUnique.mockResolvedValue({ propertyId: 99 });
    mocks.canManageProperty.mockResolvedValue(false);

    const response = await POST(request({ reservationId: 12 }));

    expect(response.status).toBe(404);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
