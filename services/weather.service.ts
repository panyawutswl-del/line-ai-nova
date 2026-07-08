import type { AppConfig } from "@/lib/config";
import { logger, errorInfo } from "@/lib/logger";

export interface WeatherSnapshot {
  locationName: string;
  temperature: number;
  /** Daily high / low in °C. */
  high: number;
  low: number;
  /** Human-readable condition with a leading emoji. */
  condition: string;
  /** Max chance of precipitation today, 0–100. */
  rainProbability: number;
}

/** WMO weather codes → Thai description + emoji. */
const WMO: Record<number, string> = {
  0: "☀️ ท้องฟ้าแจ่มใส",
  1: "🌤 ส่วนใหญ่แจ่มใส",
  2: "⛅ มีเมฆบางส่วน",
  3: "☁️ เมฆมาก",
  45: "🌫 หมอก",
  48: "🌫 หมอกน้ำแข็ง",
  51: "🌦 ฝนปรอยเล็กน้อย",
  53: "🌦 ฝนปรอย",
  55: "🌦 ฝนปรอยหนาแน่น",
  61: "🌧 ฝนตกเล็กน้อย",
  63: "🌧 ฝนตก",
  65: "🌧 ฝนตกหนัก",
  71: "🌨 หิมะเล็กน้อย",
  73: "🌨 หิมะ",
  75: "🌨 หิมะหนัก",
  80: "🌦 ฝนซู่เล็กน้อย",
  81: "🌧 ฝนซู่",
  82: "⛈ ฝนซู่รุนแรง",
  95: "⛈ พายุฝนฟ้าคะนอง",
  96: "⛈ พายุฝนฟ้าคะนองมีลูกเห็บ",
  99: "⛈ พายุฝนฟ้าคะนองมีลูกเห็บหนัก",
};

/**
 * Current conditions from Open-Meteo (free, no API key).
 * Returns null on any failure — the brief simply omits the weather line.
 */
export class WeatherService {
  constructor(private location: AppConfig["weather"]) {}

  async current(): Promise<WeatherSnapshot | null> {
    return this.forecast(
      this.location.latitude,
      this.location.longitude,
      this.location.locationName,
    );
  }

  /** Geocodes `city` via Open-Meteo, then fetches its current forecast. Null if the city can't be found or any fetch fails. */
  async forCity(city: string): Promise<WeatherSnapshot | null> {
    const place = await this.geocode(city);
    if (!place) return null;
    return this.forecast(place.latitude, place.longitude, place.name);
  }

  private async geocode(
    city: string,
  ): Promise<{ latitude: number; longitude: number; name: string } | null> {
    const params = new URLSearchParams({
      name: city,
      count: "1",
      language: "th",
      format: "json",
    });
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?${params}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) {
        logger.warn("weather.geocode_failed", { status: res.status, city });
        return null;
      }
      const data = (await res.json()) as {
        results?: { latitude: number; longitude: number; name: string }[];
      };
      const match = data.results?.[0];
      if (!match) return null;
      return { latitude: match.latitude, longitude: match.longitude, name: match.name };
    } catch (err) {
      logger.warn("weather.geocode_failed", { ...errorInfo(err), city });
      return null;
    }
  }

  private async forecast(
    latitude: number,
    longitude: number,
    locationName: string,
  ): Promise<WeatherSnapshot | null> {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,weather_code",
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
      timezone: "Asia/Bangkok",
      forecast_days: "1",
    });
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?${params}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      if (!res.ok) {
        logger.warn("weather.fetch_failed", { status: res.status });
        return null;
      }
      const data = (await res.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
        daily?: {
          temperature_2m_max?: number[];
          temperature_2m_min?: number[];
          precipitation_probability_max?: number[];
        };
      };
      if (data.current?.temperature_2m === undefined) return null;

      const code = data.current.weather_code ?? 0;
      return {
        locationName,
        temperature: Math.round(data.current.temperature_2m),
        high: Math.round(data.daily?.temperature_2m_max?.[0] ?? data.current.temperature_2m),
        low: Math.round(data.daily?.temperature_2m_min?.[0] ?? data.current.temperature_2m),
        condition: WMO[code] ?? "🌡 ไม่ทราบสภาพอากาศ",
        rainProbability: data.daily?.precipitation_probability_max?.[0] ?? 0,
      };
    } catch (err) {
      logger.warn("weather.fetch_failed", errorInfo(err));
      return null;
    }
  }
}
