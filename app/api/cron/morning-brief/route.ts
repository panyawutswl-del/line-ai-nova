import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { isCronAuthorized } from "@/lib/cron-auth";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily Executive Brief — scheduled 00:00 UTC = 07:00 Asia/Bangkok. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await getContainer().briefService.sendMorningBriefs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("cron.morning_brief_failed", errorInfo(err));
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
