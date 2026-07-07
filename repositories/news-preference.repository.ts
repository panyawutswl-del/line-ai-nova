import type { NewsPreference, PrismaClient } from "@prisma/client";

export class NewsPreferenceRepository {
  constructor(private prisma: PrismaClient) {}

  subscribe(userId: string, topic: string): Promise<NewsPreference> {
    return this.prisma.newsPreference.upsert({
      where: { userId_topic: { userId, topic } },
      update: { isActive: true },
      create: { userId, topic },
    });
  }

  async unsubscribe(userId: string, topic: string): Promise<boolean> {
    const match = await this.prisma.newsPreference.findFirst({
      where: {
        userId,
        isActive: true,
        topic: { equals: topic, mode: "insensitive" },
      },
    });
    if (!match) return false;
    await this.prisma.newsPreference.update({
      where: { id: match.id },
      data: { isActive: false },
    });
    return true;
  }

  listActive(userId: string): Promise<NewsPreference[]> {
    return this.prisma.newsPreference.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }
}
