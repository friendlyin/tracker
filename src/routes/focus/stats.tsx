import { createFileRoute } from "@tanstack/react-router";
import { METRICS, type MetricDef } from "../../../shared/metrics/registry";
import { bucketValues, periodValue } from "../../../shared/metrics/series";
import { useFocusSettings } from "../../features/focus/api";
import { useMetrics } from "../../features/stats/api";
import { MetricSection } from "../../features/stats/MetricSection";
import { StatsScreen } from "../../features/stats/PeriodBar";
import { usePeriod } from "../../features/stats/period";
import { fmtAxis, fmtBucket, fmtDay, fmtInt, fmtNum } from "../../lib/format";
import { Heatmap } from "../../ui/charts/Heatmap";
import { Line } from "../../ui/charts/Line";
import { Row, SectionLabel } from "../../ui/Row";

export const Route = createFileRoute("/focus/stats")({ component: FocusStats });

const M = METRICS;
const IDS = [
  M.focusDeep,
  M.focusDeepSessions,
  M.focusModerate,
  M.focusUnfocus,
  M.focusMinEnergy,
  M.focusLowSuggest,
  M.focusLowRecommend,
  M.focusLowUrgent,
  M.sleepQuality,
].map((m) => m.id);

const SLEEP = ["", "Bad", "OK", "Good"];
const fmtHours = (min: number) =>
  `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, "0")}`;

function FocusStats() {
  const { period: p, today } = usePeriod();
  const rows = useMetrics(IDS, p).data?.rows ?? [];
  const thresholds = useFocusSettings().data?.thresholds;
  const avg = (def: MetricDef, dimension?: string) =>
    periodValue(rows, def, p, { today, mode: "daily", dimension });

  // Lowest energy of the day (or the bucket's average low): a line against the thresholds.
  const lows = bucketValues(rows, M.focusMinEnergy, p, { today });
  const lowPoints = lows.flatMap((v, i) =>
    v === null ? [] : [{ x: p.buckets.length > 1 ? i / (p.buckets.length - 1) : 0.5, y: v, i }],
  );
  const tags = [
    ...new Set(rows.filter((r) => r.metric === M.focusModerate.id).map((r) => r.dimension)),
  ];
  const sleep = bucketValues(rows, M.sleepQuality, p, { today });

  return (
    <StatsScreen back="/focus" title="Focus">
      <MetricSection def={M.focusDeep} rows={rows} p={p} today={today} unit="h" format={fmtHours}>
        <div className="mt-2 flex justify-between text-[13px] text-ink-2">
          <span>Sessions</span>
          <span className="num">{fmtNum(avg(M.focusDeepSessions) ?? 0)} a day</span>
        </div>
      </MetricSection>

      <section className="mt-2">
        <SectionLabel>{M.focusMinEnergy.label}</SectionLabel>
        <Line
          series={[{ id: "low", tone: "ink", dots: true, points: lowPoints }]}
          guides={thresholds ? [thresholds.suggest, thresholds.recommend, thresholds.urgent] : []}
          domain={[0, 100]}
          format={fmtInt}
          axis={[
            fmtAxis(p.buckets[0] as string, p.bucket),
            fmtAxis(p.buckets.at(-1) as string, p.bucket),
          ]}
          readout={(i) => {
            const pt = i === null ? undefined : lowPoints[i];
            return pt
              ? `${fmtBucket(p.buckets[pt.i] as string, p.bucket)} · ${fmtInt(pt.y)}`
              : null;
          }}
        />
        <div className="mt-3">
          {(
            [
              [M.focusLowSuggest, thresholds?.suggest],
              [M.focusLowRecommend, thresholds?.recommend],
              [M.focusLowUrgent, thresholds?.urgent],
            ] as [MetricDef, number | undefined][]
          ).map(([def, level]) => {
            const v = avg(def);
            return (
              <Row key={def.id}>
                <span className="num flex-1 text-[15px] text-ink-2">≤ {level ?? ""}</span>
                <span className="num text-[15px]">
                  {v === null ? "–" : fmtHours(v)}
                  <span className="text-ink-2"> h a day</span>
                </span>
              </Row>
            );
          })}
        </div>
      </section>

      {tags.length > 0 && (
        <section className="mt-2">
          <SectionLabel>{M.focusModerate.label}</SectionLabel>
          {tags.map((t) => (
            <Row key={t}>
              <span className="flex-1 text-[15px]">{t || "–"}</span>
              <span className="num text-[15px]">
                {fmtHours(periodValue(rows, M.focusModerate, p, { today, dimension: t }) ?? 0)}
              </span>
            </Row>
          ))}
          <Row>
            <span className="flex-1 text-[15px]">{M.focusUnfocus.label}</span>
            <span className="num text-[15px]">
              {fmtHours(periodValue(rows, M.focusUnfocus, p, { today }) ?? 0)}
            </span>
          </Row>
        </section>
      )}

      <section className="mt-2">
        <SectionLabel>{M.sleepQuality.label}</SectionLabel>
        {p.bucket === "day" ? (
          <Heatmap
            from={p.buckets[0] as string}
            values={sleep}
            max={3}
            today={today}
            readout={(i) =>
              i === null
                ? null
                : `${fmtDay(p.buckets[i] as string)} · ${SLEEP[sleep[i] ?? 0] || "–"}`
            }
          />
        ) : (
          <div className="num text-[15px]">
            {fmtNum(periodValue(rows, M.sleepQuality, p, { today }) ?? 0)}
            <span className="text-ink-2"> / 3</span>
          </div>
        )}
      </section>
    </StatsScreen>
  );
}
