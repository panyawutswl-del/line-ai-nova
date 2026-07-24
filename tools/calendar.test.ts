import { describe, it, expect, vi } from "vitest";
import type { User } from "@prisma/client";
import type {
  CalendarEventInput,
  CalendarEventPatch,
  CalendarEventView,
  CalendarService,
} from "@/services/calendar.service";
import type { ToolContext, ToolServices } from "@/types";
import { calendarTools } from "@/tools/calendar";

const calendarTool = calendarTools[0];

const USER: User = {
  id: "user-1",
  lineUserId: "U123",
  displayName: "Test User",
  pictureUrl: null,
  role: "USER",
  isActive: true,
  lastLogin: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeEvent(overrides: Partial<CalendarEventView> = {}): CalendarEventView {
  return {
    id: "evt-1",
    title: "ประชุมฝ่ายขาย",
    start: "2026-07-25T10:00:00.000Z",
    end: "2026-07-25T11:00:00.000Z",
    allDay: false,
    ...overrides,
  };
}

interface FakeCalendarOptions {
  configured?: boolean;
  connected?: boolean;
  events?: CalendarEventView[];
  createResult?: CalendarEventView;
  updateResult?: CalendarEventView;
}

function makeFakeCalendar(opts: FakeCalendarOptions = {}) {
  const events = opts.events ?? [];
  const deleteEvent = vi.fn(async () => {});
  const createEvent = vi.fn(
    async (_userId: string, _input: CalendarEventInput) =>
      opts.createResult ?? makeEvent(),
  );
  const updateEvent = vi.fn(
    async (_userId: string, _id: string, _patch: CalendarEventPatch) =>
      opts.updateResult ?? makeEvent(),
  );

  const calendar = {
    isConfigured: () => opts.configured ?? true,
    configStatus: () => ({ clientId: true, clientSecret: true, redirectUri: true }),
    isConnected: async () => opts.connected ?? true,
    connectUrl: () => "https://example.com/connect",
    listEvents: async () => events,
    createEvent,
    updateEvent,
    deleteEvent,
  } as unknown as CalendarService;

  return { calendar, createEvent, updateEvent, deleteEvent };
}

function makeContext(opts: FakeCalendarOptions = {}) {
  const { calendar, createEvent, updateEvent, deleteEvent } = makeFakeCalendar(opts);
  const services = { calendar } as unknown as ToolServices;
  const ctx: ToolContext = { user: USER, services };
  return { ctx, createEvent, updateEvent, deleteEvent };
}

describe("calendar tool", () => {
  it("returns a config error when Google Calendar isn't configured", async () => {
    const { ctx } = makeContext({ configured: false });

    const result = await calendarTool.execute({ action: "list" }, ctx);

    expect(result.error).toMatch(/not configured/);
  });

  it("returns a connect_url when the user hasn't connected their calendar", async () => {
    const { ctx } = makeContext({ connected: false });

    const result = await calendarTool.execute({ action: "list" }, ctx);

    expect(result).toMatchObject({ connected: false, connect_url: "https://example.com/connect" });
  });

  describe("action=list", () => {
    it("lists events in a day window when no query is given", async () => {
      const { ctx } = makeContext({ events: [makeEvent()] });

      const result = await calendarTool.execute({ action: "list", days_ahead: 3 }, ctx);

      expect(result).toMatchObject({ count: 1 });
      expect((result.events as unknown[])).toHaveLength(1);
    });

    it("fuzzy-searches by title when a query is given (find use case)", async () => {
      const { ctx } = makeContext({
        events: [makeEvent({ title: "ประชุมกับสถาปนิก" }), makeEvent({ id: "evt-2", title: "ทานข้าวเที่ยง" })],
      });

      const result = await calendarTool.execute({ action: "list", query: "สถาปนิก" }, ctx);

      expect(result).toMatchObject({ found: true, count: 1 });
    });

    it("returns found=false when the query matches nothing", async () => {
      const { ctx } = makeContext({ events: [] });

      const result = await calendarTool.execute({ action: "list", query: "ไม่มีจริง" }, ctx);

      expect(result).toEqual({ found: false, reason: "no matching event" });
    });
  });

  describe("action=create", () => {
    it("creates an event when title and start are given", async () => {
      const { ctx, createEvent } = makeContext({ createResult: makeEvent({ title: "ประชุมฝ่ายขาย" }) });

      const result = await calendarTool.execute(
        { action: "create", title: "ประชุมฝ่ายขาย", start: "2026-07-25T10:00:00+07:00" },
        ctx,
      );

      expect(result).toMatchObject({ created: true });
      expect(createEvent).toHaveBeenCalledTimes(1);
      const input = createEvent.mock.calls[0][1] as CalendarEventInput;
      expect(input.title).toBe("ประชุมฝ่ายขาย");
      expect(input.end.getTime() - input.start.getTime()).toBe(60 * 60 * 1000);
    });

    it("errors when title or start is missing", async () => {
      const { ctx } = makeContext();

      const result = await calendarTool.execute({ action: "create", title: "x" }, ctx);

      expect(result.error).toMatch(/title and a valid start are required/);
    });
  });

  describe("action=update", () => {
    it("updates the single strongly-matching event, preserving duration on reschedule", async () => {
      const existing = makeEvent({
        title: "ประชุมฝ่ายขาย",
        start: "2026-07-25T10:00:00.000Z",
        end: "2026-07-25T11:30:00.000Z",
      });
      const { ctx, updateEvent } = makeContext({
        events: [existing],
        updateResult: makeEvent({ start: "2026-07-25T14:00:00.000Z" }),
      });

      const result = await calendarTool.execute(
        { action: "update", query: "ฝ่ายขาย", start: "2026-07-25T14:00:00+07:00" },
        ctx,
      );

      expect(result).toMatchObject({ updated: true });
      const patch = updateEvent.mock.calls[0][2] as CalendarEventPatch;
      expect(patch.start?.toISOString()).toBe("2026-07-25T07:00:00.000Z");
      // original duration was 90 minutes
      expect(patch.end && patch.start && patch.end.getTime() - patch.start.getTime()).toBe(
        90 * 60 * 1000,
      );
    });

    it("asks for clarification when multiple events match", async () => {
      const { ctx } = makeContext({
        events: [
          makeEvent({ id: "evt-1", title: "ประชุมทีม A" }),
          makeEvent({ id: "evt-2", title: "ประชุมทีม B" }),
        ],
      });

      const result = await calendarTool.execute(
        { action: "update", query: "ประชุมทีม", title: "ประชุมทีมใหม่" },
        ctx,
      );

      expect(result).toMatchObject({ updated: false, needs_clarification: true });
    });

    it("errors when nothing to update is given", async () => {
      const { ctx } = makeContext();

      const result = await calendarTool.execute({ action: "update", query: "x" }, ctx);

      expect(result.error).toMatch(/nothing to update/);
    });

    it("requires a query", async () => {
      const { ctx } = makeContext();

      const result = await calendarTool.execute({ action: "update", title: "new title" }, ctx);

      expect(result.error).toMatch(/query is required/);
    });
  });

  describe("action=delete", () => {
    it("deletes the single strongly-matching event", async () => {
      const { ctx, deleteEvent } = makeContext({
        events: [makeEvent({ title: "ประชุมพรุ่งนี้" })],
      });

      const result = await calendarTool.execute({ action: "delete", query: "พรุ่งนี้" }, ctx);

      expect(result).toMatchObject({ deleted: true });
      expect(deleteEvent).toHaveBeenCalledTimes(1);
    });

    it("returns deleted=false when nothing matches", async () => {
      const { ctx } = makeContext({ events: [] });

      const result = await calendarTool.execute({ action: "delete", query: "ไม่มีจริง" }, ctx);

      expect(result).toEqual({ deleted: false, reason: "no matching event" });
    });
  });
});
