import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getOfficialExchangeRate } from "@/lib/bcb-exchange-rate";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const rate = await getOfficialExchangeRate();
    return NextResponse.json({ ...rate, source: "BCB", referenceOnly: true });
  } catch (error) {
    return NextResponse.json({ error: "BCB rate unavailable", detail: error instanceof Error ? error.message : "Unknown error" }, { status: 503 });
  }
}
