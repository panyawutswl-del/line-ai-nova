import type { Todo, User, UserSettings, WeatherAlertType } from "@prisma/client";
import type { UserRepository } from "@/repositories/user.repository";
import type { TodoRepository } from "@/repositories/todo.repository";
import type { ReminderRepository } from "@/repositories/reminder.repository";
import type { NewsPreferenceRepository } from "@/repositories/news-preference.repository";
import type { NewsService } from "@/services/news.service";
import type { CalendarService } from "@/services/calendar.service";
import type { SettingsService } from "@/services/settings.service";
import type { LocationService } from "@/services/location.service";
import type { AirVisualService } from "@/services/airvisual.service";
import type { WeatherAlertService } from "@/services/weather-alert.service";
import { COMPARISON_SYMBOL } from "@/services/weather-alert.service";
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
    weatherTitle: "🌤 อากาศ",
    airQualityTitle: "🌫 คุณภาพอากาศ",
    adviceTitle: "💡 คำแนะนำวันนี้",
    activeAlertsTitle: "🚨 แจ้งเตือนที่กำลังทำงาน",
    aqiCategory: {
      good: "ดี",
      moderate: "ปานกลาง",
      usg: "เริ่มมีผลต่อกลุ่มเสี่ยง",
      unhealthy: "มีผลต่อสุขภาพ",
      veryUnhealthy: "มีผลต่อสุขภาพมาก",
      hazardous: "อันตราย",
    },
    adviceGoodExercise: "วันนี้อากาศดี เหมาะกับการออกกำลังกายกลางแจ้ง",
    adviceAqiUnhealthy: "คุณภาพอากาศไม่ดี ควรหลีกเลี่ยงกิจกรรมกลางแจ้งเป็นเวลานาน",
    adviceAqiUsg: "คุณภาพอากาศเริ่มมีผลต่อกลุ่มเสี่ยง กลุ่มเสี่ยงควรลดกิจกรรมกลางแจ้ง",
    adviceStrongWind: "ลมแรง ระมัดระวังหากอยู่กลางแจ้งหรือขับขี่",
    adviceHot: "อากาศร้อนจัด ควรดื่มน้ำเยอะ ๆ และหลีกเลี่ยงแดดจัดช่วงเที่ยง",
    adviceNormal: "วันนี้อากาศทั่วไปปกติดี ใช้ชีวิตได้ตามปกติ",
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
    weatherTitle: "🌤 Weather",
    airQualityTitle: "🌫 Air Quality",
    adviceTitle: "💡 Today's Advice",
    activeAlertsTitle: "🚨 Active Alerts",
    aqiCategory: {
      good: "Good",
      moderate: "Moderate",
      usg: "Unhealthy for Sensitive Groups",
      unhealthy: "Unhealthy",
      veryUnhealthy: "Very Unhealthy",
      hazardous: "Hazardous",
    },
    adviceGoodExercise: "Good day for outdoor exercise.",
    adviceAqiUnhealthy: "Air quality is poor — avoid prolonged outdoor activity.",
    adviceAqiUsg: "Air quality may affect sensitive groups — they should limit outdoor activity.",
    adviceStrongWind: "Strong winds — be cautious outdoors or while riding.",
    adviceHot: "Very hot — stay hydrated and avoid the midday sun.",
    adviceNormal: "Conditions are generally normal today.",
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

const ALERT_TYPE_LABEL: Record<Lang, Record<WeatherAlertType, string>> = {
  th: { AQI: "AQI", PM25: "PM2.5", RAIN: "ฝน", TEMPERATURE: "อุณหภูมิ", WIND: "ลม" },
  en: { AQI: "AQI", PM25: "PM2.5", RAIN: "Rain", TEMPERATURE: "Temperature", WIND: "Wind" },
};

