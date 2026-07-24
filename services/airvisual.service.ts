import { logger, errorInfo } from "@/lib/logger";

const BASE_URL = "https://api.airvisual.com/v2/nearest_city";
const TIMEOUT_MS = 8_000;

export interface AirQualitySnapshot {
  weather: {
    /** °C */
    temperature: number;
    /** % */
    humidity: number;
    /** hPa */
    pressure: number;
    /** m/s */
    windSpeed: number;
    /** degrees */
    windDirection: number;
    weatherIcon: string;
  };
  airQuality: {
    /** US EPA AQI */
    aqiUs: number;
    pm25: number | null;
    pm10: number | null;
    mainPollutant: string | null;
  };
  metadata: {
    city: string;
    state: string;
    country: string;
    /** ISO 8601 */
    timestamp: string;
  };
}

export type AirVisualErrorCode =
  | "not_configured"
  | "invalid_api_key"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "malformed_response"
  | "unknown";

export type AirVisualResult =
  | { ok: true; data: AirQualitySnapshot }
  | { ok: false; error: AirVisualErrorCode; message: string };

/** Raw shape of a successful `nearest_city` response — only the fields we use. */
interface AirVisualApiResponse {
  status: string;
  data?: {
    city?: string;
    state?: string;
    country?: string;
    current?: {
      weather?: {
        tp?: number;
        hu?: number;
        pr?: number;
        ws?: number;
        wd?: number;
        ic?: string;
        ts?: string;
      };
      pollution?: {
        ts?: string;
        aqius?: number;
        mainus?: string;
        p2?: { conc?: number };
        p1?: { conc?: number };
      };
    };
  };
  message?: string;
}

/**
 * Typed client + service for the AirVisual (IQAir) API.
 * Never throws — every failure mode is returned as a typed error result.
 */
export class AirVisualService {
  constructor(private apiKey: string) {}

  async current(latitude: number, longitude: number): Promise<AirVisualResult> {
    if (!this.apiKey) {
      return {
        ok: false,
        error: "not_configured",
        message: "AIRVISUAL_API_KEY is not set",
      };
    }

    const params = new URLSearchParams({
      lat: String(latitude),
      lon: String(longitude),
      key: this.apiKey,
    });

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}?${params}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "TimeoutError") {
        logger.warn("airvisual.timeout", { latitude, longitude });
        return { ok: false, error: "timeout", message: "Request timed out" };
      }
      logger.warn("airvisual.network_error", {
        ...errorInfo(err),
        latitude,
        longitude,
      });
      return {
        ok: false,
        error: "network_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    let body: AirVisualApiResponse;
    try {
      body = (await res.json()) as AirVisualApiResponse;
    } catch (err) {
      logger.warn("airvisual.malformed_response", {
        ...errorInfo(err),
        status: res.status,
      });
      return {
        ok: false,
        error: "malformed_response",
        message: "Response body was not valid JSON",
      };
    }

    if (!res.ok || body.status !== "success") {
      return this.mapErrorResponse(res.status, body);
    }

    const snapshot = this.normalize(body);
    if (!snapshot) {
      logger.warn("airvisual.malformed_response", { body });
      return {
        ok: false,
        error: "malformed_response",
        message: "Response was missing required fields",
      };
    }

    return { ok: true, data: snapshot };
  }

  private mapErrorResponse(
    status: number,
    body: AirVisualApiResponse,
  ): AirVisualResult {
    const message = body.message ?? `HTTP ${status}`;

    if (status === 401 || /invalid_key|incorrect_key|api_key_expired/i.test(message)) {
      logger.warn("airvisual.invalid_api_key", { status, message });
      return { ok: false, error: "invalid_api_key", message };
    }
    if (status === 429 || /too_many_requests|call_limit_reached/i.test(message)) {
      logger.warn("airvisual.rate_limited", { status, message });
      return { ok: false, error: "rate_limited", message };
    }
    logger.warn("airvisual.unknown_error", { status, message });
    return { ok: false, error: "unknown", message };
  }

  private normalize(body: AirVisualApiResponse): AirQualitySnapshot | null {
    const data = body.data;
    const weather = data?.current?.weather;
    const pollution = data?.current?.pollution;

    if (
      !data?.city ||
      !data.state ||
      !data.country ||
      weather?.tp === undefined ||
      weather?.hu === undefined ||
      weather?.pr === undefined ||
      weather?.ws === undefined ||
      weather?.wd === undefined ||
      pollution?.aqius === undefined
    ) {
      return null;
    }

    return {
      weather: {
        temperature: weather.tp,
        humidity: weather.hu,
        pressure: weather.pr,
        windSpeed: weather.ws,
        windDirection: weather.wd,
        weatherIcon: weather.ic ?? "",
      },
      airQuality: {
        aqiUs: pollution.aqius,
        pm25: pollution.p2?.conc ?? null,
        pm10: pollution.p1?.conc ?? null,
        mainPollutant: pollution.mainus ?? null,
      },
      metadata: {
        city: data.city,
        state: data.state,
        country: data.country,
        timestamp: pollution.ts ?? weather.ts ?? new Date().toISOString(),
      },
    };
  }
}
