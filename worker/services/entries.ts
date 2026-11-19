import { and, asc, eq, gte, lte } from "drizzle-orm";
import { uuidv7 } from "../../shared/id";
import { localDate } from "../../shared/time";
import { TRACKERS, type TrackerData, type TrackerKey } from "../../shared/tracking/trackers";
import type { Db } from "../db";
import { type EntryRow, entry } from "../db/schema";
import { InvalidError, NotFoundError } from "./errors";
import { recomputeTrackerDay } from "./metrics";

// Tracking engine service: generic entry CRUD for every tracker. Feature services (nutrition, later
// water and focus) wrap these with domain-named functions; the rollups stay consistent here.

export interface EntryInput<D> {
  id?: string;
  occurredAt: number;
  endedAt?: number | null;
  value: number | null;
  note?: string | null;
  data: D;
  source: "app" | "mcp";
}

export type EntryPatch<D> = Partial<Omit<EntryInput<D>, "id" | "source">>;

function validate<K extends TrackerKey>(key: K, data: unknown): TrackerData<K> {
  const r = TRACKERS[key].data.safeParse(data);
  if (!r.success) throw new InvalidError(r.error.issues.map((i) => i.message).join("; "));
  return r.data as TrackerData<K>;
}

async function findEntry(db: Db, userId: string, key: TrackerKey, id: string) {
  return db.query.entry.findFirst({
    where: and(eq(entry.userId, userId), eq(entry.tracker, key), eq(entry.id, id)),
  });
}

/** Idempotent by id: logging the same id again returns the existing entry. */
export async function logEntry<K extends TrackerKey>(
  db: Db,
  userId: string,
  tz: string,
  key: K,
  input: EntryInput<TrackerData<K>>,
): Promise<EntryRow> {
  if (input.id) {
    const existing = await db.query.entry.findFirst({
      where: and(eq(entry.userId, userId), eq(entry.id, input.id)),
    });
    if (existing) {
      if (existing.tracker !== key) throw new InvalidError("id belongs to another entry");
      return existing;
    }
  }
  const data = validate(key, input.data);
  const now = Date.now();
  const [row] = await db
    .insert(entry)
    .values({
      id: input.id ?? uuidv7(now),
      userId,
      tracker: key,
      occurredAt: input.occurredAt,
      endedAt: input.endedAt ?? null,
      tz,
      localDate: localDate(input.occurredAt, tz),
      value: input.value,
      note: input.note ?? null,
      data,
      source: input.source,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  await recomputeTrackerDay(db, userId, key, row.localDate);
  return row;
}

/** A changed `occurredAt` moves the entry to the local date in `tz`. */
export async function updateEntry<K extends TrackerKey>(
  db: Db,
  userId: string,
  tz: string,
  key: K,
  id: string,
  patch: EntryPatch<TrackerData<K>>,
): Promise<EntryRow> {
  const current = await findEntry(db, userId, key, id);
  if (!current) throw new NotFoundError(key);
  const moved = patch.occurredAt !== undefined;
  const [row] = await db
    .update(entry)
    .set({
      ...(moved && patch.occurredAt !== undefined
        ? { occurredAt: patch.occurredAt, tz, localDate: localDate(patch.occurredAt, tz) }
        : {}),
      ...(patch.endedAt !== undefined ? { endedAt: patch.endedAt } : {}),
      ...(patch.value !== undefined ? { value: patch.value } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
      ...(patch.data !== undefined ? { data: validate(key, patch.data) } : {}),
      updatedAt: Date.now(),
    })
    .where(and(eq(entry.userId, userId), eq(entry.id, id)))
    .returning();
  if (!row) throw new NotFoundError(key);
  await recomputeTrackerDay(db, userId, key, row.localDate);
  if (row.localDate !== current.localDate)
    await recomputeTrackerDay(db, userId, key, current.localDate);
  return row;
}

/** Idempotent: deleting a missing entry returns null. */
export async function deleteEntry(
  db: Db,
  userId: string,
  key: TrackerKey,
  id: string,
): Promise<EntryRow | null> {
  const [row] = await db
    .delete(entry)
    .where(and(eq(entry.userId, userId), eq(entry.tracker, key), eq(entry.id, id)))
    .returning();
  if (!row) return null;
  await recomputeTrackerDay(db, userId, key, row.localDate);
  return row;
}

export async function getEntry(db: Db, userId: string, key: TrackerKey, id: string) {
  return (await findEntry(db, userId, key, id)) ?? null;
}

/** Entries with local dates in [from, to], oldest first. */
export async function listEntries(
  db: Db,
  userId: string,
  key: TrackerKey,
  range: { from: string; to: string },
): Promise<EntryRow[]> {
  return db
    .select()
    .from(entry)
    .where(
      and(
        eq(entry.userId, userId),
        eq(entry.tracker, key),
        gte(entry.localDate, range.from),
        lte(entry.localDate, range.to),
      ),
    )
    .orderBy(asc(entry.occurredAt));
}
