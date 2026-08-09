import type { LineService } from "@/lib/line";
import type { GeminiService } from "@/services/gemini.service";
import { logger, errorInfo } from "@/lib/logger";

const TIMEOUT_MS = 15_000;

export type WeeklyReportErrorCode =
  | "not_configured"
  | "empty_data"
  | "gemini_failed"
  | "unknown";

export interface WeeklyReportSendResult {
  sent: boolean;
  error?: WeeklyReportErrorCode;
  message?: string;
}

/** Both sriwilai-web report endpoints return `{ text, summary }`. */
interface ReportResponse {
  text?: string;
  error?: string;
}

const SYSTEM_INSTRUCTION =
  "คุณเป็นนักการตลาดโรงแรมมืออาชีพของ Sriwilai Sukhothai Resort & Spa " +
  "(รีสอร์ทหรูในสุโขทัย จุดยืน: ขายประสบการณ์และมรดกสุโขทัย ไม่ลดราคา ไม่โชว์ราคาห้อง) " +
  "เขียนกระชับ อ่านบนมือถือง่าย ตอบภาษาไทยเท่านั้น";

/**
 * Weekly marketing report: pulls the GA4 (website) and social (Facebook +
 * Instagram) summaries from sriwilai-web — both data-only endpoints — asks
 * Gemini to synthesise a short Thai analysis with recommendations, and pushes
 * one LINE message to the owner. Runs alongside (not replacing) the existing
 * Mon/Wed/Fri GA4-only report.
 */
export class WeeklyMarketingReportService {
  constructor(
    private analyticsUrl: string,
    private socialUrl: string,
    private reportSecret: string,
    private gemini: Pick<GeminiService, "generateText">,
    private line: Pick<LineService, "pushText">,
    private ownerLineUserId: string,
  ) {}

  /** Fetch one report endpoint's `text`; returns null on any failure. */
  private async fetchText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.reportSecret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json()) as ReportResponse;
      if (!res.ok) {
        logger.warn("weekly_report.fetch_not_ok", {
          url,
          status: res.status,
          message: body.error,
        });
        return null;
      }
      return body.text?.trim() || null;
    } catch (err) {
      logger.warn("weekly_report.fetch_error", { url, ...errorInfo(err) });
      return null;
    }
  }

  private buildPrompt(ga4: string | null, social: string | null): string {
    return [
      "นี่คือข้อมูลการตลาดสัปดาห์ล่าสุดของ Sriwilai Sukhothai:",
      "",
      "=== เว็บไซต์ (Google Analytics) ===",
      ga4 ?? "(ดึงข้อมูลเว็บไม่สำเร็จสัปดาห์นี้)",
      "",
      "=== Facebook & Instagram ===",
      social ?? "(ดึงข้อมูลโซเชียลไม่สำเร็จสัปดาห์นี้)",
      "",
      "ช่วยเขียน 'รายงานการตลาดรายสัปดาห์' ภาษาไทยสำหรับส่งเข้า LINE",
      "ความยาวไม่เกิน ~1,500 ตัวอักษร มีหัวข้อชัดเจนพร้อมอิโมจิ:",
      "1) 🌐 เว็บไซต์ — ตัวเลขสำคัญ (ผู้เข้าชม, กด Book Now, แหล่งที่มา)",
      "2) 📱 โซเชียล — ผู้ติดตาม + โพสต์/ธีมที่เวิร์ก",
      "3) 💡 วิเคราะห์ — อะไรได้ผล/ควรปรับ (2-3 บรรทัด)",
      "4) ✅ แนะนำสัปดาห์นี้ — 3 ข้อ ทำได้จริง เพื่อเพิ่มยอดจอง (เน้นขายประสบการณ์ ไม่ลดราคา)",
      "อย่าใส่แคปชั่นโพสต์ยาวๆ เอาเฉพาะใจความ",
    ].join("\n");
  }

  async send(): Promise<WeeklyReportSendResult> {
    if (!this.reportSecret || !this.ownerLineUserId) {
      logger.warn("weekly_report.not_configured", {
        hint: "set ANALYTICS_REPORT_SECRET and OWNER_LINE_USER_ID",
      });
      return {
        sent: false,
        error: "not_configured",
        message: "ANALYTICS_REPORT_SECRET or OWNER_LINE_USER_ID is not set",
      };
    }

    const [ga4, social] = await Promise.all([
      this.fetchText(this.analyticsUrl),
      this.fetchText(this.socialUrl),
    ]);

    if (!ga4 && !social) {
      return {
        sent: false,
        error: "empty_data",
        message: "Both report endpoints returned no data",
      };
    }

    let report: string;
    try {
      report = await this.gemini.generateText({
        prompt: this.buildPrompt(ga4, social),
        systemInstruction: SYSTEM_INSTRUCTION,
      });
    } catch (err) {
      logger.error("weekly_report.gemini_failed", errorInfo(err));
      return {
        sent: false,
        error: "gemini_failed",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    if (!report.trim()) {
      return {
        sent: false,
        error: "gemini_failed",
        message: "Gemini returned empty text",
      };
    }

    const message = `🗓️ รายงานการตลาดรายสัปดาห์ — Sriwilai\n\n${report.trim()}`;
    await this.line.pushText(this.ownerLineUserId, message);
    logger.info("weekly_report.sent", {
      recipient: this.ownerLineUserId,
      length: message.length,
      ga4: !!ga4,
      social: !!social,
    });
    return { sent: true };
  }
}
