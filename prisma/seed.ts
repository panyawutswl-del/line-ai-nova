/**
 * Seed the owner user from OWNER_LINE_USER_ID.
 * Run: npm run db:seed  (needs DATABASE_URL/DIRECT_URL + OWNER_LINE_USER_ID)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ownerLineUserId = process.env.OWNER_LINE_USER_ID?.trim();
  if (!ownerLineUserId) {
    console.log(
      "OWNER_LINE_USER_ID is not set — skipping seed.\n" +
        "Tip: message the bot once; it replies with your LINE User ID.",
    );
    return;
  }

  const owner = await prisma.user.upsert({
    where: { lineUserId: ownerLineUserId },
    update: { role: "OWNER", isActive: true },
    create: {
      lineUserId: ownerLineUserId,
      displayName: "Owner",
      role: "OWNER",
      isActive: true,
    },
  });
  console.log(`✅ Owner user ready: ${owner.id} (${owner.lineUserId})`);

  await prisma.setting.upsert({
    where: { userId_key: { userId: owner.id, key: "timezone" } },
    update: {},
    create: { userId: owner.id, key: "timezone", value: "Asia/Bangkok" },
  });
  console.log("✅ Default settings ready");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
