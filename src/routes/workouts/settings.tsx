import { createFileRoute } from "@tanstack/react-router";
import { GROUP_LABELS, MUSCLE_GROUPS } from "../../../shared/workouts/groups";
import { useOverview, useUpdateWorkoutSettings } from "../../features/workouts/api";
import { Row, SectionLabel } from "../../ui/Row";
import { Screen } from "../../ui/Screen";
import { Segmented } from "../../ui/Segmented";
import { Stepper } from "../../ui/Stepper";

export const Route = createFileRoute("/workouts/settings")({ component: WorkoutSettingsScreen });

const categoryOptions = [
  { value: "major" as const, label: "Major" },
  { value: "minor" as const, label: "Minor" },
];

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

          <SectionLabel>Weekly sets · major</SectionLabel>
          <Stepper
            label="major target"
            unit="sets"
            min={0}
            max={40}
            value={s.targets.major}
            onChange={(n) => n !== null && update.mutate({ targets: { major: n } })}
          />
          <SectionLabel>Weekly sets · minor</SectionLabel>
          <Stepper
            label="minor target"
            unit="sets"
            min={0}
            max={40}
            value={s.targets.minor}
            onChange={(n) => n !== null && update.mutate({ targets: { minor: n } })}
          />

          <SectionLabel>Groups</SectionLabel>
          {MUSCLE_GROUPS.map((g) => (
            <Row key={g}>
              <span className="flex-1 text-[17px]">{GROUP_LABELS[g]}</span>
              <Segmented
                className="w-44"
                value={s.categories[g]}
                options={categoryOptions}
                onChange={(c) => update.mutate({ categories: { [g]: c } })}
              />
            </Row>
          ))}
        </>
      )}
    </Screen>
  );
}
