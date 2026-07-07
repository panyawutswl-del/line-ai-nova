const TZ = "Asia/Bangkok";

/** Calendar-day boundaries in Bangkok time, offset by N days from today. */
export function bangkokDayRange(offsetDays = 0): { start: Date; end: Date } {
  // en-CA locale formats as YYYY-MM-DD
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(
    new Date(),
  );
  const start = new Date(`${ymd}T00:00:00+07:00`);
  start.setUTCDate(start.getUTCDate() + offsetDays);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function formatThaiDate(d: Date): string {
  return d.toLocaleDateString("th-TH", { timeZone: TZ, dateStyle: "full" });
}

export function formatThaiDateTime(d: Date): string {
  return d.toLocaleString("th-TH", {
    timeZone: TZ,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatThaiTime(d: Date): string {
  return d.toLocaleTimeString("th-TH", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}
