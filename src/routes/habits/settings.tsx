import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { type FocusKind, focusKinds } from "../../../shared/focus/schemas";
import {
  EVERY_DAY,
  type HabitFields,
  type HabitKind,
  habitKinds,
  habitProblem,
} from "../../../shared/habits/schemas";
import type { HabitDto } from "../../../shared/habits/types";
import {
  useArchiveHabit,
  useCreateHabit,
  useHabitsDay,
  useUpdateHabit,
} from "../../features/habits/api";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { ChevronIcon, PlusIcon } from "../../ui/icons";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/habits/settings")({ component: HabitSettings });

const KIND_LABEL: Record<HabitKind, string> = {
  check: "Check",
  time: "Time",
  count: "Count",
  amount: "Amount",
};
const FOCUS_LABEL: Record<FocusKind | "none", string> = {
  none: "None",
  moderate: "Moderate",
  deep: "Deep",
  unfocus: "Unfocus",
};
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

const defaultTarget = (k: HabitKind) => (k === "check" ? null : k === "time" ? 10 : 1);

/** "Every day", "Weekdays" or the day letters. */
function daysText(days: number) {
  if (days === EVERY_DAY) return "Every day";
  if (days === 31) return "Weekdays";
  if (days === 96) return "Weekends";
  return DAY_LETTERS.filter((_, i) => days & (1 << i)).join(" ");
}

function summary(h: HabitDto) {
  const target =
    h.kind === "time"
      ? `${h.target} min`
      : h.kind === "check"
        ? ""
        : `${h.target}${h.unit ? ` ${h.unit}` : ""}`;
  return [target, daysText(h.days)].filter(Boolean).join(" · ");
}

function DaysPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {DAY_LETTERS.map((l, i) => {
        const bit = 1 << i;
        const on = (value & bit) !== 0;
        return (
          <button
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed Monday-to-Sunday positions
            key={i}
            type="button"
            aria-pressed={on}
            onClick={() => {
              const next = value ^ bit;
              if (next !== 0) onChange(next);
            }}
            className={cx(
              "h-11 flex-1 rounded-md text-[15px] font-medium active:opacity-60",
              on ? "bg-ink text-on-ink" : "bg-surface text-ink-2",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

const label = "mt-5 mb-2 text-[13px] font-medium text-ink-3";

/** Create (no `habit`) or edit a habit. */
function EditSheet({ habit, onClose }: { habit?: HabitDto; onClose: () => void }) {
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const archive = useArchiveHabit();
  const [f, setF] = useState<HabitFields>(
    habit ?? { name: "", kind: "check", target: null, unit: null, focus: null, days: EVERY_DAY },
  );
  const set = (patch: Partial<HabitFields>) => setF((v) => ({ ...v, ...patch }));
  const fields: HabitFields = { ...f, name: f.name.trim(), unit: f.unit?.trim() || null };
  const invalid = fields.name === "" || habitProblem(fields) !== null;

  return (
    <div className="pb-2">
      <input
        aria-label="Name"
        className="h-12 w-full border-b border-line bg-transparent text-[20px] font-semibold outline-none"
        value={f.name}
        placeholder="Name"
        maxLength={40}
        onChange={(e) => set({ name: e.target.value })}
      />
      <div className={label}>Type</div>
      <Segmented<HabitKind>
        value={f.kind}
        options={habitKinds.map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        onChange={(k) =>
          set({
            kind: k,
            target: k === f.kind ? f.target : defaultTarget(k),
            unit: k === "amount" ? f.unit : null,
            focus: k === "time" ? f.focus : null,
          })
        }
      />
      {f.kind !== "check" && (
        <>
          <div className={label}>Target</div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Stepper
                label="Target"
                value={f.target}
                onChange={(v) => set({ target: v === null ? null : Math.max(0.1, v) })}
                step={f.kind === "time" ? 5 : 1}
                min={f.kind === "time" ? 1 : 0.1}
                max={f.kind === "time" ? 1440 : 100_000}
                decimal={f.kind === "amount"}
                unit={f.kind === "time" ? "min" : undefined}
              />
            </div>
            {f.kind === "amount" && (
              <input
                aria-label="Unit"
                className="h-11 w-24 rounded-md bg-surface px-3 text-[17px] outline-none"
                value={f.unit ?? ""}
                placeholder="unit"
                maxLength={12}
                onChange={(e) => set({ unit: e.target.value })}
              />
            )}
          </div>
        </>
      )}
      {f.kind === "time" && (
        <>
          <div className={label}>Focus energy</div>
          <Segmented<FocusKind | "none">
            value={f.focus ?? "none"}
            options={(["none", ...focusKinds] as const).map((k) => ({
              value: k,
              label: FOCUS_LABEL[k],
            }))}
            onChange={(k) => set({ focus: k === "none" ? null : k })}
          />
        </>
      )}
      <div className={label}>Days</div>
      <DaysPicker value={f.days} onChange={(days) => set({ days })} />
      <Button
        className="mt-6"
        disabled={invalid}
        onClick={() => {
          if (habit) update(habit.id, fields);
          else create(fields);
          onClose();
        }}
      >
        {habit ? "Save" : "Add"}
      </Button>
      {habit && (
        <Button
          variant="danger"
          className="mt-2"
          onClick={() => {
            archive(habit.id);
            onClose();
          }}
        >
          Remove
        </Button>
      )}
    </div>
  );
}

function HabitSettings() {
  const { data } = useHabitsDay();
  const update = useUpdateHabit();
  const [editing, setEditing] = useState<HabitDto | "new" | null>(null);
  const habits = data?.habits ?? [];

  /** Swaps positions with the neighbour (positions may have gaps). */
  const move = (i: number, dir: -1 | 1) => {
    const a = habits[i];
    const b = habits[i + dir];
    if (!a || !b) return;
    const [pa, pb] = a.position === b.position ? [i, i + dir] : [a.position, b.position];
    update(a.id, { position: pb });
    update(b.id, { position: pa });
  };

  return (
    <Screen
      back="/habits"
      title="Habits"
      footer={
        <div className="pb-3">
          <Button onClick={() => setEditing("new")}>
            <span className="flex items-center justify-center gap-2">
              <PlusIcon className="size-5" />
              Habit
            </span>
          </Button>
        </div>
      }
    >
      <div className="mt-2">
        {habits.map((h, i) => (
          <div key={h.id} className="flex min-h-14 items-center gap-1 border-b border-line">
            <button
              type="button"
              onClick={() => setEditing(h)}
              className="min-w-0 flex-1 py-2 text-left active:opacity-60"
            >
              <div className="truncate text-[17px]">{h.name}</div>
              <div className="text-[13px] text-ink-2">{summary(h)}</div>
            </button>
            <button
              type="button"
              aria-label={`Move ${h.name} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
              className="grid size-11 place-items-center text-ink-2 active:opacity-60 disabled:opacity-25"
            >
              <ChevronIcon className="size-5 -rotate-90" />
            </button>
            <button
              type="button"
              aria-label={`Move ${h.name} down`}
              disabled={i === habits.length - 1}
              onClick={() => move(i, 1)}
              className="-mr-2 grid size-11 place-items-center text-ink-2 active:opacity-60 disabled:opacity-25"
            >
              <ChevronIcon className="size-5 rotate-90" />
            </button>
          </div>
        ))}
      </div>
      <Sheet open={editing !== null} onClose={() => setEditing(null)}>
        {editing !== null && (
          <EditSheet
            key={editing === "new" ? "new" : editing.id}
            habit={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Sheet>
    </Screen>
  );
}
