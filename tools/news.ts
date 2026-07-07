import { Type } from "@google/genai";
import type { NovaTool } from "@/types";
import { str } from "@/tools/helpers";

export const newsTools: NovaTool[] = [
  {
    declaration: {
      name: "get_news",
      description:
        "Fetch latest news headlines for a topic. Known categories (AI, Technology, Travel, Hotel, Business) map to curated Thai queries; any other topic is searched verbatim. Summarize the returned headlines for the user in their language. If the result has ok=false, relay the 'message' field to the user as-is.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "News topic to search" },
        },
        required: ["topic"],
      },
    },
    async execute(args, ctx) {
      const topic = str(args, "topic");
      if (!topic) return { error: "topic is required" };
      const result = await ctx.services.news.getNews(topic, 6);
      if (!result.ok) {
        // Tell the model to relay this friendly line verbatim.
        return { ok: false, topic: result.topic, message: result.message };
      }
      return {
        ok: true,
        topic: result.topic,
        used_fallback: result.usedFallback,
        headlines: result.headlines,
      };
    },
  },
  {
    declaration: {
      name: "subscribe_news",
      description:
        "Subscribe the user to a news topic included in the daily 07:00 morning brief. Call for 'ติดตามข่าว…', 'subscribe me to … news'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "Topic to subscribe to" },
        },
        required: ["topic"],
      },
    },
    async execute(args, ctx) {
      const topic = str(args, "topic");
      if (!topic) return { error: "topic is required" };
      await ctx.services.newsPrefs.subscribe(ctx.user.id, topic);
      return { subscribed: true, topic };
    },
  },
  {
    declaration: {
      name: "unsubscribe_news",
      description: "Remove a news topic from the user's daily brief. Call for 'เลิกติดตามข่าว…'.",
      parameters: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: "Topic to unsubscribe" },
        },
        required: ["topic"],
      },
    },
    async execute(args, ctx) {
      const topic = str(args, "topic");
      if (!topic) return { error: "topic is required" };
      const removed = await ctx.services.newsPrefs.unsubscribe(
        ctx.user.id,
        topic,
      );
      return removed
        ? { unsubscribed: true, topic }
        : { unsubscribed: false, reason: "no matching subscription" };
    },
  },
  {
    declaration: {
      name: "list_news_topics",
      description: "List the news topics the user is subscribed to.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async execute(_args, ctx) {
      const prefs = await ctx.services.newsPrefs.listActive(ctx.user.id);
      return { topics: prefs.map((p) => p.topic) };
    },
  },
];
