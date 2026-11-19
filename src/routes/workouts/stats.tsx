import { createFileRoute, Link } from "@tanstack/react-router";
import { bucketDays, daysBetween, type Period } from "../../../shared/metrics/periods";
import { METRICS } from "../../../shared/metrics/registry";
import { bucketValues, periodValue } from "../../../shared/metrics/series";
import type { ExerciseProgressDto, GroupProgressDto } from "../../../shared/metrics/types";
import { GROUP_LABELS, MUSCLE_GROUPS } from "../../../shared/workouts/groups";
import type { WorkoutSettings } from "../../../shared/workouts/settings";
import { useVariant } from "../../dev/variants";
import { useMetrics, useProgression } from "../../features/stats/api";
import { StatsScreen } from "../../features/stats/PeriodBar";
import { usePeriod } from "../../features/stats/period";
import { useOverview } from "../../features/workouts/api";
import { fmtAxis, fmtBucket, fmtDay, fmtPct, fmtSets } from "../../lib/format";
import { Bars } from "../../ui/charts/Bars";
import { Heatmap } from "../../ui/charts/Heatmap";
import { Spark } from "../../ui/charts/Spark";
import { cx } from "../../ui/cx";
import { ChevronIcon } from "../../ui/icons";
import { SectionLabel } from "../../ui/Row";

export const Route = createFileRoute("/workouts/stats")({ component: WorkoutStats });

const IDS = [METRICS.workoutsCount.id, METRICS.workingSets.id];

const weeklyTarget = (s: WorkoutSettings) =>
  MUSCLE_GROUPS.reduce((sum, g) => sum + s.targets[s.categories[g]], 0);

/** Elapsed share of a week: targets are per week, periods are not. */
const weeksSoFar = (p: Period, today: string) =>
  daysBetween(p.from, p.to < today ? p.to : today) / 7;

function WorkoutStats() {
  const { period: p, today } = usePeriod();
  const metrics = useMetrics(IDS, p);
  const progression = useProgression(p);
  const settings = useOverview().data?.settings;
  const rows = metrics.data?.rows ?? [];
  const weeks = weeksSoFar(p, today);

  const workouts = periodValue(rows, METRICS.workoutsCount, p, { today }) ?? 0;
  const sets = periodValue(rows, METRICS.workingSets, p, { today }) ?? 0;
  const plannedWorkouts = settings ? Math.round(settings.workoutsPerWeek * weeks) : null;
  const plannedSets = settings ? Math.round(weeklyTarget(settings) * weeks) : null;

  return (
    <StatsScreen back="/workouts" title="Workouts">
      <div className="mt-2 grid grid-cols-2 gap-4">
        <Big value={String(workouts)} of={plannedWorkouts} unit="workouts" />
        <Big value={fmtSets(sets)} of={plannedSets} unit="sets" />
      </div>

      <Timeline p={p} today={today} rows={rows} target={settings && weeklyTarget(settings)} />

      {settings && (
        <Groups
          p={p}
          today={today}
          rows={rows}
          weeks={weeks}
          settings={settings}
          progress={progression.data?.groups ?? []}
        />
      )}

      <Exercises list={progression.data?.exercises ?? []} />
    </StatsScreen>
  );
}

function Big({ value, of, unit }: { value: string; of: number | null; unit: string }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-[34px] leading-none font-semibold">{value}</span>
        {of !== null && <span className="num text-[17px] text-ink-2">/ {of}</span>}
      </div>
      <div className="mt-1 text-[13px] text-ink-2">{unit}</div>
    </div>
  );
}

type Rows = NonNullable<ReturnType<typeof useMetrics>["data"]>["rows"];

/** Sets per day (a calendar for a month), per week or per week on average by month, vs the target. */
function Timeline({
  p,
  today,
  rows,
  target,
}: {
  p: Period;
  today: string;
  rows: Rows;
  target: number | undefined;
}) {
  const def = METRICS.workingSets;

  if (p.kind === "month") {
    const values = bucketValues(rows, def, p, { today });
    return (
      <div className="mt-6">
        <Heatmap
          from={p.from}
          values={values}
          max={Math.max(1, ...values.map((v) => v ?? 0))}
          today={today}
          readout={(i) =>
            i === null
              ? null
              : `${fmtDay(p.buckets[i] as string)} · ${fmtSets(values[i] ?? 0)} sets`
          }
        />
      </div>
    );
  }

  // Months are compared as their average week, so a short month is not "behind".
  const perWeek = p.bucket === "month";
  const values = bucketValues(rows, def, p, { today, mode: perWeek ? "daily" : "total" }).map(
    (v) => (v === null || !perWeek ? v : v * 7),
  );
  const targets = p.bucket === "day" || target === undefined ? undefined : values.map(() => target);
  const label = (i: number) => {
    const b = p.buckets[i] as string;
    if (p.bucket !== "week") return fmtBucket(b, p.bucket);
    const { from, to } = bucketDays(p, b);
    return `${fmtAxis(from, "day")} – ${fmtAxis(to, "day")}`;
  };
  return (
    <div className="mt-6">
      <Bars
        values={values}
        targets={targets}
        format={(v) => fmtSets(v)}
        axis={[
          fmtAxis(p.buckets[0] as string, p.bucket),
          fmtAxis(p.buckets.at(-1) as string, p.bucket),
        ]}
        readout={(i) =>
          i === null
            ? null
            : `${label(i)} · ${fmtSets(values[i] ?? 0)}${targets ? ` / ${target}` : ""} sets${perWeek ? " a week" : ""}`
        }
      />
    </div>
  );
}

