import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { METRICS, type MetricDef } from "../../../shared/metrics/registry";
import { periodValue } from "../../../shared/metrics/series";
import { useMetrics } from "../../features/stats/api";
import { MetricSection } from "../../features/stats/MetricSection";
import { StatsScreen } from "../../features/stats/PeriodBar";
import { usePeriod } from "../../features/stats/period";
import { fmtInt } from "../../lib/format";
import { Row } from "../../ui/Row";

export const Route = createFileRoute("/nutrition/stats")({ component: NutritionStats });

const M = METRICS;
const IDS = [M.kcal, M.kcalTarget, M.protein, M.proteinTarget, M.fat, M.carbs].map((m) => m.id);

/** Daily averages over logged days against the targets that applied. */
function NutritionStats() {
  const { period: p, today } = usePeriod();
  const rows = useMetrics(IDS, p).data?.rows ?? [];
  const navigate = useNavigate();
  const openDay = (date: string) => navigate({ to: "/nutrition", search: { date } });
  const avg = (def: MetricDef) => periodValue(rows, def, p, { today, mode: "daily" });

  return (
    <StatsScreen back="/nutrition" title="Nutrition">
      <MetricSection
        def={M.kcal}
        rows={rows}
        p={p}
        today={today}
        unit="kcal"
        format={fmtInt}
        onOpenDay={openDay}
      />
      <MetricSection
        def={M.protein}
        rows={rows}
        p={p}
        today={today}
        unit="g"
        format={fmtInt}
        onOpenDay={openDay}
      />
      <div className="mt-6 border-t border-line">
        {[M.fat, M.carbs].map((def) => {
          const v = avg(def);
          return (
            <Row key={def.id}>
              <span className="flex-1 text-[15px]">{def.label}</span>
              <span className="num text-[15px]">
                {v === null ? "–" : fmtInt(v)}
                <span className="text-ink-2"> g a day</span>
              </span>
            </Row>
          );
        })}
      </div>
    </StatsScreen>
  );
}
