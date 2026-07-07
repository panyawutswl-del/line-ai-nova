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
    const params = new URLSearchParams({
      latitude: String(this.location.latitude),
      longitude: String(this.location.longitude),
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
        locationName: this.location.locationName,
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
