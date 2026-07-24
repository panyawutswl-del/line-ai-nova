import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AirVisualService } from "./airvisual.service";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SUCCESS_BODY = {
  status: "success",
  data: {
    city: "Bangkok",
    state: "Bangkok",
    country: "Thailand",
    current: {
      weather: {
        ts: "2026-07-24T00:00:00.000Z",
        tp: 32,
        pr: 1008,
        hu: 70,
        ws: 3.6,
        wd: 220,
        ic: "10d",
      },
      pollution: {
        ts: "2026-07-24T00:00:00.000Z",
        aqius: 95,
        mainus: "p2",
      },
    },
  },
};

describe("AirVisualService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns not_configured when no API key is set", async () => {
    const service = new AirVisualService("");
    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("normalizes a successful response into the internal model", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SUCCESS_BODY));
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.data).toEqual({
      weather: {
        temperature: 32,
        humidity: 70,
        pressure: 1008,
        windSpeed: 3.6,
        windDirection: 220,
        weatherIcon: "10d",
      },
      airQuality: {
        aqiUs: 95,
        pm25: null,
        pm10: null,
        mainPollutant: "p2",
      },
      metadata: {
        city: "Bangkok",
        state: "Bangkok",
        country: "Thailand",
        timestamp: "2026-07-24T00:00:00.000Z",
      },
    });
  });

  it("maps HTTP 401 to invalid_api_key", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { status: "fail", message: "invalid_key" }),
    );
    const service = new AirVisualService("bad-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_api_key");
  });

  it("maps HTTP 429 to rate_limited", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, { status: "fail", message: "too_many_requests" }),
    );
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("rate_limited");
  });

  it("returns timeout when the request aborts due to timeout", async () => {
    fetchMock.mockImplementation(() =>
      Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
    );
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("timeout");
  });

  it("returns network_error on fetch rejection", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("fetch failed")));
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("network_error");
  });

  it("returns malformed_response when the body isn't valid JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("not json", { status: 200 }),
    );
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_response");
  });

  it("returns malformed_response when required fields are missing", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { status: "success", data: { city: "Bangkok" } }),
    );
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("malformed_response");
  });

  it("returns unknown for an unrecognized error status", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, { status: "fail", message: "internal_server_error" }),
    );
    const service = new AirVisualService("test-key");

    const result = await service.current(13.7, 100.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("unknown");
  });
});
