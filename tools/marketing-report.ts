import { Type } from "@google/genai";
import type { NovaTool } from "@/types";

export const marketingReportTools: NovaTool[] = [
  {
    declaration: {
      name: "get_website_analytics",
      description:
        "Get the latest Sriwilai Sukhothai website analytics from Google Analytics (rolling 7-day window): total/new/returning visitors, page views, daily trend, top events (e.g. book_now_click, whatsapp_click), top countries, devices, top landing page, and traffic sources. Use whenever the owner asks about website traffic, visitors, or booking-intent clicks.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async execute(_args, ctx) {
      const result = await ctx.services.marketingReport.fetchWebsiteAnalytics();
      if (!result.ok) {
        return { ok: false, message: `ดึงข้อมูลเว็บไซต์ไม่สำเร็จ: ${result.error}` };
      }
      return { ok: true, data: result.summary ?? result.text };
    },
  },
  {
    declaration: {
      name: "get_social_media_report",
      description:
        "Get the latest Sriwilai Sukhothai Facebook Page and Instagram performance: follower counts, media/post counts, reach where available, and the top posts by engagement (likes, comments, shares) with captions. Use whenever the owner asks about social media performance, which posts did well, or follower growth.",
      parameters: { type: Type.OBJECT, properties: {} },
    },
    async execute(_args, ctx) {
      const result = await ctx.services.marketingReport.fetchSocialReport();
      if (!result.ok) {
        return { ok: false, message: `ดึงข้อมูลโซเชียลไม่สำเร็จ: ${result.error}` };
      }
      return { ok: true, data: result.summary ?? result.text };
    },
  },
];
