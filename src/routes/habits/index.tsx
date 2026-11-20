import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { goal, minutesLeft } from "../../../shared/habits/logic";
import type { HabitDto, HabitEntryDto, HabitsDayDto } from "../../../shared/habits/types";
import {
  useDeleteHabitEntry,
  useLogHabit,
  useStartHabit,
  useStopTimer,
} from "../../features/habits/api";
import { type HabitRowState, progressText, useHabitsToday } from "../../features/habits/today";
import { WeekDots } from "../../features/habits/WeekDots";
import { TimerClock } from "../../features/timer/Countdown";
import { primeAudio } from "../../features/timer/signal";
import { fmtDuration, fmtTime } from "../../lib/format";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { CheckIcon, CloseIcon, PlayIcon, PlusIcon, SlidersIcon, StopIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";
import { IconLink, Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/habits/")({ component: HabitsScreen });

const MIN = 60_000;

/** Due and not done first, then done; habits not due today last. */
const rank = (r: HabitRowState) => (!r.due ? 2 : r.done ? 1 : 0);

const actionClass =
  "grid size-11 shrink-0 place-items-center rounded-md text-[15px] font-semibold active:opacity-60";

function Action({
  row,
  d,
  running,
  onOpen,
}: {
  row: HabitRowState;
  d: HabitsDayDto;
  running: HabitEntryDto | undefined;
  onOpen: () => void;
}) {
  const log = useLogHabit();
  const del = useDeleteHabitEntry();
  const start = useStartHabit();
  const stop = useStopTimer();
  const h = row.habit;

  if (h.kind === "check") {
    const today = d.entries.filter((e) => e.habitId === h.id);
    return (
      <button
        type="button"
        aria-label={row.done ? `Undo ${h.name}` : `Done: ${h.name}`}
        aria-pressed={row.done}
        onClick={() => {
          if (!row.done) return log(h);
          for (const e of today) del(e.id);
        }}
        className={cx(actionClass, row.done ? "bg-ok text-on-ink" : "bg-surface")}
      >
        <CheckIcon className="size-5" />
      </button>
    );
  }
  if (h.kind === "count") {
    return (
      <button type="button" onClick={() => log(h, 1)} className={cx(actionClass, "bg-surface")}>
        +1
      </button>
    );
  }
  if (h.kind === "time") {
    const mine = running?.habitId === h.id ? running : undefined;
    return (
      <div className="flex gap-1.5">
        <button
          type="button"
          aria-label={`Add minutes: ${h.name}`}
          onClick={onOpen}
          className={cx(actionClass, "bg-surface")}
        >
          <PlusIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label={mine ? `Stop ${h.name}` : `Start ${h.name}`}
          onClick={() => {
            if (mine) return stop(mine.id);
            primeAudio();
            start(h, minutesLeft(h, row.amount));
          }}
          className={cx(actionClass, mine ? "bg-ink text-on-ink" : "bg-surface")}
        >
          {mine ? <StopIcon className="size-5" /> : <PlayIcon className="size-5" />}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      aria-label={`Add: ${h.name}`}
      onClick={onOpen}
      className={cx(actionClass, "bg-surface")}
    >
      <PlusIcon className="size-5" />
    </button>
  );
}

function HabitRow({
  row,
  d,
  running,
  onOpen,
}: {
  row: HabitRowState;
  d: HabitsDayDto;
  running: HabitEntryDto | undefined;
  onOpen: () => void;
}) {
  const h = row.habit;
  const muted = row.done || !row.due;
  return (
    <div className="flex min-h-16 items-center gap-3 border-b border-line py-2">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left active:opacity-60">
        <div className={cx("truncate text-[17px]", muted && "text-ink-3")}>{h.name}</div>
        <div className="mt-1 flex items-center gap-3">
          <WeekDots h={h} d={d} amount={row.amount} />
          <span className="num text-[13px] text-ink-2">{progressText(h, row.amount)}</span>
        </div>
        {h.kind !== "check" && (
          <ProgressBar
            className="mt-2"
            value={row.amount}
            max={goal(h)}
            tone={row.done ? "ok" : "accent"}
          />
        )}
      </button>
      <Action row={row} d={d} running={running} onOpen={onOpen} />
    </div>
  );
}

const entryLabel = (e: HabitEntryDto) => {
  if (e.session && e.amount === null)
    return `${fmtTime(e.at)}–${e.endedAt === null ? "" : fmtTime(e.endedAt)}`;
  return fmtTime(e.at);
};

const entryAmount = (e: HabitEntryDto, h: HabitDto) => {
  if (h.kind === "check") return "";
  if (h.kind === "time")
    return fmtDuration(e.amount !== null ? e.amount * MIN : (e.endedAt ?? Date.now()) - e.at);
  return `+${e.amount ?? 0}${h.unit ? ` ${h.unit}` : ""}`;
};

/** Add an amount (or minutes) and see or delete today's entries. */
function HabitSheet({
  row,
  d,
  onClose,
}: {
  row: HabitRowState;
  d: HabitsDayDto;
  onClose: () => void;
}) {
  const h = row.habit;
  const log = useLogHabit();
  const del = useDeleteHabitEntry();
  const left = Math.max(0, goal(h) - row.amount);
  const [amount, setAmount] = useState<number | null>(
    h.kind === "time" ? minutesLeft(h, row.amount) : left > 0 ? Math.ceil(left) : 1,
  );
  const entries = d.entries.filter((e) => e.habitId === h.id).sort((a, b) => b.at - a.at);
  return (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">{h.name}</span>
        <span className="num text-[15px] text-ink-2">{progressText(h, row.amount)}</span>
      </div>
      {h.kind !== "check" && (
        <div className="mt-4 flex gap-2">
          <div className="flex-1">
            <Stepper
              label={h.kind === "time" ? "Minutes" : "Amount"}
              value={amount}
              onChange={setAmount}
              step={h.kind === "time" ? 5 : 1}
              min={h.kind === "time" ? 1 : 0}
              max={h.kind === "time" ? 1440 : 100_000}
              decimal={h.kind === "amount"}
              unit={h.kind === "time" ? "min" : (h.unit ?? undefined)}
            />
          </div>
        </div>
      )}
      {h.kind !== "check" && (
        <Button
          className="mt-3"
          disabled={!amount}
          onClick={() => {
            if (amount) log(h, amount);
            onClose();
          }}
        >
          Add
        </Button>
      )}
      {entries.length > 0 && (
        <div className="mt-4 mb-2">
          {entries.map((e) => (
            <div key={e.id} className="flex min-h-12 items-center gap-3 border-b border-line">
              <span className="num flex-1 text-[15px] text-ink-2">{entryLabel(e)}</span>
              <span className="num text-[15px]">{entryAmount(e, h)}</span>
              <button
                type="button"
                aria-label="Delete"
                onClick={() => del(e.id)}
                className="-mr-2 grid size-11 place-items-center text-ink-3 active:opacity-60"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RunningTimer({ running, habit }: { running: HabitEntryDto; habit: HabitDto | undefined }) {
  const stop = useStopTimer();
  return (
    <div className="flex items-center gap-3 pb-3">
      <div className="flex-1">
        <div className="text-[13px] text-ink-2">{habit?.name}</div>
        <TimerClock
          id={running.id}
          startedAt={running.at}
          targetMin={running.targetMin}
          className="text-[28px] leading-none font-semibold"
        />
      </div>
      <button
        type="button"
        onClick={() => stop(running.id)}
        className="flex h-14 items-center gap-2 rounded-md bg-ink px-6 text-[17px] font-semibold text-on-ink active:opacity-70"
      >
        <StopIcon className="size-5" />
        Stop
      </button>
    </div>
  );
}

function HabitsScreen() {
  const today = useHabitsToday();
  const [open, setOpen] = useState<string | null>(null);
  const rows = today ? [...today.rows].sort((a, b) => rank(a) - rank(b)) : [];
  const firstOff = rows.findIndex((r) => !r.due);
  const openRow = rows.find((r) => r.habit.id === open);
  const running = today?.running;

  return (
    <Screen
      back="/"
      title="Habits"
      right={
        <IconLink to="/habits/settings" label="Habit settings" className="-mr-1">
          <SlidersIcon />
        </IconLink>
      }
      footer={
        running && (
          <RunningTimer
            running={running}
            habit={today?.d.habits.find((h) => h.id === running.habitId)}
          />
        )
      }
    >
      {today && (
        <>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="num text-[52px] leading-none font-semibold">{today.status.left}</span>
            <span className="text-[13px] text-ink-2">of {today.status.due} left today</span>
          </div>
          <ProgressBar
            className="mt-3"
            value={today.status.done}
            max={today.status.due}
            tone={today.status.left === 0 ? "ok" : "accent"}
          />
          <div className="mt-6">
            {rows.map((r, i) => (
              <div key={r.habit.id} className={cx(i === firstOff && i > 0 && "mt-6")}>
                <HabitRow
                  row={r}
                  d={today.d}
                  running={running}
                  onOpen={() => setOpen(r.habit.id)}
                />
              </div>
            ))}
          </div>
        </>
      )}
      <Sheet open={openRow !== undefined} onClose={() => setOpen(null)}>
        {openRow && today && (
          <HabitSheet
            key={openRow.habit.id}
            row={openRow}
            d={today.d}
            onClose={() => setOpen(null)}
          />
        )}
      </Sheet>
    </Screen>
  );
}
