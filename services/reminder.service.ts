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

  async create(userId: string, message: string, remindAt: Date): Promise<Reminder> {
    const reminder = await this.reminders.create(userId, message, remindAt);
    logger.info("reminder.created", {
      reminderId: reminder.id,
      userId,
      remindAt: reminder.remindAt.toISOString(),
    });
    return reminder;
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
    const now = new Date();
    const due = await this.reminders.findDue(now);
    logger.info("reminder.dispatch_started", { now: now.toISOString(), due: due.length });
    let sent = 0;
    for (const reminder of due) {
      logger.info("reminder.processing", { reminderId: reminder.id, remindAt: reminder.remindAt.toISOString() });
      const claimed = await this.reminders.claim(reminder.id);
      if (!claimed) {
        logger.info("reminder.claim_lost", { reminderId: reminder.id });
        continue;
      }
      logger.info("reminder.claimed", { reminderId: reminder.id });
      try {
        logger.info("reminder.pushing", { reminderId: reminder.id, lineUserId: reminder.user.lineUserId });
        await this.line.pushText(
          reminder.user.lineUserId,
          `⏰ เตือนความจำ\n${reminder.message}\n\n(ตั้งไว้เมื่อ ${formatThaiDateTime(reminder.createdAt)})`,
        );
        sent++;
        logger.info("reminder.sent", { reminderId: reminder.id });
      } catch (err) {
        logger.error("reminder.failed", {
          reminderId: reminder.id,
          ...errorInfo(err),
        });
        await this.reminders.release(reminder.id).catch(() => undefined);
      }
    }
    logger.info("reminder.dispatch_finished", { due: due.length, sent });
    return sent;
  }
}