/** OpenWeatherMap-style icon prefixes — AirVisual reuses this iconography. */
const CONDITION_TEXT: Record<string, { th: string; en: string }> = {
  "01": { th: "☀️ ท้องฟ้าแจ่มใส", en: "Clear sky" },
  "02": { th: "🌤 มีเมฆบางส่วน", en: "Few clouds" },
  "03": { th: "⛅ เมฆกระจาย", en: "Scattered clouds" },
  "04": { th: "☁️ เมฆมาก", en: "Overcast clouds" },
  "09": { th: "🌧 ฝนซู่", en: "Shower rain" },
  "10": { th: "🌧 ฝนตก", en: "Rain" },
  "11": { th: "⛈ พายุฝนฟ้าคะนอง", en: "Thunderstorm" },
  "13": { th: "🌨 หิมะ", en: "Snow" },
  "50": { th: "🌫 หมอก", en: "Mist" },
};

function conditionText(icon: string, lang: Lang): string {
  const entry = CONDITION_TEXT[icon.slice(0, 2)];
  return entry ? entry[lang] : lang === "en" ? "Unknown conditions" : "ไม่ทราบสภาพอากาศ";
}

/** US EPA AQI bands — same scale documented in prompts/system.ts for chat. */
function aqiCategoryText(aqi: number, t: (typeof L)["th"]): string {
  const c = t.aqiCategory;
  if (aqi <= 50) return c.good;
  if (aqi <= 100) return c.moderate;
  if (aqi <= 150) return c.usg;
  if (aqi <= 200) return c.unhealthy;
  if (aqi <= 300) return c.veryUnhealthy;
  return c.hazardous;
}

/** One concise, deterministic recommendation from AQI + temperature + wind. */
function buildAdvice(
  aqiUs: number,
  temperature: number,
  windSpeed: number,
  t: (typeof L)["th"],
): string {
  if (aqiUs > 150) return t.adviceAqiUnhealthy;
  if (aqiUs > 100) return t.adviceAqiUsg;
  if (windSpeed > 10) return t.adviceStrongWind;
  if (temperature > 35) return t.adviceHot;
  if (aqiUs <= 50 && temperature <= 33) return t.adviceGoodExercise;
  return t.adviceNormal;
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
    private location: LocationService,
    private airvisual: AirVisualService,
    private weatherAlert: WeatherAlertService,
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
      const lang: Lang = settings.language === "en" ? "en" : "th";
      sections.push(...(await this.weatherSections(user.id, lang, t)));
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

  /**
   * Weather + Air Quality + Advice (+ Active Alerts) blocks, sourced from the
   * user's default Location via AirVisual. Returns [] gracefully — never
   * throws — when there's no default location or AirVisual is unavailable,
   * so a section outage can't break the rest of the brief.
   */
  private async weatherSections(
    userId: string,
    lang: Lang,
    t: (typeof L)["th"],
  ): Promise<string[]> {
    const location = await this.location.getDefault(userId).catch(() => null);
    if (!location) return [];

    const result = await this.airvisual
      .current(location.latitude, location.longitude)
      .catch(() => null);
    if (!result || !result.ok) return [];

    const { weather, airQuality } = result.data;
    const sections = [
      `${t.weatherTitle}\n${weather.temperature}°C ${conditionText(weather.weatherIcon, lang)}`,
      `${t.airQualityTitle}\nAQI ${airQuality.aqiUs} (${aqiCategoryText(airQuality.aqiUs, t)})`,
      `${t.adviceTitle}\n${buildAdvice(airQuality.aqiUs, weather.temperature, weather.windSpeed, t)}`,
    ];

    const alerts = await this.activeAlertsBlock(userId, lang, t).catch(() => null);
    if (alerts) sections.push(alerts);

    return sections;
  }

  private async activeAlertsBlock(
    userId: string,
    lang: Lang,
    t: (typeof L)["th"],
  ): Promise<string | null> {
    const alerts = await this.weatherAlert.list(userId);
    const active = alerts.filter((a) => a.isEnabled && a.lastState);
    if (active.length === 0) return null;

    const lines = active.map((a) => {
      const symbol = a.comparison ? COMPARISON_SYMBOL[a.comparison] : "";
      const condition = a.type === "RAIN" ? "" : ` ${symbol} ${a.threshold}`;
      return `• ${ALERT_TYPE_LABEL[lang][a.type]}${condition} — ${a.location.name}`;
    });
    return `${t.activeAlertsTitle}\n${lines.join("\n")}`;
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
