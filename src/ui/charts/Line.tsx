import type { ReactNode } from "react";
import { cx } from "../cx";
import { useScrub } from "./scrub";

export interface LinePoint {
  /** 0–1 across the chart. */
  x: number;
  y: number;
}

export interface LineSeries {
  id: string;
  points: LinePoint[];
  tone: "ink" | "ink-2" | "ink-3";
  dots?: boolean;
  dashed?: boolean;
}

interface LineProps {
  /** The first series is the one taps select points of. */
  series: LineSeries[];
  /** Horizontal guide lines (thresholds, a target). */
  guides?: number[];
  readout: (i: number | null) => ReactNode;
  axis: [string, string];
  format: (v: number) => string;
  height?: number;
  /** Fixed y range; by default it fits the data with a little room. */
  domain?: [number, number];
}

const W = 1000;

export function Line({
  series,
  guides = [],
  readout,
  axis,
  format,
  height = 140,
  domain,
}: LineProps) {
  const main = series[0]?.points ?? [];
  const scrub = useScrub((f) => {
    if (main.length === 0) return null;
    let best = 0;
    main.forEach((p, i) => {
      if (Math.abs(p.x - f) < Math.abs((main[best] as LinePoint).x - f)) best = i;
    });
    return best;
  });
  const sel = scrub.selected;

  const ys = [...series.flatMap((s) => s.points.map((p) => p.y)), ...guides];
  const [lo, hi] = domain ?? fitDomain(ys);
  const pad = 6;
  const y = (v: number) => pad + (1 - (v - lo) / (hi - lo || 1)) * (height - 2 * pad);
  const x = (f: number) => f * W;
  const selPoint = sel === null ? undefined : main[sel];

  return (
    <div>
      <div className="flex h-6 items-baseline text-[13px]">
        <span className="num truncate">{readout(sel)}</span>
      </div>
      <div className="relative" {...scrub.handlers}>
        <span className="num pointer-events-none absolute top-0 right-0 -translate-y-full text-[11px] text-ink-3">
          {sel === null ? format(hi) : ""}
        </span>
        <svg
          viewBox={`0 0 ${W} ${height}`}
          preserveAspectRatio="none"
          className="block w-full overflow-visible"
          style={{ height }}
          aria-hidden="true"
        >
          <path
            d={`M0 ${height - 0.5}H${W}`}
            className="stroke-line"
            vectorEffect="non-scaling-stroke"
          />
          {guides.map((g) => (
            <path
              key={g}
              d={`M0 ${y(g)}H${W}`}
              className="stroke-ink-3"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {selPoint && (
            <path
              d={`M${x(selPoint.x)} 0V${height}`}
              className="stroke-ink-3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {series.map((s, si) => (
            <g
              key={s.id}
              className={cx(
                s.tone === "ink"
                  ? "stroke-ink"
                  : s.tone === "ink-2"
                    ? "stroke-ink-2"
                    : "stroke-ink-3",
              )}
            >
              {s.points.length > 1 && (
                <path
                  d={s.points.map((p, i) => `${i ? "L" : "M"}${x(p.x)} ${y(p.y)}`).join("")}
                  fill="none"
                  strokeWidth={s.tone === "ink" ? 2 : 1.5}
                  strokeDasharray={s.dashed ? "4 4" : undefined}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {(s.dots || s.points.length === 1) &&
                s.points.map((p, i) => (
                  // Zero-length round-capped strokes: circles that the stretched viewBox cannot distort.
                  <path
                    // biome-ignore lint/suspicious/noArrayIndexKey: points are positional
                    key={i}
                    d={`M${x(p.x)} ${y(p.y)}h0`}
                    strokeWidth={si === 0 && i === sel ? 10 : 6}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </g>
          ))}
        </svg>
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
      </div>
    </div>
  );
}

function fitDomain(ys: number[]): [number, number] {
  if (ys.length === 0) return [0, 1];
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const room = (max - min || max || 1) * 0.1;
  return [Math.max(0, min - room), max + room];
}
