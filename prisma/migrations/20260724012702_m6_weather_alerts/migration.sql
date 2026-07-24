-- CreateEnum
CREATE TYPE "WeatherAlertType" AS ENUM ('AQI', 'PM25', 'RAIN', 'TEMPERATURE', 'WIND');

-- CreateTable
CREATE TABLE "weather_alerts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "location_id" TEXT NOT NULL,
    "type" "WeatherAlertType" NOT NULL,
    "threshold" DOUBLE PRECISION,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_state" BOOLEAN NOT NULL DEFAULT false,
    "last_notified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weather_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weather_alerts_user_id_idx" ON "weather_alerts"("user_id");

-- CreateIndex
CREATE INDEX "weather_alerts_is_enabled_idx" ON "weather_alerts"("is_enabled");

-- AddForeignKey
ALTER TABLE "weather_alerts" ADD CONSTRAINT "weather_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weather_alerts" ADD CONSTRAINT "weather_alerts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
