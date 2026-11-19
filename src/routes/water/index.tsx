import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { WaterEntryDto } from "../../../shared/water/types";
import { useDeleteWater, useDrink, useWaterDay, useWaterState } from "../../features/water/api";
import { Summary } from "../../features/water/Summary";
import { fmtInt, fmtTime } from "../../lib/format";
import { Button } from "../../ui/Button";
import { ChartIcon, CloseIcon, SlidersIcon } from "../../ui/icons";
import { IconLink, Screen } from "../../ui/Screen";
import { Sheet } from "../../ui/Sheet";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/water/")({ component: WaterScreen });

const UNDO_MS = 5000;

function Entries({ entries }: { entries: WaterEntryDto[] }) {
  const del = useDeleteWater();
  if (entries.length === 0) return null;
  return (
    <div className="mt-8">
      {entries.map((e) => (
        <div key={e.id} className="flex min-h-13 items-center gap-3 border-b border-line">
          <span className="num w-12 shrink-0 text-[13px] text-ink-3">{fmtTime(e.drankAt)}</span>
          <span className="num flex-1 text-[17px]">{fmtInt(e.ml)} ml</span>
          <button
            type="button"
            aria-label={`Delete ${e.ml} ml at ${fmtTime(e.drankAt)}`}
            onClick={() => del.mutate(e.id)}
            className="-mr-2 grid size-11 place-items-center text-ink-3 active:opacity-60"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
      ))}
    </div>
  );
}

function CustomSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (ml: number) => void;
}) {
  const [ml, setMl] = useState<number | null>(330);
  return (
    <Sheet open={open} onClose={onClose}>
      <Stepper
        label="Amount"
        unit="ml"
        step={50}
        min={10}
        max={3000}
        size="lg"
        value={ml}
        onChange={setMl}
      />
      <Button
        className="mt-4 mb-2"
        disabled={!ml}
        onClick={() => {
          if (ml) onAdd(ml);
          onClose();
        }}
      >
        Add
      </Button>
    </Sheet>
  );
}

function Actions({
  quick,
  last,
  setLast,
  onCustom,
}: {
  quick: [number, number];
  last: string | null;
  setLast: (id: string | null) => void;
  onCustom: () => void;
}) {
  const drink = useDrink();
  const del = useDeleteWater();

  useEffect(() => {
    if (!last) return;
    const t = setTimeout(() => setLast(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [last, setLast]);

  const add = (ml: number) => setLast(drink.log(ml));
  const btn = "num h-14 flex-1 rounded-md bg-surface text-[17px] font-semibold active:opacity-60";

  return (
    <div className="pb-3">
      {last && (
        <Button
          variant="quiet"
          className="mb-3"
          onClick={() => {
            del.mutate(last);
            setLast(null);
          }}
        >
          Undo
        </Button>
      )}
      <div className="flex gap-2">
        {quick.map((ml) => (
          <button key={ml} type="button" className={btn} onClick={() => add(ml)}>
            +{ml}
          </button>
        ))}
        <button type="button" className={btn} onClick={onCustom} aria-label="Other amount">
          +…
        </button>
      </div>
    </div>
  );
}

function WaterScreen() {
  const { data } = useWaterDay();
  const s = useWaterState();
  const drink = useDrink();
  const [last, setLast] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const today = s ? data?.entries.filter((e) => e.localDate === s.date).reverse() : [];

  return (
    <Screen
      back="/"
      title="Water"
      right={
        <>
          <IconLink to="/water/stats" label="Water stats">
            <ChartIcon />
          </IconLink>
          <IconLink to="/water/settings" label="Water settings" className="-mr-1">
            <SlidersIcon />
          </IconLink>
        </>
      }
      footer={
        data && (
          <Actions
            quick={data.settings.quickMl}
            last={last}
            setLast={setLast}
            onCustom={() => setCustom(true)}
          />
        )
      }
    >
      {s && data && (
        <>
          <div className="mt-2">
            <Summary s={s} />
          </div>
          <Entries entries={today ?? []} />
        </>
      )}
      {/* Outside the sticky footer, which would trap the sheet under the header. */}
      <CustomSheet
        open={custom}
        onClose={() => setCustom(false)}
        onAdd={(ml) => setLast(drink.log(ml))}
      />
    </Screen>
  );
}
