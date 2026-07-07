import type { PrismaClient, Reminder, User } from "@prisma/client";

export type ReminderWithUser = Reminder & { user: User };

export class ReminderRepository {
  constructor(private prisma: PrismaClient) {}

  create(userId: string, message: string, remindAt: Date): Promise<Reminder> {
    return this.prisma.reminder.create({ data: { userId, message, remindAt } });
  }

  listPending(userId: string, take = 20): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: { userId, status: "PENDING" },
      orderBy: { remindAt: "asc" },
      take,
    });
  }

  listPendingBetween(
    userId: string,
    start: Date,
    end: Date,
  ): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: { userId, status: "PENDING", remindAt: { gte: start, lt: end } },
      orderBy: { remindAt: "asc" },
    });
  }

  searchPending(userId: string, query: string, take = 5): Promise<Reminder[]> {
    return this.prisma.reminder.findMany({
      where: {
        userId,
        status: "PENDING",
        message: { contains: query, mode: "insensitive" },
      },
      take,
    });
  }

  findDue(now: Date, take = 50): Promise<ReminderWithUser[]> {
    return this.prisma.reminder.findMany({
      where: { status: "PENDING", remindAt: { lte: now } },
      include: { user: true },
      orderBy: { remindAt: "asc" },
      take,
    });
  }

  /** Atomically claim a due reminder; returns false if another run took it. */
  async claim(id: string): Promise<boolean> {
    const result = await this.prisma.reminder.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "SENT", sentAt: new Date() },
    });
    return result.count === 1;
  }

  async release(id: string): Promise<void> {
    await this.prisma.reminder.update({
      where: { id },
      data: { status: "PENDING", sentAt: null },
    });
  }

  async cancel(id: string): Promise<void> {
    await this.prisma.reminder.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }
}
