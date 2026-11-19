import { createFileRoute } from "@tanstack/react-router";
import { GROUP_LABELS, MUSCLE_GROUPS } from "../../../shared/workouts/groups";
import { useOverview, useUpdateWorkoutSettings } from "../../features/workouts/api";
import { Row, SectionLabel } from "../../ui/Row";
import { Screen } from "../../ui/Screen";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/workouts/settings")({ component: WorkoutSettingsScreen });

function WorkoutSettingsScreen() {
  const { data } = useOverview();
  const update = useUpdateWorkoutSettings();
  const s = data?.settings;

  return (
    <Screen back="/workouts" title="Workout settings">
      {s && (
        <>
          <SectionLabel>Workouts per week</SectionLabel>
          <Stepper
            label="workouts per week"
            min={1}
            max={7}
            value={s.workoutsPerWeek}
            onChange={(n) => n && update.mutate({ workoutsPerWeek: n })}
          />

          <SectionLabel>Weekly sets</SectionLabel>
          {MUSCLE_GROUPS.map((g) => (
            <Row key={g}>
              <span className="min-w-0 flex-1 truncate text-[17px]">{GROUP_LABELS[g]}</span>
              <div className="w-40">
                <Stepper
                  label={`${GROUP_LABELS[g]} sets`}
                  min={0}
                  max={40}
                  value={s.targets[g]}
                  onChange={(n) => n !== null && update.mutate({ targets: { [g]: n } })}
                />
              </div>
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}
