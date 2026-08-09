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
  CRON_SECRET: z.string().default(""),
  GOOGLE_CLIENT_ID: z.string().default(""),
  GOOGLE_CLIENT_SECRET: z.string().default(""),
  GOOGLE_REDIRECT_URI: z.string().default(""),
  // Weather location for the daily brief — defaults to Sukhothai.
  WEATHER_LATITUDE: z.coerce.number().default(17.0078),
  WEATHER_LONGITUDE: z.coerce.number().default(99.8237),
  WEATHER_LOCATION_NAME: z.string().default("สุโขทัย"),
  // AirVisual (IQAir) — air quality + weather by lat/lon. Empty when not configured.
  AIRVISUAL_API_KEY: z.string().default(""),
  // Shared secret for machine-to-machine infrastructure alerts (e.g. Synology DSM).
  INFRASTRUCTURE_WEBHOOK_SECRET: z.string().default(""),
  // sriwilai-web GA4 report — data-only endpoint, Nova pushes it to LINE.
  ANALYTICS_REPORT_URL: z
    .string()
    .default("https://sriwilaisukhothai.com/api/analytics-report"),
  ANALYTICS_REPORT_SECRET: z.string().default(""),
  // sriwilai-web social report (Facebook + Instagram) — same shared secret.
  SOCIAL_REPORT_URL: z
    .string()
    .default("https://sriwilaisukhothai.com/api/social-report"),
  // sriwilai-web Search Console top-queries report — same shared secret.
  SEARCH_QUERIES_REPORT_URL: z
    .string()
    .default("https://sriwilaisukhothai.com/api/search-queries-report"),
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
  /** Empty string when cron endpoints are unprotected (dev only). */
  cronSecret: string;
  /** All empty when Google Calendar integration is not configured. */
  google: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  };
  /** Location used for the daily brief weather section. */
  weather: {
    latitude: number;
    longitude: number;
    locationName: string;
  };
  /** Empty string when AirVisual integration is not configured. */
  airvisual: {
    apiKey: string;
  };
  /** Empty when the infrastructure webhook has not been enabled. */
  infrastructure: {
    webhookSecret: string;
  };
  /** Empty secret when the sriwilai-web analytics report is not configured. */
  analytics: {
    reportUrl: string;
    socialReportUrl: string;
    searchQueriesReportUrl: string;
    reportSecret: string;
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
    cronSecret: env.CRON_SECRET.trim(),
    google: {
      clientId: env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
      redirectUri: env.GOOGLE_REDIRECT_URI.trim(),
    },
    weather: {
      latitude: env.WEATHER_LATITUDE,
      longitude: env.WEATHER_LONGITUDE,
      locationName: env.WEATHER_LOCATION_NAME.trim(),
    },
    airvisual: {
      apiKey: env.AIRVISUAL_API_KEY.trim(),
    },
    infrastructure: {
      webhookSecret: env.INFRASTRUCTURE_WEBHOOK_SECRET.trim(),
    },
    analytics: {
      reportUrl: env.ANALYTICS_REPORT_URL.trim(),
      socialReportUrl: env.SOCIAL_REPORT_URL.trim(),
      searchQueriesReportUrl: env.SEARCH_QUERIES_REPORT_URL.trim(),
      reportSecret: env.ANALYTICS_REPORT_SECRET.trim(),
    },
  };
  return cached;
}
