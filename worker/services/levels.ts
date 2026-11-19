import { and, eq, inArray, sql } from "drizzle-orm";
import type { DaySchedule } from "../../shared/schedule";
import { addDays, localDate } from "../../shared/time";
import type { TrackerKey } from "../../shared/tracking/trackers";
import type { Db } from "../db";
import { entry, type User } from "../db/schema";
import { getSetting, putSetting } from "./users";

// Shared by the level-engine features (water, focus): who they act for, and the rollups that can only
// be written once a day is over (time at the cap, lowest energy), because they keep changing while
// the day is open.

/** The user, their latest timezone and their day schedule. */
export interface DayUser {
  id: string;
  tz: string;
  schedule: DaySchedule;
}

export const dayUser = (u: User, tz: string): DayUser => ({
  id: u.id,
  tz,
  schedule: { wakeTime: u.wakeTime, sleepTime: u.sleepTime },
});

export interface ClosedDayRollup {
  /** `user_setting` key holding the last finalised local date. */
  key: string;
  /** Finalising never starts before the first entry of these trackers. */
  trackers: readonly TrackerKey[];
  /** Writes the rollups of the closed days [from, to]. */
  write(from: string, to: string): Promise<void>;
}

/** Closed days are finalised at most this far back (the app was not opened for a while). */
const MAX_FINALIZE_DAYS = 14;

/**
 * On the first read or write of a new day: finalises the days since the last run (at most 14, never
 * before the first entry).
 */
export async function finalizeClosedDays(db: Db, u: DayUser, r: ClosedDayRollup, now: number) {
  const yesterday = addDays(localDate(now, u.tz), -1);
  const done = (await getSetting(db, u.id, r.key)) as string | undefined;
  if (done && done >= yesterday) return;
  const [first] = await db
    .select({ d: sql<string | null>`min(${entry.localDate})` })
    .from(entry)
    .where(and(eq(entry.userId, u.id), inArray(entry.tracker, [...r.trackers])));
  if (!first?.d) return;
  const from = [
    done ? addDays(done, 1) : first.d,
    first.d,
    addDays(yesterday, 1 - MAX_FINALIZE_DAYS),
  ]
    .sort()
    .at(-1) as string;
  if (from <= yesterday) await r.write(from, yesterday);
  await putSetting(db, u.id, r.key, yesterday);
}

/** After a write that affects [from, to]: rewrites the part that is already finalised. */
export async function refinalize(db: Db, u: DayUser, r: ClosedDayRollup, from: string, to: string) {
  const done = (await getSetting(db, u.id, r.key)) as string | undefined;
  if (!done || from > done) return;
  await r.write(from, to <= done ? to : done);
}
