import { describe, it, expect } from "vitest";
import type {
  ComparisonOperator,
  Location,
  User,
  WeatherAlert,
  WeatherAlertType,
} from "@prisma/client";
import type { LocationRepository } from "@/repositories/location.repository";
import type { WeatherAlertRepository } from "@/repositories/weather-alert.repository";
import { LocationService } from "@/services/location.service";
import { AirVisualService } from "@/services/airvisual.service";
import { WeatherAlertService } from "@/services/weather-alert.service";
import type { LineService } from "@/lib/line";
import type { ToolContext, ToolServices } from "@/types";
import { weatherAlertTools } from "@/tools/weather-alert";

const weatherAlertTool = weatherAlertTools[0];

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

function makeFakeLocationRepo(locations: Location[]): LocationRepository {
  return {
    findById: async (id: string) => locations.find((l) => l.id === id) ?? null,
    listByUser: async (userId: string) => locations.filter((l) => l.userId === userId),
    findDefault: async (userId: string) =>
      locations.find((l) => l.userId === userId && l.isDefault) ?? null,
    searchByName: async (userId: string, query: string) =>
      locations.filter(
        (l) =>
          l.userId === userId && l.name.toLowerCase().includes(query.toLowerCase()),
      ),
  } as unknown as LocationRepository;
}

interface FakeAlertRow extends WeatherAlert {
  location: Location;
}

