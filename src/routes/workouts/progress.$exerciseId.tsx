import { createFileRoute, Link } from "@tanstack/react-router";
import { daysBetween } from "../../../shared/metrics/periods";
import { topSet } from "../../../shared/workouts/strength";
import { useExerciseSessions, useProgression } from "../../features/stats/api";
import { StatsScreen } from "../../features/stats/PeriodBar";
import { usePeriod } from "../../features/stats/period";
import { useExercises } from "../../features/workouts/api";
import { fmtAxis, fmtDay, fmtNum, fmtPct, fmtSet } from "../../lib/format";
import { Line, type LineSeries } from "../../ui/charts/Line";
import { cx } from "../../ui/cx";
import { ChevronIcon } from "../../ui/icons";

export const Route = createFileRoute("/workouts/progress/$exerciseId")({ component: Progress });

/** One exercise over the period: best e1RM (or reps) per session, its trend and the top sets. */
function Progress() {
  const { exerciseId } = Route.useParams();
  const { period: p } = usePeriod();
  const progression = useProgression(p);
  const name = useExercises().data?.find((e) => e.id === exerciseId)?.name;
  const ex = progression.data?.exercises.find((e) => e.exerciseId === exerciseId);
  const sessions = (useExerciseSessions(exerciseId).data ?? []).filter(
    (s) => s.localDate >= p.from && s.localDate <= p.to,
  );

  const span = daysBetween(p.from, p.to) - 1 || 1;
  const xOf = (date: string) => (daysBetween(p.from, date) - 1) / span;
  const unit = ex?.measure === "reps" ? "reps" : "kg";
  const series: LineSeries[] = [];
  if (ex) {
    series.push({
      id: "best",
      tone: "ink",
      dots: true,
      points: ex.points.map((x) => ({ x: xOf(x.date), y: x.value })),
    });
    const first = ex.points[0];
    const last = ex.points.at(-1);
    if (ex.trend && first && last) {
      series.push({
        id: "trend",
        tone: "ink-3",
        dashed: true,
        points: [
          { x: xOf(first.date), y: ex.trend.start },
          { x: xOf(last.date), y: ex.trend.end },
        ],
      });
    }
    if (ex.measure === "e1rm") {
      series.push({
        id: "top",
        tone: "ink-3",
        dots: true,
        points: ex.topSets.map((x) => ({ x: xOf(x.date), y: x.value })),
      });
    }
  }

  return (
    <StatsScreen back="/workouts/stats" title={ex?.name ?? name ?? ""}>
      {ex?.trend ? (
        <div className="mt-2 flex items-baseline gap-2">
          <span className="num text-[34px] leading-none font-semibold">{fmtNum(ex.trend.end)}</span>
          <span className="text-[15px] text-ink-2">{unit}</span>
          <span
            className={cx(
              "num ml-auto text-[17px]",
              ex.trend.changePct >= 0.5
                ? "text-ok"
                : ex.trend.changePct <= -0.5
                  ? "text-warn"
                  : "text-ink-2",
            )}
          >
            {fmtPct(ex.trend.changePct)}
          </span>
        </div>
      ) : (
        <div className="mt-2 h-[34px] text-[15px] text-ink-3">
          {ex ? "3+ sessions for a trend" : "–"}
        </div>
      )}
      <div className="mt-1 text-[13px] text-ink-2">
        {ex?.measure === "reps" ? "Best reps" : "Estimated 1RM"}
      </div>

      {ex && (
        <div className="mt-5">
          <Line
            series={series}
            format={fmtNum}
            axis={[fmtAxis(p.from, "day"), fmtAxis(p.to, "day")]}
            readout={(i) => {
              const pt = i === null ? undefined : ex.points[i];
              if (!pt) return null;
              const top = ex.topSets.find((t) => t.date === pt.date);
              return `${fmtDay(pt.date)} · ${fmtNum(pt.value)} ${unit}${top ? ` · top ${fmtNum(top.value)} kg` : ""}`;
            }}
          />
        </div>
      )}

      {sessions.length > 0 && (
        <div className="mt-6 border-t border-line">
          {sessions.map((s) => {
            const working = s.sets.filter((x) => x.kind === "working");
            const best = topSet(working) ?? [...working].sort((a, b) => b.reps - a.reps)[0];
            return (
              <Link
                key={s.workoutId}
                to="/workouts/history/$workoutId"
                params={{ workoutId: s.workoutId }}
                className="flex min-h-12 items-center gap-3 border-b border-line active:opacity-60"
              >
                <span className="w-24 shrink-0 text-[15px]">{fmtDay(s.localDate)}</span>
                <span className="num min-w-0 flex-1 truncate text-[15px] text-ink-2">
                  {best ? fmtSet(best) : ""}
                  <span className="text-ink-3"> · {working.length}</span>
                </span>
                <ChevronIcon className="text-ink-3" width={18} height={18} />
              </Link>
            );
          })}
        </div>
      )}
    </StatsScreen>
  );
}
