import { sendNotification } from "web-push";
import { prisma } from "@/lib/prisma";
import { rentHomeOwner } from "@/lib/renthome";

export const supervisorRole = "cleaning_supervisor";
const operatorRoles = ["user", "admin", "superadmin"];

export function pushConfig() {
  const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey, VAPID_SUBJECT: subject } = process.env;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function validPushEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.hash || url.search) return false;
    return (url.hostname === "fcm.googleapis.com" && /^\/fcm\/send\/[\w:-]+$/.test(url.pathname))
      || (url.hostname === "updates.push.services.mozilla.com" && /^\/wpush\/v[12]\/[\w-]+$/.test(url.pathname))
      || ((url.hostname === "web.push.apple.com" || /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname))
        && /^\/[\w-]+$/.test(url.pathname));
  } catch {
    return false;
  }
}

export async function isRentHomeOperator(userId: number, role: string) {
  const ownerId = rentHomeOwner();
  if (!ownerId || !operatorRoles.includes(role)) return false;
  if (userId === ownerId) return true;
  return !!await prisma.propertyManager.findFirst({
    where: { managerId: userId, property: { userId: ownerId } },
    select: { id: true },
  });
}

type PushMessage = { title: string; body: string; path: string; tag: string };

export async function notifyRentHome(audience: "administrators" | "supervisors", message: PushMessage, propertyId?: number) {
  const vapidDetails = pushConfig();
  const ownerId = rentHomeOwner();
  if (!vapidDetails || !ownerId) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { user: {
      suspendedAt: null,
      ...(audience === "supervisors"
        ? { role: supervisorRole }
        : {
          role: { in: operatorRoles },
          OR: [{ id: ownerId }, { managedProperties: { some: { property: {
            userId: ownerId, ...(propertyId !== undefined && { id: propertyId }),
          } } } }],
        }),
    } },
  });

  await Promise.all(subscriptions.map(async ({ endpoint, auth, p256dh, userId }) => {
    if (!validPushEndpoint(endpoint)) return;
    try {
      await sendNotification({ endpoint, keys: { auth, p256dh } }, JSON.stringify(message), {
        vapidDetails, timeout: 4000, TTL: 900,
      });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
      } else {
        console.warn("RentHome web push delivery failed", status ?? "network");
      }
    }
  }));
}
