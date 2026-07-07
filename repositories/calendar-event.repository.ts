import type { CalendarEvent, PrismaClient } from "@prisma/client";

export interface CalendarEventPatch {
  title?: string;
  description?: string | null;
  location?: string | null;
  startTime?: Date;
  endTime?: Date;
  allDay?: boolean;
}

export class CalendarEventRepository {
  constructor(private prisma: PrismaClient) {}

  create(data: {
    userId: string;
    googleEventId?: string;
    title: string;
    description?: string;
    location?: string;
    startTime: Date;
    endTime: Date;
    allDay?: boolean;
  }): Promise<CalendarEvent> {
    return this.prisma.calendarEvent.create({ data });
  }

  findByGoogleEventId(
    userId: string,
    googleEventId: string,
  ): Promise<CalendarEvent | null> {
    return this.prisma.calendarEvent.findFirst({
      where: { userId, googleEventId },
    });
  }

  /** Keep the local mirror in sync after a Google update (no-op if not mirrored). */
  async updateByGoogleEventId(
    userId: string,
    googleEventId: string,
    patch: CalendarEventPatch,
  ): Promise<void> {
    await this.prisma.calendarEvent.updateMany({
      where: { userId, googleEventId },
      data: patch,
    });
  }

  async deleteByGoogleEventId(
    userId: string,
    googleEventId: string,
  ): Promise<void> {
    await this.prisma.calendarEvent.deleteMany({
      where: { userId, googleEventId },
    });
  }
}
