import type { LevelPoint } from "../../shared/level/engine";

/**
 * A level timeline as a flat line over [from, to] (the future part stays empty), with horizontal
 * guide lines (thresholds, bounds).
 */
export function LevelCurve({
  points,
  from,
  to,
  min,
  max,
  guides = [],
  className = "h-20",
}: {
  points: readonly LevelPoint[];
  from: number;
  to: number;
  min: number;
  max: number;
  guides?: number[];
  className?: string;
}) {
  const W = 320;
  const H = 80;
  if (points.length === 0 || to <= from) return null;
  const x = (t: number) => ((Math.min(to, Math.max(from, t)) - from) / (to - from)) * W;
  const y = (v: number) => ((max - v) / (max - min)) * H;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.level).toFixed(1)}`);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={`w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {guides.map((g) => (
        <line
          key={g}
          x1="0"
          x2={W}
          y1={y(g)}
          y2={y(g)}
          className="stroke-line"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path
        d={d.join("")}
        fill="none"
        className="stroke-ink"
        strokeWidth="2"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
