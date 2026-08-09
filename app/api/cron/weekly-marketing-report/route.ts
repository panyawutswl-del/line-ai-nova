import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly marketing report for sriwilaisukhothai.com — pulls the GA4 + social
 * (Facebook/Instagram) summaries, has Gemini synthesise a Thai analysis, and
 * pushes it to LINE. Scheduled Monday 02:00 UTC = 09:00 Asia/Bangkok via the
 * external pinger (see docs/weekly-marketing-report.md), not vercel.json.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await getContainer().weeklyMarketingReportService.send();
    if (!result.sent) {
      logger.warn("cron.weekly_marketing_report_not_sent", { ...result });
      return NextResponse.json({ ok: false, ...result }, { status: 502 });
    }
    logger.info("cron.weekly_marketing_report_completed", { sent: result.sent });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.weekly_marketing_report_failed", errorInfo(err));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
