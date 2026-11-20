import { fallTime } from "../focus/model";
import type { SessionKind } from "../focus/schemas";
import type { FocusInputsDto } from "../focus/types";
import { type DaySchedule, isAwake, nextPhaseChange } from "../schedule";
import { capReachAt } from "../water/model";
import type { WaterInputsDto } from "../water/types";
import type { NotifySettings } from "./settings";

// What to notify and when, from the same simulations the app runs. The server recomputes this after
// every write and on a one-minute cron, and sends what is due. Pure, so it is unit-tested.

const MIN = 60_000;
/** Recomputed times can shift a little; an occurrence this close to the one sent is the same. */
const SAME_MS = 5 * MIN;
/** A reminder due longer ago than this (push was off, or the cron missed it) is dropped. */
const STALE_MS = 30 * MIN;

export interface PlannedEvent {
  /** One occurrence per type at a time: `water.cap`, `focus.recommend`, `timer:<id>`, … */
  type: string;
  /** When its condition starts (reaching the cap, falling to a level, the countdown's end). */
  at: number;
  /** When to send: `at`, or the next wake time for a reminder that falls in the night. */
  dueAt: number;
  title: string;
  body: string;
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag: string;
  urgency: "normal" | "high";
}

/** The type → `at` of the occurrence last sent (or dropped). */
export type Sent = Record<string, number>;

export interface PlanInput {
  now: number;
  water?: WaterInputsDto;
  focus?: FocusInputsDto;
  notify: NotifySettings;
  /** Names of time habits, for their timers. */
  habitNames?: Record<string, string>;
}

/** `t`, or the next wake time when `t` falls while asleep. */
function awakeFrom(t: number, schedule: DaySchedule, tz: string): number {
  return isAwake(t, schedule, tz) ? t : nextPhaseChange(t, schedule, tz);
}

const TIMER_LABEL: Record<SessionKind, string> = {
  deep: "Deep focus",
  moderate: "Moderate focus",
  unfocus: "Unfocus",
  other: "Timer",
};

const hours = (min: number) => (min % 60 === 0 ? `${min / 60} h` : `${min} min`);

export function notificationPlan(i: PlanInput): PlannedEvent[] {
  const events: PlannedEvent[] = [];
  const { now } = i;

  if (i.water) {
    const { settings: s, schedule, tz } = i.water;
    const capAt = capReachAt(i.water, now);
    if (capAt !== null) {
      const base = { url: "/water", tag: "water", urgency: "normal" as const, title: "Water" };
      if (s.remindCap) {
        events.push({
          ...base,
          type: "water.cap",
          at: capAt,
          dueAt: awakeFrom(capAt, schedule, tz),
          body: `${s.capMl} ml due`,
        });
      }
      if (s.remindUrgent) {
        // Urgency counts awake time at the cap.
        const at = awakeFrom(capAt, schedule, tz) + s.urgencyDelayMin * MIN;
        events.push({
          ...base,
          type: "water.urgent",
          at,
          dueAt: awakeFrom(at, schedule, tz),
          body: `${s.capMl} ml due for ${hours(s.urgencyDelayMin)}`,
        });
      }
    }
  }

  if (i.focus) {
    const { settings: s, schedule, tz } = i.focus;
    for (const state of ["suggest", "recommend", "urgent"] as const) {
      if (!s.remind[state]) continue;
      const level = s.thresholds[state];
      const at = fallTime(i.focus, now, level);
      if (at === null) continue;
      events.push({
        type: `focus.${state}`,
        at,
        dueAt: awakeFrom(at, schedule, tz),
        title: `Energy ${level}`,
        body: "Time for an unfocus break",
        url: "/focus",
        tag: "focus",
        urgency: "normal",
      });
    }

    if (i.notify.timers) {
      for (const e of i.focus.entries) {
        if (e.minutes !== null || e.endedAt !== null || e.targetMin === null) continue;
        const name = e.habitId ? i.habitNames?.[e.habitId] : undefined;
        const at = e.startedAt + e.targetMin * MIN;
        events.push({
          type: `timer:${e.id}`,
          at,
          dueAt: at,
          title: name ?? TIMER_LABEL[e.kind],
          body: `${hours(e.targetMin)} done`,
          url: e.habitId ? "/habits" : "/focus",
          tag: "timer",
          urgency: "high",
        });
      }
    }
  }
  return events;
}

const handled = (e: PlannedEvent, sent: Sent) => {
  const last = sent[e.type];
  return last !== undefined && last >= e.at - SAME_MS;
};

/** Events to send now, and stale ones to drop without sending (both are then marked as sent). */
export function dueNow(events: readonly PlannedEvent[], sent: Sent, now: number) {
  const due = events.filter((e) => !handled(e, sent) && e.dueAt <= now);
  return {
    send: due.filter((e) => now - e.dueAt <= STALE_MS),
    drop: due.filter((e) => now - e.dueAt > STALE_MS),
  };
}

/** When the next unsent event is due (null: nothing planned). */
export function nextDue(events: readonly PlannedEvent[], sent: Sent): number | null {
  const times = events.filter((e) => !handled(e, sent)).map((e) => e.dueAt);
  return times.length > 0 ? Math.min(...times) : null;
}

/** Records events as sent and forgets occurrences older than three days. */
export function markSent(sent: Sent, events: readonly PlannedEvent[], now: number): Sent {
  const next: Sent = {};
  for (const [k, v] of Object.entries(sent)) if (now - v < 3 * 24 * 60 * MIN) next[k] = v;
  for (const e of events) next[e.type] = Math.max(next[e.type] ?? 0, e.at);
  return next;
}
