import { cx } from "./cx";

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex rounded-md bg-surface p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-10 flex-1 rounded-sm px-2 text-[15px] font-medium",
            o.value === value ? "bg-paper text-ink" : "text-ink-2",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
