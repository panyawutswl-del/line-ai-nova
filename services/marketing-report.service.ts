import { logger, errorInfo } from "@/lib/logger";

const TIMEOUT_MS = 15_000;

interface ReportResponse {
  text?: string;
  summary?: unknown;
  error?: string;
}

export type MarketingReportResult =
  | { ok: true; text: string; summary: unknown }
  | { ok: false; error: string };

/**
 * On-demand fetch of sriwilai-web's data-only report endpoints, for use
 * inside a live chat turn (Gemini function calling) — unlike the scheduled
 * cron reports, this returns structured data for the model to answer the
 * owner's specific question with, rather than pushing a pre-written summary.
 */
export class MarketingReportService {
  constructor(
    private analyticsUrl: string,
    private socialUrl: string,
    private secret: string,
  ) {}

  private async fetchReport(url: string): Promise<MarketingReportResult> {
    if (!this.secret) {
      return { ok: false, error: "ANALYTICS_REPORT_SECRET is not set" };
    }
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${this.secret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await res.json()) as ReportResponse;
      if (!res.ok) {
        logger.warn("marketing_report.fetch_not_ok", { url, status: res.status, message: body.error });
        return { ok: false, error: body.error ?? `HTTP ${res.status}` };
      }
      if (!body.text) {
        return { ok: false, error: "Response had no `text` field" };
      }
      return { ok: true, text: body.text, summary: body.summary };
    } catch (err) {
      logger.warn("marketing_report.fetch_error", { url, ...errorInfo(err) });
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  fetchWebsiteAnalytics(): Promise<MarketingReportResult> {
    return this.fetchReport(this.analyticsUrl);
  }

  fetchSocialReport(): Promise<MarketingReportResult> {
    return this.fetchReport(this.socialUrl);
  }
}
