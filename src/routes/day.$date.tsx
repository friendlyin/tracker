import { createFileRoute, Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { METRICS } from "../../shared/metrics/registry";
import { addDays } from "../../shared/time";
import { todayLocal } from "../features/nutrition/api";
import { useDayStats } from "../features/stats/api";
import { fmtDay, fmtInt } from "../lib/format";
import { cx } from "../ui/cx";
import { ChevronIcon } from "../ui/icons";
import { SectionLabel } from "../ui/Row";
import { Screen } from "../ui/Screen";

export const Route = createFileRoute("/day/$date")({ component: Day });

const M = METRICS;
const SLEEP = ["", "Bad", "OK", "Good"];
const fmtHours = (min: number) =>
  `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** One day across features, from the rollups. */
function Day() {
  const { date } = Route.useParams();
  const today = todayLocal();
  const { data } = useDayStats(date);
  const get = (id: string) => {
    const rows = data?.rows.filter((r) => r.metric === id) ?? [];
    return rows.length ? rows.reduce((a, r) => a + r.value, 0) : null;
  };
  const kcal = get(M.kcal.id);
  const water = get(M.waterIntake.id);
  const sleep = get(M.sleepQuality.id);

  return (
    <Screen back="/stats" title={fmtDay(date)} footer={<DayNav date={date} today={today} />}>
      <SectionLabel>Workouts</SectionLabel>
      {data?.workouts.length ? (
        data.workouts.map((w) => (
          <Link
            key={w.id}
            to="/workouts/history/$workoutId"
            params={{ workoutId: w.id }}
            className="flex min-h-12 items-center gap-3 border-b border-line active:opacity-60"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]">{w.exercises.join(", ")}</span>
            <span className="num text-[15px] text-ink-2">{w.workingSets}</span>
            <ChevronIcon className="text-ink-3" width={18} height={18} />
          </Link>
        ))
      ) : (
        <Value label="–" value={null} />
      )}

      <SectionLabel>Nutrition</SectionLabel>
      <Value
        to="/nutrition"
        search={{ date }}
        label={M.kcal.label}
        value={kcal}
        target={get(M.kcalTarget.id)}
        unit="kcal"
        format={fmtInt}
        better="lower"
      />
      <Value
        to="/nutrition"
        search={{ date }}
        label={M.protein.label}
        value={get(M.protein.id)}
        target={get(M.proteinTarget.id)}
        unit="g"
        format={fmtInt}
      />

      <SectionLabel>Water</SectionLabel>
      <Value
        label={M.waterIntake.label}
        value={water ?? (data ? 0 : null)}
        target={get(M.waterTarget.id)}
        unit="ml"
        format={fmtInt}
      />
      <Value label={M.waterAtCap.label} value={get(M.waterAtCap.id)} unit="h" format={fmtHours} />

      <SectionLabel>Focus</SectionLabel>
      <Value label={M.sleepQuality.label} value={sleep} format={(v) => SLEEP[v] ?? ""} />
      <Value label={M.focusDeep.label} value={get(M.focusDeep.id)} unit="h" format={fmtHours} />
      <Value
        label={M.focusModerate.label}
        value={get(M.focusModerate.id)}
        unit="h"
        format={fmtHours}
      />
      <Value
        label={M.focusUnfocus.label}
        value={get(M.focusUnfocus.id)}
        unit="h"
        format={fmtHours}
      />
      <Value label={M.focusMinEnergy.label} value={get(M.focusMinEnergy.id)} format={fmtInt} />
    </Screen>
  );
}

function Value({
  label,
  value,
  target,
  unit = "",
  format = String,
  better = "higher",
  to,
  search,
}: {
  label: string;
  value: number | null;
  target?: number | null;
  unit?: string;
  format?: (v: number) => string;
  better?: "higher" | "lower";
  to?: LinkProps["to"];
  search?: LinkProps["search"];
}) {
  const met =
    value !== null && target != null
      ? better === "higher"
        ? value >= target
        : value <= target
      : null;
  const body: ReactNode = (
    <>
      <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">{label}</span>
      <span className={cx("num text-[15px]", met === false && "text-ink-2")}>
        {value === null ? "–" : format(value)}
        {target != null && <span className="text-ink-3"> / {format(target)}</span>}
        {unit && value !== null && <span className="text-ink-2"> {unit}</span>}
      </span>
      {to && <ChevronIcon className="-mr-1 text-ink-3" width={18} height={18} />}
    </>
  );
  const cls = "flex min-h-12 items-center gap-3 border-b border-line";
  return to ? (
    <Link to={to} search={search} className={cx(cls, "active:opacity-60")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function DayNav({ date, today }: { date: string; today: string }) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const btn = "flex h-11 items-center gap-1 text-[15px] text-ink-2 active:opacity-60";
  return (
    <div className="flex items-center justify-between pb-3">
      <Link to="/day/$date" params={{ date: prev }} replace className={cx(btn, "-ml-2")}>
        <ChevronIcon className="rotate-180" />
        {fmtDay(prev)}
      </Link>
      {date < today && (
        <Link to="/day/$date" params={{ date: next }} replace className={cx(btn, "-mr-2")}>
          {fmtDay(next)}
          <ChevronIcon />
        </Link>
      )}
    </div>
  );
}
