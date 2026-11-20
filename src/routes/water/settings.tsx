import { createFileRoute } from "@tanstack/react-router";
import type { WaterSettingsPatch } from "../../../shared/water/settings";
import { useUpdateWaterSettings, useWaterSettings } from "../../features/water/api";
import { Row, SectionLabel } from "../../ui/Row";
import { Screen } from "../../ui/Screen";
import { Stepper } from "../../ui/Stepper";
import { Toggle } from "../../ui/Toggle";

export const Route = createFileRoute("/water/settings")({ component: WaterSettingsScreen });

function WaterSettingsScreen() {
  const { data: s } = useWaterSettings();
  const update = useUpdateWaterSettings();
  const set = (patch: WaterSettingsPatch) => update.mutate(patch);

  return (
    <Screen back="/water" title="Water">
      {s && (
        <>
          <SectionLabel>Daily target</SectionLabel>
          <Stepper
            label="Daily target"
            unit="ml"
            step={250}
            min={500}
            max={10000}
            value={s.targetMl}
            onChange={(n) => n !== null && set({ targetMl: n })}
          />

          <SectionLabel>Quick amounts</SectionLabel>
          <div className="space-y-3">
            {([0, 1] as const).map((i) => (
              <Stepper
                key={i}
                label={`Quick amount ${i + 1}`}
                unit="ml"
                step={50}
                min={10}
                max={3000}
                value={s.quickMl[i]}
                onChange={(n) => {
                  if (n === null) return;
                  const q: [number, number] = [...s.quickMl];
                  q[i] = n;
                  set({ quickMl: q });
                }}
              />
            ))}
          </div>

          <SectionLabel>Build-up</SectionLabel>
          <div className="space-y-3">
            <Stepper
              label="Cap"
              unit="ml cap"
              step={50}
              min={50}
              max={3000}
              value={s.capMl}
              onChange={(n) => n !== null && set({ capMl: n })}
            />
            <Stepper
              label="Night factor"
              unit="× rate at night"
              step={0.05}
              min={0}
              max={1}
              decimal
              value={s.nightFactor}
              onChange={(n) => n !== null && set({ nightFactor: n })}
            />
            <Stepper
              label="Urgency delay"
              unit="min at cap until urgent"
              step={5}
              min={0}
              max={600}
              value={s.urgencyDelayMin}
              onChange={(n) => n !== null && set({ urgencyDelayMin: n })}
            />
          </div>

          <SectionLabel>Credit for drinking ahead</SectionLabel>
          <div className="space-y-3">
            <Stepper
              label="Credit factor"
              unit="× extra water"
              step={0.05}
              min={0}
              max={1}
              decimal
              value={s.creditFactor}
              onChange={(n) => n !== null && set({ creditFactor: n })}
            />
            <Stepper
              label="Credit cap"
              unit="ml max credit"
              step={25}
              min={0}
              max={1000}
              value={s.creditCapMl}
              onChange={(n) => n !== null && set({ creditCapMl: Math.round(n) })}
            />
          </div>

          <SectionLabel>Reminders</SectionLabel>
          <Row>
            <span className="flex-1 text-[17px]">At the cap</span>
            <Toggle
              checked={s.remindCap}
              onChange={(remindCap) => set({ remindCap })}
              label="Remind at the cap"
            />
          </Row>
          <Row>
            <span className="flex-1 text-[17px]">When urgent</span>
            <Toggle
              checked={s.remindUrgent}
              onChange={(remindUrgent) => set({ remindUrgent })}
              label="Remind when urgent"
            />
          </Row>
        </>
      )}
    </Screen>
  );
}
