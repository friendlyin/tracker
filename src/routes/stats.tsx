import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import type { Period } from "../../shared/metrics/periods";
import { METRICS, type MetricDef } from "../../shared/metrics/registry";
import {
  bucketValues,
  meetsTarget,
  periodValue,
  targetValues,
  type Values,
} from "../../shared/metrics/series";
import type { MetricBucketRow } from "../../shared/metrics/types";
import { useVariant } from "../dev/variants";
import { useMetrics } from "../features/stats/api";
import { StatsScreen } from "../features/stats/PeriodBar";
import { usePeriod } from "../features/stats/period";
import { fmtAxis, fmtBucket, fmtInt, fmtNum, fmtSets } from "../lib/format";
import { niceMax, useScrub } from "../ui/charts/scrub";
import { cx } from "../ui/cx";

export const Route = createFileRoute("/stats")({ component: Overview });

const M = METRICS;
const fmtHours = (min: number) =>
  `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

interface Feature {
  key: string;
  label: string;
  def: MetricDef;
  to: "/workouts/stats" | "/nutrition/stats" | "/water/stats" | "/focus/stats";
  unit: string;
  format: (v: number) => string;
  /** Totals per bucket (sets per week) rather than daily averages. */
  total?: boolean;
}

const FEATURES: Feature[] = [
  {
    key: "sets",
    label: "Sets",
    def: M.workingSets,
    to: "/workouts/stats",
    unit: "",
    format: fmtSets,
    total: true,
  },
  { key: "kcal", label: "kcal", def: M.kcal, to: "/nutrition/stats", unit: "", format: fmtInt },
  {
    key: "protein",
    label: "Protein",
    def: M.protein,
    to: "/nutrition/stats",
    unit: "g",
    format: fmtInt,
  },
  {
    key: "water",
    label: "Water",
    def: M.waterIntake,
    to: "/water/stats",
    unit: "ml",
    format: fmtInt,
  },
  {
    key: "focus",
    label: "Deep focus",
    def: M.focusDeep,
    to: "/focus/stats",
    unit: "h",
    format: fmtHours,
  },
  {
    key: "sleep",
    label: "Sleep",
    def: M.sleepQuality,
    to: "/focus/stats",
    unit: "/3",
    format: fmtNum,
  },
];

const IDS = FEATURES.flatMap((f) => (f.def.target ? [f.def.id, f.def.target] : [f.def.id]));

interface Strip extends Feature {
  values: Values;
  targets: Values | null;
  value: number | null;
}

function strips(rows: MetricBucketRow[], p: Period, today: string): Strip[] {
  return FEATURES.map((f) => {
    const mode = f.total || p.bucket === "day" ? "total" : "daily";
    return {
      ...f,
      values: bucketValues(rows, f.def, p, { today, mode }),
      targets: f.def.target ? targetValues(rows, f.def, p, today) : null,
      value: periodValue(rows, f.def, p, { today, mode: f.total ? "total" : "daily" }),
    };
  });
}

const meets = (s: Strip, i: number) => {
  const v = s.values[i];
  const t = s.targets?.[i];
  return v != null && t != null ? meetsTarget(s.def, v, t) : null;
};

/** Every feature on one time axis for the period; a bucket can be opened (a day) or zoomed into. */
function Overview() {
  const { period: p, today, zoom } = usePeriod();
  const rows = useMetrics(IDS, p).data?.rows ?? [];
  const list = strips(rows, p, today);
  const Layout = useVariant("overview.layout", { strips: Strips, matrix: Matrix, cards: Cards });
  const navigate = useNavigate();
  const open = (i: number) => {
    const b = p.buckets[i] as string;
    if (p.bucket === "day") navigate({ to: "/day/$date", params: { date: b } });
    else zoom(p.bucket === "week" ? "week" : "month", b);
  };
  return (
    <StatsScreen back="/" title="Overview">
      <Layout p={p} list={list} open={open} />
    </StatsScreen>
  );
}

interface LayoutProps {
  p: Period;
  list: Strip[];
  open: (i: number) => void;
}

/** Labels on the left, one scrubbable column per bucket on the right; the selection opens a bucket. */
function Shared({
  p,
  list,
  open,
  cell,
}: LayoutProps & { cell: (s: Strip, sel: number | null) => React.ReactNode }) {
  const n = p.buckets.length;
  const scrub = useScrub((f) => Math.min(n - 1, Math.floor(f * n)));
  const sel = scrub.selected;
  return (
    <div className="mt-2">
      <div className="flex h-11 items-center justify-between">
        <span className="num text-[15px] font-medium">
          {sel === null ? "" : fmtBucket(p.buckets[sel] as string, p.bucket)}
        </span>
        {sel !== null && (
          <button
            type="button"
            onClick={() => open(sel)}
            className="-mr-2 h-11 px-2 text-[15px] text-ink-2 active:opacity-60"
          >
            Open
          </button>
        )}
      </div>
      <div className="flex gap-3">
        <div className="w-24 shrink-0">
          {list.map((s) => {
            const v = sel === null ? s.value : s.values[sel];
            return (
              <Link
                key={s.key}
                to={s.to}
                className="flex h-14 flex-col justify-center active:opacity-60"
              >
                <span className="text-[13px] text-ink-2">{s.label}</span>
                <span className="num text-[17px] leading-tight font-semibold">
                  {v == null ? "–" : s.format(v)}
                  <span className="text-[13px] font-normal text-ink-2"> {s.unit}</span>
                </span>
              </Link>
            );
          })}
        </div>
        <div className="min-w-0 flex-1" {...scrub.handlers}>
          {list.map((s) => (
            <div key={s.key} className="flex h-14 items-center">
              {cell(s, sel)}
            </div>
          ))}
        </div>
      </div>
      <div className="num mt-1 flex justify-between pl-27 text-[11px] text-ink-3">
        <span>{fmtAxis(p.buckets[0] as string, p.bucket)}</span>
        <span>{fmtAxis(p.buckets.at(-1) as string, p.bucket)}</span>
      </div>
    </div>
  );
}

function MiniBars({ s, sel }: { s: Strip; sel: number | null }) {
  const n = s.values.length;
  const top = niceMax(
    Math.max(0, ...s.values.map((v) => v ?? 0), ...(s.targets ?? []).map((t) => t ?? 0)),
  );
  const H = 40;
  return (
    <svg
      viewBox={`0 0 ${n * 10} ${H}`}
      preserveAspectRatio="none"
      className="block h-10 w-full"
      aria-hidden="true"
    >
      <path
        d={`M0 ${H - 0.5}H${n * 10}`}
        className="stroke-line"
        vectorEffect="non-scaling-stroke"
      />
      {s.values.map((v, i) => {
        if (v == null || v <= 0) return null;
        const h = (v / top) * H;
        return (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: buckets are positional
            key={i}
            x={i * 10 + 1.5}
            width={7}
            y={H - h}
            height={h}
            className={cx(
              meets(s, i) === false ? "fill-ink-3" : "fill-ink",
              sel !== null && sel !== i && "opacity-35",
            )}
          />
        );
      })}
    </svg>
  );
}

/** Variant A: a small bar chart per feature. */
function Strips(props: LayoutProps) {
  return <Shared {...props} cell={(s, sel) => <MiniBars s={s} sel={sel} />} />;
}

/** Variant B: a features × buckets grid, each cell shaded by how close it came to the target. */
function Matrix(props: LayoutProps) {
  return (
    <Shared
      {...props}
      cell={(s, sel) => {
        const max = Math.max(1, ...s.values.map((v) => v ?? 0));
        return (
          <div className="flex h-10 w-full gap-px">
            {s.values.map((v, i) => {
              const t = s.targets?.[i];
              const ratio = v == null ? 0 : Math.min(1, t ? v / t : v / max);
              const pct = v == null || v <= 0 ? 0 : Math.round(20 + ratio * 80);
              return (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: buckets are positional
                  key={i}
                  className={cx("flex-1 rounded-[2px]", sel !== null && sel !== i && "opacity-35")}
                  style={{
                    background: pct
                      ? `color-mix(in oklab, var(--color-ink) ${pct}%, var(--color-surface))`
                      : "var(--color-surface)",
                  }}
                />
              );
            })}
          </div>
        );
      }}
    />
  );
}

/** Variant C: one card per feature, two per row; a card opens the feature's stats. */
function Cards({ list }: LayoutProps) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {list.map((s) => (
        <Link key={s.key} to={s.to} className="rounded-md bg-surface p-3 active:opacity-70">
          <div className="text-[13px] text-ink-2">{s.label}</div>
          <div className="num mt-1 text-[22px] leading-tight font-semibold">
            {s.value == null ? "–" : s.format(s.value)}
            <span className="text-[13px] font-normal text-ink-2"> {s.unit}</span>
          </div>
          <div className="mt-2">
            <MiniBars s={s} sel={null} />
          </div>
        </Link>
      ))}
    </div>
  );
}
