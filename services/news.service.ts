import { logger, errorInfo } from "@/lib/logger";

export interface Headline {
  title: string;
  source?: string;
}

export interface NewsResult {
  /** false only when both the topic feed and the general fallback failed. */
  ok: boolean;
  topic: string;
  headlines: Headline[];
  /** true when the topic feed failed and general Thai news was used instead. */
  usedFallback: boolean;
  /** Friendly message to show the user when ok === false. */
  message?: string;
}

/** Shown to the user when even the fallback feed cannot be fetched. */
export const NEWS_UNAVAILABLE_MESSAGE =
  "ขออภัยครับ ตอนนี้ยังไม่สามารถดึงข่าวได้";

/** Top Thai headlines — used when a specific topic feed fails. */
const GENERAL_FEED_URL =
  "https://news.google.com/rss?hl=th&gl=TH&ceid=TH:th";

/**
 * Known categories → Thai search queries. Topics that aren't a known
 * category are searched verbatim, so arbitrary subjects still work.
 */
const CATEGORY_QUERIES: Record<string, string> = {
  ai: "ปัญญาประดิษฐ์ AI",
  technology: "เทคโนโลยี",
  tech: "เทคโนโลยี",
  travel: "ท่องเที่ยว",
  hotel: "โรงแรม",
  business: "ธุรกิจ เศรษฐกิจ",
};

const FETCH_TIMEOUT_MS = 6_000;

/**
 * Headlines via Google News RSS — free, no API key.
 * Every method is failure-tolerant: network, HTTP, and parse errors are
 * caught and logged, never thrown, so a news outage can never crash the
 * webhook or the morning brief.
 */
export class NewsService {
  /**
   * Fetch news for a topic/category with a general-news fallback.
   * Returns a friendly message instead of throwing when everything fails.
   */
  async getNews(topic: string, limit = 5): Promise<NewsResult> {
    const cleanTopic = topic.trim();
    const query = this.resolveQuery(cleanTopic);

    const primary = await this.fetchFeed(this.searchUrl(query), limit, {
      topic: cleanTopic,
      feed: "topic",
    });
    if (primary && primary.length > 0) {
      return { ok: true, topic: cleanTopic, headlines: primary, usedFallback: false };
    }

    // Topic feed failed or was empty — fall back to general Thai news.
    logger.warn("news.fallback_to_general", { topic: cleanTopic });
    const fallback = await this.fetchFeed(GENERAL_FEED_URL, limit, {
      topic: cleanTopic,
      feed: "general",
    });
    if (fallback && fallback.length > 0) {
      return { ok: true, topic: cleanTopic, headlines: fallback, usedFallback: true };
    }

    logger.error("news.unavailable", { topic: cleanTopic });
    return {
      ok: false,
      topic: cleanTopic,
      headlines: [],
      usedFallback: false,
      message: NEWS_UNAVAILABLE_MESSAGE,
    };
  }

  /**
   * Raw topic headlines with no fallback (used by the morning brief, which
   * skips a topic silently rather than substituting unrelated general news).
   * Never throws — returns [] on any failure.
   */
  async headlines(topic: string, limit = 5): Promise<Headline[]> {
    const query = this.resolveQuery(topic.trim());
    const items = await this.fetchFeed(this.searchUrl(query), limit, {
      topic: topic.trim(),
      feed: "topic",
    });
    return items ?? [];
  }

  private resolveQuery(topic: string): string {
    return CATEGORY_QUERIES[topic.toLowerCase()] ?? topic;
  }

  private searchUrl(query: string): string {
    return (
      `https://news.google.com/rss/search?q=${encodeURIComponent(query)}` +
      `&hl=th&gl=TH&ceid=TH:th`
    );
  }

  /** Fetch + parse one feed. Returns null on any failure, [] when empty. */
  private async fetchFeed(
    url: string,
    limit: number,
    logCtx: Record<string, unknown>,
  ): Promise<Headline[] | null> {
    let xml: string;
    try {
      const res = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Nova LINE assistant)" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        logger.warn("news.fetch_failed", { ...logCtx, status: res.status });
        return null;
      }
      xml = await res.text();
    } catch (err) {
      logger.warn("news.fetch_failed", { ...logCtx, ...errorInfo(err) });
      return null;
    }

    try {
      return parseRssItems(xml, limit);
    } catch (err) {
      logger.error("news.parse_failed", { ...logCtx, ...errorInfo(err) });
      return null;
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
