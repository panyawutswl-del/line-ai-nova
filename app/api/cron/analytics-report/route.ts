import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Google Analytics report for sriwilaisukhothai.com — pulled from sriwilai-web
 * and pushed to LINE. Scheduled Mon/Wed/Fri 02:00 UTC = 09:00 Asia/Bangkok;
 * the schedule lives in the pinger (see docs/analytics-report.md), not here.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await getContainer().analyticsReportService.send();
    if (!result.sent) {
      logger.warn("cron.analytics_report_not_sent", { ...result });
      return NextResponse.json({ ok: false, ...result }, { status: 502 });
    }
    logger.info("cron.analytics_report_completed", { sent: result.sent });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.analytics_report_failed", errorInfo(err));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
