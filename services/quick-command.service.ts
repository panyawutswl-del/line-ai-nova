import type { User } from "@prisma/client";
import type { TodoService } from "@/services/todo.service";
import type { ReminderService } from "@/services/reminder.service";
import type { MemoryService } from "@/services/memory.service";
import type { CalendarService } from "@/services/calendar.service";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import type { SettingsService, ToggleKey } from "@/services/settings.service";
import { bangkokDayRange, formatThaiTime, formatThaiDateTime } from "@/lib/time";

type Command = "calendar" | "todo" | "reminder" | "news" | "memory" | "settings";

const COMMAND_ALIASES: Record<Command, string[]> = {
  calendar: ["calendar", "ปฏิทิน"],
  todo: ["todo", "todos", "to-do", "งาน"],
  reminder: ["reminder", "reminders", "เตือน", "การเตือน"],
  news: ["news", "ข่าว"],
  memory: ["memory", "memories", "ความจำ"],
  settings: ["settings", "setting", "ตั้งค่า", "การตั้งค่า"],
};

const ON = "เปิด ✅";
const OFF = "ปิด ⛔";

/** Structured toggle intents (checked before plain commands). */
const TOGGLES: Array<{ match: string[]; key: ToggleKey; on: boolean }> = [
  { match: ["เปิดสรุปเช้า", "morning on"], key: "morningBriefEnabled", on: true },
  { match: ["ปิดสรุปเช้า", "morning off"], key: "morningBriefEnabled", on: false },
  { match: ["เปิดสรุปเย็น", "evening on"], key: "eveningBriefEnabled", on: true },
  { match: ["ปิดสรุปเย็น", "evening off"], key: "eveningBriefEnabled", on: false },
  { match: ["เปิดข่าว", "news on"], key: "newsEnabled", on: true },
  { match: ["ปิดข่าว", "news off"], key: "newsEnabled", on: false },
  { match: ["เปิดอากาศ", "weather on"], key: "weatherEnabled", on: true },
  { match: ["ปิดอากาศ", "weather off"], key: "weatherEnabled", on: false },
];

/**
 * Handles fixed keyword commands (from the rich menu or typed directly) without
 * calling Gemini. Returns null when the text is not a recognised command,
 * letting the normal AI chat path take over.
 */
export class QuickCommandService {
  constructor(
    private todo: TodoService,
    private reminder: ReminderService,
    private memory: MemoryService,
    private calendar: CalendarService,
    private newsPrefs: NewsPreferenceRepository,
    private settings: SettingsService,
  ) {}

  async handle(user: User, rawText: string): Promise<string | null> {
    const text = normalize(rawText);

    // Language switches
    if (["english", "ภาษาอังกฤษ"].includes(text)) {
      await this.settings.update(user.id, { language: "en" });
      return "🌐 Language set to English.";
    }
    if (["thai", "ไทย", "ภาษาไทย"].includes(text)) {
      await this.settings.update(user.id, { language: "th" });
      return "🌐 ตั้งค่าภาษาเป็นไทยแล้วค่ะ";
    }

    // Setting toggles
    const toggle = TOGGLES.find((t) => t.match.includes(text));
    if (toggle) {
      await this.settings.setToggle(user.id, toggle.key, toggle.on);
      return `${toggle.on ? "✅ เปิด" : "⛔ ปิด"}${TOGGLE_LABEL[toggle.key]}แล้วค่ะ`;
    }

    const command = matchCommand(text);
    if (!command) return null;

    switch (command) {
      case "calendar":
        return this.calendarCmd(user);
      case "todo":
        return this.todoCmd(user);
      case "reminder":
        return this.reminderCmd(user);
      case "news":
        return this.newsCmd(user);
      case "memory":
        return this.memoryCmd(user);
      case "settings":
        return this.settingsCmd(user);
    }
  }

  private async calendarCmd(user: User): Promise<string> {
    if (!this.calendar.isConfigured()) {
      return "📅 ระบบปฏิทินยังไม่ได้ตั้งค่าบนเซิร์ฟเวอร์ค่ะ";
    }
    if (!(await this.calendar.isConnected(user.id))) {
      return (
        "📅 เชื่อมต่อ Google Calendar ของคุณกับ Nova ได้ที่ลิงก์นี้ค่ะ:\n" +
        this.calendar.connectUrl(user.lineUserId)
      );
    }
    const { start, end } = bangkokDayRange();
    const events = await this.calendar.listEvents(user.id, start, end).catch(() => []);
    const body =
      events.length === 0
        ? "วันนี้ไม่มีนัดหมาย"
        : events
            .map((e) => {
              const time = e.start.includes("T")
                ? `${formatThaiTime(new Date(e.start))} `
                : "ทั้งวัน · ";
              return `• ${time}${e.title}`;
            })
            .join("\n");
    return `📅 กำหนดการวันนี้\n${body}\n\n💡 พิมพ์ "นัดประชุมพรุ่งนี้ 10 โมง" เพื่อสร้างนัดใหม่`;
  }

