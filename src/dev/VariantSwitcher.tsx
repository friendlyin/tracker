import { useState } from "react";
import { Segmented } from "../ui/Segmented";
import { Sheet } from "../ui/Sheet";
import { selectVariant, useDevState } from "./variants";

/** Floating button (dev mode only) that switches the variants on the current screen. */
export function VariantSwitcher() {
  const { devMode, mounted, selected } = useDevState();
  const [open, setOpen] = useState(false);
  const keys = Object.keys(mounted).sort();
  if (!devMode) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-1/3 right-0 z-40 grid h-12 w-7 place-items-center rounded-l-md border border-r-0 border-line bg-paper text-[13px] font-semibold text-ink-2"
        aria-label="Design variants"
      >
        {keys.length || "·"}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="mb-4 text-[13px] font-medium text-ink-3">Variants on this screen</div>
        {keys.length === 0 && <div className="pb-6 text-ink-2">None</div>}
        {keys.map((key) => {
          const names = mounted[key] ?? [];
          return (
            <div key={key} className="mb-5">
              <div className="mb-2 font-mono text-[13px] text-ink-2">{key}</div>
              <Segmented
                value={
                  selected[key] && names.includes(selected[key]) ? selected[key] : (names[0] ?? "")
                }
                options={names.map((n) => ({ value: n, label: n }))}
                onChange={(v) => selectVariant(key, v)}
              />
            </div>
          );
        })}
      </Sheet>
    </>
  );
}
