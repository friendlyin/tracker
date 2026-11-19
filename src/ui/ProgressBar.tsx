import { cx } from "./cx";

/** Flat bar; the part beyond the target is not drawn. `tone` colors the fill. */
export function ProgressBar({
  value,
  max,
  tone = "accent",
  className,
}: {
  value: number;
  max: number;
  tone?: "accent" | "ok" | "warn";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx("h-1.5 w-full bg-line", className)}>
      <div
        className={cx(
          "h-full",
          tone === "accent" && "bg-accent",
          tone === "ok" && "bg-ok",
          tone === "warn" && "bg-warn",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
