import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Evaluate every enabled weather/AQI alert and push a LINE message on each
 * false→true transition. Same infrastructure as /api/cron/reminders — ping
 * every 15–30 minutes (Vercel Cron on Pro, or a free external pinger like
 * cron-job.org on Hobby — see DEPLOYMENT_CHECKLIST.md).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  logger.info("cron.weather_alerts_triggered", {
    hasAuthHeader: req.headers.has("authorization"),
  });
  if (!isCronAuthorized(req)) {
    logger.warn("cron.weather_alerts_unauthorized");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await getContainer().weatherAlertService.evaluateAll();
    logger.info("cron.weather_alerts_completed", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.weather_alerts_failed", errorInfo(err));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
