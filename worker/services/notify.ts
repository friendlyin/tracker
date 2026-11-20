import { and, eq, inArray, lte } from "drizzle-orm";
import { uuidv7 } from "../../shared/id";
import {
  dueNow,
  markSent,
  nextDue,
  notificationPlan,
  type PlannedEvent,
  type Sent,
} from "../../shared/notify/plan";
import {
  type NotifySettings,
  type NotifySettingsPatch,
  notifySettingsKey,
  type PushSubscriptionInput,
  parseNotifySettings,
} from "../../shared/notify/settings";
import type { Db } from "../db";
import { habit, notifyDue, pushSubscription } from "../db/schema";
import { type PushMessage, sendPush, type Vapid } from "../push/webpush";
import { getFocusInputs } from "./focus";
import { type DayUser, dayUser } from "./levels";
import { getSetting, getUser, putSetting } from "./users";
import { getWaterInputs } from "./water";

// Push notifications. After every write (API or MCP) the user's plan is recomputed and the time of the
// next notification stored in `notify_due`; a one-minute cron sends what is due. Only users with a
// subscribed device are planned.

const SENT_KEY = "notify.sent";

// ---------- settings and subscriptions ----------

export async function getNotifySettings(db: Db, userId: string): Promise<NotifySettings> {
  return parseNotifySettings(await getSetting(db, userId, notifySettingsKey));
}

export async function setNotifySettings(db: Db, userId: string, patch: NotifySettingsPatch) {
  const next = { ...(await getNotifySettings(db, userId)), ...patch };
  await putSetting(db, userId, notifySettingsKey, next);
  return next;
}

/** Saves this device's subscription (an endpoint moves to the user who subscribed it last). */
export async function subscribe(db: Db, userId: string, s: PushSubscriptionInput) {
  await db
    .insert(pushSubscription)
    .values({
      id: uuidv7(),
      userId,
      endpoint: s.endpoint,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      createdAt: Date.now(),
    })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth },
    });
}

/** Idempotent. */
export async function unsubscribe(db: Db, userId: string, endpoint: string) {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

const subscriptions = (db: Db, userId: string) =>
  db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId));

// ---------- planning ----------

async function plan(db: Db, u: DayUser, now: number): Promise<PlannedEvent[]> {
  const [water, focus, notify] = await Promise.all([
    getWaterInputs(db, u, now),
    getFocusInputs(db, u, now),
    getNotifySettings(db, u.id),
  ]);
  const habitIds = [
    ...new Set(focus.entries.flatMap((e) => (e.habitId && e.endedAt === null ? [e.habitId] : []))),
  ];
  const names =
    habitIds.length === 0
      ? []
      : await db
          .select({ id: habit.id, name: habit.name })
          .from(habit)
          .where(and(eq(habit.userId, u.id), inArray(habit.id, habitIds)));
  return notificationPlan({
    now,
    water,
    focus,
    notify,
    habitNames: Object.fromEntries(names.map((h) => [h.id, h.name])),
  });
}

const readSent = async (db: Db, userId: string) =>
  ((await getSetting(db, userId, SENT_KEY)) ?? {}) as Sent;

async function storeDue(db: Db, userId: string, dueAt: number | null) {
  if (dueAt === null) {
    await db.delete(notifyDue).where(eq(notifyDue.userId, userId));
    return;
  }
  await db
    .insert(notifyDue)
    .values({ userId, dueAt })
    .onConflictDoUpdate({ target: notifyDue.userId, set: { dueAt } });
}

/** Recomputes when the user's next notification is due (after a write). */
export async function refreshNotify(db: Db, u: DayUser, now = Date.now()) {
  const subs = await subscriptions(db, u.id);
  if (subs.length === 0) return storeDue(db, u.id, null);
  const [events, sent] = await Promise.all([plan(db, u, now), readSent(db, u.id)]);
  await storeDue(db, u.id, nextDue(events, sent));
}

// ---------- sending ----------

async function sendAll(db: Db, userId: string, msg: PushMessage, vapid: Vapid, urgent: boolean) {
  for (const s of await subscriptions(db, userId)) {
    const r = await sendPush(s, msg, vapid, {
      urgency: urgent ? "high" : "normal",
      ttl: urgent ? 600 : 3600,
    });
    if (r === "gone") await db.delete(pushSubscription).where(eq(pushSubscription.id, s.id));
  }
}

/** Sends the user's due notifications and stores the next due time. */
async function runUser(db: Db, userId: string, vapid: Vapid, now: number) {
  const user = await getUser(db, userId);
  if (!user) return storeDue(db, userId, null);
  const u = dayUser(user, user.timezone);
  const [events, sent] = await Promise.all([plan(db, u, now), readSent(db, userId)]);
  const { send, drop } = dueNow(events, sent, now);
  for (const e of send) {
    await sendAll(
      db,
      userId,
      { title: e.title, body: e.body, url: e.url, tag: e.tag },
      vapid,
      e.urgency === "high",
    );
  }
  const next = markSent(sent, [...send, ...drop], now);
  if (send.length + drop.length > 0) await putSetting(db, userId, SENT_KEY, next);
  await storeDue(db, userId, nextDue(events, next));
}

/** The cron: every user with a notification due. */
export async function runDue(db: Db, vapid: Vapid, now = Date.now()) {
  const due = await db.select().from(notifyDue).where(lte(notifyDue.dueAt, now));
  for (const { userId } of due) {
    try {
      await runUser(db, userId, vapid, now);
    } catch (e) {
      console.error("notify failed", userId, e);
    }
  }
}

export async function sendTest(db: Db, userId: string, vapid: Vapid) {
  const n = (await subscriptions(db, userId)).length;
  await sendAll(
    db,
    userId,
    { title: "Tracker", body: "Notifications work", url: "/settings", tag: "test" },
    vapid,
    true,
  );
  return { devices: n };
}

/** VAPID keys from the secrets; null when not set up (notifications are then off). */
export function vapidFrom(env: Env): Vapid | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  };
}
