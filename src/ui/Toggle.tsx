import { cx } from "./cx";

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-7 w-12 rounded-full", checked ? "bg-ink" : "bg-line")}
    >
      <span
        className={cx(
          "absolute top-1 size-5 rounded-full bg-paper transition-[left] duration-150",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
  );
}
