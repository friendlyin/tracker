import type { LocalDate } from "../time";
import { daysBetween } from "./periods";
import type { ExerciseProgressDto, GroupProgressDto, TrendDto } from "./types";

// Strength progress. Each session's best estimated 1RM (or best reps, for exercises done without
// weight in most sessions) is fitted with a least-squares line; the change is the fitted value at the last session
// against the fitted value at the first. A single heavy or light day barely moves it.

export const MIN_SESSIONS = 3;

export interface Point {
  date: LocalDate;
  value: number;
}

export function trend(points: Point[]): TrendDto | null {
  if (points.length < MIN_SESSIONS) return null;
  const first = points[0] as Point;
  const xs = points.map((p) => daysBetween(first.date, p.date) - 1);
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = points.reduce((a, p) => a + p.value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  points.forEach((p, i) => {
    const dx = (xs[i] as number) - mx;
    sxx += dx * dx;
    sxy += dx * (p.value - my);
  });
  if (sxx === 0) return null; // all on one day
  const slope = sxy / sxx;
  const start = my + slope * ((xs[0] as number) - mx);
  const end = my + slope * ((xs[n - 1] as number) - mx);
  if (start <= 0) return null;
  return { start, end, changePct: ((end - start) / start) * 100 };
}

export interface ExerciseInput {
  id: string;
  name: string;
  muscles: { group: string; contribution: number }[];
}

export interface DayRow {
  exerciseId: string;
  date: LocalDate;
  e1rm?: number;
  topSet?: number;
  reps?: number;
}

/**
 * Progress per exercise trained in the rows, and per muscle group as the mean change of its primary
 * exercises (contribution 1) that have a trend.
 */
export function progression(exercises: ExerciseInput[], rows: DayRow[]) {
  const byExercise = new Map<string, DayRow[]>();
  for (const r of rows) {
    const list = byExercise.get(r.exerciseId) ?? [];
    list.push(r);
    byExercise.set(r.exerciseId, list);
  }

  const out: ExerciseProgressDto[] = [];
  for (const ex of exercises) {
    const days = byExercise.get(ex.id);
    if (!days?.length) continue;
    days.sort((a, b) => (a.date < b.date ? -1 : 1));
    // Most sessions decide: one weighted pull-up day does not switch pull-ups to e1RM.
    const weightedDays = days.filter((d) => d.e1rm !== undefined).length;
    const weighted = weightedDays > 0 && weightedDays * 2 >= days.length;
    const points = days.flatMap((d) => {
      const v = weighted ? d.e1rm : d.reps;
      return v === undefined ? [] : [{ date: d.date, value: v }];
    });
    const topSets = days.flatMap((d) =>
      d.topSet === undefined ? [] : [{ date: d.date, value: d.topSet }],
    );
    out.push({
      exerciseId: ex.id,
      name: ex.name,
      measure: weighted ? "e1rm" : "reps",
      points,
      topSets,
      trend: trend(points),
    });
  }

  const byId = new Map(out.map((e) => [e.exerciseId, e]));
  const groups = new Map<string, number[]>();
  for (const ex of exercises) {
    const change = byId.get(ex.id)?.trend?.changePct;
    for (const m of ex.muscles) {
      if (m.contribution !== 1) continue;
      const list = groups.get(m.group) ?? [];
      if (change !== undefined) list.push(change);
      groups.set(m.group, list);
    }
  }
  const groupList: GroupProgressDto[] = [...groups].map(([group, changes]) => ({
    group,
    changePct: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
    exercises: changes.length,
  }));

  return { exercises: out, groups: groupList };
}
