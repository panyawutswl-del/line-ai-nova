import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getContainer } from "@/lib/container";
import { errorInfo, logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

function secretsMatch(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

/** DSM notification rules this endpoint accepts. Unknown events are rejected. */
const KNOWN_EVENTS = new Set(["ups_on_battery", "power_restored"]);
/** The original DSM rule sends no `event` field — preserve its behavior. */
const DEFAULT_EVENT = "ups_on_battery";

/** Receives signed Synology DSM power-event webhooks. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const { infrastructure, auth } = getConfig();
  const secret = req.headers.get("x-nova-infrastructure-secret");

  if (!secretsMatch(secret, infrastructure.webhookSecret)) {
    logger.warn("infrastructure.webhook_unauthorized");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!auth.ownerLineUserId) {
    logger.error("infrastructure.webhook_missing_owner");
    return NextResponse.json({ error: "service not configured" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const body = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const text = body.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  const event = typeof body.event === "string" && body.event.trim() ? body.event.trim() : DEFAULT_EVENT;
  if (!KNOWN_EVENTS.has(event)) {
    return NextResponse.json({ error: `unknown event: ${event}` }, { status: 400 });
  }

  try {
    const alert = { dsmMessage: text.trim() };
    if (event === "power_restored") {
      await getContainer().infrastructureAlertService.notifyPowerRestored(alert);
    } else {
      await getContainer().infrastructureAlertService.notifyUpsOnBattery(alert);
    }
    return NextResponse.json({ ok: true, event });
  } catch (err) {
    logger.error("infrastructure.notify_failed", { event, ...errorInfo(err) });
    return NextResponse.json({ error: "delivery failed" }, { status: 502 });
  }
}
