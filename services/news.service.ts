import { logger, errorInfo } from "@/lib/logger";

export interface Headline {
  title: string;
  source?: string;
}

/**
 * Headlines via Google News RSS — free, no API key.
 * Thai locale first; callers pass any topic (AI, technology, hotel industry, ...).
 */
export class NewsService {
  async headlines(topic: string, limit = 5): Promise<Headline[]> {
    const url =
      `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}` +
      `&hl=th&gl=TH&ceid=TH:th`;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Nova LINE assistant)" },
        signal: AbortSignal.timeout(6_000),
      });
      if (!res.ok) {
        logger.warn("news.fetch_failed", { topic, status: res.status });
        return [];
      }
      return parseRssItems(await res.text(), limit);
    } catch (err) {
      logger.warn("news.fetch_failed", { topic, ...errorInfo(err) });
      return [];
    }
  }
}

function parseRssItems(xml: string, limit: number): Headline[] {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, limit);
  return items
    .map((match) => {
      const block = match[1];
      const title = decodeEntities(extractTag(block, "title"));
      const source = decodeEntities(extractTag(block, "source"));
      return { title, source: source || undefined };
    })
    .filter((h) => h.title.length > 0);
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
