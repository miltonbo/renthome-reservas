import { NextRequest, NextResponse } from "next/server";
import {
  AUTOMATED_PRICING_CHANNELS,
  claimNextPricingAutomationRun,
  collectPricingChannelSnapshot,
  completePricingAutomationRun,
  failPricingAutomationRun,
  heartbeatPricingAutomationRun,
  ingestPricingAutomationSnapshot,
  registerPricingChannelConnections,
  type AutomatedPricingChannel,
  type AutomationVerificationResult,
  type ChannelConnectionRegistration,
  type ChannelListingSnapshot,
} from "@/lib/pricing-automation";
import { authorizePricingWorker } from "@/lib/pricing-worker-auth";

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new RangeError(`${label} inválido`);
  return parsed;
}

function workerId(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._-]{3,80}$/.test(value)) throw new RangeError("workerId inválido");
  return value;
}

function channel(value: unknown): AutomatedPricingChannel {
  if (!AUTOMATED_PRICING_CHANNELS.includes(value as AutomatedPricingChannel)) throw new RangeError("Canal inválido");
  return value as AutomatedPricingChannel;
}

export async function POST(request: NextRequest) {
  if (!authorizePricingWorker(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const action = typeof body.action === "string" ? body.action : "";
    const id = workerId(body.workerId);
    if (action === "claim") {
      const channels = Array.isArray(body.channels) ? body.channels.map(String) : [...AUTOMATED_PRICING_CHANNELS];
      return NextResponse.json({ run: await claimNextPricingAutomationRun(id, channels) });
    }
    if (action === "register_connections") {
      const listings = Array.isArray(body.listings) ? body.listings as ChannelConnectionRegistration[] : [];
      return NextResponse.json(await registerPricingChannelConnections({ channel: channel(body.channel), listings }));
    }
    if (action === "collect_snapshot") {
      const listings = Array.isArray(body.listings) ? body.listings as ChannelListingSnapshot[] : [];
      return NextResponse.json(await collectPricingChannelSnapshot({ channel: channel(body.channel), listings }));
    }
    const runId = integer(body.runId, "runId");
    if (action === "heartbeat") {
      const ok = await heartbeatPricingAutomationRun(runId, id);
      return NextResponse.json({ ok }, { status: ok ? 200 : 409 });
    }
    if (action === "snapshot") {
      const listings = Array.isArray(body.listings) ? body.listings as ChannelListingSnapshot[] : [];
      const plan = await ingestPricingAutomationSnapshot({ runId, workerId: id, channel: channel(body.channel), listings });
      return NextResponse.json({ plan });
    }
    if (action === "complete") {
      const results = Array.isArray(body.results) ? body.results as AutomationVerificationResult[] : [];
      return NextResponse.json(await completePricingAutomationRun({ runId, workerId: id, results }));
    }
    if (action === "fail") {
      const code = typeof body.code === "string" ? body.code : "worker_error";
      const message = typeof body.message === "string" ? body.message : "El trabajador no pudo completar la ejecución.";
      const run = await failPricingAutomationRun(runId, id, code, message);
      return NextResponse.json({ run });
    }
    return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Solicitud inválida" }, { status: 400 });
  }
}
