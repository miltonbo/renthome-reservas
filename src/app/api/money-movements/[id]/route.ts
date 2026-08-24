import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageProperty } from "@/lib/ownership";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = Number((await params).id);
  const movement = await prisma.moneyMovement.findUnique({ where: { id } });
  if (!movement || !(await canManageProperty(movement.propertyId, session.userId, session.role))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.moneyMovement.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
