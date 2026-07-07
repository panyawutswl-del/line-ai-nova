import type { ToolContext } from "@/types";
import { formatThaiDateTime } from "@/lib/time";
import { logger, errorInfo } from "@/lib/logger";

/**
 * Deterministic, keyword-driven replies used when Gemini is unavailable
 * (e.g. daily quota exhausted). No LLM call — just a few high-value intents
 * routed straight to the services, so the bot stays partly useful.
 *
 * Returns null when nothing clearly matches, letting the caller show the
 * generic quota message. Never throws.
 */
const OFFLINE_NOTE =
  "\n\n— ตอนนี้ Nova ใช้ AI ครบโควต้าของวันนี้ ตอบได้เฉพาะคำสั่งพื้นฐานชั่วคราวค่ะ 🙏";

export async function buildOfflineReply(
  text: string,
  ctx: ToolContext,
): Promise<string | null> {
  const t = text.trim().toLowerCase();
  if (!t) return null;

  try {
    // Evaluate intents in priority order (each returns string | null).
    const reply =
      (await tryCalendar(t, ctx)) ??
      (await tryReminders(t, ctx)) ??
      (await tryTodos(t, ctx)) ??
      tryDateTime(t);

    return reply ? reply + OFFLINE_NOTE : null;
  } catch (err) {
    logger.warn("offline_responder.failed", errorInfo(err));
    return null;
  }
}

function tryDateTime(t: string): string | null {
  const matched =
    /กี่โมง|เวลาเท่า|ตอนนี้กี่|วันที่เท่า|วันนี้วันอะไร|วันนี้วันที่|วันนี้กี่|what time|current time|today.*date|date.*today/.test(
      t,
    );
  if (!matched) return null;
  return `📅 ตอนนี้ ${formatThaiDateTime(new Date())} น.`;
}

async function tryReminders(
  t: string,
  ctx: ToolContext,
): Promise<string | null> {
  const isReminder = /เตือน|reminder/.test(t);
  const isQuery =
    /อะไร|บ้าง|ดู|list|รายการ|มีไหม|ค้าง|ตั้งไว้|pending|ทั้งหมด/.test(t);
  if (!isReminder || !isQuery) return null;

  const list = await ctx.services.reminder.listPending(ctx.user.id);
  if (list.length === 0) return "⏰ ตอนนี้ยังไม่มีรายการเตือนที่ตั้งไว้ค่ะ";
  return (
    "⏰ รายการเตือนที่รอส่ง:\n" +
    list
      .map((r) => `• ${formatThaiDateTime(r.remindAt)} — ${r.message}`)
      .join("\n")
  );
}

async function tryTodos(t: string, ctx: ToolContext): Promise<string | null> {
  const isTodo = /งาน|todo|to-?do|task/.test(t);
  const isQuery = /วันนี้|today|อะไรบ้าง|มีอะไร|list|ค้าง|ทั้งหมด|ดู/.test(t);
  if (!isTodo || !isQuery) return null;

  const todos = await ctx.services.todo.list(ctx.user.id, "today");
  if (todos.length === 0) return "📋 วันนี้ไม่มีงานถึงกำหนดค่ะ";
  return "📋 งานวันนี้:\n" + todos.map((td) => `• ${td.title}`).join("\n");
}

async function tryCalendar(
  t: string,
  ctx: ToolContext,
): Promise<string | null> {
  if (!/ปฏิทิน|calendar/.test(t)) return null;

  const { calendar } = ctx.services;
  if (!calendar.isConfigured()) return null;

  if (await calendar.isConnected(ctx.user.id)) {
    return "📅 ปฏิทิน Google ของคุณเชื่อมต่อกับ Nova อยู่แล้วค่ะ";
  }
  return (
    "📅 เชื่อมต่อ Google Calendar ของคุณกับ Nova ได้ที่ลิงก์นี้ค่ะ:\n" +
    calendar.connectUrl(ctx.user.lineUserId)
  );
}
