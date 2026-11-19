import { cx } from "./cx";

/** Flat bar; the part beyond the target is not drawn. `tone` colors the fill. */
export function ProgressBar({
  value,
  max,
  tone = "accent",
  marker,
  className,
}: {
  value: number;
  max: number;
  tone?: "accent" | "ok" | "warn";
  /** Optional tick (e.g. where today's target ends). */
  marker?: number;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const markerPct = marker !== undefined && max > 0 ? Math.min(100, (marker / max) * 100) : null;
  return (
    <div className={cx("relative h-1.5 w-full bg-line", className)}>
      <div
        className={cx(
          "h-full",
          tone === "accent" && "bg-accent",
          tone === "ok" && "bg-ok",
          tone === "warn" && "bg-warn",
        )}
        style={{ width: `${pct}%` }}
      />
      {markerPct !== null && (
        <div className="absolute -top-1 h-3.5 w-0.5 bg-ink-3" style={{ left: `${markerPct}%` }} />
      )}
    </div>
  );
}
