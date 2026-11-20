import { useMemo } from "react";
import { dayStatus, isDone, isDue, progress } from "../../../shared/habits/logic";
import type { HabitDto, HabitsDayDto } from "../../../shared/habits/types";
import { useNow } from "../../lib/useNow";
import { runningEntry, useHabitsDay } from "./api";

export interface HabitRowState {
  habit: HabitDto;
  amount: number;
  due: boolean;
  done: boolean;
}

/** Today's habits with live progress (a running timer ticks every 15 s). */
export function useHabitsToday() {
  const { data } = useHabitsDay();
  const running = runningEntry(data);
  const tick = useNow(running ? 15_000 : 60_000);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick re-runs it
  return useMemo(() => (data ? today(data, Date.now()) : undefined), [data, tick]);
}

function today(d: HabitsDayDto, now: number) {
  const rows: HabitRowState[] = d.habits.map((habit) => {
    const amount = progress(habit.id, d.entries, now);
    return { habit, amount, due: isDue(habit, d.date), done: isDone(habit, amount) };
  });
  return {
    d,
    rows,
    status: dayStatus(d.habits, d.date, d.entries, now),
    running: runningEntry(d),
  };
}

const num = (n: number) => String(Math.round(n * 10) / 10);

/** "4/10 min", "20/50", "12/20 pages"; empty for a check. */
export function progressText(h: HabitDto, amount: number) {
  if (h.kind === "check") return "";
  const target = h.target ?? 0;
  if (h.kind === "time") return `${Math.floor(amount + 1e-9)}/${target} min`;
  if (h.kind === "amount") return `${num(amount)}/${num(target)}${h.unit ? ` ${h.unit}` : ""}`;
  return `${num(amount)}/${num(target)}`;
}
