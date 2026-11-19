type Kind = "warmup" | "working";
interface S {
  kind: Kind;
  reps: number;
  weightKg: number | null;
}

/**
 * Default kind for the next set: warm-up while today has fewer warm-ups than last time (and no
 * working set yet), otherwise working.
 */
export function nextKind(previous: readonly S[], today: readonly S[]): Kind {
  const prevWarmups = previous.filter((s) => s.kind === "warmup").length;
  const todayWarmups = today.filter((s) => s.kind === "warmup").length;
  const todayWorking = today.some((s) => s.kind === "working");
  return !todayWorking && todayWarmups < prevWarmups ? "warmup" : "working";
}

/**
 * Prefill for the next set of `kind`. Follows last time's set at the same position, so repeating
 * last session is one tap per set. If today's previous set differs from last time (more weight, fewer
 * reps), it carries today's values instead. Falls back to the recommended reps with no weight.
 */
export function prefillSet(
  kind: Kind,
  previous: readonly S[],
  today: readonly S[],
  recommendedReps: number,
): { reps: number; weightKg: number | null } {
  const prev = previous.filter((s) => s.kind === kind);
  const done = today.filter((s) => s.kind === kind);
  const i = done.length;
  const lastToday = done.at(-1);
  const prevAtLast = prev[i - 1];
  const prevNext = prev[i];

  const deviated =
    lastToday &&
    (!prevAtLast ||
      prevAtLast.reps !== lastToday.reps ||
      prevAtLast.weightKg !== lastToday.weightKg);

  const pick = (deviated ? lastToday : prevNext) ?? lastToday ?? prev.at(-1);
  if (pick) return { reps: pick.reps, weightKg: pick.weightKg };

  if (kind === "working") {
    const warm = today.filter((s) => s.kind === "warmup").at(-1);
    return { reps: recommendedReps, weightKg: warm?.weightKg ?? null };
  }
  return { reps: recommendedReps, weightKg: null };
}
