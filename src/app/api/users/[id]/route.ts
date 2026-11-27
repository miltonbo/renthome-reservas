import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { rentHomeOwner } from "@/lib/renthome";
import { supervisorRole } from "@/lib/renthome-push";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "superadmin" || session.impersonatorId || !rentHomeOwner()) {
    return NextResponse.json({ error: "Acceso restringido." }, { status: 403 });
  }
  const userId = Number((await params).id);
  const body = await request.json().catch(() => null);
  if (!Number.isSafeInteger(userId) || userId === session.userId || userId === rentHomeOwner()
    || typeof body?.supervisor !== "boolean") {
    return NextResponse.json({ error: "El cambio de rol no es válido." }, { status: 400 });
  }
  const changed = await prisma.$transaction(async (db) => {
    const result = await db.user.updateMany({
      where: { id: userId, role: body.supervisor ? "user" : supervisorRole,
        properties: { none: {} }, managedProperties: { none: {} } },
      data: { role: body.supervisor ? supervisorRole : "user" },
    });
    if (result.count) await db.pushSubscription.deleteMany({ where: { userId } });
    return result.count;
  });
  if (!changed) return NextResponse.json({ error: "Usa una cuenta operativa sin propiedades propias ni permisos de administración." }, { status: 409 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session || session.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const userId = parseInt(id);
    if (isNaN(userId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

    // Prevent deleting yourself
    if (userId === session.userId) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Route error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
