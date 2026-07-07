import { Type } from "@google/genai";
import type { MemoryCategory, MemorySource } from "@prisma/client";
import type { NovaTool } from "@/types";
import { str } from "@/tools/helpers";

const CATEGORIES = ["PERSONAL", "PREFERENCES", "WORK", "ROUTINE", "REFERENCE"];

export const memoryTools: NovaTool[] = [
  {
    declaration: {
      name: "create_memory",
      description:
        "Save a fact about the user to long-term memory. Call when the user says 'จำว่า…'/'จำไว้ว่า…'/'Remember that…' (source=PIN), or when the user reveals important personal information worth remembering even without being asked (source=AUTO).",
      parameters: {
        type: Type.OBJECT,
        properties: {
          content: {
            type: Type.STRING,
            description: "The fact to remember, as one self-contained sentence",
          },
          category: {
            type: Type.STRING,
            enum: CATEGORIES,
            description: "Memory category",
          },
          source: {
            type: Type.STRING,
            enum: ["PIN", "AUTO"],
            description: "PIN when the user explicitly asked; AUTO otherwise",
          },
        },
        required: ["content", "category"],
      },
    },
    async execute(args, ctx) {
      const content = str(args, "content");
      if (!content) return { error: "content is required" };
      const category = (
        CATEGORIES.includes(str(args, "category"))
          ? str(args, "category")
          : "REFERENCE"
      ) as MemoryCategory;
      const source = (
        str(args, "source") === "AUTO" ? "AUTO" : "PIN"
      ) as MemorySource;
      const memory = await ctx.services.memory.save(
        ctx.user.id,
        content,
        category,
        source,
      );
      return { saved: true, id: memory.id, content, category };
    },
  },
  {
    declaration: {
      name: "search_memory",
      description:
        "Semantic search over the user's saved memories. Call when the user asks about their own facts/preferences (e.g. 'ผมชอบอะไร', 'what do I like', 'เบอร์ช่างแอร์อะไรนะ').",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: "What to look for" },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      const hits = await ctx.services.memory.search(ctx.user.id, query);
      return {
        results: hits.map((h) => ({ content: h.content, category: h.category })),
      };
    },
  },
  {
    declaration: {
      name: "forget_memory",
      description:
        "Delete a saved memory. Call when the user says 'ลืม…'/'ลบความจำ…'/'Forget…'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: {
            type: Type.STRING,
            description: "Description of the memory to forget",
          },
        },
        required: ["query"],
      },
    },
    async execute(args, ctx) {
      const query = str(args, "query");
      if (!query) return { error: "query is required" };
      const forgotten = await ctx.services.memory.forget(ctx.user.id, query);
      return forgotten
        ? { forgotten: true, content: forgotten }
        : { forgotten: false, reason: "no matching memory" };
    },
  },
  {
    declaration: {
      name: "list_memories",
      description:
        "List everything saved in the user's memory. Call when the user asks 'จำอะไรไว้บ้าง' / 'what do you remember about me'.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async execute(_args, ctx) {
      const memories = await ctx.services.memory.list(ctx.user.id, 30);
      return {
        count: memories.length,
        memories: memories.map((m) => ({
          content: m.content,
          category: m.category,
        })),
      };
    },
  },
];
