import type { Reminder } from "@prisma/client";
import type { ReminderRepository } from "@/repositories/reminder.repository";
import type { LineService } from "@/lib/line";
import { logger, errorInfo } from "@/lib/logger";
import { formatThaiDateTime } from "@/lib/time";

export class ReminderService {
  constructor(
    private reminders: ReminderRepository,
    private line: LineService,
  ) {}

  create(userId: string, message: string, remindAt: Date): Promise<Reminder> {
    return this.reminders.create(userId, message, remindAt);
  }

  listPending(userId: string): Promise<Reminder[]> {
    return this.reminders.listPending(userId);
  }

  async cancelByQuery(
    userId: string,
    query: string,
  ): Promise<Reminder | null> {
    const matches = await this.reminders.searchPending(userId, query, 1);
    if (matches.length === 0) return null;
    await this.reminders.cancel(matches[0].id);
    return matches[0];
  }

  /**
   * Send every due reminder as a LINE push message.
   * Each reminder is claimed atomically first, so concurrent cron runs
   * (Vercel Cron + external pinger) never double-send.
   */
  async dispatchDue(): Promise<number> {
    const due = await this.reminders.findDue(new Date());
    let sent = 0;
    for (const reminder of due) {
      const claimed = await this.reminders.claim(reminder.id);
      if (!claimed) continue;
      try {
        await this.line.pushText(
          reminder.user.lineUserId,
          `⏰ เตือนความจำ\n${reminder.message}\n\n(ตั้งไว้เมื่อ ${formatThaiDateTime(reminder.createdAt)})`,
        );
        sent++;
      } catch (err) {
        logger.error("reminder.push_failed", {
          reminderId: reminder.id,
          ...errorInfo(err),
        });
        await this.reminders.release(reminder.id).catch(() => undefined);
      }
    }
    if (due.length > 0) logger.info("reminder.dispatched", { due: due.length, sent });
    return sent;
  }
}
