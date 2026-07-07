import { Type } from "@google/genai";
import type { NovaTool } from "@/types";
import { str, isoDate, ISO_HINT } from "@/tools/helpers";
import { logger } from "@/lib/logger";

const NOT_CONFIGURED = {
  error:
    "Google Calendar integration is not configured on the server (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI). Tell the user the admin must set it up first.",
};

async function requireConnection(ctx: Parameters<NovaTool["execute"]>[1]) {
  const { calendar } = ctx.services;
  if (!calendar.isConfigured()) {
    // Diagnostic: shows exactly which field the cached config sees as missing.
    logger.warn("calendar.not_configured", calendar.configStatus());
    return NOT_CONFIGURED;
  }
  if (!(await calendar.isConnected(ctx.user.id))) {
    return {
      connected: false,
      connect_url: calendar.connectUrl(ctx.user.lineUserId),
      instruction:
        "Send this URL to the user and ask them to open it to connect their Google Calendar, then try again.",
    };
  }
  return null;
}

export const calendarTools: NovaTool[] = [
  {
    declaration: {
      name: "create_calendar_event",
      description:
        "Create a Google Calendar event. Call for 'นัดประชุมพรุ่งนี้ 10 โมง', 'schedule meeting tomorrow at 10am', etc. Default duration 1 hour when the user gives no end time.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Event title" },
          start: { type: Type.STRING, description: `Start time, ${ISO_HINT}` },
          end: {
            type: Type.STRING,
            description: "Optional end time, same format. Default: start + 1 hour",
          },
          description: { type: Type.STRING },
          location: { type: Type.STRING },
          all_day: { type: Type.BOOLEAN, description: "True for all-day events" },
        },
        required: ["title", "start"],
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      const title = str(args, "title");
      const start = isoDate(args, "start");
      if (!title || !start) return { error: "title and a valid start are required" };
      const allDay = args.all_day === true;
      const end =
        isoDate(args, "end") ??
        new Date(start.getTime() + (allDay ? 24 : 1) * 60 * 60 * 1000);

      try {
        const event = await ctx.services.calendar.createEvent(ctx.user.id, {
          title,
          description: str(args, "description") || undefined,
          location: str(args, "location") || undefined,
          start,
          end,
          allDay,
        });
        return { created: true, event };
      } catch (err) {
        return {
          error: `Failed to create event: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
  {
    declaration: {
      name: "list_calendar_events",
      description:
        "List upcoming Google Calendar events. Call for 'วันนี้มีนัดอะไรบ้าง', 'what's on my calendar this week'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          days_ahead: {
            type: Type.NUMBER,
            description: "How many days ahead to look (default 1 = today only)",
          },
        },
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      const days = typeof args.days_ahead === "number" && args.days_ahead > 0
        ? Math.min(args.days_ahead, 31)
        : 1;
      const now = new Date();
      const max = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      try {
        const events = await ctx.services.calendar.listEvents(
          ctx.user.id,
          now,
          max,
        );
        return { count: events.length, events };
      } catch (err) {
        return {
          error: `Failed to list events: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
];
