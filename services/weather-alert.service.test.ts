import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Location, User, WeatherAlert, WeatherAlertType } from "@prisma/client";
import type {
  WeatherAlertRepository,
  WeatherAlertWithContext,
} from "@/repositories/weather-alert.repository";
import type { LocationRepository } from "@/repositories/location.repository";
import { LocationService } from "@/services/location.service";
import { AirVisualService } from "@/services/airvisual.service";
import type { LineService } from "@/lib/line";
import {
  WeatherAlertService,
  WeatherAlertNotFoundError,
  WeatherAlertLocationError,
  evaluateCondition,
} from "@/services/weather-alert.service";

const USER: User = {
  id: "user-1",
  lineUserId: "U123",
  displayName: "Test User",
  pictureUrl: null,
  role: "USER",
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    userId: "user-1",
    name: "Home",
    latitude: 13.7563,
    longitude: 100.5018,
    timezone: "Asia/Bangkok",
    country: "Thailand",
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAlert(overrides: Partial<WeatherAlertWithContext> = {}): WeatherAlertWithContext {
  return {
    id: "alert-1",
    userId: "user-1",
    locationId: "loc-1",
    type: "AQI" as WeatherAlertType,
    threshold: 100,
    isEnabled: true,
    lastState: false,
    lastNotifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: USER,
    location: makeLocation(),
    ...overrides,
  };
}

/** In-memory fake — tracks updateState calls for assertions. */
function makeFakeAlertRepo(seed: WeatherAlertWithContext[] = []) {
  const store: WeatherAlertWithContext[] = [...seed];
  const updateStateCalls: { id: string; state: boolean; notifiedAt?: Date }[] = [];

  const repo = {
    create: async (data: {
      userId: string;
      locationId: string;
      type: WeatherAlertType;
      threshold?: number;
    }): Promise<WeatherAlert> => {
      const created: WeatherAlertWithContext = {
        id: `alert-${store.length + 1}`,
        threshold: data.threshold ?? null,
        isEnabled: true,
        lastState: false,
        lastNotifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: USER,
        location: makeLocation({ id: data.locationId }),
        ...data,
      };
      store.push(created);
      return created;
    },
    findById: async (id: string) => store.find((a) => a.id === id) ?? null,
    listByUser: async (userId: string) => store.filter((a) => a.userId === userId),
    listEnabledWithContext: async () => store.filter((a) => a.isEnabled),
    setEnabled: async (id: string, isEnabled: boolean) => {
      const alert = store.find((a) => a.id === id);
      if (!alert) throw new Error("not found");
      alert.isEnabled = isEnabled;
      return alert;
    },
    updateState: async (id: string, state: boolean, notifiedAt?: Date) => {
      updateStateCalls.push({ id, state, notifiedAt });
      const alert = store.find((a) => a.id === id);
      if (!alert) return;
      alert.lastState = state;
      if (notifiedAt) alert.lastNotifiedAt = notifiedAt;
    },
    delete: async (id: string) => {
      const idx = store.findIndex((a) => a.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  } as unknown as WeatherAlertRepository;

  return { repo, store, updateStateCalls };
}

function makeFakeLocationRepo(locations: Location[]): LocationRepository {
  return {
    findById: async (id: string) => locations.find((l) => l.id === id) ?? null,
    listByUser: async (userId: string) => locations.filter((l) => l.userId === userId),
    findDefault: async () => null,
    searchByName: async () => [],
  } as unknown as LocationRepository;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function airVisualBody(overrides: {
  aqius?: number;
  pm25?: number | null;
  temperature?: number;
  windSpeed?: number;
  icon?: string;
} = {}) {
  return {
    status: "success",
    data: {
      city: "Bangkok",
      state: "Bangkok",
      country: "Thailand",
      current: {
        weather: {
          ts: "2026-07-24T00:00:00.000Z",
          tp: overrides.temperature ?? 32,
          pr: 1008,
          hu: 70,
          ws: overrides.windSpeed ?? 3.6,
          wd: 220,
          ic: overrides.icon ?? "01d",
        },
        pollution: {
          ts: "2026-07-24T00:00:00.000Z",
          aqius: overrides.aqius ?? 40,
          mainus: "p2",
        },
      },
    },
  };
}

describe("evaluateCondition", () => {
  const base = {
    weather: {
      temperature: 25,
      humidity: 60,
      pressure: 1010,
      windSpeed: 2,
      windDirection: 180,
      weatherIcon: "01d",
    },
    airQuality: { aqiUs: 40, pm25: null, pm10: null, mainPollutant: null },
    metadata: { city: "Bangkok", state: "Bangkok", country: "Thailand", timestamp: "" },
  };

  it("AQI: true only when above threshold", () => {
    expect(evaluateCondition("AQI", 100, { ...base, airQuality: { ...base.airQuality, aqiUs: 150 } })).toBe(true);
    expect(evaluateCondition("AQI", 100, { ...base, airQuality: { ...base.airQuality, aqiUs: 50 } })).toBe(false);
  });

  it("PM25: false when pm2.5 is unavailable, even above a hypothetical threshold", () => {
    expect(evaluateCondition("PM25", 10, base)).toBe(false);
  });

  it("PM25: true when concentration exceeds threshold", () => {
    expect(
      evaluateCondition("PM25", 10, { ...base, airQuality: { ...base.airQuality, pm25: 50 } }),
    ).toBe(true);
  });

  it("TEMPERATURE: true only when above threshold", () => {
    expect(evaluateCondition("TEMPERATURE", 35, { ...base, weather: { ...base.weather, temperature: 40 } })).toBe(true);
    expect(evaluateCondition("TEMPERATURE", 35, { ...base, weather: { ...base.weather, temperature: 30 } })).toBe(false);
  });

  it("WIND: true only when above threshold", () => {
    expect(evaluateCondition("WIND", 10, { ...base, weather: { ...base.weather, windSpeed: 15 } })).toBe(true);
    expect(evaluateCondition("WIND", 10, { ...base, weather: { ...base.weather, windSpeed: 5 } })).toBe(false);
  });

  it("RAIN: true for rain/thunderstorm icon codes, false otherwise", () => {
    expect(evaluateCondition("RAIN", null, { ...base, weather: { ...base.weather, weatherIcon: "10d" } })).toBe(true);
    expect(evaluateCondition("RAIN", null, { ...base, weather: { ...base.weather, weatherIcon: "11n" } })).toBe(true);
    expect(evaluateCondition("RAIN", null, { ...base, weather: { ...base.weather, weatherIcon: "01d" } })).toBe(false);
  });
});

describe("WeatherAlertService", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let airvisual: AirVisualService;
  let line: { pushText: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    airvisual = new AirVisualService("test-key");
    line = { pushText: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("create", () => {
    it("throws when the location doesn't exist or isn't owned by the user", async () => {
      const { repo } = makeFakeAlertRepo();
      const locationService = new LocationService(makeFakeLocationRepo([]));
      const service = new WeatherAlertService(
        repo,
        locationService,
        airvisual,
        line as unknown as LineService,
      );

      await expect(
        service.create("user-1", { locationId: "loc-missing", type: "AQI", threshold: 100 }),
      ).rejects.toThrow(WeatherAlertLocationError);
    });

    it("creates an alert for a location the user owns", async () => {
      const { repo } = makeFakeAlertRepo();
      const locationService = new LocationService(
        makeFakeLocationRepo([makeLocation({ id: "loc-1" })]),
      );
      const service = new WeatherAlertService(
        repo,
        locationService,
        airvisual,
        line as unknown as LineService,
      );

      const alert = await service.create("user-1", {
        locationId: "loc-1",
        type: "AQI",
        threshold: 100,
      });

      expect(alert.type).toBe("AQI");
      expect(alert.threshold).toBe(100);
      expect(alert.isEnabled).toBe(true);
    });
  });

  describe("setEnabled / delete ownership", () => {
    it("throws WeatherAlertNotFoundError for another user's alert", async () => {
      const { repo } = makeFakeAlertRepo([makeAlert({ userId: "other-user" })]);
      const locationService = new LocationService(makeFakeLocationRepo([]));
      const service = new WeatherAlertService(
        repo,
        locationService,
        airvisual,
        line as unknown as LineService,
      );

      await expect(service.setEnabled("user-1", "alert-1", false)).rejects.toThrow(
        WeatherAlertNotFoundError,
      );
      await expect(service.delete("user-1", "alert-1")).rejects.toThrow(
        WeatherAlertNotFoundError,
      );
    });

    it("disables and deletes the owner's own alert", async () => {
      const { repo, store } = makeFakeAlertRepo([makeAlert({ userId: "user-1" })]);
      const locationService = new LocationService(makeFakeLocationRepo([]));
      const service = new WeatherAlertService(
        repo,
        locationService,
        airvisual,
        line as unknown as LineService,
      );

      const disabled = await service.setEnabled("user-1", "alert-1", false);
      expect(disabled.isEnabled).toBe(false);

      await service.delete("user-1", "alert-1");
      expect(store).toHaveLength(0);
    });
  });

  describe("evaluateAll", () => {
    it("notifies on a false→true transition and marks lastState true", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, airVisualBody({ aqius: 150 })));
      const { repo, updateStateCalls } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "AQI", threshold: 100, lastState: false }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 1, notified: 1 });
      expect(line.pushText).toHaveBeenCalledTimes(1);
      expect(line.pushText.mock.calls[0][0]).toBe("U123");
      expect(updateStateCalls).toEqual([
        { id: "alert-1", state: true, notifiedAt: expect.any(Date) },
      ]);
    });

    it("does not re-notify when the condition is already true", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, airVisualBody({ aqius: 150 })));
      const { repo, updateStateCalls } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "AQI", threshold: 100, lastState: true }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 1, notified: 0 });
      expect(line.pushText).not.toHaveBeenCalled();
      expect(updateStateCalls).toEqual([]);
    });

    it("clears state silently on a true→false transition, without notifying", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, airVisualBody({ aqius: 40 })));
      const { repo, updateStateCalls } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "AQI", threshold: 100, lastState: true }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 1, notified: 0 });
      expect(line.pushText).not.toHaveBeenCalled();
      expect(updateStateCalls).toEqual([{ id: "alert-1", state: false, notifiedAt: undefined }]);
    });

    it("skips evaluation and leaves state untouched when AirVisual is unavailable", async () => {
      fetchMock.mockResolvedValue(jsonResponse(401, { status: "fail", message: "invalid_key" }));
      const { repo, updateStateCalls } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "AQI", threshold: 100, lastState: false }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 1, notified: 0 });
      expect(line.pushText).not.toHaveBeenCalled();
      expect(updateStateCalls).toEqual([]);
    });

    it("ignores disabled alerts", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, airVisualBody({ aqius: 150 })));
      const { repo } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "AQI", threshold: 100, isEnabled: false }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 0, notified: 0 });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("triggers a RAIN alert from a rain-family weather icon", async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, airVisualBody({ icon: "10d" })));
      const { repo } = makeFakeAlertRepo([
        makeAlert({ id: "alert-1", type: "RAIN", threshold: null, lastState: false }),
      ]);
      const service = new WeatherAlertService(
        repo,
        new LocationService(makeFakeLocationRepo([])),
        airvisual,
        line as unknown as LineService,
      );

      const result = await service.evaluateAll();

      expect(result).toEqual({ evaluated: 1, notified: 1 });
      expect(line.pushText).toHaveBeenCalledTimes(1);
    });
  });
});
