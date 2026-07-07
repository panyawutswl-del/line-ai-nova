/**
 * Rich Menu management CLI.
 *
 *   npm run line:richmenu:create        create menu + image, set as default, alias
 *   npm run line:richmenu:delete        delete alias + all rich menus
 *   npm run line:richmenu:link [userId] set default (or link to one LINE user)
 *
 * Needs LINE_CHANNEL_ACCESS_TOKEN (read from .env or the environment).
 */
import sharp from "sharp";
import {
  RichMenuService,
  RICH_MENU_ALIAS,
  RICH_MENU_BUTTONS,
} from "@/services/rich-menu.service";

// Node 20.12+/22+ can load .env natively; ignore if already in the environment.
try {
  process.loadEnvFile(".env");
} catch {
  /* .env not present — rely on process.env */
}

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error("✗ LINE_CHANNEL_ACCESS_TOKEN is not set (.env or environment).");
  process.exit(1);
}

const service = new RichMenuService(token);
const command = process.argv[2];

/** Build the 2500×1686 menu image (2 cols × 3 rows) as a PNG buffer. */
async function buildImage(): Promise<Buffer> {
  const W = 2500;
  const H = 1686;
  const COL = W / 2;
  const ROW = H / 3;
  const COLORS = ["#e8f0fe", "#e6f4ea", "#fef7e0", "#fce8e6", "#f3e8fd", "#e0f7fa"];

  const cells = RICH_MENU_BUTTONS.map((btn, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = col * COL;
    const y = row * ROW;
    const cx = x + COL / 2;
    const cy = y + ROW / 2;
    // Strip the emoji from the label for reliable rasterization; keep the word.
    const word = btn.label.replace(/^[^\p{L}]+/u, "").trim();
    return `
      <rect x="${x + 8}" y="${y + 8}" width="${COL - 16}" height="${ROW - 16}" rx="32" fill="${COLORS[i]}" stroke="#dadce0" stroke-width="2"/>
      <text x="${cx}" y="${cy + 20}" font-family="Arial, sans-serif" font-size="90" font-weight="700" fill="#202124" text-anchor="middle">${word}</text>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    ${cells}
  </svg>`;

  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function create(): Promise<void> {
  console.log("→ creating rich menu…");
  const richMenuId = await service.createMenu();
  console.log("→ generating image…");
  const image = await buildImage();
  await service.uploadImage(richMenuId, image, "image/png");
  await service.setDefault(richMenuId);
  await service.upsertAlias(RICH_MENU_ALIAS, richMenuId);
  console.log(`✓ Rich menu ready: ${richMenuId} (alias "${RICH_MENU_ALIAS}")`);
}

async function remove(): Promise<void> {
  const count = await service.deleteAll();
  console.log(`✓ Deleted ${count} rich menu(s) and alias "${RICH_MENU_ALIAS}".`);
}

async function link(): Promise<void> {
  const ids = await service.listMenus();
  if (ids.length === 0) {
    console.error("✗ No rich menu exists. Run create first.");
    process.exit(1);
  }
  const richMenuId = ids[0];
  const userId = process.argv[3];
  if (userId) {
    await service.linkToUser(userId, richMenuId);
    console.log(`✓ Linked ${richMenuId} to user ${userId}.`);
  } else {
    await service.setDefault(richMenuId);
    await service.upsertAlias(RICH_MENU_ALIAS, richMenuId);
    console.log(`✓ Set ${richMenuId} as the default rich menu.`);
  }
}

async function main(): Promise<void> {
  switch (command) {
    case "create":
      return create();
    case "delete":
      return remove();
    case "link":
      return link();
    default:
      console.error("Usage: richmenu.ts <create|delete|link [lineUserId]>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("✗ Rich menu command failed:", err?.message ?? err);
  process.exit(1);
});
