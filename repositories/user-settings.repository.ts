import type { PrismaClient, UserSettings } from "@prisma/client";

export type UserSettingsUpdate = Partial<
  Pick<
    UserSettings,
    | "morningBriefEnabled"
    | "eveningBriefEnabled"
    | "newsEnabled"
    | "weatherEnabled"
    | "timezone"
    | "language"
  >
>;

export class UserSettingsRepository {
  constructor(private prisma: PrismaClient) {}

  /** Return the user's settings row, creating it with defaults on first access. */
  getOrCreate(userId: string): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });
  }

  update(userId: string, data: UserSettingsUpdate): Promise<UserSettings> {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }
}