function makeFakeAlertRepo(seed: FakeAlertRow[] = []) {
  const store: FakeAlertRow[] = [...seed];
  const repo = {
    create: async (data: {
      userId: string;
      locationId: string;
      type: WeatherAlertType;
      comparison?: ComparisonOperator;
      threshold?: number;
    }) => {
      const location = seed.find((s) => s.locationId === data.locationId)?.location;
      const created: FakeAlertRow = {
        id: `alert-${store.length + 1}`,
        userId: data.userId,
        locationId: data.locationId,
        type: data.type,
        comparison: data.comparison ?? null,
        threshold: data.threshold ?? null,
        isEnabled: true,
        lastState: false,
        lastNotifiedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        location: location ?? makeLocation({ id: data.locationId }),
      };
      store.push(created);
      return created;
    },
    findById: async (id: string) => store.find((a) => a.id === id) ?? null,
    listByUser: async (userId: string) => store.filter((a) => a.userId === userId),
    listEnabledWithContext: async () => [],
    setEnabled: async (id: string, isEnabled: boolean) => {
      const alert = store.find((a) => a.id === id);
      if (!alert) throw new Error("not found");
      alert.isEnabled = isEnabled;
      return alert;
    },
    updateState: async () => {},
    delete: async (id: string) => {
      const idx = store.findIndex((a) => a.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  } as unknown as WeatherAlertRepository;
  return { repo, store };
}

function withLocation(alert: Omit<FakeAlertRow, "location">, location: Location): FakeAlertRow {
  return { ...alert, location };
}

function makeContext(locations: Location[], alertSeed: FakeAlertRow[] = []) {
  const locationService = new LocationService(makeFakeLocationRepo(locations));
  const { repo, store } = makeFakeAlertRepo(alertSeed);
  const airvisual = new AirVisualService("");
  const line = { pushText: async () => {} } as unknown as LineService;
  const weatherAlertService = new WeatherAlertService(repo, locationService, airvisual, line);

  const services = {
    location: locationService,
    weatherAlert: weatherAlertService,
  } as unknown as ToolServices;
  const ctx: ToolContext = { user: USER, services };
  return { ctx, store };
}

describe("weather_alert tool", () => {
  describe("create", () => {
    it("creates an alert against the default location", async () => {
      const { ctx, store } = makeContext([makeLocation({ id: "loc-1", isDefault: true })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "AQI", comparison: ">", threshold: 100 },
        ctx,
      );

      expect(result).toMatchObject({
        ok: true,
        action: "create",
        alert: { type: "AQI", comparison: ">", threshold: 100, location: "Home", isEnabled: true },
      });
      expect(store).toHaveLength(1);
    });

    it("creates an alert against an explicitly named location (partial, case-insensitive)", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-2", name: "โรงแรมเชียงใหม่" })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "PM25", comparison: ">", threshold: 35, location: "เชียงใหม่" },
        ctx,
      );

      expect(result).toMatchObject({
        ok: true,
        alert: { type: "PM25", comparison: ">", threshold: 35, location: "โรงแรมเชียงใหม่" },
      });
    });

    it("supports the '<' comparison (e.g. 'แจ้งเมื่อ AQI ต่ำกว่า 50')", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", isDefault: true })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "AQI", comparison: "<", threshold: 50 },
        ctx,
      );

      expect(result).toMatchObject({ ok: true, alert: { comparison: "<", threshold: 50 } });
    });

    it("returns no_default_location when location is omitted and none is default", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", isDefault: false })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "AQI", comparison: ">", threshold: 100 },
        ctx,
      );

      expect(result).toEqual({ ok: false, status: "no_default_location" });
    });

    it("returns invalid_type for RAIN (not exposed yet) or unknown types", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", isDefault: true })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "RAIN", comparison: ">", threshold: 1 },
        ctx,
      );

      expect(result).toEqual({ ok: false, status: "invalid_type", type: "RAIN" });
    });

    it("returns invalid_comparison for an unsupported operator", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", isDefault: true })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "AQI", comparison: "==", threshold: 100 },
        ctx,
      );

      expect(result).toEqual({ ok: false, status: "invalid_comparison", comparison: "==" });
    });

    it("returns missing_threshold when threshold is omitted", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", isDefault: true })]);

      const result = await weatherAlertTool.execute(
        { action: "create", type: "AQI", comparison: ">" },
        ctx,
      );

      expect(result).toEqual({ ok: false, status: "missing_threshold" });
    });
  });

  describe("list", () => {
    it("returns all of the user's alerts", async () => {
      const home = makeLocation({ id: "loc-1", name: "Home" });
      const { ctx } = makeContext(
        [home],
        [
          withLocation(
            {
              id: "alert-1",
              userId: "user-1",
              locationId: "loc-1",
              type: "AQI",
              comparison: "GT",
              threshold: 100,
              isEnabled: true,
              lastState: false,
              lastNotifiedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            home,
          ),
        ],
      );

      const result = await weatherAlertTool.execute({ action: "list" }, ctx);

      expect(result).toMatchObject({
        ok: true,
        count: 1,
        alerts: [{ type: "AQI", comparison: ">", threshold: 100, location: "Home" }],
      });
    });
  });

  describe("delete / enable / disable", () => {
    function seedAlert(location: Location): FakeAlertRow {
      return withLocation(
        {
          id: "alert-1",
          userId: "user-1",
          locationId: location.id,
          type: "AQI",
          comparison: "GT",
          threshold: 100,
          isEnabled: true,
          lastState: false,
          lastNotifiedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        location,
      );
    }

    it("deletes by type + default location", async () => {
      const home = makeLocation({ id: "loc-1", isDefault: true });
      const { ctx, store } = makeContext([home], [seedAlert(home)]);

      const result = await weatherAlertTool.execute({ action: "delete", type: "AQI" }, ctx);

      expect(result).toMatchObject({ ok: true, action: "delete" });
      expect(store).toHaveLength(0);
    });

    it("deletes by alert_id directly, without type/location", async () => {
      const home = makeLocation({ id: "loc-1" });
      const { ctx, store } = makeContext([home], [seedAlert(home)]);

      const result = await weatherAlertTool.execute(
        { action: "delete", alert_id: "alert-1" },
        ctx,
      );

      expect(result).toMatchObject({ ok: true, action: "delete" });
      expect(store).toHaveLength(0);
    });

    it("returns alert_not_found when nothing matches", async () => {
      const home = makeLocation({ id: "loc-1", isDefault: true });
      const { ctx } = makeContext([home], []);

      const result = await weatherAlertTool.execute({ action: "delete", type: "AQI" }, ctx);

      expect(result).toMatchObject({ ok: false, status: "alert_not_found" });
    });

    it("disables then re-enables an alert", async () => {
      const home = makeLocation({ id: "loc-1", isDefault: true });
      const { ctx } = makeContext([home], [seedAlert(home)]);

      const disabled = await weatherAlertTool.execute(
        { action: "disable", type: "AQI" },
        ctx,
      );
      expect(disabled).toMatchObject({ ok: true, action: "disable", alert: { isEnabled: false } });

      const enabled = await weatherAlertTool.execute({ action: "enable", type: "AQI" }, ctx);
      expect(enabled).toMatchObject({ ok: true, action: "enable", alert: { isEnabled: true } });
    });
  });
});
