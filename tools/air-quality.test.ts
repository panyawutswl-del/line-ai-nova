import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Location, User } from "@prisma/client";
import type { LocationRepository } from "@/repositories/location.repository";
import { LocationService } from "@/services/location.service";
import { AirVisualService } from "@/services/airvisual.service";
import type { ToolContext, ToolServices } from "@/types";
import { airQualityTools } from "@/tools/air-quality";

const weatherTool = airQualityTools[0];

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

function makeLocation(overrides: Partial<Location>): Location {
  return {
    id: overrides.id ?? "loc-1",
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

/** Fake repository — in-memory, scoped to a single user's locations. */
function makeFakeRepo(locations: Location[]): LocationRepository {
  return {
    findDefault: async (userId: string) =>
      locations.find((l) => l.userId === userId && l.isDefault) ?? null,
    searchByName: async (userId: string, query: string) =>
      locations.filter(
        (l) =>
          l.userId === userId &&
          l.name.toLowerCase().includes(query.toLowerCase()),
      ),
    findById: async (id: string) => locations.find((l) => l.id === id) ?? null,
    listByUser: async (userId: string) =>
      locations.filter((l) => l.userId === userId),
  } as unknown as LocationRepository;
}

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
      weather: { ts: "2026-07-24T00:00:00.000Z", tp: 32, pr: 1008, hu: 70, ws: 3.6, wd: 220, ic: "10d" },
      pollution: { ts: "2026-07-24T00:00:00.000Z", aqius: 95, mainus: "p2" },
    },
  },
};

function makeContext(locations: Location[], airvisual: AirVisualService): ToolContext {
  const locationService = new LocationService(makeFakeRepo(locations));
  const services = {
    location: locationService,
    airvisual,
  } as unknown as ToolServices;
  return { user: USER, services };
}

describe("weather tool", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let airvisual: AirVisualService;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    airvisual = new AirVisualService("test-key");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns no_default_location when location is omitted and none is default", async () => {
    const ctx = makeContext([makeLocation({ id: "loc-1", isDefault: false })], airvisual);

    const result = await weatherTool.execute({}, ctx);

    expect(result).toEqual({ ok: false, status: "no_default_location" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the default location when location is omitted", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SUCCESS_BODY));
    const ctx = makeContext(
      [makeLocation({ id: "loc-1", name: "Home", isDefault: true })],
      airvisual,
    );

    const result = await weatherTool.execute({}, ctx);

    expect(result.ok).toBe(true);
    expect((result as { location: { name: string } }).location.name).toBe("Home");
    expect(result).toHaveProperty("weather");
    expect(result).toHaveProperty("airQuality");
    expect(result).toHaveProperty("metadata");
  });

  it("matches a saved location case-insensitively and partially", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, SUCCESS_BODY));
    const ctx = makeContext(
      [makeLocation({ id: "loc-1", name: "โรงแรมเชียงใหม่" })],
      airvisual,
    );

    const result = await weatherTool.execute({ location: "เชียงใหม่" }, ctx);

    expect(result.ok).toBe(true);
    expect((result as { location: { name: string } }).location.name).toBe(
      "โรงแรมเชียงใหม่",
    );
  });

  it("returns location_not_found when no saved location matches", async () => {
    const ctx = makeContext([makeLocation({ id: "loc-1", name: "Home" })], airvisual);

    const result = await weatherTool.execute({ location: "Phuket" }, ctx);

    expect(result).toEqual({
      ok: false,
      status: "location_not_found",
      query: "Phuket",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns ambiguous when multiple locations match", async () => {
    const ctx = makeContext(
      [
        makeLocation({ id: "loc-1", name: "Hotel Bangkok" }),
        makeLocation({ id: "loc-2", name: "Hotel Chiang Mai" }),
      ],
      airvisual,
    );

    const result = await weatherTool.execute({ location: "hotel" }, ctx);

    expect(result).toEqual({
      ok: false,
      status: "ambiguous",
      query: "hotel",
      candidates: ["Hotel Bangkok", "Hotel Chiang Mai"],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns airvisual_unavailable with the error reason on API failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { status: "fail", message: "invalid_key" }),
    );
    const ctx = makeContext(
      [makeLocation({ id: "loc-1", name: "Home", isDefault: true })],
      airvisual,
    );

    const result = await weatherTool.execute({}, ctx);

    expect(result).toEqual({
      ok: false,
      status: "airvisual_unavailable",
      reason: "invalid_api_key",
      location: { name: "Home", country: "Thailand", timezone: "Asia/Bangkok" },
    });
  });

  it("returns airvisual_unavailable(timeout) when the request times out", async () => {
    fetchMock.mockImplementation(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError")),
    );
    const ctx = makeContext(
      [makeLocation({ id: "loc-1", name: "Home", isDefault: true })],
      airvisual,
    );

    const result = await weatherTool.execute({}, ctx);

    expect(result).toEqual({
      ok: false,
      status: "airvisual_unavailable",
      reason: "timeout",
      location: { name: "Home", country: "Thailand", timezone: "Asia/Bangkok" },
    });
  });
});