  private async todoCmd(user: User): Promise<string> {
    const today = await this.todo.list(user.id, "today");
    const open = await this.todo.list(user.id, "all");
    const todayBody =
      today.length === 0
        ? "วันนี้ไม่มีงานถึงกำหนด"
        : today.map((t) => `• ${t.title}`).join("\n");
    return (
      `📋 งานวันนี้\n${todayBody}\n\n` +
      `งานค้างทั้งหมด: ${open.length} รายการ\n` +
      `💡 พิมพ์ "เพิ่มงาน ..." หรือ "ทำเสร็จแล้ว ..."`
    );
  }

  private async reminderCmd(user: User): Promise<string> {
    const list = await this.reminder.listPending(user.id);
    const body =
      list.length === 0
        ? "ยังไม่มีการเตือนที่ตั้งไว้"
        : list.map((r) => `• ${formatThaiDateTime(r.remindAt)} — ${r.message}`).join("\n");
    return `⏰ การเตือนที่รอส่ง\n${body}\n\n💡 พิมพ์ "เตือนฉันพรุ่งนี้ 9 โมง ..."`;
  }

  private async newsCmd(user: User): Promise<string> {
    const topics = await this.newsPrefs.listActive(user.id);
    if (topics.length === 0) {
      return '📰 คุณยังไม่ได้ติดตามหมวดข่าวใด\n💡 พิมพ์ "ติดตามข่าว AI" เพื่อเริ่ม';
    }
    return (
      `📰 ข่าวที่ติดตาม: ${topics.map((t) => t.topic).join(", ")}\n\n` +
      '💡 พิมพ์ "สรุปข่าว AI" เพื่อดูพาดหัวล่าสุด'
    );
  }

  private async memoryCmd(user: User): Promise<string> {
    const memories = await this.memory.list(user.id, 15);
    if (memories.length === 0) {
      return '🧠 ยังไม่มีข้อมูลที่จำไว้\n💡 พิมพ์ "จำว่า ..." เพื่อบันทึก';
    }
    return (
      "🧠 สิ่งที่ Nova จำไว้\n" +
      memories.map((m) => `• ${m.content}`).join("\n")
    );
  }

  private async settingsCmd(user: User): Promise<string> {
    const s = await this.settings.get(user.id);
    return (
      "⚙️ การตั้งค่าของคุณ\n" +
      `• สรุปเช้า 07:00 — ${bool(s.morningBriefEnabled)}\n` +
      `• สรุปเย็น 20:00 — ${bool(s.eveningBriefEnabled)}\n` +
      `• ข่าวในสรุป — ${bool(s.newsEnabled)}\n` +
      `• พยากรณ์อากาศ — ${bool(s.weatherEnabled)}\n` +
      `• ภาษา — ${s.language === "en" ? "English" : "ไทย"}\n` +
      `• โซนเวลา — ${s.timezone}\n\n` +
      "ปรับได้โดยพิมพ์ เช่น:\n" +
      "• ปิดสรุปเช้า / เปิดสรุปเช้า\n" +
      "• ปิดข่าว / เปิดอากาศ\n" +
      "• english / ไทย"
    );
  }
}

const TOGGLE_LABEL: Record<ToggleKey, string> = {
  morningBriefEnabled: "สรุปเช้า",
  eveningBriefEnabled: "สรุปเย็น",
  newsEnabled: "ข่าวในสรุป",
  weatherEnabled: "พยากรณ์อากาศ",
};

function bool(v: boolean): string {
  return v ? ON : OFF;
}

/**
 * Lowercase, trim, and strip a leading emoji label (e.g. "⚙️ Settings" →
 * "settings"). Includes variation selectors (U+FE0F) and ZWJ so composed
 * emoji like ⚙️ are fully removed.
 */
function normalize(text: string): string {
  return text
    .trim()
    .replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "")
    .trim()
    .toLowerCase();
}

function matchCommand(text: string): Command | null {
  for (const [command, aliases] of Object.entries(COMMAND_ALIASES)) {
    if (aliases.includes(text)) return command as Command;
  }
  return null;
}
