import { Type } from "@google/genai";
import type { NovaTool, ToolContext } from "@/types";
import type { CalendarEventView } from "@/services/calendar.service";
import { str, isoDate, ISO_HINT } from "@/tools/helpers";
import { similarity } from "@/lib/fuzzy";
import { bangkokDayBounds, formatThaiDateTime } from "@/lib/time";
import { logger } from "@/lib/logger";

const ACTIONS = ["list", "create", "update", "delete"];

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

async function listAction(args: Record<string, unknown>, ctx: ToolContext) {
  const query = str(args, "query");

  // A query narrows to fuzzy-matched candidates (also serves the old
  // "find_calendar_event" use case — locate an event by title before acting).
  if (query) {
    try {
      const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
      if (resolution.kind === "none") return { found: false, reason: "no matching event" };
      if (resolution.kind === "single") {
        return { found: true, count: 1, events: [eventOut(resolution.event)] };
      }
      return {
        found: true,
        count: resolution.candidates.length,
        events: resolution.candidates.map(eventOut),
      };
    } catch (err) {
      return { error: `Failed to find event: ${err instanceof Error ? err.message : "unknown"}` };
    }
  }

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
    return { error: `Failed to list events: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

async function createAction(args: Record<string, unknown>, ctx: ToolContext) {
  const title = str(args, "title");
  const start = isoDate(args, "start");
  if (!title || !start) return { error: "title and a valid start are required" };
  const allDay = args.all_day === true;
  const end =
    isoDate(args, "end") ?? new Date(start.getTime() + (allDay ? 24 : 1) * 60 * 60 * 1000);

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
    return { error: `Failed to create event: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

async function updateAction(args: Record<string, unknown>, ctx: ToolContext) {
  const query = str(args, "query");
  if (!query) return { error: "query is required to find the event to update" };

  const newTitle = str(args, "title");
  const newStart = isoDate(args, "start");
  const newEnd = isoDate(args, "end");
  const newLocation = str(args, "location");
  if (!newTitle && !newStart && !newEnd && !newLocation) {
    return { error: "nothing to update — ask the user what to change" };
  }

  try {
    const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
    if (resolution.kind === "none") return { updated: false, reason: "no matching event" };
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
    return { error: `Failed to update event: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

async function deleteAction(args: Record<string, unknown>, ctx: ToolContext) {
  const query = str(args, "query");
  if (!query) return { error: "query is required to find the event to delete" };

  try {
    const resolution = await resolveEvent(ctx, query, isoDate(args, "date"));
    if (resolution.kind === "none") return { deleted: false, reason: "no matching event" };
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
    return { error: `Failed to delete event: ${err instanceof Error ? err.message : "unknown"}` };
  }
}

export const calendarTools: NovaTool[] = [
  {
    declaration: {
      name: "calendar",
      description:
        "Manage the user's Google Calendar. action=list shows upcoming events in a day window (days_ahead), or fuzzy-searches by title when 'query' is given (also use this to locate an event before update/delete) — e.g. 'วันนี้มีอะไร', 'พรุ่งนี้มีประชุมไหม', 'หานัดกับสถาปนิก'. action=create adds a new event (title + start required) — e.g. 'เพิ่มประชุมกับฝ่ายขาย 10 โมง'. action=update reschedules/renames an event found by fuzzy title match via 'query' — only send the fields that change; when a new start is given without a new end, the original duration is preserved — e.g. 'เลื่อนประชุมเป็นบ่ายสอง'. action=delete removes an event found by fuzzy title match via 'query' — e.g. 'ลบประชุมพรุ่งนี้'. If a query matches multiple events, needs_clarification is returned — show the candidates and ask the user, never guess.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: { type: Type.STRING, enum: ACTIONS, description: "Which operation to perform" },
          query: {
            type: Type.STRING,
            description:
              "Words from the event title. Required for update/delete; optional for list (fuzzy search instead of a plain day-window listing).",
          },
          date: {
            type: Type.STRING,
            description: `Optional day to narrow a query search (list/update/delete), ${ISO_HINT}`,
          },
          days_ahead: {
            type: Type.NUMBER,
            description: "list only, when no query: how many days ahead to look (default 1 = today only)",
          },
          title: {
            type: Type.STRING,
            description: "create: event title (required). update: new title, if renaming.",
          },
          start: {
            type: Type.STRING,
            description: `create: start time (required), ${ISO_HINT}. update: new start time, same format.`,
          },
          end: {
            type: Type.STRING,
            description:
              "create: optional end time, default start + 1 hour. update: optional new end time.",
          },
          description: { type: Type.STRING, description: "create only: event description" },
          location: {
            type: Type.STRING,
            description: "create: event location. update: new location.",
          },
          all_day: {
            type: Type.BOOLEAN,
            description: "create only: true for an all-day event",
          },
        },
        required: ["action"],
      },
    },
    async execute(args, ctx) {
      const blocked = await requireConnection(ctx);
      if (blocked) return blocked;

      switch (str(args, "action")) {
        case "list":
          return listAction(args, ctx);
        case "create":
          return createAction(args, ctx);
        case "update":
          return updateAction(args, ctx);
        case "delete":
          return deleteAction(args, ctx);
        default:
          return { error: `unknown action: ${str(args, "action")}` };
      }
    },
  },
];
