import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { canManageProperty } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { readListing, rentHomeOwner } from "@/lib/renthome";

const widths = new Set([16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920]);

async function readPhoto(directory: string, file: string, width: number | null) {
  const originalPath = path.join(directory, file);
  if (!width || width === 1920) return readFile(originalPath);
  const cacheDirectory = path.join(directory, ".renditions");
  const variant = path.join(cacheDirectory, `v1-${width}-${file}`);
  const cached = await readFile(variant).catch(() => null);
  if (cached) return cached;

  const original = await readFile(originalPath);
  const source = sharp(original, { limitInputPixels: 40_000_000 });
  const metadata = await source.metadata();
  if (metadata.width && metadata.width <= width) return original;
  const resized = await source.resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const temporary = `${variant}.${randomUUID()}.tmp`;
  try {
    await mkdir(cacheDirectory, { recursive: true });
    await writeFile(temporary, resized);
    await rename(temporary, variant);
  } catch {
    await unlink(temporary).catch(() => {});
  }
  return resized;
}

export async function GET(request: Request, { params }: { params: Promise<{ propertyId: string; file: string }> }) {
  const { propertyId: rawId, file } = await params;
  const propertyId = Number(rawId);
  const owner = rentHomeOwner();
  const missing = () => new Response(null, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  if (!owner || !Number.isSafeInteger(propertyId) || propertyId < 1 || !/^[a-f0-9]{32}\.webp$/.test(file)) return missing();
  const size = new URL(request.url).searchParams.get("w");
  const width = size === null ? null : Number(size);
  if (width !== null && (!widths.has(width) || String(width) !== size)) return missing();
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: owner }, select: { isPaused: true } });
  const listing = property && await prisma.rentHomeListing.findUnique({ where: { propertyId } });
  if (!listing || !readListing(listing).photos.includes(file)) return missing();
  const isPublic = listing.published && !property.isPaused;
  if (!isPublic) {
    const session = await getSession();
    if (!session || !(await canManageProperty(propertyId, session.userId, session.role))) return missing();
  }
  const image = await readPhoto(path.join(process.cwd(), "data", "renthome-photos", String(propertyId)), file, width).catch(() => null);
  if (!image) return missing();
  const headers = {
    "Content-Type": "image/webp",
    "Cache-Control": isPublic ? "private, max-age=300" : "private, no-store",
  };
  return new Response(new Uint8Array(image), { headers });
}
