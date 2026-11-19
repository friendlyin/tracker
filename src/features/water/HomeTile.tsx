import { Link } from "@tanstack/react-router";
import type { WaterStateDto } from "../../../shared/water/types";
import { fmtInt } from "../../lib/format";
import { cx } from "../../ui/cx";
import { ProgressBar } from "../../ui/ProgressBar";
import { useDrink, useWaterDay, useWaterState } from "./api";
import { Credit } from "./Summary";

// Home tile with its own one-tap button: a glass from home is one tap. The tile opens /water; the
// button sits above the link (a button inside a link is invalid HTML).

/** What is due now as the big number, today's total below it. */
function Body({ s }: { s: WaterStateDto }) {
  return (
    <div>
      <div className="flex items-baseline gap-1.5">
        <span className="num text-[40px] leading-none font-semibold">{fmtInt(s.pendingMl)}</span>
        <span className="text-[12px]">ml due</span>
      </div>
      <div className="mt-1 h-4 text-[12px]">
        <Credit s={s} />
      </div>
      <ProgressBar className="mt-2" value={s.totalMl} max={s.targetMl} />
      <div className="num mt-1 text-[12px] opacity-70">
        {fmtInt(s.totalMl)} / {fmtInt(s.targetMl)}
      </div>
    </div>
  );
}

export function WaterTile({ className }: { className: string }) {
  const s = useWaterState();
  const day = useWaterDay();
  const drink = useDrink();
  const quick = day.data?.settings.quickMl[0] ?? 250;
  const urgent = s?.state === "urgent";

  return (
    <div className={cx(className, "relative", urgent && "bg-warn text-on-ink")}>
      <Link
        to="/water"
        aria-label="Water"
        className="absolute inset-0 rounded-md active:bg-ink/5"
      />
      <div className="pointer-events-none flex items-center justify-between">
        <span className="text-[15px] font-medium">Water</span>
        <button
          type="button"
          onClick={() => drink.log(quick)}
          className={cx(
            "num pointer-events-auto relative -mt-2 -mr-2 h-11 rounded-md px-3 text-[15px] font-semibold active:opacity-60",
            urgent ? "bg-paper text-ink" : "bg-paper",
          )}
        >
          +{quick}
        </button>
      </div>
      <div className="pointer-events-none">{s ? <Body s={s} /> : "–"}</div>
    </div>
  );
}
