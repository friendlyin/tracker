import { useEffect, useState } from "react";
import { cx } from "./cx";
import { MinusIcon, PlusIcon } from "./icons";

/** − value + with a typeable center field (numeric keypad on phones). */
export function Stepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  unit,
  decimal = false,
  placeholder = "–",
  size = "md",
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  decimal?: boolean;
  placeholder?: string;
  size?: "md" | "lg";
  label: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  useEffect(() => setText(value === null ? "" : String(value)), [value]);

  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n * 100) / 100));
  const bump = (d: number) => onChange(clamp((value ?? 0) + d));

  const btn = cx(
    "grid shrink-0 place-items-center rounded-md bg-surface text-ink active:opacity-60",
    size === "lg" ? "size-14" : "size-11",
  );

  return (
    <div className="flex items-center gap-2">
      <button type="button" className={btn} onClick={() => bump(-step)} aria-label={`${label} −`}>
        <MinusIcon />
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <input
          aria-label={label}
          inputMode={decimal ? "decimal" : "numeric"}
          className={cx(
            "num w-full min-w-0 bg-transparent text-center font-semibold outline-none placeholder:text-ink-3",
            size === "lg" ? "text-[32px]" : "text-[22px]",
          )}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value.replace(",", ".");
            setText(t);
            if (t === "") return onChange(null);
            const n = Number(t);
            if (Number.isFinite(n)) onChange(clamp(n));
          }}
          onFocus={(e) => e.target.select()}
        />
        {unit && <span className="-mt-0.5 text-[12px] leading-none text-ink-3">{unit}</span>}
      </label>
      <button type="button" className={btn} onClick={() => bump(step)} aria-label={`${label} +`}>
        <PlusIcon />
      </button>
    </div>
  );
}
