import { createHmac } from "crypto";
import type { AppConfig } from "@/lib/config";
import type { SettingsRepository } from "@/repositories/settings.repository";
import type { CalendarEventRepository } from "@/repositories/calendar-event.repository";
import { logger, errorInfo } from "@/lib/logger";

const TOKENS_KEY = "google_oauth";
const OAUTH_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EVENTS_URL =
  "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIMEOUT_MS = 8_000;

interface StoredTokens {
  access_token: string;
  refresh_token?: string;
  /** epoch ms when access_token expires */
  expiry: number;
}

export interface CalendarEventInput {
  title: string;
  description?: string;
  location?: string;
  start: Date;
  end: Date;
  allDay?: boolean;
}

export interface CalendarEventView {
  /** Google event id — used for update/delete and mirrored as googleEventId. */
  id: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location?: string;
  htmlLink?: string;
}

export interface CalendarEventPatch {
  title?: string;
  description?: string;
  location?: string;
  start?: Date;
  end?: Date;
  allDay?: boolean;
}

/**
 * Google Calendar over plain OAuth 2.0 + REST (no googleapis dependency).
 * Tokens are stored per-user in the settings table under "google_oauth".
 */
export class CalendarService {
  constructor(
    private settings: SettingsRepository,
    private events: CalendarEventRepository,
    private google: AppConfig["google"],
    private stateSecret: string,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      this.google.clientId && this.google.clientSecret && this.google.redirectUri,
    );
  }

  /** Per-field presence as seen by the (cached) app config — for diagnostics. */
  configStatus(): {
    clientId: boolean;
    clientSecret: boolean;
    redirectUri: boolean;
  } {
    return {
      clientId: Boolean(this.google.clientId),
      clientSecret: Boolean(this.google.clientSecret),
      redirectUri: Boolean(this.google.redirectUri),
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.settings.get<StoredTokens>(userId, TOKENS_KEY)) !== null;
  }

  /** Link the user sends to the browser to start OAuth (state = signed LINE user id). */
  connectUrl(lineUserId: string): string {
    const base = this.google.redirectUri.replace(/\/callback\/?$/, "");
    return `${base}?state=${encodeURIComponent(this.signState(lineUserId))}`;
  }

  googleAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.google.clientId,
      redirect_uri: this.google.redirectUri,
      response_type: "code",
      scope: OAUTH_SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  signState(lineUserId: string): string {
    return `${lineUserId}.${this.hmac(lineUserId)}`;
  }

  verifyState(state: string): string | null {
    const dot = state.lastIndexOf(".");
    if (dot <= 0) return null;
    const lineUserId = state.slice(0, dot);
    return state.slice(dot + 1) === this.hmac(lineUserId) ? lineUserId : null;
  }

  async handleOAuthCallback(userId: string, code: string): Promise<void> {
    const data = await this.postToken({
      grant_type: "authorization_code",
      code,
      client_id: this.google.clientId,
      client_secret: this.google.clientSecret,
      redirect_uri: this.google.redirectUri,
    });
    await this.settings.set(userId, TOKENS_KEY, {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry: Date.now() + (data.expires_in - 60) * 1000,
    });
    logger.info("calendar.connected", { userId });
  }

  async createEvent(
    userId: string,
    input: CalendarEventInput,
  ): Promise<CalendarEventView> {
    const token = await this.accessToken(userId);
    const body = input.allDay
      ? {
          summary: input.title,
          description: input.description,
          location: input.location,
          start: { date: toDateOnly(input.start) },
          end: { date: toDateOnly(input.end) },
        }
      : {
          summary: input.title,
          description: input.description,
          location: input.location,
          start: { dateTime: input.start.toISOString(), timeZone: "Asia/Bangkok" },
          end: { dateTime: input.end.toISOString(), timeZone: "Asia/Bangkok" },
        };

    const res = await fetch(EVENTS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
    }
    const event = (await res.json()) as { id: string; htmlLink?: string };

    await this.events.create({
      userId,
      googleEventId: event.id,
      title: input.title,
      description: input.description,
      location: input.location,
      startTime: input.start,
      endTime: input.end,
      allDay: input.allDay ?? false,
    });

    return {
      id: event.id,
      title: input.title,
      start: input.start.toISOString(),
      end: input.end.toISOString(),
      allDay: input.allDay ?? false,
      location: input.location,
      htmlLink: event.htmlLink,
    };
  }

  async listEvents(
    userId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<CalendarEventView[]> {
    const token = await this.accessToken(userId);
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "20",
    });
    const res = await fetch(`${EVENTS_URL}?${params}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        location?: string;
        htmlLink?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
      }>;
    };
    return (data.items ?? []).map((item) => ({
      id: item.id,
      title: item.summary ?? "(ไม่มีชื่อ)",
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      allDay: !item.start?.dateTime,
      location: item.location,
      htmlLink: item.htmlLink,
    }));
  }

  /**
   * Patch an existing event by its Google id, then mirror the change locally.
   * Only the fields present in `patch` are sent to Google.
   */
  async updateEvent(
    userId: string,
    googleEventId: string,
    patch: CalendarEventPatch,
  ): Promise<CalendarEventView> {
    const token = await this.accessToken(userId);
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.summary = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.location !== undefined) body.location = patch.location;
    if (patch.start) {
      body.start = patch.allDay
        ? { date: toDateOnly(patch.start) }
        : { dateTime: patch.start.toISOString(), timeZone: "Asia/Bangkok" };
    }
    if (patch.end) {
      body.end = patch.allDay
        ? { date: toDateOnly(patch.end) }
        : { dateTime: patch.end.toISOString(), timeZone: "Asia/Bangkok" };
    }

    const res = await fetch(this.eventUrl(googleEventId), {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
    }
    const event = (await res.json()) as {
      id: string;
      summary?: string;
      location?: string;
      htmlLink?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    };

    await this.events.updateByGoogleEventId(userId, googleEventId, {
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.start ? { startTime: patch.start } : {}),
      ...(patch.end ? { endTime: patch.end } : {}),
      ...(patch.allDay !== undefined ? { allDay: patch.allDay } : {}),
    });

    return {
      id: event.id,
      title: event.summary ?? patch.title ?? "(ไม่มีชื่อ)",
      start: event.start?.dateTime ?? event.start?.date ?? "",
      end: event.end?.dateTime ?? event.end?.date ?? "",
      allDay: !event.start?.dateTime,
      location: event.location,
      htmlLink: event.htmlLink,
    };
  }

  /** Delete an event by its Google id, then remove the local mirror. */
  async deleteEvent(userId: string, googleEventId: string): Promise<void> {
    const token = await this.accessToken(userId);
    const res = await fetch(this.eventUrl(googleEventId), {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // 410 Gone = already deleted on Google; treat as success.
    if (!res.ok && res.status !== 410) {
      throw new Error(`Calendar API ${res.status}: ${await res.text()}`);
    }
    await this.events.deleteByGoogleEventId(userId, googleEventId);
  }

  private eventUrl(googleEventId: string): string {
    return `${EVENTS_URL}/${encodeURIComponent(googleEventId)}`;
  }

  private async accessToken(userId: string): Promise<string> {
    const tokens = await this.settings.get<StoredTokens>(userId, TOKENS_KEY);
    if (!tokens) throw new Error("Google Calendar not connected");
    if (Date.now() < tokens.expiry) return tokens.access_token;

    if (!tokens.refresh_token) {
      await this.settings.delete(userId, TOKENS_KEY);
      throw new Error("Google Calendar not connected");
    }
    try {
      const data = await this.postToken({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: this.google.clientId,
        client_secret: this.google.clientSecret,
      });
      const updated: StoredTokens = {
        access_token: data.access_token,
        refresh_token: tokens.refresh_token,
        expiry: Date.now() + (data.expires_in - 60) * 1000,
      };
      await this.settings.set(userId, TOKENS_KEY, { ...updated });
      return updated.access_token;
    } catch (err) {
      logger.error("calendar.refresh_failed", errorInfo(err));
      await this.settings.delete(userId, TOKENS_KEY);
      throw new Error("Google Calendar not connected");
    }
  }

  private async postToken(
    params: Record<string, string>,
  ): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`OAuth token ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  private hmac(value: string): string {
    return createHmac("sha256", this.stateSecret)
      .update(value)
      .digest("hex")
      .slice(0, 32);
  }
}

function toDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(d);
}
