import { daysLeftInWeek, type LocalDate } from "../time";
import { type GroupCategory, MUSCLE_GROUPS, type MuscleGroup } from "./groups";
import type { WorkoutSettings } from "./settings";

export type Volume = Record<MuscleGroup, number>;

export interface MuscleContribution {
  group: MuscleGroup;
  contribution: number;
}

export function emptyVolume(): Volume {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0])) as Volume;
}

/** Σ(working sets × contribution) per group. Warm-ups never count. */
export function weeklyVolume(
  sets: readonly { kind: "warmup" | "working"; muscles: readonly MuscleContribution[] }[],
): Volume {
  const v = emptyVolume();
  for (const s of sets) {
    if (s.kind !== "working") continue;
    for (const m of s.muscles) v[m.group] += m.contribution;
  }
  return v;
}

/** Sets are displayed in 0.5 steps, rounded down so a target never looks met before it is. */
export function displaySets(n: number): number {
  return Math.floor(n * 2 + 1e-9) / 2;
}

export type GroupStatus = "done" | "ok" | "at_risk";

export interface GroupPlan {
  group: MuscleGroup;
  category: GroupCategory;
  target: number;
  /** Working sets this week, including today. */
  done: number;
  /** Working sets in today's workouts. */
  doneToday: number;
  remaining: number;
  /** Sets planned for today, computed from the state before today's workouts. */
  todayTarget: number;
  /** todayTarget − doneToday rounded up to whole sets, never negative. */
  leftToday: number;
  status: GroupStatus;
}

export interface WeekPlan {
  groups: GroupPlan[];
  /** Planned workouts left this week, today included. */
  remainingWorkouts: number;
  totals: { done: number; target: number; remaining: number };
}

export interface PlanWeekInput {
  settings: WorkoutSettings;
  today: LocalDate;
  /** Volume for the whole week so far (Mon..today). */
  volume: Volume;
  /** Volume from workouts dated today (finished or active). */
  volumeToday: Volume;
  /** Workouts this week that started before today. */
  workoutsBeforeToday: number;
  /**
   * Today's training is over (workouts today, none active). Today's workouts then count as done and
   * the plan is for the next workout, from tomorrow.
   */
  todayFinished?: { workouts: number };
}

/**
 * Weekly budget per group. Suggested sets today = what was left before today ÷ planned workouts left
 * (today included), rounded up. A group is at risk when today's share exceeds 1.5× a normal session.
 */
export function planWeek(input: PlanWeekInput): WeekPlan {
  const { settings, today, volume, workoutsBeforeToday, todayFinished } = input;
  const perWeek = settings.workoutsPerWeek;
  const volumeToday = todayFinished ? emptyVolume() : input.volumeToday;
  const workoutsDone = workoutsBeforeToday + (todayFinished?.workouts ?? 0);
  const daysLeft = daysLeftInWeek(today) - (todayFinished ? 1 : 0);
  const remainingWorkouts = Math.max(1, Math.min(perWeek - workoutsDone, daysLeft));

  const groups: GroupPlan[] = MUSCLE_GROUPS.map((group) => {
    const category = settings.categories[group];
    const target = settings.targets[category];
    const done = volume[group];
    const doneToday = volumeToday[group];
    const remaining = Math.max(0, target - done);
    const remainingBeforeToday = Math.max(0, target - (done - doneToday));
    const todayTarget = Math.ceil(remainingBeforeToday / remainingWorkouts - 1e-9);
    // Whole sets: secondary contributions can leave a fraction (e.g. 1.5 → 2 more sets).
    const leftToday = Math.max(0, Math.ceil(todayTarget - doneToday - 1e-9));
    const normalSession = target / perWeek;
    const status: GroupStatus =
      remaining <= 0 ? "done" : todayTarget > normalSession * 1.5 ? "at_risk" : "ok";
    return { group, category, target, done, doneToday, remaining, todayTarget, leftToday, status };
  });

  const order = (g: GroupPlan) => MUSCLE_GROUPS.indexOf(g.group);
  groups.sort((a, b) => {
    if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
    if (a.leftToday > 0 !== b.leftToday > 0) return a.leftToday > 0 ? -1 : 1;
    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
    return order(a) - order(b);
  });

  const totals = groups.reduce(
    (t, g) => ({
      done: t.done + Math.min(g.done, g.target),
      target: t.target + g.target,
      remaining: t.remaining + g.remaining,
    }),
    { done: 0, target: 0, remaining: 0 },
  );

  return { groups, remainingWorkouts, totals };
}
