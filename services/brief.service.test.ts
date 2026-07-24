import { describe, it, expect } from "vitest";
import type { Location, User, UserSettings } from "@prisma/client";
import type { UserRepository } from "@/repositories/user.repository";
import type { TodoRepository } from "@/repositories/todo.repository";
import type { ReminderRepository } from "@/repositories/reminder.repository";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import type { NewsService } from "@/services/news.service";
import type { CalendarService } from "@/services/calendar.service";
import type { SettingsService } from "@/services/settings.service";
import type { LocationService } from "@/services/location.service";
import type { AirVisualResult, AirVisualService } from "@/services/airvisual.service";
import type { WeatherAlertService } from "@/services/weather-alert.service";
import type { LineService } from "@/lib/line";
import { BriefService } from "@/services/brief.service";

const USER: User = {
  id: "user-1",
  lineUserId: "U123",
  displayName: "Test",
  pictureUrl: null,
  role: "USER",
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  return {
    id: "settings-1",
    userId: "user-1",
    morningBriefEnabled: true,
    eveningBriefEnabled: true,
    newsEnabled: false,
    weatherEnabled: true,
    timezone: "Asia/Bangkok",
    language: "th",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    userId: "user-1",
    name: "บ้าน",
    latitude: 13.7563,
    longitude: 100.5018,
    timezone: "Asia/Bangkok",
    country: "Thailand",
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const NO_OP_TODOS = {
  listDueBetween: async () => [],
  listOverdue: async () => [],
  listOpen: async () => [],
  listCompletedSince: async () => [],
} as unknown as TodoRepository;

const DISCONNECTED_CALENDAR = {
  isConnected: async () => false,
} as unknown as CalendarService;

function airVisualSnapshot(overrides: {
  aqius?: number;
  temperature?: number;
  windSpeed?: number;
  icon?: string;
} = {}) {
  return {
    weather: {
      temperature: overrides.temperature ?? 28,
      humidity: 60,
      pressure: 1010,
      windSpeed: overrides.windSpeed ?? 3,
      windDirection: 180,
      weatherIcon: overrides.icon ?? "01d",
    },
    airQuality: {
      aqiUs: overrides.aqius ?? 40,
      pm25: null,
      pm10: null,
      mainPollutant: null,
    },
    metadata: { city: "Bangkok", state: "Bangkok", country: "Thailand", timestamp: "" },
  };
}

function makeBriefService(opts: {
  location?: Location | null;
  airvisual?: AirVisualResult;
  activeAlerts?: {
    type: "AQI" | "PM25" | "TEMPERATURE" | "WIND" | "RAIN";
    comparison: "GT" | "GTE" | "LT" | "LTE" | null;
    threshold: number | null;
    isEnabled: boolean;
    lastState: boolean;
    location: Location;
  }[];
}): BriefService {
  const locationService = {
    getDefault: async () => opts.location ?? null,
  } as unknown as LocationService;

  const airvisual = {
    current: async () => opts.airvisual ?? { ok: false, error: "unknown", message: "no data" },
  } as unknown as AirVisualService;

  const weatherAlert = {
    list: async () => opts.activeAlerts ?? [],
  } as unknown as WeatherAlertService;

  return new BriefService(
    {} as unknown as UserRepository,
    NO_OP_TODOS,
    {} as unknown as ReminderRepository,
    { listActive: async () => [] } as unknown as NewsPreferenceRepository,
    {} as unknown as NewsService,
    DISCONNECTED_CALENDAR,
    locationService,
    airvisual,
    weatherAlert,
    {} as unknown as SettingsService,
    {} as unknown as LineService,
  );
}

describe("BriefService — morning brief weather integration (M8)", () => {
  it("includes Weather / Air Quality / Advice sections when location + AirVisual succeed", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 40, temperature: 28 }) },
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).toContain("🌤 อากาศ");
    expect(brief).toContain("28°C");
    expect(brief).toContain("🌫 คุณภาพอากาศ");
    expect(brief).toContain("AQI 40");
    expect(brief).toContain("💡 คำแนะนำวันนี้");
  });

  it("omits the weather section entirely when there's no default location", async () => {
    const service = makeBriefService({ location: null });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).not.toContain("🌤 อากาศ");
    expect(brief).not.toContain("🌫 คุณภาพอากาศ");
    expect(brief).not.toContain("💡 คำแนะนำวันนี้");
  });

  it("omits the section without failing the brief when AirVisual is unavailable", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: false, error: "invalid_api_key", message: "bad key" },
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).not.toContain("🌤 อากาศ");
    expect(brief.startsWith("☀️")).toBe(true);
  });

  it("skips the whole weather block when weatherEnabled is off", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: true, data: airVisualSnapshot() },
    });

    const brief = await service.composeMorning(USER, makeSettings({ weatherEnabled: false }));

    expect(brief).not.toContain("🌤 อากาศ");
  });

  it("gives AQI-unhealthy advice above 150, overriding the exercise suggestion", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 180, temperature: 28 }) },
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).toContain("หลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน");
  });

  it("gives good-exercise advice for good AQI and mild temperature", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 30, temperature: 26, windSpeed: 2 }) },
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).toContain("เหมาะกับการออกกำลังกายกลางแจ้ง");
  });

  it("appends an Active Alerts block when an alert is currently active", async () => {
    const home = makeLocation();
    const service = makeBriefService({
      location: home,
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 40 }) },
      activeAlerts: [
        {
          type: "AQI",
          comparison: "GT",
          threshold: 100,
          isEnabled: true,
          lastState: true,
          location: home,
        },
      ],
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).toContain("🚨 แจ้งเตือนที่กำลังทำงาน");
    expect(brief).toContain("AQI > 100");
  });

  it("omits Active Alerts when no alert is currently active", async () => {
    const home = makeLocation();
    const service = makeBriefService({
      location: home,
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 40 }) },
      activeAlerts: [
        {
          type: "AQI",
          comparison: "GT",
          threshold: 100,
          isEnabled: true,
          lastState: false,
          location: home,
        },
      ],
    });

    const brief = await service.composeMorning(USER, makeSettings());

    expect(brief).not.toContain("🚨");
  });

  it("renders English labels when the user's language is 'en'", async () => {
    const service = makeBriefService({
      location: makeLocation(),
      airvisual: { ok: true, data: airVisualSnapshot({ aqius: 40, temperature: 28 }) },
    });

    const brief = await service.composeMorning(USER, makeSettings({ language: "en" }));

    expect(brief).toContain("🌤 Weather");
    expect(brief).toContain("🌫 Air Quality");
    expect(brief).toContain("💡 Today's Advice");
  });
});
