import { Link } from "@tanstack/react-router";
import type { HabitEntryDto } from "../../../shared/habits/types";
import { useVariant } from "../../dev/variants";
import { cx } from "../../ui/cx";
import { CheckIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";
import { TimerClock } from "../timer/Countdown";
import { useLogHabit } from "./api";
import { type HabitRowState, progressText, useHabitsToday } from "./today";

// Home tile: how many of today's habits are left. Variant `habits.tile`: the count with a bar, or
// the next few habits with one-tap check-offs for check and count habits. Buttons sit above the
// tile's link (a button inside a link is invalid HTML).

type Today = NonNullable<ReturnType<typeof useHabitsToday>>;

function Running({ t }: { t: Today }) {
  const r = t.running;
  if (!r) return null;
  const name = t.d.habits.find((h) => h.id === r.habitId)?.name;
  return (
    <div className="truncate text-[12px]">
      {name} · <TimerClock id={r.id} startedAt={r.at} targetMin={r.targetMin} />
    </div>
  );
}

function CountBody({ t }: { t: Today }) {
  const { due, done, left } = t.status;
  return (
    <div>
      {due > 0 && left === 0 ? (
        <CheckIcon className="size-9 text-ok" />
      ) : (
        <div className="num text-[40px] leading-none font-semibold">{left}</div>
      )}
      <div className="mt-1 h-4 text-[13px] text-ink-2">
        {t.running ? <Running t={t} /> : `of ${due} left today`}
      </div>
      <ProgressBar
        className="mt-3"
        value={done}
        max={due}
        tone={due > 0 && left === 0 ? "ok" : "accent"}
      />
    </div>
  );
}

function QuickRow({ r, running }: { r: HabitRowState; running?: HabitEntryDto }) {
  const log = useLogHabit();
  const h = r.habit;
  const quick = h.kind === "check" || h.kind === "count";
  return (
    <div className="flex h-9 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-[13px]">{h.name}</span>
      {quick ? (
        <button
          type="button"
          aria-label={h.kind === "check" ? `Done: ${h.name}` : `+1 ${h.name}`}
          onClick={() => log(h, 1)}
          className="pointer-events-auto relative grid h-9 min-w-9 place-items-center rounded-md bg-paper px-2 text-[13px] font-semibold active:opacity-60"
        >
          {h.kind === "check" ? <CheckIcon className="size-4" /> : "+1"}
        </button>
      ) : running ? (
        <TimerClock
          id={running.id}
          startedAt={running.at}
          targetMin={running.targetMin}
          className="text-[12px]"
        />
      ) : (
        <span className="num text-[12px] text-ink-2">{progressText(h, r.amount)}</span>
      )}
    </div>
  );
}

function ListBody({ t }: { t: Today }) {
  const run = t.running;
  // The running habit first, then the next ones due.
  const next = t.rows
    .filter((r) => (r.due && !r.done) || r.habit.id === run?.habitId)
    .sort((a, b) => Number(b.habit.id === run?.habitId) - Number(a.habit.id === run?.habitId))
    .slice(0, 3);
  if (next.length === 0) return <CountBody t={t} />;
  return (
    <div>
      {next.map((r) => (
        <QuickRow key={r.habit.id} r={r} running={r.habit.id === run?.habitId ? run : undefined} />
      ))}
    </div>
  );
}

export function HabitsTile({ className }: { className: string }) {
  const t = useHabitsToday();
  const Body = useVariant("habits.tile", { count: CountBody, list: ListBody });
  return (
    <div className={cx(className, "relative")}>
      <Link
        to="/habits"
        aria-label="Habits"
        className="absolute inset-0 rounded-md active:bg-ink/5"
      />
      <div className="pointer-events-none flex items-center justify-between">
        <span className="text-[15px] font-medium">Habits</span>
        {t && Body === ListBody && t.status.left > 0 && (
          <span className="num text-[13px] text-ink-2">
            {t.status.done}/{t.status.due}
          </span>
        )}
      </div>
      <div className="pointer-events-none">{t ? <Body t={t} /> : "–"}</div>
    </div>
  );
}
