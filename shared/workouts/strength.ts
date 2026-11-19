/** Estimated one-rep max (Epley). Lets progress be compared across different rep counts. */
export function e1rm(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export interface SetLike {
  reps: number;
  weightKg: number | null;
}

/** The heaviest set (ties broken by reps), or null when no set has weight. */
export function topSet<T extends SetLike>(sets: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of sets) {
    if (!s.weightKg) continue;
    if (
      !best ||
      s.weightKg > (best.weightKg ?? 0) ||
      (s.weightKg === best.weightKg && s.reps > best.reps)
    ) {
      best = s;
    }
  }
  return best;
}

export function bestE1rm(sets: readonly SetLike[]): number {
  let best = 0;
  for (const s of sets) best = Math.max(best, e1rm(s.weightKg ?? 0, s.reps));
  return best;
}
