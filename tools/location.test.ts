import { describe, it, expect } from "vitest";
import type { Location, User } from "@prisma/client";
import type { LocationRepository } from "@/repositories/location.repository";
import { LocationService } from "@/services/location.service";
import { GeocodingService } from "@/services/geocoding.service";
import type { GeocodeResult, GeocodingProvider } from "@/services/geocoding/types";
import type { ToolContext, ToolServices } from "@/types";
import { locationTools } from "@/tools/location";

const locationTool = locationTools[0];

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

/** In-memory fake repository, scoped to a single user's locations. */
function makeFakeRepo(seed: Location[]): LocationRepository {
  const store = [...seed];
  return {
    findDefault: async (userId: string) =>
      store.find((l) => l.userId === userId && l.isDefault) ?? null,
    searchByName: async (userId: string, query: string) =>
      store.filter(
        (l) =>
          l.userId === userId &&
          l.name.toLowerCase().includes(query.toLowerCase()),
      ),
    findById: async (id: string) => store.find((l) => l.id === id) ?? null,
    listByUser: async (userId: string) =>
      store.filter((l) => l.userId === userId),
    create: async (data: Omit<Location, "id" | "createdAt" | "updatedAt">) => {
      if (data.isDefault) {
        store.forEach((l) => {
          if (l.userId === data.userId) l.isDefault = false;
        });
      }
      const created: Location = {
        ...data,
        id: `loc-${store.length + 1}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.push(created);
      return created;
    },
    update: async (id: string, userId: string, data: Partial<Location>) => {
      if (data.isDefault) {
        store.forEach((l) => {
          if (l.userId === userId && l.id !== id) l.isDefault = false;
        });
      }
      const existing = store.find((l) => l.id === id);
      if (!existing) throw new Error("not found");
      Object.assign(existing, data, { updatedAt: new Date() });
      return existing;
    },
    delete: async (id: string) => {
      const idx = store.findIndex((l) => l.id === id);
      if (idx >= 0) store.splice(idx, 1);
    },
  } as unknown as LocationRepository;
}

/** Fake geocoding provider returning a canned result set. */
class FakeGeocodingProvider implements GeocodingProvider {
  constructor(private results: Record<string, GeocodeResult[]>) {}
  async search(query: string): Promise<GeocodeResult[]> {
    return this.results[query] ?? [];
  }
}

const SRIWILAI_RESULT: GeocodeResult = {
  displayName: "Sriwilai Resort, Sukhothai, Thailand",
  latitude: 17.0078,
  longitude: 99.8237,
  country: "Thailand",
  timezone: "Asia/Bangkok",
};

function makeContext(
  locations: Location[],
  geocodeResults: Record<string, GeocodeResult[]>,
): { ctx: ToolContext; repo: LocationRepository } {
  const repo = makeFakeRepo(locations);
  const locationService = new LocationService(repo);
  const geocodingService = new GeocodingService(
    new FakeGeocodingProvider(geocodeResults),
  );
  const services = {
    location: locationService,
    geocoding: geocodingService,
  } as unknown as ToolServices;
  return { ctx: { user: USER, services }, repo };
}

describe("location tool", () => {
  describe("add", () => {
    it("saves the location when exactly one geocode match is found", async () => {
      const { ctx } = makeContext([], { "Sriwilai Resort": [SRIWILAI_RESULT] });

      const result = await locationTool.execute(
        { action: "add", place: "Sriwilai Resort" },
        ctx,
      );

      expect(result.ok).toBe(true);
      expect(result.action).toBe("add");
      expect((result as { location: { name: string } }).location).toMatchObject({
        name: "Sriwilai Resort",
        country: "Thailand",
        timezone: "Asia/Bangkok",
      });
    });

    it("returns ambiguous when multiple geocode matches are found", async () => {
      const { ctx } = makeContext([], {
        Springfield: [
          { ...SRIWILAI_RESULT, displayName: "Springfield, Illinois, USA" },
          { ...SRIWILAI_RESULT, displayName: "Springfield, Missouri, USA" },
        ],
      });

      const result = await locationTool.execute(
        { action: "add", place: "Springfield" },
        ctx,
      );

      expect(result).toEqual({
        ok: false,
        status: "ambiguous",
        query: "Springfield",
        candidates: [
          { displayName: "Springfield, Illinois, USA", country: "Thailand" },
          { displayName: "Springfield, Missouri, USA", country: "Thailand" },
        ],
      });
    });

    it("returns place_not_found when geocoding has no results", async () => {
      const { ctx } = makeContext([], {});

      const result = await locationTool.execute(
        { action: "add", place: "Nowhereville" },
        ctx,
      );

      expect(result).toEqual({
        ok: false,
        status: "place_not_found",
        query: "Nowhereville",
      });
    });

    it("returns missing_place when place is omitted", async () => {
      const { ctx } = makeContext([], {});

      const result = await locationTool.execute({ action: "add" }, ctx);

      expect(result).toEqual({ ok: false, status: "missing_place" });
    });
  });

  describe("remove", () => {
    it("deletes the matching location", async () => {
      const { ctx, repo } = makeContext(
        [makeLocation({ id: "loc-1", name: "บ้าน" })],
        {},
      );

      const result = await locationTool.execute(
        { action: "remove", place: "บ้าน" },
        ctx,
      );

      expect(result.ok).toBe(true);
      expect(result.action).toBe("remove");
      expect(await repo.findById("loc-1")).toBeNull();
    });

    it("returns location_not_found when nothing matches", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", name: "บ้าน" })], {});

      const result = await locationTool.execute(
        { action: "remove", place: "เชียงใหม่" },
        ctx,
      );

      expect(result).toEqual({
        ok: false,
        status: "location_not_found",
        query: "เชียงใหม่",
      });
    });

    it("returns ambiguous when multiple saved locations match", async () => {
      const { ctx } = makeContext(
        [
          makeLocation({ id: "loc-1", name: "Hotel Bangkok" }),
          makeLocation({ id: "loc-2", name: "Hotel Chiang Mai" }),
        ],
        {},
      );

      const result = await locationTool.execute(
        { action: "remove", place: "hotel" },
        ctx,
      );

      expect(result).toEqual({
        ok: false,
        status: "ambiguous",
        query: "hotel",
        candidates: ["Hotel Bangkok", "Hotel Chiang Mai"],
      });
    });
  });

  describe("list", () => {
    it("returns all saved locations and marks the default", async () => {
      const { ctx } = makeContext(
        [
          makeLocation({ id: "loc-1", name: "บ้าน", isDefault: true }),
          makeLocation({ id: "loc-2", name: "โรงแรม", isDefault: false }),
        ],
        {},
      );

      const result = await locationTool.execute({ action: "list" }, ctx);

      expect(result.ok).toBe(true);
      expect(result.count).toBe(2);
      expect(result.locations).toEqual([
        expect.objectContaining({ name: "บ้าน", isDefault: true }),
        expect.objectContaining({ name: "โรงแรม", isDefault: false }),
      ]);
    });
  });

  describe("set_default", () => {
    it("marks the matching location as default", async () => {
      const { ctx, repo } = makeContext(
        [
          makeLocation({ id: "loc-1", name: "บ้าน", isDefault: true }),
          makeLocation({ id: "loc-2", name: "โรงแรม", isDefault: false }),
        ],
        {},
      );

      const result = await locationTool.execute(
        { action: "set_default", place: "โรงแรม" },
        ctx,
      );

      expect(result.ok).toBe(true);
      expect((result as { location: { isDefault: boolean } }).location.isDefault).toBe(
        true,
      );

      const home = await repo.findById("loc-1");
      const hotel = await repo.findById("loc-2");
      expect(home?.isDefault).toBe(false);
      expect(hotel?.isDefault).toBe(true);
    });

    it("returns location_not_found when nothing matches", async () => {
      const { ctx } = makeContext([makeLocation({ id: "loc-1", name: "บ้าน" })], {});

      const result = await locationTool.execute(
        { action: "set_default", place: "ภูเก็ต" },
        ctx,
      );

      expect(result).toEqual({
        ok: false,
        status: "location_not_found",
        query: "ภูเก็ต",
      });
    });
  });
});
