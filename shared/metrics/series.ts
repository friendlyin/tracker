import type { LocalDate } from "../time";
import { bucketDays, daysBetween, type Period } from "./periods";
import { type MetricDef, metricDef } from "./registry";
import type { MetricBucketRow } from "./types";

// Turns aggregated `metric_daily` rows into one value per bucket of a period, the shape every chart
// takes. Sums are shown as the bucket's total or as a daily average; days without a row count as 0
// for metrics whose `empty` is "zero" and are left out for "unknown".

export type Mode = "total" | "daily";
export type Values = (number | null)[];

interface Combined {
  sum: number;
  min: number;
  max: number;
  days: number;
}

/** Rows of one metric per bucket; all dimensions combined unless one is given. */
function combine(rows: MetricBucketRow[], metric: string, dimension?: string) {
  const out = new Map<LocalDate, Combined>();
  for (const r of rows) {
    if (r.metric !== metric || (dimension !== undefined && r.dimension !== dimension)) continue;
    const c = out.get(r.bucket);
    if (!c) out.set(r.bucket, { sum: r.sum, min: r.min, max: r.max, days: r.days });
    else {
      c.sum += r.sum;
      c.min = Math.min(c.min, r.min);
      c.max = Math.max(c.max, r.max);
      // Days with any row; exact for metrics without a dimension.
      c.days = Math.max(c.days, r.days);
    }
  }
  return out;
}

/** Days of the range up to today. */
const elapsed = (from: LocalDate, to: LocalDate, today: LocalDate) =>
  daysBetween(from, to < today ? to : today);

function value(def: MetricDef, c: Combined | undefined, days: number, mode: Mode) {
  switch (def.aggregation) {
    case "sum": {
      if (!c) return def.empty === "zero" ? 0 : null;
      if (mode === "total") return c.sum;
      const n = def.empty === "zero" ? days : c.days;
      return n > 0 ? c.sum / n : null;
    }
    case "avg":
      return c && c.days > 0 ? c.sum / c.days : null;
    case "max":
      return c ? c.max : null;
    case "min":
      return c ? c.min : null;
  }
}

export interface SeriesOpts {
  today: LocalDate;
  mode?: Mode;
  dimension?: string;
}

/** One value per bucket of the period; null for buckets in the future or without data. */
export function bucketValues(
  rows: MetricBucketRow[],
  def: MetricDef,
  p: Period,
  { today, mode = "total", dimension }: SeriesOpts,
): Values {
  const byBucket = combine(rows, def.id, dimension);
  return p.buckets.map((b) => {
    if (b > today) return null;
    const { from, to } = bucketDays(p, b);
    return value(def, byBucket.get(b), elapsed(from, to, today), mode);
  });
}

/** One value for the whole period: total or daily average for sums, else the aggregation. */
export function periodValue(
  rows: MetricBucketRow[],
  def: MetricDef,
  p: Period,
  { today, mode = "total", dimension }: SeriesOpts,
): number | null {
  if (p.from > today) return null;
  let all: Combined | undefined;
  for (const c of combine(rows, def.id, dimension).values()) {
    if (!all) all = { ...c };
    else {
      all.sum += c.sum;
      all.min = Math.min(all.min, c.min);
      all.max = Math.max(all.max, c.max);
      all.days += c.days;
    }
  }
  return value(def, all, elapsed(p.from, p.to, today), mode);
}

/**
 * The target that applied per bucket (daily, averaged over the bucket), from the metric's linked
 * target metric. Buckets without one take the previous known target, or the first one after.
 */
export function targetValues(
  rows: MetricBucketRow[],
  def: MetricDef,
  p: Period,
  today: LocalDate,
): Values {
  const tdef = def.target ? metricDef(def.target) : undefined;
  if (!tdef) return p.buckets.map(() => null);
  const vals = bucketValues(rows, tdef, p, { today });
  let last = vals.find((v) => v !== null) ?? null;
  return vals.map((v) => {
    if (v !== null) last = v;
    return last;
  });
}

/** Whether a value meets its target: at least it for "higher", at most it otherwise (a budget). */
export const meetsTarget = (def: MetricDef, v: number, target: number) =>
  def.better === "higher" ? v >= target : v <= target;

/** Buckets with a value that met their target, out of buckets with both. */
export function onTarget(def: MetricDef, values: Values, targets: Values) {
  let hit = 0;
  let of = 0;
  values.forEach((v, i) => {
    const t = targets[i];
    if (v === null || t === null || t === undefined) return;
    of++;
    if (meetsTarget(def, v, t)) hit++;
  });
  return { hit, of };
}
