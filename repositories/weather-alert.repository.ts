import type {
  ComparisonOperator,
  Location,
  PrismaClient,
  User,
  WeatherAlert,
  WeatherAlertType,
} from "@prisma/client";

export interface WeatherAlertInput {
  userId: string;
  locationId: string;
  type: WeatherAlertType;
  comparison?: ComparisonOperator;
  threshold?: number;
}

export type WeatherAlertWithContext = WeatherAlert & {
  user: User;
  location: Location;
};

export class WeatherAlertRepository {
  constructor(private prisma: PrismaClient) {}

  create(data: WeatherAlertInput): Promise<WeatherAlert> {
    return this.prisma.weatherAlert.create({ data });
  }

  findById(id: string): Promise<WeatherAlert | null> {
    return this.prisma.weatherAlert.findUnique({ where: { id } });
  }

  listByUser(userId: string): Promise<(WeatherAlert & { location: Location })[]> {
    return this.prisma.weatherAlert.findMany({
      where: { userId },
      include: { location: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /** All enabled alerts across all users — the periodic evaluation input. */
  listEnabledWithContext(): Promise<WeatherAlertWithContext[]> {
    return this.prisma.weatherAlert.findMany({
      where: { isEnabled: true },
      include: { user: true, location: true },
    });
  }

  setEnabled(id: string, isEnabled: boolean): Promise<WeatherAlert> {
    return this.prisma.weatherAlert.update({ where: { id }, data: { isEnabled } });
  }

  async updateState(
    id: string,
    lastState: boolean,
    notifiedAt?: Date,
  ): Promise<void> {
    await this.prisma.weatherAlert.update({
      where: { id },
      data: {
        lastState,
        ...(notifiedAt ? { lastNotifiedAt: notifiedAt } : {}),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.weatherAlert.delete({ where: { id } });
  }
}
