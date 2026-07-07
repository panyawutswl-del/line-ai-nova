import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * OAuth entry point. Nova sends the user here (with a signed state carrying
 * their LINE user id); we forward them to Google's consent screen.
 *
 * Opening this URL directly in a browser (no `state`) is NOT an error — it
 * returns 400 "missing state" by design, because a valid signed link only
 * comes from the bot in LINE.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { calendarService } = getContainer();

  // Debug: raw process.env (live) vs. the cached app config. A mismatch here
  // (env present but configured=false) points to a stale warm instance that
  // booted before the env vars were added — redeploy to clear it.
  const envPresent = {
    GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: !!process.env.GOOGLE_REDIRECT_URI,
  };
  console.log(envPresent);
  logger.info("oauth.entry", {
    envPresent,
    config: calendarService.configStatus(),
  });

  if (!calendarService.isConfigured()) {
    return NextResponse.json(
      {
        error: "Google Calendar integration is not configured",
        env_present: envPresent,
        hint: "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI in Vercel, then redeploy.",
      },
      { status: 501 },
    );
  }

  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!state) {
    return NextResponse.json(
      {
        error: "missing state",
        hint: "เปิดลิงก์นี้จากข้อความที่ Nova ส่งให้ใน LINE เท่านั้น (ลิงก์ที่ถูกต้องจะมีพารามิเตอร์ state)",
      },
      { status: 400 },
    );
  }
  if (!calendarService.verifyState(state)) {
    return NextResponse.json(
      { error: "invalid or expired link — กรุณาขอลิงก์ใหม่จาก Nova ในแชท" },
      { status: 400 },
    );
  }

  return NextResponse.redirect(calendarService.googleAuthUrl(state));
}
