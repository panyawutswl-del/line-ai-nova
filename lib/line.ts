import { messagingApi } from "@line/bot-sdk";
import { logger, errorInfo } from "@/lib/logger";

const MAX_MESSAGE_LENGTH = 5000; // LINE text message hard limit

function toTextMessages(texts: string[]): messagingApi.TextMessage[] {
  return texts
    .filter((t) => t.trim().length > 0)
    .slice(0, 5) // LINE allows max 5 messages per reply/push
    .map((text) => ({
      type: "text" as const,
      text: text.length > MAX_MESSAGE_LENGTH ? text.slice(0, MAX_MESSAGE_LENGTH - 1) + "…" : text,
    }));
}

/**
 * Thin wrapper over the LINE Messaging API client.
 * Reply tokens are single-use, so replies retry only on network/5xx errors.
 */
export class LineService {
  private client: messagingApi.MessagingApiClient;

  constructor(channelAccessToken: string) {
    this.client = new messagingApi.MessagingApiClient({ channelAccessToken });
  }

  async replyText(replyToken: string, ...texts: string[]): Promise<void> {
    const messages = toTextMessages(texts);
    if (messages.length === 0) return;
    try {
      await this.client.replyMessage({ replyToken, messages });
    } catch (err) {
      logger.error("line.reply_failed", errorInfo(err));
      throw err;
    }
  }

  async pushText(to: string, ...texts: string[]): Promise<void> {
    const messages = toTextMessages(texts);
    if (messages.length === 0) return;
    try {
      await this.client.pushMessage({ to, messages });
    } catch (err) {
      logger.error("line.push_failed", errorInfo(err));
      throw err;
    }
  }

  async getProfile(
    lineUserId: string,
  ): Promise<{ displayName?: string; pictureUrl?: string }> {
    try {
      const profile = await this.client.getProfile(lineUserId);
      return {
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl,
      };
    } catch (err) {
      // Profile fetch is best-effort; a user can still chat without one.
      logger.warn("line.get_profile_failed", errorInfo(err));
      return {};
    }
  }
}
