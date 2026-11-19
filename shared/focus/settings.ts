import { z } from "zod";

export const sleepQualities = ["good", "ok", "bad"] as const;
export type SleepQuality = (typeof sleepQualities)[number];
export const SLEEP_LABEL: Record<SleepQuality, string> = { good: "Good", ok: "OK", bad: "Bad" };

const points = z.number().min(0).max(100);
const perHour = z.number().min(0).max(100);
const sleepRow = z.object({ start: points, ceiling: points });

const tag = z.string().trim().min(1).max(30);

const base = z.object({
  /** Sleep sets the day's start energy and its ceiling (energy never goes above it). */
  sleep: z.object({ good: sleepRow, ok: sleepRow, bad: sleepRow }).default({
    good: { start: 100, ceiling: 100 },
    ok: { start: 85, ceiling: 90 },
    bad: { start: 70, ceiling: 80 },
  }),
  /** Assumed until the user sets the day's sleep quality. */
  defaultSleep: z.enum(sleepQualities).default("ok"),
  /** Drain per hour while awake: a total for each tier, not added on top of each other. */
  drain: z
    .object({ baseline: perHour, moderate: perHour, deep: perHour })
    .default({ baseline: 3, moderate: 6, deep: 12 }),
  /** Unfocus restores restorePerMin × (restoreFloor + (1 − restoreFloor) × energy/100) per minute. */
  restorePerMin: z.number().min(0).max(10).default(1),
  restoreFloor: z.number().min(0).max(1).default(0.2),
  /** At or below: suggest (subtle), recommend (tile highlighted), urgent (strong highlight). */
  thresholds: z
    .object({ suggest: points, recommend: points, urgent: points })
    .default({ suggest: 60, recommend: 40, urgent: 20 }),
  /** Tags offered for moderate focus sessions. */
  tags: z.array(tag).max(20).default(["podcast", "film", "reading"]),
});

export const focusSettingsSchema = base.superRefine((s, ctx) => {
  const t = s.thresholds;
  if (!(t.urgent <= t.recommend && t.recommend <= t.suggest))
    ctx.addIssue({ code: "custom", message: "thresholds must be urgent ≤ recommend ≤ suggest" });
  for (const q of sleepQualities) {
    if (s.sleep[q].start > s.sleep[q].ceiling)
      ctx.addIssue({ code: "custom", message: `sleep ${q}: start is above the ceiling` });
  }
});

export type FocusSettings = z.infer<typeof focusSettingsSchema>;

/** Only the given values change; nested groups merge field by field. */
export const focusSettingsPatchSchema = z.object({
  sleep: z
    .object({
      good: sleepRow.partial().optional(),
      ok: sleepRow.partial().optional(),
      bad: sleepRow.partial().optional(),
    })
    .optional(),
  defaultSleep: z.enum(sleepQualities).optional(),
  drain: z.object({ baseline: perHour, moderate: perHour, deep: perHour }).partial().optional(),
  restorePerMin: z.number().min(0).max(10).optional(),
  restoreFloor: z.number().min(0).max(1).optional(),
  thresholds: z.object({ suggest: points, recommend: points, urgent: points }).partial().optional(),
  tags: z.array(tag).max(20).optional(),
});

export type FocusSettingsPatch = z.infer<typeof focusSettingsPatchSchema>;

export const focusSettingsKey = "focus";

export function parseFocusSettings(raw: unknown): FocusSettings {
  const r = focusSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : focusSettingsSchema.parse({});
}

const defined = <T extends object>(o: T | undefined) =>
  Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined));

/** Applies a patch; the result can be invalid (check it with `focusSettingsSchema`). */
export function applyFocusSettingsPatch(c: FocusSettings, p: FocusSettingsPatch): FocusSettings {
  return {
    sleep: {
      good: { ...c.sleep.good, ...defined(p.sleep?.good) },
      ok: { ...c.sleep.ok, ...defined(p.sleep?.ok) },
      bad: { ...c.sleep.bad, ...defined(p.sleep?.bad) },
    },
    defaultSleep: p.defaultSleep ?? c.defaultSleep,
    drain: { ...c.drain, ...defined(p.drain) },
    restorePerMin: p.restorePerMin ?? c.restorePerMin,
    restoreFloor: p.restoreFloor ?? c.restoreFloor,
    thresholds: { ...c.thresholds, ...defined(p.thresholds) },
    tags: p.tags ?? c.tags,
  };
}
