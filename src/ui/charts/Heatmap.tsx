import { type ReactNode, useState } from "react";
import { addDays, isoWeekday } from "../../../shared/time";
import { cx } from "../cx";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Ink at increasing strength over the surface; 0 stays the plain surface. */
const shade = (level: number) =>
  level <= 0
    ? "var(--color-surface)"
    : `color-mix(in oklab, var(--color-ink) ${[0, 30, 55, 80, 100][level]}%, var(--color-surface))`;

/**
 * A calendar of the days from `from`: rows are weeks (Monday first), each day shaded by its value.
 * Tapping a day selects it; tapping it again opens it.
 */
export function Heatmap({
  from,
  values,
  max,
  today,
  readout,
  onOpen,
}: {
  from: string;
  values: (number | null)[];
  /** The value drawn at full strength. */
  max: number;
  today: string;
  readout: (i: number | null) => ReactNode;
  onOpen?: (i: number) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const lead = isoWeekday(from) - 1;
  const level = (v: number | null) =>
    v === null || v <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((v / (max || 1)) * 4)));

  return (
    <div>
      <div className="flex h-6 items-baseline text-[13px]">
        <span className="num truncate">{readout(sel)}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed weekday header
          <span key={i} className="text-center text-[11px] text-ink-3">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: empty leading cells
          <span key={`lead${i}`} />
        ))}
        {values.map((v, i) => {
          const date = addDays(from, i);
          const future = date > today;
          return (
            <button
              key={date}
              type="button"
              disabled={future}
              aria-label={date}
              aria-pressed={sel === i}
              onClick={() => (sel === i && onOpen ? onOpen(i) : setSel(sel === i ? null : i))}
              className={cx(
                "aspect-square rounded-sm",
                future && "opacity-40",
                sel === i && "outline-2 outline-offset-1 outline-ink",
                date === today && sel !== i && "outline-1 outline-offset-1 outline-ink-3",
              )}
              style={{ background: shade(level(v)) }}
            />
          );
        })}
      </div>
    </div>
  );
}
