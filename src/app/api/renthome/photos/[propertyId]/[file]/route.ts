import { readFile } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@/lib/auth";
import { canManageProperty } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { readListing, rentHomeOwner } from "@/lib/renthome";

export async function GET(_: Request, { params }: { params: Promise<{ propertyId: string; file: string }> }) {
  const { propertyId: rawId, file } = await params;
  const propertyId = Number(rawId);
  const owner = rentHomeOwner();
  const missing = () => new Response(null, { status: 404 });
  if (!owner || !Number.isSafeInteger(propertyId) || propertyId < 1 || !/^[a-f0-9]{32}\.webp$/.test(file)) return missing();
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: owner }, select: { isPaused: true } });
  const listing = property && await prisma.rentHomeListing.findUnique({ where: { propertyId } });
  if (!listing || !readListing(listing).photos.includes(file)) return missing();
  if (!listing.published || property.isPaused) {
    const session = await getSession();
    if (!session || !(await canManageProperty(propertyId, session.userId, session.role))) return missing();
  }
  const image = await readFile(path.join(process.cwd(), "data", "renthome-photos", String(propertyId), file)).catch(() => null);
  return image ? new Response(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Cache-Control": "no-store" } }) : missing();
}
