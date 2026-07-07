import { Type } from "@google/genai";
import type { Todo, TodoPriority } from "@prisma/client";
import type { NovaTool } from "@/types";
import type { TodoFilter, TodoMatchResult } from "@/services/todo.service";
import { str, isoDate, ISO_HINT } from "@/tools/helpers";
import { formatThaiDateTime } from "@/lib/time";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
const FILTERS = ["today", "upcoming", "overdue", "completed", "all"];

function view(t: Todo) {
  return {
    title: t.title,
    description: t.description ?? undefined,
    priority: t.priority,
    status: t.status,
    due: t.dueDate ? formatThaiDateTime(t.dueDate) : undefined,
  };
}

function matchResult(result: TodoMatchResult, action: string) {
  switch (result.status) {
    case "done":
      return { [action]: true, todo: view(result.todo) };
    case "not_found":
      return { [action]: false, reason: "no matching open todo" };
    case "ambiguous":
      return {
        [action]: false,
        reason: "multiple matches — ask the user which one",
        candidates: result.candidates.map((t) => t.title),
      };
  }
}

export const todoTools: NovaTool[] = [
  {
    declaration: {
      name: "create_todo",
      description:
        "Create a to-do item. Call when the user says 'เพิ่มงาน…', 'add task…', or asks to track something to do.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Short task title" },
          description: { type: Type.STRING, description: "Optional details" },
          priority: { type: Type.STRING, enum: PRIORITIES },
          due_date: { type: Type.STRING, description: `Optional due date, ${ISO_HINT}` },
        },
        required: ["title"],
      },
    },
    async execute(args, ctx) {
      const title = str(args, "title");
      if (!title) return { error: "title is required" };
      const priority = PRIORITIES.includes(str(args, "priority"))
        ? (str(args, "priority") as TodoPriority)
        : undefined;
      const todo = await ctx.services.todo.create(ctx.user.id, {
        title,
        description: str(args, "description") || undefined,
        priority,
        dueDate: isoDate(args, "due_date") ?? undefined,
      });
      return { created: true, todo: view(todo) };
    },
  },
  {
    declaration: {
      name: "list_todos",
      description:
        "List the user's to-dos. Call for 'งานของผมวันนี้' (filter=today), 'งานค้าง' (all), 'งานเกินกำหนด' (overdue), 'ทำอะไรเสร็จไปแล้ว' (completed).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          filter: { type: Type.STRING, enum: FILTERS, description: "Which set to list" },
        },
        required: ["filter"],
      },
    },
    async execute(args, ctx) {
      const filter = (
        FILTERS.includes(str(args, "filter")) ? str(args, "filter") : "all"
      ) as TodoFilter;
      const todos = await ctx.services.todo.list(ctx.user.id, filter);
      return { filter, count: todos.length, todos: todos.map(view) };
    },
  },
  {
    declaration: {
      name: "complete_todo",
      description:
        "Mark a to-do as completed. Call when the user says 'ทำเสร็จแล้ว…', 'done with…', 'เสร็จแล้ว…'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Words from the task title" },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      const result = await ctx.services.todo.completeByQuery(ctx.user.id, query);
      return matchResult(result, "completed");
    },
  },
  {
    declaration: {
      name: "delete_todo",
      description: "Delete a to-do entirely (not complete it). Call for 'ลบงาน…'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "Words from the task title" },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      const result = await ctx.services.todo.deleteByQuery(ctx.user.id, query);
      return matchResult(result, "deleted");
    },
  },
];
