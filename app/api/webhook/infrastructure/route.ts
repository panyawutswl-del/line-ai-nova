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

/** Receives only the milestone-1 DSM event: UPS entered battery mode. */
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
  const text = typeof payload === "object" && payload !== null && "text" in payload
    ? (payload as { text?: unknown }).text
    : undefined;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  try {
    await getContainer().infrastructureAlertService.notifyUpsOnBattery({
      dsmMessage: text.trim(),
    });
    return NextResponse.json({ ok: true, event: "ups_on_battery" });
  } catch (err) {
    logger.error("infrastructure.ups_on_battery_failed", errorInfo(err));
    return NextResponse.json({ error: "delivery failed" }, { status: 502 });
  }
}
