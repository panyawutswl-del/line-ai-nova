-- CreateEnum
CREATE TYPE "ComparisonOperator" AS ENUM ('GT', 'GTE', 'LT', 'LTE');

-- AlterTable
ALTER TABLE "weather_alerts" ADD COLUMN     "comparison" "ComparisonOperator";
