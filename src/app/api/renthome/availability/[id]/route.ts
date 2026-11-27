import { NextResponse } from "next/server";
import { rentHomeAvailabilityCalendar } from "@/lib/renthome";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const calendar = Number.isSafeInteger(id) && id > 0 ? await rentHomeAvailabilityCalendar(id) : null;
  const headers = { "Cache-Control": "no-store" };
  return calendar
    ? NextResponse.json(calendar, { headers })
    : NextResponse.json({ error: "Alojamiento no disponible." }, { status: 404, headers });
}
