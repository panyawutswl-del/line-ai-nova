import type { ComparisonOperator, WeatherAlert, WeatherAlertType } from "@prisma/client";
import type {
  WeatherAlertRepository,
  WeatherAlertWithContext,
} from "@/repositories/weather-alert.repository";
import type { LocationService } from "@/services/location.service";
import type { AirQualitySnapshot, AirVisualService } from "@/services/airvisual.service";
import type { LineService } from "@/lib/line";
import { logger, errorInfo } from "@/lib/logger";

export class WeatherAlertNotFoundError extends Error {
  constructor() {
    super("Weather alert not found");
    this.name = "WeatherAlertNotFoundError";
  }
}

export class WeatherAlertLocationError extends Error {
  constructor() {
    super("Location not found or not owned by this user");
    this.name = "WeatherAlertLocationError";
  }
}

export interface CreateWeatherAlertInput {
  locationId: string;
  type: WeatherAlertType;
  /** Required for AQI/PM25/TEMPERATURE/WIND; ignored for RAIN. */
  comparison?: ComparisonOperator;
  threshold?: number;
}

/** OpenWeatherMap-style icon prefixes that mean rain/thunderstorm — AirVisual reuses this iconography. */
const RAIN_ICON_PREFIXES = ["09", "10", "11"];

function isRainIcon(icon: string): boolean {
  return RAIN_ICON_PREFIXES.some((prefix) => icon.startsWith(prefix));
}

export const COMPARISON_SYMBOL: Record<ComparisonOperator, string> = {
  GT: ">",
  GTE: ">=",
  LT: "<",
  LTE: "<=",
};

function compare(value: number, comparison: ComparisonOperator, threshold: number): boolean {
  switch (comparison) {
    case "GT":
      return value > threshold;
    case "GTE":
      return value >= threshold;
    case "LT":
      return value < threshold;
    case "LTE":
      return value <= threshold;
  }
}

/** Whether the alert's condition currently holds, given a fresh AirVisual snapshot. */
export function evaluateCondition(
  type: WeatherAlertType,
  comparison: ComparisonOperator | null,
  threshold: number | null,
  data: AirQualitySnapshot,
): boolean {
  if (type === "RAIN") return isRainIcon(data.weather.weatherIcon);
  if (comparison === null || threshold === null) return false;

  switch (type) {
    case "AQI":
      return compare(data.airQuality.aqiUs, comparison, threshold);
    case "PM25":
      return data.airQuality.pm25 !== null && compare(data.airQuality.pm25, comparison, threshold);
    case "TEMPERATURE":
      return compare(data.weather.temperature, comparison, threshold);
    case "WIND":
      return compare(data.weather.windSpeed, comparison, threshold);
  }
}

const TYPE_LABEL: Record<WeatherAlertType, string> = {
  AQI: "AQI",
  PM25: "ฝุ่น PM2.5",
  RAIN: "มีแนวโน้มฝนตกหนัก",
  TEMPERATURE: "อุณหภูมิ",
  WIND: "ความเร็วลม",
};

function buildAlertMessage(
  alert: WeatherAlertWithContext,
  data: AirQualitySnapshot,
): string {
  const symbol = alert.comparison ? COMPARISON_SYMBOL[alert.comparison] : "";
  const lines = [`⚠️ แจ้งเตือน: ${TYPE_LABEL[alert.type]}`, `📍 ${alert.location.name}`];
  switch (alert.type) {
    case "AQI":
      lines.push(`AQI ปัจจุบัน ${data.airQuality.aqiUs} (เงื่อนไข ${symbol} ${alert.threshold})`);
      break;
    case "PM25":
      lines.push(`PM2.5 ปัจจุบัน ${data.airQuality.pm25} µg/m³ (เงื่อนไข ${symbol} ${alert.threshold})`);
      break;
    case "TEMPERATURE":
      lines.push(`อุณหภูมิปัจจุบัน ${data.weather.temperature}°C (เงื่อนไข ${symbol} ${alert.threshold}°C)`);
      break;
    case "WIND":
      lines.push(`ความเร็วลมปัจจุบัน ${data.weather.windSpeed} m/s (เงื่อนไข ${symbol} ${alert.threshold} m/s)`);
      break;
    case "RAIN":
      lines.push("โปรดเตรียมร่มหรือเสื้อกันฝนไว้ล่วงหน้า");
      break;
  }
  return lines.join("\n");
}

export class WeatherAlertService {
  constructor(
    private alerts: WeatherAlertRepository,
    private locations: LocationService,
    private airvisual: AirVisualService,
    private line: LineService,
  ) {}

  list(userId: string) {
    return this.alerts.listByUser(userId);
  }

  async create(
    userId: string,
    input: CreateWeatherAlertInput,
  ): Promise<WeatherAlert> {
    const location = await this.locations.get(userId, input.locationId);
    if (!location) throw new WeatherAlertLocationError();

    const alert = await this.alerts.create({
      userId,
      locationId: input.locationId,
      type: input.type,
      comparison: input.comparison,
      threshold: input.threshold,
    });
    logger.info("weather_alert.created", {
      userId,
      alertId: alert.id,
      type: alert.type,
      comparison: alert.comparison,
      threshold: alert.threshold,
    });
    return alert;
  }

  async setEnabled(
    userId: string,
    id: string,
    isEnabled: boolean,
  ): Promise<WeatherAlert> {
    const existing = await this.alerts.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new WeatherAlertNotFoundError();
    }
    const updated = await this.alerts.setEnabled(id, isEnabled);
    logger.info("weather_alert.enabled_changed", { userId, alertId: id, isEnabled });
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.alerts.findById(id);
    if (!existing || existing.userId !== userId) {
      throw new WeatherAlertNotFoundError();
    }
    await this.alerts.delete(id);
    logger.info("weather_alert.deleted", { userId, alertId: id });
  }

  /**
   * Cron entrypoint — evaluate every enabled alert once against a fresh
   * AirVisual snapshot. Notifies only on a false→true transition; state is
   * otherwise updated silently so a later false→true can fire again.
   * AirVisual failures leave the alert's state untouched (skip, don't flip).
   */
  async evaluateAll(): Promise<{ evaluated: number; notified: number }> {
    const alerts = await this.alerts.listEnabledWithContext();
    let notified = 0;

    for (const alert of alerts) {
      const result = await this.airvisual.current(
        alert.location.latitude,
        alert.location.longitude,
      );
      if (!result.ok) {
        logger.warn("weather_alert.evaluation_skipped", {
          alertId: alert.id,
          reason: result.error,
        });
        continue;
      }

      const condition = evaluateCondition(
        alert.type,
        alert.comparison,
        alert.threshold,
        result.data,
      );

      if (condition && !alert.lastState) {
        try {
          await this.line.pushText(
            alert.user.lineUserId,
            buildAlertMessage(alert, result.data),
          );
          await this.alerts.updateState(alert.id, true, new Date());
          notified++;
          logger.info("weather_alert.notified", { alertId: alert.id, type: alert.type });
        } catch (err) {
          logger.error("weather_alert.notify_failed", {
            alertId: alert.id,
            ...errorInfo(err),
          });
        }
      } else if (condition !== alert.lastState) {
        await this.alerts.updateState(alert.id, condition);
      }
    }

    logger.info("weather_alert.evaluation_finished", {
      evaluated: alerts.length,
      notified,
    });
    return { evaluated: alerts.length, notified };
  }
}
