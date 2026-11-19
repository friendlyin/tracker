import type { Phase } from "../schedule";

// Level engine: a level that drifts over time on its own (a rate per hour that depends on the phase
// of the day) and is moved by entries. Water debt is the first configuration, focus energy the
// second. Pure and deterministic: the Worker, the PWA and the MCP tools run the same simulation.

export type LevelState = "ok" | "suggest" | "recommend" | "urgent";

export interface LevelPoint {
  /** Unix ms. */
  t: number;
  level: number;
}

export interface LevelModel<E> {
  min: number;
  max: number;
  /** Change per hour in a phase (positive rises, negative falls). */
  rate(phase: Phase): number;
  /** Instant effect of an entry; the result is clamped to [min, max]. */
  apply(level: number, entry: E): number;
}

/** When the phase changes. `nextChange(t)` must be strictly after `t`. */
export interface LevelClock {
  phaseAt(t: number): Phase;
  nextChange(t: number): number;
}

export interface SimulateInput<E extends { at: number }> {
  start: { at: number; level: number };
  /** Entries before `start.at` or after `to` are ignored. */
  entries: readonly E[];
  to: number;
  clock: LevelClock;
}

export interface Simulation {
  /** Piecewise-linear timeline: straight lines between points, vertical steps at entries. */
  points: LevelPoint[];
  level: number;
}

const HOUR = 3_600_000;

export function simulate<E extends { at: number }>(
  model: LevelModel<E>,
  input: SimulateInput<E>,
): Simulation {
  const clamp = (v: number) => Math.min(model.max, Math.max(model.min, v));
  const events = input.entries
    .filter((e) => e.at >= input.start.at && e.at <= input.to)
    .sort((a, b) => a.at - b.at);
  let t = input.start.at;
  let level = clamp(input.start.level);
  const points: LevelPoint[] = [{ t, level }];
  let i = 0;

  const applyDue = () => {
    while (i < events.length && (events[i] as E).at <= t) {
      level = clamp(model.apply(level, events[i] as E));
      points.push({ t, level });
      i++;
    }
  };

  applyDue();
  while (t < input.to) {
    const end = Math.min(input.to, input.clock.nextChange(t), events[i]?.at ?? Infinity);
    const rate = model.rate(input.clock.phaseAt(t));
    const bound = rate > 0 ? model.max : rate < 0 ? model.min : level;
    if (bound !== level) {
      const hit = t + ((bound - level) / rate) * HOUR;
      if (hit < end) points.push({ t: hit, level: bound });
    }
    level = clamp(level + (rate * (end - t)) / HOUR);
    t = end;
    points.push({ t, level });
    applyDue();
  }
  return { points, level };
}

export interface LevelCondition {
  atLeast?: number;
  atMost?: number;
}

const holds = (v: number, c: LevelCondition) =>
  (c.atLeast === undefined || v >= c.atLeast) && (c.atMost === undefined || v <= c.atMost);

/** Share of a straight segment from `a` to `b` for which the condition holds. */
function shareHolding(a: number, b: number, c: LevelCondition): number {
  if (a === b) return holds(a, c) ? 1 : 0;
  let lo = 0;
  let hi = 1;
  const at = (x: number) => (x - a) / (b - a);
  for (const [limit, keepAbove] of [
    [c.atLeast, true],
    [c.atMost, false],
  ] as const) {
    if (limit === undefined) continue;
    const x = at(limit);
    // Where the segment is on the right side of the limit: above it when rising, below when falling.
    if (b > a === keepAbove) lo = Math.max(lo, x);
    else hi = Math.min(hi, x);
  }
  return Math.max(0, hi - lo);
}

/** Time in ms within [from, to] during which the condition holds. */
export function durationWhere(
  points: readonly LevelPoint[],
  from: number,
  to: number,
  c: LevelCondition,
): number {
  let total = 0;
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1] as LevelPoint;
    const q = points[k] as LevelPoint;
    if (q.t <= p.t) continue;
    const s = Math.max(p.t, from);
    const e = Math.min(q.t, to);
    if (e <= s) continue;
    const span = q.t - p.t;
    const ls = p.level + ((q.level - p.level) * (s - p.t)) / span;
    const le = p.level + ((q.level - p.level) * (e - p.t)) / span;
    total += shareHolding(ls, le, c) * (e - s);
  }
  return total;
}

/**
 * Start of the latest unbroken stretch, up to the end of the timeline, during which the condition
 * holds; null when it does not hold at the end.
 */
export function heldSince(points: readonly LevelPoint[], c: LevelCondition): number | null {
  const last = points[points.length - 1];
  if (!last || !holds(last.level, c)) return null;
  let since = last.t;
  for (let k = points.length - 1; k > 0; k--) {
    const p = points[k - 1] as LevelPoint;
    const q = points[k] as LevelPoint;
    if (holds(p.level, c)) {
      since = p.t;
      continue;
    }
    // The condition starts somewhere on this segment (or exactly at q for a vertical step).
    if (q.t === p.t) return q.t;
    const share = shareHolding(p.level, q.level, c);
    return q.t - share * (q.t - p.t);
  }
  return since;
}

export interface StateRule extends LevelCondition {
  state: Exclude<LevelState, "ok">;
  /** The condition must have held this long. */
  forMin?: number;
}

/**
 * The first matching rule (list the most severe first), else "ok". `notBefore` limits how far back
 * held time counts (water counts urgency from the last wake time).
 */
export function classify(
  points: readonly LevelPoint[],
  rules: readonly StateRule[],
  notBefore = Number.NEGATIVE_INFINITY,
): LevelState {
  const last = points[points.length - 1];
  if (!last) return "ok";
  for (const r of rules) {
    if (!holds(last.level, r)) continue;
    if (!r.forMin) return r.state;
    const since = heldSince(points, r);
    if (since !== null && last.t - Math.max(since, notBefore) >= r.forMin * 60_000) return r.state;
  }
  return "ok";
}

/** First time at or after `from` the timeline reaches `level` going up; null if it never does. */
export function firstReach(
  points: readonly LevelPoint[],
  level: number,
  from = Number.NEGATIVE_INFINITY,
): number | null {
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1] as LevelPoint;
    const q = points[k] as LevelPoint;
    if (q.t < from) continue;
    if (p.level >= level && p.t >= from) return p.t;
    if (p.level < level && q.level >= level) {
      if (q.t === p.t) return q.t;
      const t = p.t + ((level - p.level) / (q.level - p.level)) * (q.t - p.t);
      if (t >= from) return t;
    }
  }
  const last = points[points.length - 1];
  return last && last.level >= level && last.t >= from ? last.t : null;
}

/** The level at `t` (linear between points; after a step at `t`, the level after it). */
export function levelAt(points: readonly LevelPoint[], t: number): number {
  let v = points[0]?.level ?? 0;
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1] as LevelPoint;
    const q = points[k] as LevelPoint;
    if (q.t <= t) {
      v = q.level;
      continue;
    }
    if (p.t <= t) v = p.level + ((q.level - p.level) * (t - p.t)) / (q.t - p.t);
    break;
  }
  return v;
}

/** The timeline from `from` on, starting with an interpolated point at `from`. */
export function pointsFrom(points: readonly LevelPoint[], from: number): LevelPoint[] {
  const first = points[0];
  if (!first || first.t >= from) return [...points];
  return [{ t: from, level: levelAt(points, from) }, ...points.filter((p) => p.t > from)];
}
