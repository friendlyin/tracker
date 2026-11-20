import { z } from "zod";

const ml = (max: number) => z.number().int().min(0).max(max);
const factor = z.number().min(0).max(1);

const fields = {
  /** Daily intake target. Pending water rises at a rate that adds up to it over 24 h. */
  targetMl: ml(10000).min(500),
  /** Pending water stops rising here. */
  capMl: ml(3000).min(50),
  /** Night rate = day rate × night factor. */
  nightFactor: factor,
  /** Pending at the cap for this long (awake time) makes the state urgent. */
  urgencyDelayMin: z.number().int().min(0).max(600),
  /** Water beyond what is pending becomes credit at this factor… */
  creditFactor: factor,
  /** …up to this much credit. */
  creditCapMl: ml(1000),
  /** The two one-tap amounts; the first is also the button on the home tile. */
  quickMl: z.tuple([ml(3000).min(10), ml(3000).min(10)]),
  /** Push reminders: when pending water reaches the cap, and when it gets urgent. */
  remindCap: z.boolean(),
  remindUrgent: z.boolean(),
};

export const waterSettingsSchema = z.object({
  targetMl: fields.targetMl.default(3000),
  capMl: fields.capMl.default(500),
  nightFactor: fields.nightFactor.default(0.25),
  urgencyDelayMin: fields.urgencyDelayMin.default(60),
  creditFactor: fields.creditFactor.default(0.3),
  creditCapMl: fields.creditCapMl.default(200),
  quickMl: fields.quickMl.default([250, 500]),
  remindCap: fields.remindCap.default(true),
  remindUrgent: fields.remindUrgent.default(true),
});

export type WaterSettings = z.infer<typeof waterSettingsSchema>;

export const waterSettingsPatchSchema = z.object(fields).partial();

export type WaterSettingsPatch = z.infer<typeof waterSettingsPatchSchema>;

export const waterSettingsKey = "water";

/** Parse stored JSON, filling defaults for anything missing or invalid. */
export function parseWaterSettings(raw: unknown): WaterSettings {
  const r = waterSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : waterSettingsSchema.parse({});
}

export function applyWaterSettingsPatch(
  current: WaterSettings,
  patch: WaterSettingsPatch,
): WaterSettings {
  const next = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) Object.assign(next, { [k]: v });
  }
  return next;
}
