import { type Dot, weekDots } from "../../../shared/habits/logic";
import type { HabitDto, HabitsDayDto } from "../../../shared/habits/types";
import { localDate } from "../../../shared/time";
import { deviceTimeZone } from "../../lib/api";
import { cx } from "../../ui/cx";

const dotClass: Record<Dot, string> = {
  done: "bg-ok",
  missed: "bg-ink-3",
  due: "ring-1 ring-ink-3 ring-inset",
  off: "",
};

/** Monday to Sunday: done, missed, still due, or not scheduled (blank). */
export function WeekDots({ h, d, amount }: { h: HabitDto; d: HabitsDayDto; amount: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {weekDots(h, d.date, d.week, amount, localDate(h.createdAt, deviceTimeZone())).map(
        (dot, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed Monday-to-Sunday positions
          <span key={i} className={cx("size-2 rounded-full", dotClass[dot])} />
        ),
      )}
    </div>
  );
}
