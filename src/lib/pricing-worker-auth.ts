import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function pricingWorkerConfigured(): boolean {
  return Boolean(process.env.PRICING_WORKER_TOKEN || process.env.CRON_SECRET);
}

export function authorizePricingWorker(request: NextRequest): boolean {
  const expected = process.env.PRICING_WORKER_TOKEN || process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") || "";
  const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || !provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
}
