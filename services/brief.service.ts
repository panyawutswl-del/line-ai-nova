import type { Todo, User, UserSettings } from "@prisma/client";
import type { UserRepository } from "@/repositories/user.repository";
import type { TodoRepository } from "@/repositories/todo.repository";
import type { ReminderRepository } from "@/repositories/reminder.repository";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import type { NewsService } from "@/services/news.service";
import type { CalendarService } from "@/services/calendar.service";
import type { WeatherService } from "@/services/weather.service";
import type { SettingsService } from "@/services/settings.service";
import type { LineService } from "@/lib/line";
import { bangkokDayRange, formatThaiDate, formatThaiTime } from "@/lib/time";
import { logger, errorInfo } from "@/lib/logger";

const PRIORITY_ICON: Record<string, string> = {
  URGENT: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
};
const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

type Lang = "th" | "en";

const L = {
  th: {
    goodMorning: (n: string) => `☀️ อรุณสวัสดิ์ คุณ${n}`,
    schedule: "📅 กำหนดการวันนี้",
    noSchedule: "วันนี้ไม่มีนัดหมาย",
    tasks: "📋 งานวันนี้",
    noTasks: "วันนี้ไม่มีงานถึงกำหนด",
    overdue: "⚠️ งานเกินกำหนด",
    topNews: "📰 ข่าวเด่น",
    weather: (loc: string) => `🌤 อากาศ${loc}`,
    high: "สูงสุด",
    low: "ต่ำสุด",
    rain: "โอกาสฝน",
    eveningTitle: "🌙 สรุปท้ายวัน",
    completed: "✅ งานที่ทำเสร็จวันนี้",
    noCompleted: "วันนี้ยังไม่มีงานที่ทำเสร็จ",
    remaining: "📋 งานที่ยังเหลือ",
    noRemaining: "ไม่มีงานค้าง เยี่ยมมาก! 🎉",
    tomorrowSchedule: "📅 กำหนดการพรุ่งนี้",
    noTomorrow: "พรุ่งนี้ไม่มีนัดหมาย",
    tomorrowReminders: "⏰ เตือนพรุ่งนี้",
    suggested: "📝 ลำดับความสำคัญแนะนำสำหรับพรุ่งนี้",
    allDay: "ทั้งวัน",
  },
  en: {
    goodMorning: (n: string) => `☀️ Good Morning, ${n}`,
    schedule: "📅 Today's Schedule",
    noSchedule: "No events today",
    tasks: "📋 Today's Tasks",
    noTasks: "No tasks due today",
    overdue: "⚠️ Overdue Tasks",
    topNews: "📰 Top News",
    weather: (loc: string) => `🌤 Weather in ${loc}`,
    high: "High",
    low: "Low",
    rain: "Rain",
    eveningTitle: "🌙 Daily Wrap-up",
    completed: "✅ Completed Tasks",
    noCompleted: "No tasks completed today",
    remaining: "📋 Remaining Tasks",
    noRemaining: "Nothing left — great job! 🎉",
    tomorrowSchedule: "📅 Tomorrow's Schedule",
    noTomorrow: "No events tomorrow",
    tomorrowReminders: "⏰ Tomorrow's Reminders",
    suggested: "📝 Suggested priorities for tomorrow",
    allDay: "All day",
  },
} satisfies Record<Lang, Record<string, unknown>>;

function labels(settings: UserSettings) {
  return settings.language === "en" ? L.en : L.th;
}

/** Composes and pushes the daily briefs (morning 07:00, evening 20:00). */
export class BriefService {
  constructor(
    private users: UserRepository,
    private todos: TodoRepository,
    private reminders: ReminderRepository,
    private newsPrefs: NewsPreferenceRepository,
    private news: NewsService,
    private calendar: CalendarService,
    private weather: WeatherService,
    private settings: SettingsService,
    private line: LineService,
  ) {}

  // ---------------------------------------------------------------------------
  // Morning brief (07:00)
  // ---------------------------------------------------------------------------

  async sendMorningBriefs(): Promise<{ sent: number; skipped: number; failed: number }> {
    const result = await this.broadcast(
      "morningBriefEnabled",
      (user, s) => this.composeMorning(user, s),
    );
    logger.info("brief.morning_done", result);
    return result;
  }

  async composeMorning(user: User, settings: UserSettings): Promise<string> {
    const t = labels(settings);
    const { start, end } = bangkokDayRange();
    const name = user.displayName ?? "";
    const sections: string[] = [t.goodMorning(name)];

    sections.push(await this.scheduleSection(user, start, end, t.schedule, t.noSchedule, t.allDay));

    // Today's tasks
    const dueToday = await this.todos.listDueBetween(user.id, start, end);
    sections.push(
      dueToday.length === 0
        ? t.noTasks
        : `${t.tasks}\n` +
            dueToday.map((td) => `${PRIORITY_ICON[td.priority] ?? "•"} ${td.title}`).join("\n"),
    );

    // Overdue (only when present)
    const overdue = await this.todos.listOverdue(user.id, start);
    if (overdue.length > 0) {
      sections.push(
        `${t.overdue}\n` +
          overdue.slice(0, 5).map((td) => `• ${td.title}`).join("\n") +
          (overdue.length > 5 ? `\n…(+${overdue.length - 5})` : ""),
      );
    }

    if (settings.newsEnabled) {
      const news = await this.newsSection(user.id, t.topNews);
      if (news) sections.push(news);
    }

    if (settings.weatherEnabled) {
      const weather = await this.weatherSection(t);
      if (weather) sections.push(weather);
    }

    return sections.join("\n\n");
  }

