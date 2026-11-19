import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { localDateSchema } from "../../../shared/nutrition/schemas";
import type { MealDto, NutritionDayDto } from "../../../shared/nutrition/types";
import { addDays } from "../../../shared/time";
import { useVariant } from "../../dev/variants";
import { todayLocal, useNutritionDay, useSetDayType } from "../../features/nutrition/api";
import { BarsSummary, BigSummary, RowsSummary } from "../../features/nutrition/Summary";
import { fmtDay, fmtInt, fmtTime } from "../../lib/format";
import { cx } from "../../ui/cx";
import { ChevronIcon, SlidersIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";

export const Route = createFileRoute("/nutrition/")({
  validateSearch: z.object({ date: localDateSchema.optional() }),
  component: NutritionScreen,
});

const dayTypeOptions = [
  { value: "workout" as const, label: "Workout day" },
  { value: "rest" as const, label: "Rest day" },
];

/** Previous / next day in the thumb zone; the date labels are the only text. */
function DayNav({ date, today }: { date: string; today: string }) {
  const to = (d: string) => ({ date: d === today ? undefined : d });
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  const btn = "flex h-11 items-center gap-1 text-[15px] text-ink-2 active:opacity-60";
  return (
    <div className="flex items-center justify-between pb-3">
      <Link to="/nutrition" search={to(prev)} className={cx(btn, "-ml-2")}>
        <ChevronIcon className="rotate-180" />
        {fmtDay(prev)}
      </Link>
      {date < today && (
        <Link to="/nutrition" search={to(next)} className={cx(btn, "-mr-2")}>
          {next === today ? "Today" : fmtDay(next)}
          <ChevronIcon />
        </Link>
      )}
    </div>
  );
}

function DayType({ day }: { day: NutritionDayDto }) {
  const set = useSetDayType(day.date);
  return (
    <div className="mt-2 flex items-center gap-2">
      <Segmented
        className="flex-1"
        value={day.dayType}
        options={dayTypeOptions}
        onChange={(t) => set.mutate(t)}
      />
      {day.dayTypeSource === "manual" && (
        <button
          type="button"
          onClick={() => set.mutate("auto")}
          className="h-11 rounded-md border border-line px-3 text-[15px] text-ink-2 active:opacity-60"
        >
          Auto
        </button>
      )}
    </div>
  );
}

function MealRow({ meal, open, onToggle }: { meal: MealDto; open: boolean; onToggle: () => void }) {
  const hasItems = meal.items.length > 0;
  return (
    <div className="border-b border-line">
      <button
        type="button"
        onClick={onToggle}
        disabled={!hasItems}
        aria-expanded={hasItems ? open : undefined}
        className="flex min-h-13 w-full items-center gap-3 text-left"
      >
        <span className="num w-12 shrink-0 text-[13px] text-ink-3">{fmtTime(meal.eatenAt)}</span>
        <span className="min-w-0 flex-1 truncate text-[17px]">{meal.name}</span>
        <span className="num text-[15px]">{fmtInt(meal.kcal)}</span>
        <span className="num w-12 text-right text-[15px] text-ink-2">
          {fmtInt(meal.proteinG)} g
        </span>
      </button>
      {open && (
        <div className="pb-3 pl-15">
          {meal.items.map((it, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items have no id and never reorder
            <div key={i} className="flex items-baseline gap-3 py-1 text-[13px] text-ink-2">
              <span className="min-w-0 flex-1 truncate">
                {it.name}
                {it.amount && <span className="text-ink-3"> · {it.amount}</span>}
              </span>
              <span className="num">{fmtInt(it.kcal)}</span>
              <span className="num w-12 text-right">{fmtInt(it.proteinG)} g</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Meals({ meals }: { meals: MealDto[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (meals.length === 0) return null;
  return (
    <div className="mt-8">
      <div className="flex justify-end gap-3 pb-1 text-[12px] text-ink-3">
        <span>kcal</span>
        <span className="w-12 text-right">protein</span>
      </div>
      {meals.map((m) => (
        <MealRow
          key={m.id}
          meal={m}
          open={open === m.id}
          onToggle={() => setOpen(open === m.id ? null : m.id)}
        />
      ))}
    </div>
  );
}

function NutritionScreen() {
  const search = Route.useSearch();
  const today = todayLocal();
  const date = search.date && search.date < today ? search.date : today;
  const { data } = useNutritionDay(date);
  const Summary = useVariant("nutrition.summary", {
    bars: BarsSummary,
    big: BigSummary,
    rows: RowsSummary,
  });

  return (
    <Screen
      back="/"
      title={<span className={cx(date !== today && "text-ink-2")}>{fmtDay(date)}</span>}
      right={
        <IconLink to="/nutrition/settings" label="Nutrition targets" className="-mr-1">
          <SlidersIcon />
        </IconLink>
      }
      footer={<DayNav date={date} today={today} />}
    >
      {data && (
        <>
          <DayType day={data} />
          <div className="mt-6">
            <Summary s={data} />
          </div>
          <Meals meals={data.meals} />
        </>
      )}
    </Screen>
  );
}
