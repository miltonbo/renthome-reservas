import { randomBytes } from "node:crypto";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageProperty } from "@/lib/ownership";
import { prisma } from "@/lib/prisma";
import { readListing, rentHomeOwner } from "@/lib/renthome";
import { rentHomeFields } from "@/lib/renthome-listing-details";

type Context = { params: Promise<{ id: string }> };

async function manageableId({ params }: Context) {
  const owner = rentHomeOwner();
  const session = await getSession();
  const propertyId = Number((await params).id);
  if (!owner || !session || !Number.isSafeInteger(propertyId) || propertyId < 1 ||
    !(await canManageProperty(propertyId, session.userId, session.role))) return null;
  const property = await prisma.property.findFirst({ where: { id: propertyId, userId: owner }, select: { id: true } });
  return property?.id ?? null;
}

export async function GET(_: Request, context: Context) {
  const propertyId = await manageableId(context);
  if (!propertyId) return NextResponse.json({ error: "Departamento no encontrado." }, { status: 404 });
  const row = await prisma.rentHomeListing.findUnique({ where: { propertyId } });
  return NextResponse.json({ listing: row ? { ...readListing(row), published: row.published } : null }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PUT(request: Request, context: Context) {
  const propertyId = await manageableId(context);
  if (!propertyId) return NextResponse.json({ error: "Departamento no encontrado." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Formulario inválido." }, { status: 400 });
  const published = form.get("publish") === "yes";
  const capacity = Number(form.get("capacity"));
  const fields = Object.fromEntries(rentHomeFields.map((key) => [key, String(form.get(key) ?? "").trim()]));
  const current = await prisma.rentHomeListing.findUnique({ where: { propertyId } });
  const previousPhotos = current ? readListing(current).photos : [];
  const wanted = [...new Set(form.getAll("retain").map(String))];
  const files = form.getAll("photos").filter((item): item is File => typeof item !== "string" && item.size > 0);
  if (files.length > 30 || files.some((file) => file.size > 8 * 1024 * 1024) ||
    files.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "Agrega hasta 30 fotos por carga, con un máximo de 8 MB por foto y 25 MB en total." }, { status: 400 });
  }
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 50 ||
    fields.title.length > 160 || Object.values(fields).some((value) => value.length > 8000) ||
    wanted.some((name) => !previousPhotos.includes(name)) ||
    (published && (!fields.title || !fields.description || !wanted.length && !files.length))) {
    return NextResponse.json({ error: "Revisa la capacidad, el contenido y las fotos. Para publicar necesitas título, descripción y al menos una foto." }, { status: 400 });
  }
  const directory = path.join(process.cwd(), "data", "renthome-photos", String(propertyId));
  const added: string[] = [];
  try {
    if (files.length) await mkdir(directory, { recursive: true });
    for (const file of files) {
      const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 40_000_000 });
      const { format } = await image.metadata();
      if (!format || !["jpeg", "png", "webp", "heif", "avif"].includes(format)) throw new Error("Formato de foto inválido");
      const name = `${randomBytes(16).toString("hex")}.webp`;
      await image.rotate().resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true }).webp({ quality: 84 }).toFile(path.join(directory, name));
      added.push(name);
    }
    const photos = [...wanted, ...added];
    const data = { published, detailsJson: JSON.stringify({ ...fields, capacity }), photosJson: JSON.stringify(photos) };
    await prisma.rentHomeListing.upsert({ where: { propertyId }, create: { propertyId, ...data }, update: data });
    return NextResponse.json({ listing: { details: { ...fields, capacity }, photos, published } });
  } catch (error) {
    await Promise.allSettled(added.map((name) => unlink(path.join(directory, name))));
    console.error("RentHome listing save failed", error);
    return NextResponse.json({ error: "No se pudo guardar la ficha. Revisa el formato de las fotos." }, { status: 400 });
  }
}
