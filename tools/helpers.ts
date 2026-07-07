/** Shared helpers for tool argument handling. */

export function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Parse an ISO-8601 datetime tool argument; null when missing/invalid. */
export function isoDate(
  args: Record<string, unknown>,
  key: string,
): Date | null {
  const raw = str(args, key);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const ISO_HINT =
  "ISO 8601 with +07:00 offset (e.g. 2026-07-08T10:00:00+07:00). Convert relative Thai/English phrases like 'พรุ่งนี้ 10 โมง' or 'tomorrow 10am' using the current date/time given in the system context.";
