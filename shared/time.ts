/** Local dates are `YYYY-MM-DD` strings in the user's timezone. Weeks start on Monday. */

export type LocalDate = string;

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The calendar date of `instant` in the IANA timezone `tz`. */
export function localDate(instant: Date | number, tz: string): LocalDate {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatters.set(tz, f);
  }
  return f.format(typeof instant === "number" ? new Date(instant) : instant);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function toUtc(d: LocalDate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function addDays(d: LocalDate, n: number): LocalDate {
  const t = toUtc(d);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(d: LocalDate): number {
  const day = toUtc(d).getUTCDay();
  return day === 0 ? 7 : day;
}

export function weekRange(d: LocalDate): { start: LocalDate; end: LocalDate } {
  const start = addDays(d, 1 - isoWeekday(d));
  return { start, end: addDays(start, 6) };
}

/** Days left in the week, including `d` itself (Monday → 7, Sunday → 1). */
export function daysLeftInWeek(d: LocalDate): number {
  return 8 - isoWeekday(d);
}
