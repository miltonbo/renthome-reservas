import { createHash, timingSafeEqual } from "node:crypto";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type MessagingAccess = {
  userId: number;
  role: string;
  authType: "session" | "api_key";
};

function safelyMatches(candidate: string, expected: string): boolean {
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}

/**
 * Messaging routes accept either the normal browser session or a dedicated
 * Bearer key for n8n. The key is intentionally kept in environment variables,
 * never in URLs, source control, logs, or the application database.
 */
export async function getMessagingAccess(
  request: Request,
): Promise<MessagingAccess | null> {
  const session = await getSession();
  if (session && session.role !== "cleaner") {
    return {
      userId: session.userId,
      role: session.role,
      authType: "session",
    };
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const candidate = authorization.slice("Bearer ".length).trim();
  const expected = process.env.MESSAGING_API_KEY;
  const configuredUserId = Number(process.env.MESSAGING_API_USER_ID);

  // A 256-bit base64url token is 43 characters. Requiring at least 32 keeps a
  // weak or placeholder deployment value from silently becoming active.
  if (
    !candidate ||
    candidate.length < 32 ||
    !expected ||
    expected.length < 32 ||
    !Number.isInteger(configuredUserId) ||
    configuredUserId <= 0 ||
    !safelyMatches(candidate, expected)
  ) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: configuredUserId },
    select: { id: true, role: true, suspendedAt: true },
  });
  if (!user || user.suspendedAt || user.role === "cleaner") return null;

  return { userId: user.id, role: user.role, authType: "api_key" };
}
