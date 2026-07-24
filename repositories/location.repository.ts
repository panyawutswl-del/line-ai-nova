import type { Location, PrismaClient } from "@prisma/client";

export interface LocationInput {
  userId: string;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country: string;
  isDefault?: boolean;
}

export type LocationUpdateInput = Partial<
  Pick<
    LocationInput,
    "name" | "latitude" | "longitude" | "timezone" | "country" | "isDefault"
  >
>;

export class LocationRepository {
  constructor(private prisma: PrismaClient) {}

  async create(data: LocationInput): Promise<Location> {
    if (!data.isDefault) {
      return this.prisma.location.create({ data });
    }
    const [, location] = await this.prisma.$transaction([
      this.prisma.location.updateMany({
        where: { userId: data.userId, isDefault: true },
        data: { isDefault: false },
      }),
      this.prisma.location.create({ data }),
    ]);
    return location;
  }

  findById(id: string): Promise<Location | null> {
    return this.prisma.location.findUnique({ where: { id } });
  }

  listByUser(userId: string): Promise<Location[]> {
    return this.prisma.location.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async update(
    id: string,
    userId: string,
    data: LocationUpdateInput,
  ): Promise<Location> {
    if (!data.isDefault) {
      return this.prisma.location.update({ where: { id }, data });
    }
    const [, location] = await this.prisma.$transaction([
      this.prisma.location.updateMany({
        where: { userId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      }),
      this.prisma.location.update({ where: { id }, data }),
    ]);
    return location;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.location.delete({ where: { id } });
  }
}
