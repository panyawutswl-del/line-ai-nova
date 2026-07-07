import { Type } from "@google/genai";
import type { NovaTool } from "@/types";

/**
 * Minimal Phase 1 tool. It proves the function-calling pipeline end-to-end
 * so Phase 2 tools (todos, memories, reminders) drop into a working loop.
 */
export const getCurrentDatetimeTool: NovaTool = {
  declaration: {
    name: "get_current_datetime",
    description:
      "Get the current date and time in Thailand (Asia/Bangkok timezone). Use when the user asks about the current date, time, or day of week.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  async execute() {
    const now = new Date();
    return {
      iso: now.toISOString(),
      thai: now.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
        dateStyle: "full",
        timeStyle: "medium",
      }),
      timezone: "Asia/Bangkok",
    };
  },
};
