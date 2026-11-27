import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  listTurnovers: vi.fn(),
  create: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("next/server", () => ({ after: (send: () => Promise<void>) => send() }));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/renthome", () => ({ rentHomeOwner: () => 1 }));
vi.mock("@/lib/messaging-availability", () => ({ boliviaDateString: () => "2026-11-27" }));
vi.mock("@/lib/renthome-turnovers", () => ({ listTurnovers: mocks.listTurnovers }));
vi.mock("@/lib/renthome-push", () => ({
  supervisorRole: "cleaning_supervisor",
  isRentHomeOperator: (id: number) => id === 1,
  notifyRentHome: mocks.notify,
  pushConfig: () => true,
}));
vi.mock("@/lib/prisma", () => {
  const db = {
    cleaningTurnover: { create: mocks.create, updateMany: mocks.updateMany },
    cleaningRecord: { upsert: mocks.upsert },
  };
  return { prisma: { ...db, $transaction: (fn: (tx: typeof db) => unknown) => fn(db) } };
});

function submit(action: "checkout" | "ready", date = "2026-11-27") {
  return POST(new Request("http://localhost/api/renthome-turnovers", {
    method: "POST", body: JSON.stringify({ propertyId: 5, date, action }),
  }));
}

describe("RentHome cleaning handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.notify.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ userId: 1, role: "user" });
    mocks.listTurnovers.mockResolvedValue([{ id: 5, scheduled: true, checkoutAt: null, readyAt: null }]);
  });

  it("notifies supervisors once even when a concurrent checkout wins", async () => {
    mocks.create.mockResolvedValueOnce({}).mockRejectedValueOnce({ code: "P2002" });
    const result = await Promise.all([submit("checkout"), submit("checkout")]);
    expect(result.map((response) => response.status)).toEqual([200, 200]);
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("supervisors", expect.objectContaining({ title: "Salida confirmada" }), 5);
  });

  it("lets only supervisors mark ready after checkout and notifies administration once", async () => {
    expect((await submit("ready")).status).toBe(403);
    mocks.getSession.mockResolvedValue({ userId: 2, role: "cleaning_supervisor" });
    expect((await submit("checkout")).status).toBe(403);
    expect((await submit("ready")).status).toBe(409);
    mocks.listTurnovers.mockResolvedValue([{ id: 5, scheduled: true, checkoutAt: new Date(), readyAt: null }]);
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await submit("ready")).status).toBe(200);
    expect((await submit("ready")).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith("administrators", expect.objectContaining({ title: "Departamento listo" }), 5);
  });

  it("rejects actions outside the scheduled date and property scope", async () => {
    expect((await submit("checkout", "2026-11-28")).status).toBe(400);
    mocks.listTurnovers.mockResolvedValue([]);
    expect((await submit("checkout")).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
