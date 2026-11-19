/** A tiny line for list rows: shape only, no axes. */
export function Spark({
  values,
  width = 64,
  height = 24,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span style={{ width }} className="inline-block" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (v: number) => 2 + (1 - (v - min) / (max - min || 1)) * (height - 4);
  const d = values
    .map((v, i) => `${i ? "L" : "M"}${(i / (values.length - 1)) * width} ${y(v)}`)
    .join("");
  return (
    <svg width={width} height={height} className="shrink-0 overflow-visible" aria-hidden="true">
      <path d={d} fill="none" className="stroke-ink-2" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
