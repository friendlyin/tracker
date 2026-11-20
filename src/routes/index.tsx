import { createFileRoute, Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import type { NutritionDayStatusDto } from "../../shared/nutrition/types";
import type { HomeDto } from "../../shared/profile";
import { useVariant } from "../dev/variants";
import { FocusTile } from "../features/focus/HomeTile";
import { HabitsTile } from "../features/habits/HomeTile";
import { kcalLine, proteinLine } from "../features/nutrition/Summary";
import { useHome } from "../features/profile";
import { WaterTile } from "../features/water/HomeTile";
import { fmtSets } from "../lib/format";
import { cx } from "../ui/cx";
import { ChartIcon, CheckIcon, PersonIcon } from "../ui/icons";
import { ProgressBar } from "../ui/ProgressBar";
import { IconLink } from "../ui/Screen";
import { SyncState } from "../ui/SyncState";

export const Route = createFileRoute("/")({ component: Home });

interface Widget {
  key: string;
  label: string;
  to?: "/workouts" | "/nutrition";
  /** Custom tile body; otherwise value + unit + progress. */
  body?: ReactNode;
  value?: ReactNode;
  unit?: string;
  progress?: { value: number; max: number };
  live?: boolean;
  /** Renders its own tile (water and focus have one-tap buttons inside). */
  tile?: ComponentType<{ className: string }>;
}

/** kcal and protein as two equal numbers with their own bars. */
function NutritionTile({ s }: { s: NutritionDayStatusDto }) {
  return (
    <div className="space-y-3">
      {[kcalLine(s), proteinLine(s)].map((l) => (
        <div key={l.unit}>
          <div className="flex items-baseline gap-1.5">
            <span
              className={cx(
                "num text-[26px] leading-none font-semibold",
                l.tone === "warn" && "text-warn",
                l.tone === "ok" && "text-ok",
              )}
            >
              {l.value}
            </span>
            <span className="text-[12px] text-ink-2">
              {l.unit.startsWith("kcal") ? "kcal" : "g"}
            </span>
            {l.tone === "ok" && <CheckIcon className="size-4 text-ok" />}
            {l.tone === "warn" && <span className="text-[12px] text-warn">over</span>}
          </div>
          <ProgressBar className="mt-1.5" value={l.consumed} max={l.target} tone={l.tone} />
        </div>
      ))}
    </div>
  );
}

function widgets(home: HomeDto | undefined): Widget[] {
  const w = home?.workouts;
  const n = home?.nutrition;
  return [
    {
      key: "workouts",
      label: "Workouts",
      to: "/workouts",
      value: w ? fmtSets(w.remaining) : "–",
      unit: w ? `of ${w.target} sets left` : undefined,
      progress: w ? { value: w.done, max: w.target } : undefined,
      live: w?.active,
    },
    {
      key: "nutrition",
      label: "Nutrition",
      to: "/nutrition",
      body: n ? <NutritionTile s={n} /> : undefined,
      value: n ? undefined : "–",
    },
    { key: "water", label: "Water", tile: WaterTile },
    { key: "focus", label: "Focus", tile: FocusTile },
    { key: "habits", label: "Habits", tile: HabitsTile },
  ];
}

function WidgetShell({
  w,
  className,
  children,
}: {
  w: Widget;
  className?: string;
  children: ReactNode;
}) {
  if (!w.to) {
    return <div className={cx(className, "text-ink-3")}>{children}</div>;
  }
  return (
    <Link to={w.to} className={cx(className, "active:opacity-70")}>
      {children}
    </Link>
  );
}

function Label({ w }: { w: Widget }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-medium">
      {w.label}
      {w.live && <span className="size-2 rounded-full bg-warn" title="in progress" />}
    </div>
  );
}

/** 2-column grid of square tiles. */
const tileClass = "flex aspect-square flex-col justify-between rounded-md bg-surface p-4";

function Tiles({ items }: { items: Widget[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((w) =>
        w.tile ? (
          <w.tile key={w.key} className={tileClass} />
        ) : (
          <WidgetShell key={w.key} w={w} className={tileClass}>
            <Label w={w} />
            {w.body ? (
              w.body
            ) : w.value !== undefined ? (
              <div>
                <div className="num text-[40px] leading-none font-semibold">{w.value}</div>
                <div className="mt-1 text-[13px] text-ink-2">{w.unit}</div>
                {w.progress && <ProgressBar className="mt-3" {...w.progress} />}
              </div>
            ) : (
              <div className="text-[13px]">soon</div>
            )}
          </WidgetShell>
        ),
      )}
    </div>
  );
}

const todayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function Home() {
  const home = useHome();
  const entry = useVariant("home.overview", { icon: "icon", tile: "tile" });
  return (
    <div className="min-h-dvh px-4">
      <header className="pt-safe relative flex h-[calc(56px+max(env(safe-area-inset-top),12px))] items-center justify-between">
        <span className="text-[15px] text-ink-2">{todayFmt.format(new Date())}</span>
        <div className="-mr-2 flex items-center">
          <SyncState />
          {entry === "icon" && (
            <IconLink to="/stats" label="Overview">
              <ChartIcon />
            </IconLink>
          )}
          <IconLink to="/settings" label="Profile and settings">
            <PersonIcon />
          </IconLink>
        </div>
      </header>
      <Tiles items={widgets(home.data)} />
      {entry === "tile" && (
        <Link
          to="/stats"
          className="mt-2 flex h-14 items-center justify-between rounded-md bg-surface px-4 active:opacity-70"
        >
          <span className="text-[15px]">Overview</span>
          <ChartIcon className="text-ink-2" />
        </Link>
      )}
    </div>
  );
}
