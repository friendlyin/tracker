import type { NutritionDayStatusDto } from "../../../shared/nutrition/types";
import { fmtInt } from "../../lib/format";
import { cx } from "../../ui/cx";
import { CheckIcon } from "../../ui/icons";
import { ProgressBar } from "../../ui/ProgressBar";

// Day budget: kcal and protein against today's targets. Over the kcal target is a warning; protein at
// or above target is reached (going over is fine).

type Tone = "accent" | "ok" | "warn";

export interface Line {
  value: string;
  unit: string;
  tone?: Tone;
  consumed: number;
  target: number;
}

export function kcalLine(s: NutritionDayStatusDto): Line {
  const base = { consumed: s.totals.kcal, target: s.targets.kcal };
  return s.overKcal > 0
    ? { ...base, value: `+${fmtInt(s.overKcal)}`, unit: "kcal over", tone: "warn" }
    : { ...base, value: fmtInt(s.remaining.kcal), unit: "kcal left" };
}

export function proteinLine(s: NutritionDayStatusDto): Line {
  const base = { consumed: s.totals.proteinG, target: s.targets.proteinG };
  return s.proteinReached
    ? { ...base, value: fmtInt(s.totals.proteinG), unit: "g protein", tone: "ok" }
    : { ...base, value: fmtInt(s.remaining.proteinG), unit: "g protein left" };
}

const toneText = (t?: Tone) => cx(t === "warn" && "text-warn", t === "ok" && "text-ok");

function Value({ line, className }: { line: Line; className: string }) {
  return (
    <span
      className={cx(
        "num inline-flex items-center gap-1 font-semibold",
        className,
        toneText(line.tone),
      )}
    >
      {line.value}
      {line.tone === "ok" && <CheckIcon className="size-6" />}
    </span>
  );
}

const ofTarget = (l: Line) => `${fmtInt(l.consumed)} / ${fmtInt(l.target)}`;

function Macros({ s }: { s: NutritionDayStatusDto }) {
  return (
    <div className="mt-6 flex gap-6 text-[15px]">
      <span>
        <span className="text-ink-2">Fat</span>{" "}
        <span className="num">{fmtInt(s.totals.fatG)} g</span>
      </span>
      <span>
        <span className="text-ink-2">Carbs</span>{" "}
        <span className="num">{fmtInt(s.totals.carbsG)} g</span>
      </span>
    </div>
  );
}

/** Variant "bars": one block per target, number left, consumed/target right, bar below. */
export function BarsSummary({ s }: { s: NutritionDayStatusDto }) {
  return (
    <div>
      {[kcalLine(s), proteinLine(s)].map((l) => (
        <div key={l.unit} className="mt-5 first:mt-2">
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <Value line={l} className="text-[40px] leading-none" />
              <span className="text-[15px] text-ink-2">{l.unit}</span>
            </div>
            <span className="num text-[15px] text-ink-2">{ofTarget(l)}</span>
          </div>
          <ProgressBar className="mt-3" value={l.consumed} max={l.target} tone={l.tone} />
        </div>
      ))}
      <Macros s={s} />
    </div>
  );
}

/** Variant "big": kcal and protein side by side with large remaining numbers. */
export function BigSummary({ s }: { s: NutritionDayStatusDto }) {
  return (
    <div>
      <div className="mt-2 grid grid-cols-2 gap-4">
        {[kcalLine(s), proteinLine(s)].map((l) => (
          <div key={l.unit}>
            <Value line={l} className="text-[52px] leading-none" />
            <div className="mt-1 text-[13px] text-ink-2">{l.unit}</div>
            <ProgressBar className="mt-3" value={l.consumed} max={l.target} tone={l.tone} />
            <div className="num mt-2 text-[13px] text-ink-3">{ofTarget(l)}</div>
          </div>
        ))}
      </div>
      <Macros s={s} />
    </div>
  );
}

/** Variant "rows": a compact table, macros included. */
export function RowsSummary({ s }: { s: NutritionDayStatusDto }) {
  const k = kcalLine(s);
  const p = proteinLine(s);
  const rows = [
    { label: "kcal", left: k, consumed: fmtInt(k.consumed), target: fmtInt(k.target) },
    {
      label: "Protein",
      left: p,
      consumed: `${fmtInt(p.consumed)} g`,
      target: `${fmtInt(p.target)} g`,
    },
    { label: "Fat", consumed: `${fmtInt(s.totals.fatG)} g` },
    { label: "Carbs", consumed: `${fmtInt(s.totals.carbsG)} g` },
  ];
  return (
    <div className="mt-1">
      {rows.map((r) => (
        <div key={r.label} className="flex min-h-13 items-center gap-3 border-b border-line">
          <span className="w-20 text-[15px] text-ink-2">{r.label}</span>
          <span className="num flex-1 text-[17px]">
            {r.consumed}
            {r.target && <span className="text-ink-3"> / {r.target}</span>}
          </span>
          {r.left && (
            <span className={cx("num text-[22px] font-semibold", toneText(r.left.tone))}>
              {r.left.tone === "ok" ? (
                <CheckIcon />
              ) : (
                <>
                  {r.left.value}
                  <span className="text-[13px] font-normal text-ink-3">
                    {" "}
                    {r.left.unit.endsWith("over") ? "over" : "left"}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
