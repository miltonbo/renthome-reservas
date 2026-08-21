import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "node:path";
import fs from "node:fs";

const INVENTORY = [
  "Sky Elite 305", "Sky Elite 329", "Sky Elite 331", "Sky Elite 406",
  "Sky Elite 523", "Sky Elite 527", "Sky Elite 528", "Sky Elite 540",
  "Sky Eclipse 1309", "Sky Eclipse 1402", "Sky Eclipse 1602", "Sky Eclipse 1709",
  "Luxe Suites 104", "Luxe Suites 113", "Luxe Suites 117", "Luxe Suites 204",
  "Luxe Suites 205", "Luxe Suites 316", "Luxe Suites 406",
  "Sky Moon 706", "Sky Luxia 112", "Stanza 8B", "Uptown Nuu 12D",
] as const;

function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw?.startsWith("file:")) {
    throw new Error("seed:renthome currently requires DATABASE_URL=file:...");
  }
  const value = raw.slice("file:".length);
  const absolute = path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return `file:${absolute}`;
}

const prisma = new PrismaClient({ adapter: new PrismaLibSql({ url: databaseUrl() }) });

async function main() {
  const username = (process.env.SEED_ADMIN_USERNAME || "admin").trim();
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error(`Admin user '${username}' does not exist. Run npm run db:seed first.`);

  for (const name of INVENTORY) {
    const existing = await prisma.property.findFirst({ where: { userId: user.id, name } });
    if (existing) {
      await prisma.property.update({
        where: { id: existing.id },
        data: { checkInTime: "14:00", checkOutTime: "11:00", minNights: 1 },
      });
      continue;
    }
    await prisma.property.create({
      data: {
        userId: user.id,
        name,
        checkInTime: "14:00",
        checkOutTime: "11:00",
        minNights: 1,
        cleaningEnabled: true,
      },
    });
  }

  console.log(`RentHome inventory ready: ${INVENTORY.length} physical units.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
