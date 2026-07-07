import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dispatch due reminders as LINE push messages.
 * Ping every 1–5 minutes (Vercel Cron on Pro, or a free external pinger
 * like cron-job.org on Hobby — see DEPLOYMENT_CHECKLIST.md).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const sent = await getContainer().reminderService.dispatchDue();
    return NextResponse.json({ ok: true, sent });
  } catch (err) {
    logger.error("cron.reminders_failed", errorInfo(err));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
