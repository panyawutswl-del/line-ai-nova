import type { Location } from "@prisma/client";
import type {
  LocationRepository,
  LocationUpdateInput,
} from "@/repositories/location.repository";
import { logger } from "@/lib/logger";

export class LocationNotFoundError extends Error {
  constructor() {
    super("Location not found");
    this.name = "LocationNotFoundError";
  }
}

export interface LocationCreateInput {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string;
  isDefault?: boolean;
}

export class LocationService {
  constructor(private locations: LocationRepository) {}

  list(userId: string): Promise<Location[]> {
    return this.locations.listByUser(userId);
  }

  /** Returns null when the location doesn't exist or belongs to another user. */
  async get(userId: string, id: string): Promise<Location | null> {
    const location = await this.locations.findById(id);
    return location && location.userId === userId ? location : null;
  }

  async create(userId: string, input: LocationCreateInput): Promise<Location> {
    const location = await this.locations.create({ userId, ...input });
    logger.info("location.created", {
      userId,
      locationId: location.id,
      isDefault: location.isDefault,
    });
    return location;
  }

  async update(
    userId: string,
    id: string,
    input: LocationUpdateInput,
  ): Promise<Location> {
    const existing = await this.get(userId, id);
    if (!existing) throw new LocationNotFoundError();

    const updated = await this.locations.update(id, userId, input);
    logger.info("location.updated", {
      userId,
      locationId: id,
      fields: Object.keys(input),
    });
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const existing = await this.get(userId, id);
    if (!existing) throw new LocationNotFoundError();

    await this.locations.delete(id);
    logger.info("location.deleted", { userId, locationId: id });
  }
}
