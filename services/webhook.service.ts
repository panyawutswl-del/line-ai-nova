import type { WebhookEvent } from "@line/bot-sdk";
import type { LineService } from "@/lib/line";
import type { UserService } from "@/services/user.service";
import type { ChatService } from "@/services/chat.service";
import type { ReminderService } from "@/services/reminder.service";
import type { QuickCommandService } from "@/services/quick-command.service";
import { logger, errorInfo } from "@/lib/logger";

const UNAUTHORIZED_REPLY = (lineUserId: string) =>
  `ขออภัยค่ะ Nova เป็นผู้ช่วยส่วนตัวที่เปิดใช้เฉพาะผู้ใช้ที่ได้รับอนุญาตเท่านั้น 🔒\n\nถ้าคุณคือเจ้าของระบบ ให้นำ LINE User ID นี้ไปใส่ใน env WHITELIST:\n${lineUserId}`;

const GREETING_REPLY =
  "สวัสดีค่ะ ฉันคือ Nova ผู้ช่วยส่วนตัวของคุณ ✨\nพิมพ์คุยได้เลย — ถามข้อมูล ช่วยคิด ช่วยร่างข้อความ สรุปเนื้อหา ได้หมดค่ะ";

const ERROR_REPLY =
  "ขออภัยค่ะ เกิดข้อผิดพลาดชั่วคราว ลองใหม่อีกครั้งนะคะ 🙏";

export class WebhookService {
  constructor(
    private line: LineService,
    private users: UserService,
    private chat: ChatService,
    private reminders: ReminderService,
    private quickCommands: QuickCommandService,
  ) {}

  async handleEvent(event: WebhookEvent): Promise<void> {
    try {
      switch (event.type) {
        case "follow":
          return await this.handleFollow(event);
        case "message":
          return await this.handleMessage(event);
        default:
          logger.debug("webhook.event_ignored", { type: event.type });
      }
    } catch (err) {
      logger.error("webhook.event_failed", {
        type: event.type,
        ...errorInfo(err),
      });
      if ("replyToken" in event && event.replyToken) {
        await this.line
          .replyText(event.replyToken, ERROR_REPLY)
          .catch(() => undefined); // reply token may already be used/expired
      }
    }
  }

  private async handleFollow(
    event: Extract<WebhookEvent, { type: "follow" }>,
  ): Promise<void> {
    const lineUserId = event.source.userId;
    if (!lineUserId) return;

    const user = await this.users.ensureUser(lineUserId);
    await this.line.replyText(
      event.replyToken,
      user.isActive ? GREETING_REPLY : UNAUTHORIZED_REPLY(lineUserId),
    );
  }

  private async handleMessage(
    event: Extract<WebhookEvent, { type: "message" }>,
  ): Promise<void> {
    if (event.message.type !== "text") {
      await this.line.replyText(
        event.replyToken,
        "ตอนนี้ Nova รองรับเฉพาะข้อความตัวอักษรค่ะ 💬",
      );
      return;
    }

    const lineUserId = event.source.userId;
    if (!lineUserId) return;

    const user = await this.users.ensureUser(lineUserId);
    if (!user.isActive) {
      logger.warn("auth.rejected", { lineUserId });
      await this.line.replyText(
        event.replyToken,
        UNAUTHORIZED_REPLY(lineUserId),
      );
      return;
    }

    void this.users.touchLastLogin(user).catch(() => undefined);
    // Opportunistic fallback: deliver any due reminders even if the cron
    // pinger is down. Atomic claiming in the service prevents double-sends.
    void this.reminders.dispatchDue().catch(() => undefined);

    const text = event.message.text;

    // Fixed keyword commands (rich menu / typed) skip Gemini entirely.
    const quick = await this.quickCommands.handle(user, text);
    if (quick !== null) {
      await this.line.replyText(event.replyToken, quick);
      logger.info("quick_command.replied", { userId: user.id });
      return;
    }

    const answer = await this.chat.reply(user, text);
    await this.line.replyText(event.replyToken, answer);
    logger.info("chat.replied", {
      userId: user.id,
      inputLength: text.length,
      outputLength: answer.length,
    });
  }
}
