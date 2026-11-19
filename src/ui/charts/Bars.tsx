import type { ReactNode } from "react";
import { cx } from "../cx";
import { niceMax, useScrub } from "./scrub";

type Values = (number | null)[];

interface BarsProps {
  values: Values;
  /** Target per bucket, drawn as a dashed step line; bars short of it are drawn lighter. */
  targets?: Values;
  better?: "higher" | "lower" | "none";
  /** What the selected bucket shows above the chart; `null` when nothing is selected. */
  readout: (i: number | null) => ReactNode;
  /** Labels under the first and last bar. */
  axis: [string, string];
  format: (v: number) => string;
  height?: number;
  /** A second tap on the selected bar (e.g. open that day). */
  onOpen?: (i: number) => void;
}

const meets = (better: BarsProps["better"], v: number, t: number) =>
  better === "higher" ? v >= t : v <= t;

/** One bar per bucket against an optional target. */
export function Bars({
  values,
  targets,
  better = "higher",
  readout,
  axis,
  format,
  height = 120,
  onOpen,
}: BarsProps) {
  const n = values.length;
  const scrub = useScrub((f) => Math.min(n - 1, Math.floor(f * n)));
  const sel = scrub.selected;
  const top = niceMax(
    Math.max(0, ...values.map((v) => v ?? 0), ...(targets ?? []).map((t) => t ?? 0)),
  );
  const y = (v: number) => height - (v / top) * height;

  let target = "";
  targets?.forEach((t, i) => {
    if (t === null) return;
    target += `M${i * 10} ${y(t)}H${(i + 1) * 10}`;
  });

  return (
    <div>
      <div className="flex h-6 items-baseline justify-between text-[13px]">
        <span className="num truncate">{readout(sel)}</span>
        {sel !== null && onOpen && (
          <button
            type="button"
            onClick={() => onOpen(sel)}
            className="-my-2 h-10 px-1 text-[13px] text-ink-2 active:opacity-60"
          >
            Open
          </button>
        )}
      </div>
      <div className="relative" {...scrub.handlers}>
        <span className="num pointer-events-none absolute top-0 right-0 -translate-y-full text-[11px] text-ink-3">
          {sel === null ? format(top) : ""}
        </span>
        <svg
          viewBox={`0 0 ${n * 10} ${height}`}
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height }}
          aria-hidden="true"
        >
          <path
            d={`M0 ${height - 0.5}H${n * 10}`}
            className="stroke-line"
            vectorEffect="non-scaling-stroke"
          />
          {values.map((v, i) => {
            if (v === null || v <= 0) return null;
            const t = targets?.[i];
            const short = t !== null && t !== undefined && !meets(better, v, t);
            return (
              <rect
                // biome-ignore lint/suspicious/noArrayIndexKey: buckets are positional
                key={i}
                x={i * 10 + (n > 40 ? 1 : 1.5)}
                width={n > 40 ? 8 : 7}
                y={y(v)}
                height={height - y(v)}
                className={cx(
                  short ? "fill-ink-3" : "fill-ink",
                  sel !== null && sel !== i && "opacity-35",
                )}
              />
            );
          })}
          {target && (
            <path
              d={target}
              fill="none"
              className="stroke-ink-2"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
      <div className="num mt-1 flex justify-between text-[11px] text-ink-3">
        <span>{axis[0]}</span>
        <span>{axis[1]}</span>
      </div>
    </div>
  );
}