function Change({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined)
    return <span className="num w-14 text-right text-[15px] text-ink-3">–</span>;
  return (
    <span
      className={cx(
        "num w-14 text-right text-[15px]",
        pct >= 0.5 ? "text-ok" : pct <= -0.5 ? "text-warn" : "text-ink-2",
      )}
    >
      {fmtPct(pct)}
    </span>
  );
}

/** Sets per group against its target so far, and the group's strength trend. */
function Groups({
  p,
  today,
  rows,
  weeks,
  settings,
  progress,
}: {
  p: Period;
  today: string;
  rows: Rows;
  weeks: number;
  settings: WorkoutSettings;
  progress: GroupProgressDto[];
}) {
  return (
    <div className="mt-4">
      <SectionLabel>Muscle groups</SectionLabel>
      {MUSCLE_GROUPS.map((g) => {
        const done = periodValue(rows, METRICS.workingSets, p, { today, dimension: g }) ?? 0;
        const target = Math.round(settings.targets[settings.categories[g]] * weeks);
        return (
          <Link
            key={g}
            to="/workouts/group/$group"
            params={{ group: g }}
            className="flex min-h-12 items-center gap-3 border-b border-line active:opacity-60"
          >
            <span className="min-w-0 flex-1 truncate text-[15px]">{GROUP_LABELS[g]}</span>
            <span className={cx("num text-[15px]", done < target ? "text-ink-2" : "text-ink")}>
              {fmtSets(done)}
              <span className="text-ink-3">/{target}</span>
            </span>
            <Change pct={progress.find((x) => x.group === g)?.changePct} />
          </Link>
        );
      })}
    </div>
  );
}

const bySessions = (a: ExerciseProgressDto, b: ExerciseProgressDto) =>
  b.points.length - a.points.length || a.name.localeCompare(b.name);

function Exercises({ list }: { list: ExerciseProgressDto[] }) {
  const View = useVariant("stats.progress", { spark: SparkRows, bars: ChangeBars });
  if (list.length === 0) return null;
  return (
    <div className="mt-4">
      <SectionLabel>Exercises</SectionLabel>
      <View list={[...list].sort(bySessions)} />
    </div>
  );
}

function ExerciseLink({ e, children }: { e: ExerciseProgressDto; children: React.ReactNode }) {
  return (
    <Link
      to="/workouts/progress/$exerciseId"
      params={{ exerciseId: e.exerciseId }}
      className="flex min-h-12 items-center gap-3 border-b border-line active:opacity-60"
    >
      {children}
    </Link>
  );
}

/** Variant A: each exercise with a sparkline of its sessions and the change. */
function SparkRows({ list }: { list: ExerciseProgressDto[] }) {
  return list.map((e) => (
    <ExerciseLink key={e.exerciseId} e={e}>
      <span className="min-w-0 flex-1 truncate text-[15px]">{e.name}</span>
      <Spark values={e.points.map((x) => x.value)} />
      <Change pct={e.trend?.changePct} />
      <ChevronIcon className="-ml-2 text-ink-3" width={18} height={18} />
    </ExerciseLink>
  ));
}

/** Variant B: the change as a bar left or right of zero. */
function ChangeBars({ list }: { list: ExerciseProgressDto[] }) {
  const span = Math.max(5, ...list.map((e) => Math.abs(e.trend?.changePct ?? 0)));
  return list.map((e) => {
    const pct = e.trend?.changePct;
    const w = pct === undefined ? 0 : (Math.abs(pct) / span) * 50;
    return (
      <ExerciseLink key={e.exerciseId} e={e}>
        <span className="w-[42%] min-w-0 truncate text-[15px]">{e.name}</span>
        <span className="relative h-3 flex-1">
          <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
          {pct !== undefined && (
            <span
              className={cx("absolute inset-y-0", pct >= 0 ? "bg-ink" : "bg-ink-3")}
              style={pct >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
            />
          )}
        </span>
        <Change pct={pct} />
      </ExerciseLink>
    );
  });
}
