import type { User } from "@prisma/client";
import type { UserRepository } from "@/repositories/user.repository";
import type { TodoRepository } from "@/repositories/todo.repository";
import type { ReminderRepository } from "@/repositories/reminder.repository";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import type { NewsService } from "@/services/news.service";
import type { CalendarService } from "@/services/calendar.service";
import type { LineService } from "@/lib/line";
import { bangkokDayRange, formatThaiDate, formatThaiTime } from "@/lib/time";
import { logger, errorInfo } from "@/lib/logger";

const PRIORITY_ICON: Record<string, string> = {
  URGENT: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
};

/** Composes and pushes the 07:00 Daily Executive Brief. */
export class BriefService {
  constructor(
    private users: UserRepository,
    private todos: TodoRepository,
    private reminders: ReminderRepository,
    private newsPrefs: NewsPreferenceRepository,
    private news: NewsService,
    private calendar: CalendarService,
    private line: LineService,
  ) {}

  async sendMorningBriefs(): Promise<{ sent: number; failed: number }> {
    const users = (await this.users.list()).filter((u) => u.isActive);
    let sent = 0;
    let failed = 0;
    for (const user of users) {
      try {
        const text = await this.compose(user);
        await this.line.pushText(user.lineUserId, text);
        sent++;
      } catch (err) {
        failed++;
        logger.error("brief.send_failed", { userId: user.id, ...errorInfo(err) });
      }
    }
    logger.info("brief.morning_done", { sent, failed });
    return { sent, failed };
  }

  async compose(user: User): Promise<string> {
    const { start, end } = bangkokDayRange();
    const now = new Date();
    const sections: string[] = [
      `☀️ สรุปเช้าวันนี้ — ${formatThaiDate(now)}`,
    ];

    // 📅 Calendar
    if (await this.calendar.isConnected(user.id).catch(() => false)) {
      const events = await this.calendar
        .listEvents(user.id, start, end)
        .catch(() => []);
      sections.push(
        events.length === 0
          ? "📅 วันนี้ไม่มีนัดหมาย"
          : "📅 นัดหมายวันนี้\n" +
              events
                .map((e) => {
                  const time = e.start.includes("T")
                    ? formatThaiTime(new Date(e.start)) + " น. "
                    : "ทั้งวัน · ";
                  return `• ${time}${e.title}`;
                })
                .join("\n"),
      );
    }

    // 📋 Todos
    const dueToday = await this.todos.listDueBetween(user.id, start, end);
    const overdue = await this.todos.listOverdue(user.id, start);
    const todoLines: string[] = [];
    if (dueToday.length > 0) {
      todoLines.push(
        "📋 งานวันนี้\n" +
          dueToday
            .map((t) => `${PRIORITY_ICON[t.priority] ?? "•"} ${t.title}`)
            .join("\n"),
      );
    }
    if (overdue.length > 0) {
      todoLines.push(
        `⚠️ เกินกำหนด ${overdue.length} งาน\n` +
          overdue.slice(0, 3).map((t) => `• ${t.title}`).join("\n") +
          (overdue.length > 3 ? `\n…และอีก ${overdue.length - 3} งาน` : ""),
      );
    }
    if (todoLines.length === 0) todoLines.push("📋 วันนี้ไม่มีงานถึงกำหนด");
    sections.push(...todoLines);

    // ⏰ Reminders
    const todayReminders = await this.reminders.listPendingBetween(
      user.id,
      now,
      end,
    );
    if (todayReminders.length > 0) {
      sections.push(
        "⏰ เตือนวันนี้\n" +
          todayReminders
            .map((r) => `• ${formatThaiTime(r.remindAt)} น. ${r.message}`)
            .join("\n"),
      );
    }

    // 📰 News
    const topics = await this.newsPrefs.listActive(user.id);
    for (const pref of topics.slice(0, 3)) {
      const headlines = await this.news.headlines(pref.topic, 3);
      if (headlines.length > 0) {
        sections.push(
          `📰 ${pref.topic}\n` +
            headlines.map((h) => `• ${h.title}`).join("\n"),
        );
      }
    }

    return sections.join("\n\n");
  }
}
