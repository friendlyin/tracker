import { z } from "zod";

/** Notification settings that belong to no feature. Water and focus reminders are in theirs. */
export const notifySettingsSchema = z.object({
  /** A push when a countdown timer reaches zero. */
  timers: z.boolean().default(true),
});
export type NotifySettings = z.infer<typeof notifySettingsSchema>;

export const notifySettingsPatchSchema = z.object({ timers: z.boolean() }).partial();
export type NotifySettingsPatch = z.infer<typeof notifySettingsPatchSchema>;

export const notifySettingsKey = "notify";

export function parseNotifySettings(raw: unknown): NotifySettings {
  const r = notifySettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : notifySettingsSchema.parse({});
}

/** Push subscription from the browser (`PushSubscription.toJSON()`). */
export const pushSubscriptionInput = z.object({
  endpoint: z.url().max(2000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInput>;
