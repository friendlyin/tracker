import { createFileRoute } from "@tanstack/react-router";
import { METRICS } from "../../../shared/metrics/registry";
import { useMetrics } from "../../features/stats/api";
import { MetricSection } from "../../features/stats/MetricSection";
import { StatsScreen } from "../../features/stats/PeriodBar";
import { usePeriod } from "../../features/stats/period";
import { fmtInt } from "../../lib/format";

export const Route = createFileRoute("/water/stats")({ component: WaterStats });

const M = METRICS;
const IDS = [M.waterIntake, M.waterTarget, M.waterAtCap].map((m) => m.id);

const fmtMin = (min: number) =>
  min < 60
    ? `${Math.round(min)}`
    : `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

/** Intake against the target, and how long the pending water sat at its cap (less is better). */
function WaterStats() {
  const { period: p, today } = usePeriod();
  const rows = useMetrics(IDS, p).data?.rows ?? [];
  return (
    <StatsScreen back="/water" title="Water">
      <MetricSection
        def={M.waterIntake}
        label="Intake"
        rows={rows}
        p={p}
        today={today}
        unit="ml"
        format={fmtInt}
      />
      <MetricSection
        def={M.waterAtCap}
        rows={rows}
        p={p}
        today={today}
        unit={rows.some((r) => r.metric === M.waterAtCap.id && r.sum >= 60) ? "h" : "min"}
        format={fmtMin}
      />
    </StatsScreen>
  );
}
