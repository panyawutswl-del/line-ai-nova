import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/container";
import { logger, errorInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

function htmlResponse(title: string, message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0">
<div><h1>${title}</h1><p>${message}</p></div></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { calendarService, userRepository } = getContainer();
  const params = req.nextUrl.searchParams;

  if (params.get("error")) {
    return htmlResponse("ยกเลิกการเชื่อมต่อ", "คุณปฏิเสธการให้สิทธิ์ Google Calendar — ปิดหน้านี้ได้เลย", 400);
  }

  const code = params.get("code") ?? "";
  const lineUserId = calendarService.verifyState(params.get("state") ?? "");
  if (!code || !lineUserId) {
    return htmlResponse("เกิดข้อผิดพลาด", "ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาขอลิงก์ใหม่จาก Nova ในแชท", 400);
  }

  const user = await userRepository.findByLineUserId(lineUserId);
  if (!user || !user.isActive) {
    return htmlResponse("เกิดข้อผิดพลาด", "ไม่พบบัญชีผู้ใช้ กรุณาทักบอทก่อนแล้วลองใหม่", 404);
  }

  try {
    await calendarService.handleOAuthCallback(user.id, code);
    return htmlResponse(
      "✅ เชื่อมต่อสำเร็จ",
      "Nova เชื่อมต่อกับ Google Calendar ของคุณแล้ว กลับไปคุยใน LINE ได้เลยค่ะ",
    );
  } catch (err) {
    logger.error("oauth.callback_failed", errorInfo(err));
    return htmlResponse("เกิดข้อผิดพลาด", "เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", 500);
  }
}
