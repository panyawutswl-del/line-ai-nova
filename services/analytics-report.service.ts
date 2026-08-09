import type { LineService } from "@/lib/line";
import { logger, errorInfo } from "@/lib/logger";

const TIMEOUT_MS = 10_000;

export type AnalyticsReportErrorCode =
  | "not_configured"
  | "unauthorized"
  | "timeout"
  | "network_error"
  | "malformed_response"
  | "empty_report"
  | "unknown";

export type AnalyticsReportResult =
  | { ok: true; text: string }
  | { ok: false; error: AnalyticsReportErrorCode; message: string };

export interface AnalyticsReportSendResult {
  sent: boolean;
  error?: AnalyticsReportErrorCode;
  message?: string;
}

/**
 * Raw shape of sriwilai-web's `/api/analytics-report` response.
 * `text` arrives pre-formatted for LINE; `summary` is the structured
 * counterpart, which Nova does not consume.
 */
interface AnalyticsReportResponse {
  text?: string;
  error?: string;
}

/**
 * Pulls the ready-to-send GA4 summary from sriwilai-web (data-only endpoint —
 * it never talks to LINE itself) and pushes it through Nova's LINE channel.
 * Fetching never throws: every failure mode comes back as a typed result.
 */
export class AnalyticsReportService {
  constructor(
    private reportUrl: string,
    private reportSecret: string,
    private line: Pick<LineService, "pushText">,
    private ownerLineUserId: string,
  ) {}

  async fetchReport(): Promise<AnalyticsReportResult> {
    if (!this.reportSecret) {
      return {
        ok: false,
        error: "not_configured",
        message: "ANALYTICS_REPORT_SECRET is not set",
      };
    }

    let res: Response;
    try {
      res = await fetch(this.reportUrl, {
        headers: { authorization: `Bearer ${this.reportSecret}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        logger.warn("analytics.timeout", { url: this.reportUrl });
        return { ok: false, error: "timeout", message: "Request timed out" };
      }
      logger.warn("analytics.network_error", {
        ...errorInfo(err),
        url: this.reportUrl,
      });
      return {
        ok: false,
        error: "network_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    let body: AnalyticsReportResponse;
    try {
      body = (await res.json()) as AnalyticsReportResponse;
    } catch (err) {
      logger.warn("analytics.malformed_response", {
        ...errorInfo(err),
        status: res.status,
      });
      return {
        ok: false,
        error: "malformed_response",
        message: "Response body was not valid JSON",
      };
    }

    if (res.status === 401) {
      logger.warn("analytics.unauthorized", { status: res.status });
      return {
        ok: false,
        error: "unauthorized",
        message:
          "Analytics endpoint rejected the token — ANALYTICS_REPORT_SECRET here must match the one on sriwilaisukhothai.com",
      };
    }
    if (!res.ok) {
      logger.warn("analytics.unknown_error", {
        status: res.status,
        message: body.error,
      });
      return {
        ok: false,
        error: "unknown",
        message: body.error ?? `HTTP ${res.status}`,
      };
    }

    const text = body.text?.trim();
    if (!text) {
      logger.warn("analytics.empty_report", { status: res.status });
      return {
        ok: false,
        error: "empty_report",
        message: "Response had no `text` field to send",
      };
    }

    return { ok: true, text };
  }

  /**
   * Fetch and push as its own LINE message — the report is sent verbatim,
   * since the endpoint already formats it for LINE.
   */
  async send(): Promise<AnalyticsReportSendResult> {
    if (!this.ownerLineUserId) {
      logger.warn("analytics.no_recipient", {
        hint: "set OWNER_LINE_USER_ID",
      });
      return {
        sent: false,
        error: "not_configured",
        message: "OWNER_LINE_USER_ID is not set",
      };
    }

    const result = await this.fetchReport();
    if (!result.ok) {
      return { sent: false, error: result.error, message: result.message };
    }

    await this.line.pushText(this.ownerLineUserId, result.text);
    logger.info("analytics.report_sent", {
      recipient: this.ownerLineUserId,
      length: result.text.length,
    });
    return { sent: true };
  }
}
