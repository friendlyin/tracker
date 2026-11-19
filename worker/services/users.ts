import { and, eq } from "drizzle-orm";
import { uuidv7 } from "../../shared/id";
import { SEED_EXERCISES } from "../../shared/workouts/seed";
import { chunkRows, type Db } from "../db";
import { exercise, exerciseMuscle, type User, user, userSetting } from "../db/schema";

export async function getUser(db: Db, id: string): Promise<User | null> {
  return (await db.query.user.findFirst({ where: eq(user.id, id) })) ?? null;
}

export async function ensureUser(db: Db, email: string, timezone: string): Promise<User> {
  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) return existing;

  const now = Date.now();
  const inserted = await db
    .insert(user)
    .values({ id: uuidv7(now), email, timezone, createdAt: now, updatedAt: now })
    .onConflictDoNothing()
    .returning();
  const created = inserted[0];
  if (!created) {
    // A concurrent first request created the user.
    const row = await db.query.user.findFirst({ where: eq(user.email, email) });
    if (!row) throw new Error("user upsert failed");
    return row;
  }
  await seedExercises(db, created.id, now);
  return created;
}

/** Copies the generic starter library into the user's own exercises. */
async function seedExercises(db: Db, userId: string, now: number) {
  const exRows: (typeof exercise.$inferInsert)[] = [];
  const muscleRows: (typeof exerciseMuscle.$inferInsert)[] = [];
  SEED_EXERCISES.forEach((s, i) => {
    const id = uuidv7(now + i);
    exRows.push({
      id,
      userId,
      name: s.name,
      equipment: s.equipment,
      recSets: s.sets,
      recRepsMin: s.reps[0],
      recRepsMax: s.reps[1],
      seedKey: s.key,
      createdAt: now,
      updatedAt: now,
    });
    for (const [group, contribution] of Object.entries(s.muscles)) {
      muscleRows.push({ exerciseId: id, userId, group, contribution });
    }
  });
  const statements = [
    ...chunkRows(exRows, 11).map((rows) => db.insert(exercise).values(rows)),
    ...chunkRows(muscleRows, 4).map((rows) => db.insert(exerciseMuscle).values(rows)),
  ];
  const [first, ...rest] = statements;
  if (first) await db.batch([first, ...rest]);
}

export async function updateTimezone(db: Db, u: User, timezone: string): Promise<User> {
  const [row] = await db
    .update(user)
    .set({ timezone, updatedAt: Date.now() })
    .where(eq(user.id, u.id))
    .returning();
  return row ?? u;
}

export async function updateProfile(
  db: Db,
  userId: string,
  patch: { name?: string | null; wakeTime?: string; sleepTime?: string },
): Promise<User> {
  const [row] = await db
    .update(user)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(user.id, userId))
    .returning();
  if (!row) throw new Error("user not found");
  return row;
}

export async function getSetting(db: Db, userId: string, key: string): Promise<unknown> {
  const row = await db.query.userSetting.findFirst({
    where: and(eq(userSetting.userId, userId), eq(userSetting.key, key)),
  });
  return row?.value;
}

export async function putSetting(db: Db, userId: string, key: string, value: unknown) {
  const now = Date.now();
  await db
    .insert(userSetting)
    .values({ userId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [userSetting.userId, userSetting.key],
      set: { value, updatedAt: now },
    });
}
