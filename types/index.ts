import type { FunctionDeclaration } from "@google/genai";
import type { User } from "@prisma/client";
import type { MemoryService } from "@/services/memory.service";
import type { TodoService } from "@/services/todo.service";
import type { ReminderService } from "@/services/reminder.service";
import type { CalendarService } from "@/services/calendar.service";
import type { NewsService } from "@/services/news.service";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";

/** Services tools are allowed to touch — injected per request, never imported. */
export interface ToolServices {
  memory: MemoryService;
  todo: TodoService;
  reminder: ReminderService;
  calendar: CalendarService;
  news: NewsService;
  newsPrefs: NewsPreferenceRepository;
}

/** Context passed to every tool execution — always scoped to one user. */
export interface ToolContext {
  user: User;
  services: ToolServices;
}

/** A Gemini function-calling tool Nova can execute. */
export interface NovaTool {
  declaration: FunctionDeclaration;
  execute(
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<Record<string, unknown>>;
}

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}
