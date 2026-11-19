import { type PointerEvent, useState } from "react";

// Charts have no hover: a tap selects the bucket under the finger, sliding sideways moves the
// selection (vertical swipes still scroll the page), and tapping the selection again clears it.

export function useScrub(pick: (fraction: number) => number | null) {
  const [selected, setSelected] = useState<number | null>(null);
  const [startedOn, setStartedOn] = useState<number | null>(null);

  const at = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return pick(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };

  return {
    selected,
    clear: () => setSelected(null),
    handlers: {
      style: { touchAction: "pan-y" } as const,
      onPointerDown(e: PointerEvent<HTMLElement>) {
        e.currentTarget.setPointerCapture(e.pointerId);
        const i = at(e);
        setStartedOn(selected);
        setSelected(i);
      },
      onPointerMove(e: PointerEvent<HTMLElement>) {
        if (e.buttons === 0 && e.pointerType === "mouse") return;
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        setSelected(at(e));
      },
      onPointerUp(e: PointerEvent<HTMLElement>) {
        const i = at(e);
        if (i !== null && i === startedOn) setSelected(null);
        setStartedOn(null);
      },
    },
  };
}

/** Nice upper bound for an axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
