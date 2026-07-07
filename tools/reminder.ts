import { Type } from "@google/genai";
import type { NovaTool } from "@/types";
import { str, isoDate, ISO_HINT } from "@/tools/helpers";
import { formatThaiDateTime } from "@/lib/time";

export const reminderTools: NovaTool[] = [
  {
    declaration: {
      name: "create_reminder",
      description:
        "Set a one-time reminder delivered as a LINE push message. Call for 'เตือนฉัน…', 'remind me…'. The remind_at time must be in the future.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING, description: "What to remind about" },
          remind_at: { type: Type.STRING, description: `When to remind, ${ISO_HINT}` },
        },
        required: ["message", "remind_at"],
      },
    },
    async execute(args, ctx) {
      const message = str(args, "message");
      const remindAt = isoDate(args, "remind_at");
      if (!message || !remindAt) {
        return { error: "message and a valid remind_at are required" };
      }
      if (remindAt.getTime() <= Date.now()) {
        return { error: "remind_at is in the past — ask the user for a future time" };
      }
      const reminder = await ctx.services.reminder.create(
        ctx.user.id,
        message,
        remindAt,
      );
      return {
        created: true,
        message,
        remind_at: formatThaiDateTime(reminder.remindAt),
      };
    },
  },
  {
    declaration: {
      name: "list_reminders",
      description: "List the user's pending reminders.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async execute(_args, ctx) {
      const reminders = await ctx.services.reminder.listPending(ctx.user.id);
      return {
        count: reminders.length,
        reminders: reminders.map((r) => ({
          message: r.message,
          remind_at: formatThaiDateTime(r.remindAt),
        })),
      };
    },
  },
  {
    declaration: {
      name: "cancel_reminder",
      description: "Cancel a pending reminder. Call for 'ยกเลิกการเตือน…'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Words from the reminder message" },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      const cancelled = await ctx.services.reminder.cancelByQuery(
        ctx.user.id,
        query,
      );
      return cancelled
        ? { cancelled: true, message: cancelled.message }
        : { cancelled: false, reason: "no matching pending reminder" };
    },
  },
];
