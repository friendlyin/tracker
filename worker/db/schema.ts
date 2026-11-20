import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Every user-owned table has `user_id`, and every query filters by it (see CLAUDE.md).
// Instants are Unix milliseconds (UTC). Entries also store `tz` and the derived `local_date`.

const timestamps = {
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
};

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("UTC"),
  wakeTime: text("wake_time").notNull().default("07:00"),
  sleepTime: text("sleep_time").notNull().default("23:00"),
  ...timestamps,
});

/** Per-feature settings as JSON, validated by the feature's zod schema in `shared/`. */
export const userSetting = sqliteTable(
  "user_setting",
  {
    userId: text("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Metrics engine daily rollup. `dimension` is "" when the metric has none. */
export const metricDaily = sqliteTable(
  "metric_daily",
  {
    userId: text("user_id").notNull(),
    metric: text("metric").notNull(),
    localDate: text("local_date").notNull(),
    dimension: text("dimension").notNull().default(""),
    value: real("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.metric, t.localDate, t.dimension] })],
);

export const exercise = sqliteTable(
  "exercise",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    equipment: text("equipment").notNull(),
    recSets: integer("rec_sets").notNull(),
    recRepsMin: integer("rec_reps_min").notNull(),
    recRepsMax: integer("rec_reps_max").notNull(),
    /** Key of the seed exercise this was copied from; null for custom exercises. */
    seedKey: text("seed_key"),
    archivedAt: integer("archived_at"),
    ...timestamps,
  },
  (t) => [
    index("exercise_user_idx").on(t.userId),
    // One copy of each library exercise per user (null keys, custom exercises, never collide).
    uniqueIndex("exercise_user_seed_idx").on(t.userId, t.seedKey),
  ],
);

export const exerciseMuscle = sqliteTable(
  "exercise_muscle",
  {
    exerciseId: text("exercise_id").notNull(),
    userId: text("user_id").notNull(),
    group: text("group_key").notNull(),
    contribution: real("contribution").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.exerciseId, t.group] }),
    index("exercise_muscle_user_idx").on(t.userId),
  ],
);

export const workout = sqliteTable(
  "workout",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    startedAt: integer("started_at").notNull(),
    endedAt: integer("ended_at"),
    tz: text("tz").notNull(),
    localDate: text("local_date").notNull(),
    ...timestamps,
  },
  (t) => [index("workout_user_date_idx").on(t.userId, t.localDate)],
);

export const workoutSet = sqliteTable(
  "workout_set",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    workoutId: text("workout_id").notNull(),
    exerciseId: text("exercise_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["warmup", "working"] }).notNull(),
    reps: integer("reps").notNull(),
    weightKg: real("weight_kg"),
    performedAt: integer("performed_at").notNull(),
    ...timestamps,
  },
  (t) => [
    index("workout_set_workout_idx").on(t.workoutId),
    index("workout_set_user_exercise_idx").on(t.userId, t.exerciseId, t.performedAt),
  ],
);

/**
 * Tracking engine: one logged event of a tracker (meal, later water, focus sessions, habits…).
 * `value` is in the tracker's unit (meal: kcal); `data` holds tracker-specific fields, validated by the
 * tracker's zod schema in `shared/tracking/trackers.ts`.
 */
export const entry = sqliteTable(
  "entry",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tracker: text("tracker").notNull(),
    occurredAt: integer("occurred_at").notNull(),
    endedAt: integer("ended_at"),
    tz: text("tz").notNull(),
    localDate: text("local_date").notNull(),
    value: real("value"),
    note: text("note"),
    data: text("data", { mode: "json" }).notNull(),
    source: text("source", { enum: ["app", "mcp"] }).notNull(),
    ...timestamps,
  },
  (t) => [index("entry_user_tracker_date_idx").on(t.userId, t.tracker, t.localDate)],
);

/**
 * User-defined habits. Progress is logged as entries: the `habit` tracker for check, count and
 * amount habits, focus sessions (with `data.habitId`) for time habits.
 */
export const habit = sqliteTable(
  "habit",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["check", "time", "count", "amount"] }).notNull(),
    target: real("target"),
    unit: text("unit"),
    focus: text("focus", { enum: ["deep", "moderate", "unfocus"] }),
    /** Bitmask: Monday = 1 … Sunday = 64. */
    days: integer("days").notNull(),
    position: integer("position").notNull(),
    archivedAt: integer("archived_at"),
    ...timestamps,
  },
  (t) => [index("habit_user_idx").on(t.userId)],
);

/** Manual day-type overrides for nutrition targets. Days without a row follow workouts. */
export const dayType = sqliteTable(
  "day_type",
  {
    userId: text("user_id").notNull(),
    localDate: text("local_date").notNull(),
    type: text("type", { enum: ["workout", "rest"] }).notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.localDate] })],
);

export type User = typeof user.$inferSelect;
export type EntryRow = typeof entry.$inferSelect;
export type HabitRow = typeof habit.$inferSelect;
