import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PeriodKind } from "../../../shared/metrics/periods";
import { useVariant } from "../../dev/variants";
import { fmtPeriod } from "../../lib/format";
import { cx } from "../../ui/cx";
import { ChevronIcon } from "../../ui/icons";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { usePeriod } from "./period";

const KINDS: { value: PeriodKind; label: string }[] = [
  { value: "week", label: "W" },
  { value: "month", label: "M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "year", label: "Y" },
];

/** Period kind, the shown period and ‹ › to page through periods. */
export function PeriodBar({ className }: { className?: string }) {
  const { period, current, setKind, shift } = usePeriod();
  const arrow = "grid size-11 place-items-center active:opacity-60 disabled:opacity-25";
  return (
    <div className={className}>
      <div className="flex items-center">
        <button
          type="button"
          aria-label="Previous"
          className={cx(arrow, "-ml-3")}
          onClick={() => shift(-1)}
        >
          <ChevronIcon className="rotate-180" />
        </button>
        <span className="num flex-1 text-center text-[15px] font-medium">{fmtPeriod(period)}</span>
        <button
          type="button"
          aria-label="Next"
          className={cx(arrow, "-mr-3")}
          disabled={current}
          onClick={() => shift(1)}
        >
          <ChevronIcon />
        </button>
      </div>
      <Segmented value={period.kind} options={KINDS} onChange={setKind} />
    </div>
  );
}

/** A stats screen: the period selector in thumb reach (footer) or under the title (variant). */
export function StatsScreen(props: {
  title: ReactNode;
  back: LinkProps["to"];
  backParams?: LinkProps["params"];
  right?: ReactNode;
  children: ReactNode;
}) {
  const place = useVariant("stats.period", { footer: "footer", top: "top" });
  const { children, ...screen } = props;
  if (place === "footer") {
    return (
      <Screen {...screen} footer={<PeriodBar className="pb-3" />}>
        {children}
      </Screen>
    );
  }
  return (
    <Screen {...screen}>
      <PeriodBar className="mb-2" />
      {children}
    </Screen>
  );
}
