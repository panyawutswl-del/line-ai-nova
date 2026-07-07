import type { NextRequest } from "next/server";
import { getConfig } from "@/lib/config";
import { logger } from "@/lib/logger";

/**
 * Authorize a cron request. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * automatically when the CRON_SECRET env var is set; external pingers must send
 * the same header. When no secret is configured, requests are allowed with a
 * warning (dev convenience — always set CRON_SECRET in production).
 */
export function isCronAuthorized(req: NextRequest): boolean {
  const { cronSecret } = getConfig();
  if (!cronSecret) {
    logger.warn("cron.unprotected", { hint: "set CRON_SECRET in production" });
    return true;
  }
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}
