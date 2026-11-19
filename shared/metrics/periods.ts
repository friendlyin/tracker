import { addDays, type LocalDate, weekRange } from "../time";

// Stats periods are calendar periods that can be paged back and forward: a week (Mon–Sun), a month,
// the 3 or 6 calendar months up to the shown one, or 12 months. Each is split into buckets (days,
// weeks or months), identified by their first day.

export const PERIOD_KINDS = ["week", "month", "3m", "6m", "year"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
export type Bucket = "day" | "week" | "month";

export interface Period {
  kind: PeriodKind;
  from: LocalDate;
  to: LocalDate;
  bucket: Bucket;
  /** First day of each bucket, in order. Week buckets start on Monday, so the first may start before `from`. */
  buckets: LocalDate[];
}

const MONTHS: Record<PeriodKind, number> = { week: 0, month: 1, "3m": 3, "6m": 6, year: 12 };
const BUCKET: Record<PeriodKind, Bucket> = {
  week: "day",
  month: "day",
  "3m": "week",
  "6m": "week",
  year: "month",
};

export const isPeriodKind = (v: unknown): v is PeriodKind =>
  (PERIOD_KINDS as readonly unknown[]).includes(v);

const monthStart = (d: LocalDate): LocalDate => `${d.slice(0, 7)}-01`;

/** The first day of the month `n` months after the month of `d`. */
export function addMonths(d: LocalDate, n: number): LocalDate {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7)) - 1 + n;
  const year = y + Math.floor(m / 12);
  const month = (((m % 12) + 12) % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** The first day of the bucket that contains `d`. */
export function bucketOf(d: LocalDate, bucket: Bucket): LocalDate {
  if (bucket === "day") return d;
  if (bucket === "week") return weekRange(d).start;
  return monthStart(d);
}

export function nextBucket(d: LocalDate, bucket: Bucket): LocalDate {
  if (bucket === "day") return addDays(d, 1);
  if (bucket === "week") return addDays(d, 7);
  return addMonths(d, 1);
}

/** The period of the given kind that contains `anchor`. */
export function period(kind: PeriodKind, anchor: LocalDate): Period {
  let from: LocalDate;
  let to: LocalDate;
  if (kind === "week") {
    ({ start: from, end: to } = weekRange(anchor));
  } else {
    from = addMonths(anchor, 1 - MONTHS[kind]);
    to = addDays(addMonths(anchor, 1), -1);
  }
  const bucket = BUCKET[kind];
  const buckets: LocalDate[] = [];
  for (let b = bucketOf(from, bucket); b <= to; b = nextBucket(b, bucket)) buckets.push(b);
  return { kind, from, to, bucket, buckets };
}

/** An anchor inside the previous (-1) or next (+1) period. */
export function shiftPeriod(kind: PeriodKind, anchor: LocalDate, dir: -1 | 1): LocalDate {
  if (kind === "week") return addDays(anchor, 7 * dir);
  return addMonths(anchor, MONTHS[kind] * dir);
}

/** The days of the bucket starting at `start` that fall inside the period. */
export function bucketDays(p: Period, start: LocalDate): { from: LocalDate; to: LocalDate } {
  const end = addDays(nextBucket(start, p.bucket), -1);
  const [from] = [start, p.from].sort().slice(-1) as [LocalDate];
  const [to] = [end, p.to].sort() as [LocalDate];
  return { from, to };
}

/** Number of days from `from` to `to`, both included (0 when `to` is before `from`). */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}
