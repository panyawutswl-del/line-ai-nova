-- Phase 3: per-user settings (brief toggles, news/weather, timezone, language)

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "morning_brief_enabled" BOOLEAN NOT NULL DEFAULT true,
    "evening_brief_enabled" BOOLEAN NOT NULL DEFAULT true,
    "news_enabled" BOOLEAN NOT NULL DEFAULT true,
    "weather_enabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Bangkok',
    "language" TEXT NOT NULL DEFAULT 'th',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