  // ---------------------------------------------------------------------------
  // Evening wrap-up (20:00)
  // ---------------------------------------------------------------------------

  async sendEveningWrapups(): Promise<{ sent: number; skipped: number; failed: number }> {
    const result = await this.broadcast(
      "eveningBriefEnabled",
      (user, s) => this.composeEvening(user, s),
    );
    logger.info("brief.evening_done", result);
    return result;
  }

  async composeEvening(user: User, settings: UserSettings): Promise<string> {
    const t = labels(settings);
    const { start } = bangkokDayRange();
    const tomorrow = bangkokDayRange(1);
    const sections: string[] = [`${t.eveningTitle} — ${formatThaiDate(new Date())}`];

    // Completed today
    const completed = await this.todos.listCompletedSince(user.id, start);
    sections.push(
      completed.length === 0
        ? t.noCompleted
        : `${t.completed}\n` + completed.map((td) => `• ${td.title}`).join("\n"),
    );

    // Remaining open tasks
    const remaining = await this.todos.listOpen(user.id);
    sections.push(
      remaining.length === 0
        ? t.noRemaining
        : `${t.remaining}\n` +
            remaining
              .slice(0, 8)
              .map((td) => `${PRIORITY_ICON[td.priority] ?? "•"} ${td.title}`)
              .join("\n"),
    );

    // Tomorrow's schedule
    sections.push(
      await this.scheduleSection(
        user,
        tomorrow.start,
        tomorrow.end,
        t.tomorrowSchedule,
        t.noTomorrow,
        t.allDay,
      ),
    );

    // Tomorrow's reminders (only when present)
    const tomorrowReminders = await this.reminders.listPendingBetween(
      user.id,
      tomorrow.start,
      tomorrow.end,
    );
    if (tomorrowReminders.length > 0) {
      sections.push(
        `${t.tomorrowReminders}\n` +
          tomorrowReminders
            .map((r) => `• ${formatThaiTime(r.remindAt)} น. ${r.message}`)
            .join("\n"),
      );
    }

    // Suggested priorities for tomorrow (derived from remaining tasks)
    const suggested = this.suggestPriorities(remaining);
    if (suggested.length > 0) {
      sections.push(
        `${t.suggested}\n` +
          suggested.map((td, i) => `${i + 1}. ${td.title}`).join("\n"),
      );
    }

    return sections.join("\n\n");
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Push a composed message to every active user whose given setting is on.
   * One user's failure never affects the others.
   */
  private async broadcast(
    enabledKey: "morningBriefEnabled" | "eveningBriefEnabled",
    compose: (user: User, settings: UserSettings) => Promise<string>,
  ): Promise<{ sent: number; skipped: number; failed: number }> {
    const users = (await this.users.list()).filter((u) => u.isActive);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const settings = await this.settings.get(user.id);
        if (!settings[enabledKey]) {
          skipped++;
          continue;
        }
        const text = await compose(user, settings);
        await this.line.pushText(user.lineUserId, text);
        sent++;
      } catch (err) {
        failed++;
        logger.error("brief.send_failed", { userId: user.id, ...errorInfo(err) });
      }
    }
    return { sent, skipped, failed };
  }

  private async scheduleSection(
    user: User,
    start: Date,
    end: Date,
    title: string,
    noneText: string,
    allDayText: string,
  ): Promise<string> {
    const connected = await this.calendar.isConnected(user.id).catch(() => false);
    if (!connected) return noneText;
    const events = await this.calendar.listEvents(user.id, start, end).catch(() => []);
    if (events.length === 0) return noneText;
    return (
      `${title}\n` +
      events
        .map((e) => {
          const time = e.start.includes("T")
            ? `${formatThaiTime(new Date(e.start))} `
            : `${allDayText} · `;
          return `• ${time}${e.title}`;
        })
        .join("\n")
    );
  }

  private async newsSection(userId: string, title: string): Promise<string | null> {
    const topics = await this.newsPrefs.listActive(userId);
    if (topics.length === 0) return null;
    const blocks: string[] = [];
    for (const pref of topics.slice(0, 3)) {
      const headlines = await this.news.headlines(pref.topic, 2);
      if (headlines.length > 0) {
        blocks.push(
          `📌 ${pref.topic}\n` + headlines.map((h) => `• ${h.title}`).join("\n"),
        );
      }
    }
    return blocks.length > 0 ? `${title}\n${blocks.join("\n")}` : null;
  }

  private async weatherSection(t: (typeof L)["th"]): Promise<string | null> {
    const w = await this.weather.current();
    if (!w) return null;
    return (
      `${t.weather(w.locationName)}\n` +
      `${w.temperature}°C ${w.condition} · ${t.high} ${w.high}° ${t.low} ${w.low}° · ${t.rain} ${w.rainProbability}%`
    );
  }

  private suggestPriorities(open: Todo[]): Todo[] {
    return [...open]
      .sort((a, b) => {
        const pr = (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9);
        if (pr !== 0) return pr;
        const ad = a.dueDate?.getTime() ?? Infinity;
        const bd = b.dueDate?.getTime() ?? Infinity;
        return ad - bd;
      })
      .slice(0, 3);
  }
}
