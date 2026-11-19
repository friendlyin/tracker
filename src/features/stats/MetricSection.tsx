import type { ReactNode } from "react";
import type { Period } from "../../../shared/metrics/periods";
import type { MetricDef } from "../../../shared/metrics/registry";
import { bucketValues, onTarget, periodValue, targetValues } from "../../../shared/metrics/series";
import type { MetricBucketRow } from "../../../shared/metrics/types";
import { fmtAxis, fmtBucket } from "../../lib/format";
import { Bars } from "../../ui/charts/Bars";
import { SectionLabel } from "../../ui/Row";

/**
 * One metric over the period: its daily average (or total), the target, days on target and a bar
 * per bucket. The feature stats screens are lists of these.
 */
export function MetricSection({
  def,
  rows,
  p,
  today,
  label = def.label,
  unit,
  format,
  total = false,
  onOpenDay,
  children,
}: {
  def: MetricDef;
  rows: MetricBucketRow[];
  p: Period;
  today: string;
  label?: string;
  unit: string;
  format: (v: number) => string;
  /** Show totals rather than daily averages. */
  total?: boolean;
  onOpenDay?: (date: string) => void;
  children?: ReactNode;
}) {
  const mode = total || p.bucket === "day" ? "total" : "daily";
  const values = bucketValues(rows, def, p, { today, mode });
  const targets = def.target ? targetValues(rows, def, p, today) : undefined;
  const hasTarget = targets?.some((t) => t !== null);
  const value = periodValue(rows, def, p, { today, mode: total ? "total" : "daily" });
  const lastTarget = targets?.filter((t) => t !== null).at(-1) ?? null;
  const days = hasTarget && p.bucket === "day" && targets ? onTarget(def, values, targets) : null;
  const better = def.better === "none" ? "lower" : def.better;

  return (
    <section className="mt-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-[28px] leading-none font-semibold">
          {value === null ? "–" : format(value)}
        </span>
        <span className="num text-[15px] text-ink-2">
          {lastTarget !== null && hasTarget ? `/ ${format(lastTarget)} ` : ""}
          {unit}
          {!total && def.aggregation === "sum" ? " a day" : ""}
        </span>
        {days && days.of > 0 && (
          <span className="num ml-auto text-[13px] text-ink-2">
            {days.hit}/{days.of} days
          </span>
        )}
      </div>
      <div className="mt-3">
        <Bars
          values={values}
          targets={hasTarget ? targets : undefined}
          better={better}
          format={format}
          axis={[
            fmtAxis(p.buckets[0] as string, p.bucket),
            fmtAxis(p.buckets.at(-1) as string, p.bucket),
          ]}
          readout={(i) => {
            if (i === null) return null;
            const v = values[i];
            const t = targets?.[i];
            const when = fmtBucket(p.buckets[i] as string, p.bucket);
            if (v === null || v === undefined) return `${when} · –`;
            return `${when} · ${format(v)}${hasTarget && t != null ? ` / ${format(t)}` : ""} ${unit}`;
          }}
          onOpen={
            onOpenDay && p.bucket === "day" ? (i) => onOpenDay(p.buckets[i] as string) : undefined
          }
        />
      </div>
      {children}
    </section>
  );
}
