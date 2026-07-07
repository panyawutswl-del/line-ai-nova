import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";

export const dynamic = "force-dynamic";

/**
 * OAuth entry point. Nova sends the user here (with a signed state carrying
 * their LINE user id); we forward them to Google's consent screen.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { calendarService } = getContainer();
  if (!calendarService.isConfigured()) {
    return NextResponse.json(
      { error: "Google Calendar integration is not configured" },
      { status: 501 },
    );
  }

  const state = req.nextUrl.searchParams.get("state") ?? "";
  if (!calendarService.verifyState(state)) {
    return NextResponse.json({ error: "invalid state" }, { status: 400 });
  }

  return NextResponse.redirect(calendarService.googleAuthUrl(state));
}
