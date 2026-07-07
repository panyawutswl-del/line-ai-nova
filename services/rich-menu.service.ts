import { messagingApi } from "@line/bot-sdk";
import { logger } from "@/lib/logger";

export const RICH_MENU_NAME = "Nova Main Menu";
export const RICH_MENU_ALIAS = "nova-main";
const CHAT_BAR_TEXT = "เมนู Nova ▾";

const WIDTH = 2500;
const HEIGHT = 1686;
const COL = WIDTH / 2; // 1250
const ROW = HEIGHT / 3; // 562

/** 6-button grid. Tapping sends the plain keyword, triggering a quick command. */
export const RICH_MENU_BUTTONS = [
  { label: "📅 Calendar", command: "calendar" },
  { label: "✅ Todo", command: "todo" },
  { label: "⏰ Reminder", command: "reminder" },
  { label: "📰 News", command: "news" },
  { label: "🧠 Memory", command: "memory" },
  { label: "⚙️ Settings", command: "settings" },
] as const;

function buildMenuRequest(): messagingApi.RichMenuRequest {
  const areas = RICH_MENU_BUTTONS.map((btn, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    return {
      bounds: { x: col * COL, y: row * ROW, width: COL, height: ROW },
      action: { type: "message" as const, text: btn.command },
    };
  });
  return {
    size: { width: WIDTH, height: HEIGHT },
    selected: true,
    name: RICH_MENU_NAME,
    chatBarText: CHAT_BAR_TEXT,
    areas,
  };
}

/**
 * Manages the LINE Rich Menu lifecycle (create / image / default / alias /
 * link / delete). Used by the CLI scripts, not the web request path.
 */
export class RichMenuService {
  private api: messagingApi.MessagingApiClient;
  private blob: messagingApi.MessagingApiBlobClient;

  constructor(channelAccessToken: string) {
    this.api = new messagingApi.MessagingApiClient({ channelAccessToken });
    this.blob = new messagingApi.MessagingApiBlobClient({ channelAccessToken });
  }

  async createMenu(): Promise<string> {
    const { richMenuId } = await this.api.createRichMenu(buildMenuRequest());
    logger.info("richmenu.created", { richMenuId });
    return richMenuId;
  }

  async uploadImage(
    richMenuId: string,
    image: Buffer,
    contentType: "image/png" | "image/jpeg" = "image/png",
  ): Promise<void> {
    // Blob client expects a Blob; Node 18+ provides it globally.
    const blob = new Blob([new Uint8Array(image)], { type: contentType });
    await this.blob.setRichMenuImage(richMenuId, blob);
    logger.info("richmenu.image_uploaded", { richMenuId, bytes: image.length });
  }

  async setDefault(richMenuId: string): Promise<void> {
    await this.api.setDefaultRichMenu(richMenuId);
    logger.info("richmenu.set_default", { richMenuId });
  }

  /** (Re)point an alias at a rich menu, replacing any existing alias. */
  async upsertAlias(aliasId: string, richMenuId: string): Promise<void> {
    await this.api
      .deleteRichMenuAlias(aliasId)
      .catch(() => undefined); // alias may not exist yet
    await this.api.createRichMenuAlias({
      richMenuAliasId: aliasId,
      richMenuId,
    });
    logger.info("richmenu.alias_set", { aliasId, richMenuId });
  }

  async linkToUser(lineUserId: string, richMenuId: string): Promise<void> {
    await this.api.linkRichMenuIdToUser(lineUserId, richMenuId);
    logger.info("richmenu.linked_user", { lineUserId, richMenuId });
  }

  async listMenus(): Promise<string[]> {
    const { richmenus } = await this.api.getRichMenuList();
    return richmenus.map((m) => m.richMenuId);
  }

  /** Remove the alias, clear the default, and delete every rich menu. */
  async deleteAll(): Promise<number> {
    await this.api.deleteRichMenuAlias(RICH_MENU_ALIAS).catch(() => undefined);
    await this.api.cancelDefaultRichMenu().catch(() => undefined);
    const ids = await this.listMenus();
    for (const id of ids) {
      await this.api.deleteRichMenu(id).catch(() => undefined);
    }
    logger.info("richmenu.deleted_all", { count: ids.length });
    return ids.length;
  }
}
