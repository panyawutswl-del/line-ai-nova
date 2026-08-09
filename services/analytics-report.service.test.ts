import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnalyticsReportService } from "./analytics-report.service";

const URL = "https://sriwilaisukhothai.com/api/analytics-report";
const REPORT_TEXT = "📊 รายงาน Google Analytics\nผู้เข้าชม 1,234 คน";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeService(overrides: { secret?: string; owner?: string } = {}) {
  const pushText = vi.fn().mockResolvedValue(undefined);
  const service = new AnalyticsReportService(
    URL,
    overrides.secret ?? "test-secret",
    { pushText },
    overrides.owner ?? "U-owner",
  );
  return { service, pushText };
}

describe("AnalyticsReportService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the report text verbatim to the owner", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { text: REPORT_TEXT, summary: { users: 1234 } }),
    );
    const { service, pushText } = makeService();

    const result = await service.send();

    expect(result).toEqual({ sent: true });
    expect(pushText).toHaveBeenCalledWith("U-owner", REPORT_TEXT);
  });

  it("authenticates with a Bearer token", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { text: REPORT_TEXT }));
    const { service } = makeService({ secret: "s3cr3t" });

    await service.fetchReport();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(URL);
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer s3cr3t",
    );
  });

  it("reports a secret mismatch when the endpoint answers 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { error: "Unauthorized" }));
    const { service, pushText } = makeService();

    const result = await service.send();

    expect(result.sent).toBe(false);
    expect(result.error).toBe("unauthorized");
    expect(result.message).toContain("ANALYTICS_REPORT_SECRET");
    expect(pushText).not.toHaveBeenCalled();
  });

  it("skips the request entirely when no secret is configured", async () => {
    const { service, pushText } = makeService({ secret: "" });

    const result = await service.send();

    expect(result.error).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushText).not.toHaveBeenCalled();
  });

  it("does not push when there is no owner to push to", async () => {
    const { service, pushText } = makeService({ owner: "" });

    const result = await service.send();

    expect(result.error).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(pushText).not.toHaveBeenCalled();
  });

  it("treats a missing or blank text field as an empty report", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { summary: { users: 0 } }));
    const { service, pushText } = makeService();

    const result = await service.send();

    expect(result.error).toBe("empty_report");
    expect(pushText).not.toHaveBeenCalled();
  });

  it("maps a timeout to a typed result instead of throwing", async () => {
    fetchMock.mockRejectedValue(
      new DOMException("The operation was aborted", "TimeoutError"),
    );
    const { service } = makeService();

    const result = await service.fetchReport();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timeout");
  });

  it("maps a non-JSON body to malformed_response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 502 }));
    const { service } = makeService();

    const result = await service.fetchReport();

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_response");
  });

  it("maps other upstream failures to unknown", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, { error: "GA4 quota" }));
    const { service } = makeService();

    const result = await service.fetchReport();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("unknown");
      expect(result.message).toBe("GA4 quota");
    }
  });
});
