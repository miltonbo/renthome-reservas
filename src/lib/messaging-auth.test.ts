import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

import { getMessagingAccess } from "./messaging-auth";

const originalKey = process.env.MESSAGING_API_KEY;
const originalUserId = process.env.MESSAGING_API_USER_ID;
const validKey = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue(null);
  process.env.MESSAGING_API_KEY = validKey;
  process.env.MESSAGING_API_USER_ID = "7";
  mocks.userFindUnique.mockResolvedValue({
    id: 7,
    role: "user",
    suspendedAt: null,
  });
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.MESSAGING_API_KEY;
  else process.env.MESSAGING_API_KEY = originalKey;
  if (originalUserId === undefined) delete process.env.MESSAGING_API_USER_ID;
  else process.env.MESSAGING_API_USER_ID = originalUserId;
});

describe("getMessagingAccess", () => {
  it("accepts an authenticated browser session without reading the API user", async () => {
    mocks.getSession.mockResolvedValue({ userId: 3, role: "user" });

    await expect(getMessagingAccess(new Request("http://localhost"))).resolves.toEqual({
      userId: 3,
      role: "user",
      authType: "session",
    });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("accepts the configured Bearer key and resolves its scoped user", async () => {
    const request = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${validKey}` },
    });

    await expect(getMessagingAccess(request)).resolves.toEqual({
      userId: 7,
      role: "user",
      authType: "api_key",
    });
  });

  it("rejects incorrect, weak, or query-string credentials", async () => {
    const wrong = new Request(`http://localhost?apiKey=${validKey}`, {
      headers: { Authorization: "Bearer definitely-wrong" },
    });

    await expect(getMessagingAccess(wrong)).resolves.toBeNull();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("fails closed when the configured user is suspended", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: 7,
      role: "user",
      suspendedAt: new Date(),
    });

    const request = new Request("http://localhost", {
      headers: { Authorization: `Bearer ${validKey}` },
    });
    await expect(getMessagingAccess(request)).resolves.toBeNull();
  });
});
