import { z } from "zod";

const envSchema = z.object({
  LINE_CHANNEL_SECRET: z.string().min(1, "LINE_CHANNEL_SECRET is required"),
  LINE_CHANNEL_ACCESS_TOKEN: z
    .string()
    .min(1, "LINE_CHANNEL_ACCESS_TOKEN is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OWNER_LINE_USER_ID: z.string().default(""),
  WHITELIST_LINE_USER_IDS: z.string().default(""),
});

export interface AppConfig {
  line: {
    channelSecret: string;
    channelAccessToken: string;
  };
  gemini: {
    apiKey: string;
    model: string;
  };
  auth: {
    ownerLineUserId: string;
    /** All whitelisted LINE user IDs, including the owner. */
    whitelist: string[];
  };
}

let cached: AppConfig | null = null;

/**
 * Validated at first use (not at import time) so `next build`
 * succeeds without runtime secrets.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  const env = envSchema.parse(process.env);

  const whitelist = [
    env.OWNER_LINE_USER_ID,
    ...env.WHITELIST_LINE_USER_IDS.split(","),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  cached = {
    line: {
      channelSecret: env.LINE_CHANNEL_SECRET,
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    },
    gemini: {
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    },
    auth: {
      ownerLineUserId: env.OWNER_LINE_USER_ID.trim(),
      whitelist,
    },
  };
  return cached;
}
