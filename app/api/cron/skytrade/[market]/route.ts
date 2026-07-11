import { NextRequest, NextResponse } from "next/server";
import { SKYTRADE_MARKETS, type Market } from "@skytrade/nova-skytrade-module";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function parseMarket(value: string): Market | null {
  const upper = value.toUpperCase();
  return (SKYTRADE_MARKETS as readonly string[]).includes(upper)
    ? (upper as Market)
    : null;
}

/**
 * SkyTrade Daily Brief for one market (SET · US · CRYPTO). Triggered by Nova's
 * scheduling infrastructure (Vercel Cron / external pinger) — one cron entry per
 * market path, each at its own time/timezone (see SCHEDULES). Reuses the shared
 * `CRON_SECRET` auth. The registered callback drives the SkyTrade pipeline
 * end-to-end and delivers the brief internally.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ market: string }> },
): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { market: raw } = await params;
  const market = parseMarket(raw);
  if (!market) {
    return NextResponse.json({ error: `unknown market "${raw}"` }, { status: 404 });
  }

  try {
    await getContainer().skytrade.deliverDailyBrief(market);
    logger.info("cron.skytrade_brief_sent", { market });
    return NextResponse.json({ ok: true, market });
  } catch (err) {
    logger.error("cron.skytrade_brief_failed", { market, ...errorInfo(err) });
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
