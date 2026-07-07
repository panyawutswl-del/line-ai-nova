import type { CalendarEvent, PrismaClient } from "@prisma/client";

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
}
