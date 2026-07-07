import type { Prisma, PrismaClient } from "@prisma/client";

export class SettingsRepository {
  constructor(private prisma: PrismaClient) {}

  async get<T = unknown>(userId: string, key: string): Promise<T | null> {
    const row = await this.prisma.setting.findUnique({
      where: { userId_key: { userId, key } },
    });
    return row ? (row.value as T) : null;
  }

  async set(
    userId: string,
    key: string,
    value: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.setting.upsert({
      where: { userId_key: { userId, key } },
      update: { value },
      create: { userId, key, value },
    });
  }

  async delete(userId: string, key: string): Promise<void> {
    await this.prisma.setting.deleteMany({ where: { userId, key } });
  }
}
