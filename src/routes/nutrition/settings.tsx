import { createFileRoute } from "@tanstack/react-router";
import { DAY_TYPES, type DayType } from "../../../shared/nutrition/settings";
import { useNutritionSettings, useUpdateNutritionSettings } from "../../features/nutrition/api";
import { SectionLabel } from "../../ui/Row";
import { Screen } from "../../ui/Screen";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/nutrition/settings")({ component: NutritionSettingsScreen });

const titles: Record<DayType, string> = { workout: "Workout day", rest: "Rest day" };

function NutritionSettingsScreen() {
  const { data: s } = useNutritionSettings();
  const update = useUpdateNutritionSettings();

  return (
    <Screen back="/nutrition" title="Targets">
      {s &&
        DAY_TYPES.map((t) => (
          <div key={t}>
            <SectionLabel>{titles[t]}</SectionLabel>
            <div className="space-y-3">
              <Stepper
                label={`${titles[t]} kcal`}
                unit="kcal"
                step={50}
                min={0}
                max={10000}
                value={s[t].kcal}
                onChange={(n) => n !== null && update.mutate({ [t]: { kcal: n } })}
              />
              <Stepper
                label={`${titles[t]} protein`}
                unit="g protein"
                step={5}
                min={0}
                max={1000}
                value={s[t].proteinG}
                onChange={(n) => n !== null && update.mutate({ [t]: { proteinG: n } })}
              />
            </div>
          </div>
        ))}
    </Screen>
  );
}
