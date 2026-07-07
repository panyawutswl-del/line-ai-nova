import { Type } from "@google/genai";
import type { NovaTool, ToolContext } from "@/types";
import type { CalendarEventView } from "@/services/calendar.service";
import { str, isoDate, ISO_HINT } from "@/tools/helpers";
import { similarity } from "@/lib/fuzzy";
import { bangkokDayBounds, formatThaiDateTime } from "@/lib/time";
import { logger } from "@/lib/logger";

const NOT_CONFIGURED = {
  error:
    "Google Calendar integration is not configured on the server (missing GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI). Tell the user the admin must set it up first.",
};

const MATCH_THRESHOLD = 0.3; // below this, not a candidate at all
const CONFIDENT_MATCH = 0.6; // auto-act only when a single match is this strong
const DEFAULT_WINDOW_DAYS = 61;

async function requireConnection(ctx: ToolContext) {
  const { calendar } = ctx.services;
  if (!calendar.isConfigured()) {
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

/** Human-friendly shape returned to the model. */
function eventOut(e: CalendarEventView) {
  return {
    title: e.title,
    when: e.start.includes("T")
      ? formatThaiDateTime(new Date(e.start))
      : `${e.start} (ทั้งวัน)`,
    location: e.location,
    link: e.htmlLink,
  };
}

type Resolution =
  | { kind: "single"; event: CalendarEventView }
  | { kind: "none" }
  | { kind: "many"; candidates: CalendarEventView[] };

/** Fuzzy-match an event by title (and optional day) within the search window. */
async function resolveEvent(
  ctx: ToolContext,
  query: string,
  dateArg: Date | null,
): Promise<Resolution> {
  const now = new Date();
  const from = dateArg ? bangkokDayBounds(dateArg).start : bangkokDayBounds(now).start;
  const to = dateArg
    ? bangkokDayBounds(dateArg).end
    : new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const events = await ctx.services.calendar.listEvents(ctx.user.id, from, to);
  const ranked = events
    .map((e) => ({ e, score: similarity(query, e.title) }))
    .filter((x) => x.score >= MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return { kind: "none" };

  // Auto-act only on a single, strongly-matching event. Weak matches or
  // several strong ones go back to the user to confirm — never guess for a
  // destructive/mutating action.
  const strong = ranked.filter((x) => x.score >= CONFIDENT_MATCH);
  if (strong.length === 1) return { kind: "single", event: strong[0].e };

  const shortlist = (strong.length > 0 ? strong : ranked).slice(0, 5);
  return { kind: "many", candidates: shortlist.map((x) => x.e) };
}

const AMBIGUOUS_INSTRUCTION =
  "Show these candidate events to the user and ask which one they mean before retrying — do not guess.";

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
        return { created: true, event: eventOut(event) };
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
        "List upcoming Google Calendar events in a time window. Call for 'วันนี้มีนัดอะไรบ้าง', 'พรุ่งนี้มีนัดอะไรบ้าง', 'what's on my calendar this week'.",
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

      const days =
        typeof args.days_ahead === "number" && args.days_ahead > 0
          ? Math.min(args.days_ahead, 31)
          : 1;
      const from = bangkokDayBounds(new Date()).start;
      const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
      try {
        const events = await ctx.services.calendar.listEvents(ctx.user.id, from, to);
        return { count: events.length, events: events.map(eventOut) };
      } catch (err) {
        return {
          error: `Failed to list events: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
  {
    declaration: {
      name: "find_calendar_event",
      description:
        "Find calendar events matching a title (fuzzy) and/or a specific day. Use to locate an event before updating or deleting it, or for 'หานัดประชุมกับสถาปนิก'. Returns candidates.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Words from the event title to match",
          },
          date: {
            type: Type.STRING,
            description: `Optional day to narrow the search, ${ISO_HINT}`,
          },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      try {
        const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
        if (resolution.kind === "none") {
          return { found: false, reason: "no matching event" };
        }
        if (resolution.kind === "single") {
          return { found: true, count: 1, events: [eventOut(resolution.event)] };
        }
        return {
          found: true,
          count: resolution.candidates.length,
          events: resolution.candidates.map(eventOut),
        };
      } catch (err) {
        return {
          error: `Failed to find event: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
  {
    declaration: {
      name: "update_calendar_event",
      description:
        "Update / reschedule / rename an existing calendar event, found by fuzzy title match. Call for 'เลื่อนประชุมพรุ่งนี้เป็นบ่ายโมง', 'เปลี่ยนชื่อประชุมเป็น…', 'ย้ายนัดเป็นวันศุกร์'. Provide only the fields that change. When rescheduling with a new start but no new end, the original duration is preserved.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Words from the current event title to find it",
          },
          date: {
            type: Type.STRING,
            description: `Optional current day of the event to disambiguate, ${ISO_HINT}`,
          },
          new_title: { type: Type.STRING, description: "New title, if renaming" },
          new_start: { type: Type.STRING, description: `New start time, ${ISO_HINT}` },
          new_end: { type: Type.STRING, description: `New end time, ${ISO_HINT}` },
          new_location: { type: Type.STRING },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      const query = str(args, "query");
      if (!query) return { error: "query is required" };

      const newTitle = str(args, "new_title");
      const newStart = isoDate(args, "new_start");
      const newEnd = isoDate(args, "new_end");
      const newLocation = str(args, "new_location");
      if (!newTitle && !newStart && !newEnd && !newLocation) {
        return { error: "nothing to update — ask the user what to change" };
      }

      try {
        const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
        if (resolution.kind === "none") {
          return { updated: false, reason: "no matching event" };
        }
        if (resolution.kind === "many") {
          return {
            updated: false,
            needs_clarification: true,
            instruction: AMBIGUOUS_INSTRUCTION,
            candidates: resolution.candidates.map(eventOut),
          };
        }

        const event = resolution.event;
        // Preserve the original duration when only a new start is given.
        let end = newEnd ?? undefined;
        if (newStart && !newEnd) {
          const os = new Date(event.start).getTime();
          const oe = new Date(event.end).getTime();
          const durationMs = Number.isNaN(os) || Number.isNaN(oe) ? 3_600_000 : oe - os;
          end = new Date(newStart.getTime() + durationMs);
        }

        const updated = await ctx.services.calendar.updateEvent(ctx.user.id, event.id, {
          title: newTitle || undefined,
          location: newLocation || undefined,
          start: newStart ?? undefined,
          end,
          allDay: event.allDay,
        });
        return { updated: true, event: eventOut(updated) };
      } catch (err) {
        return {
          error: `Failed to update event: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
  {
    declaration: {
      name: "delete_calendar_event",
      description:
        "Delete a calendar event, found by fuzzy title match. Call for 'ลบนัดประชุมกับสถาปนิก', 'ยกเลิกนัดพรุ่งนี้'. If multiple events match, ask the user which one first.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Words from the event title to delete",
          },
          date: {
            type: Type.STRING,
            description: `Optional day of the event to disambiguate, ${ISO_HINT}`,
          },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      const query = str(args, "query");
      if (!query) return { error: "query is required" };

      try {
        const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
        if (resolution.kind === "none") {
          return { deleted: false, reason: "no matching event" };
        }
        if (resolution.kind === "many") {
          return {
            deleted: false,
            needs_clarification: true,
            instruction: AMBIGUOUS_INSTRUCTION,
            candidates: resolution.candidates.map(eventOut),
          };
        }

        const event = resolution.event;
        await ctx.services.calendar.deleteEvent(ctx.user.id, event.id);
        return { deleted: true, event: eventOut(event) };
      } catch (err) {
        return {
          error: `Failed to delete event: ${err instanceof Error ? err.message : "unknown"}`,
        };
      }
    },
  },
];
