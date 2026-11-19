import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { uuidv7 } from "../../../shared/id";
import { MUSCLE_GROUPS } from "../../../shared/workouts/groups";
import { useSaveExercise } from "../../features/workouts/api";
import { ExerciseForm } from "../../features/workouts/ExerciseForm";
import { Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/new")({
  validateSearch: z.object({ group: z.enum(MUSCLE_GROUPS).optional() }),
  component: NewExercise,
});

function NewExercise() {
  const { group } = Route.useSearch();
  const save = useSaveExercise();
  const navigate = useNavigate();

  return (
    <Screen
      back={group ? "/workouts/group/$group" : "/workouts"}
      backParams={group ? { group } : undefined}
    >
      <ExerciseForm
        saving={save.isPending}
        initial={{
          name: "",
          equipment: "dumbbell",
          muscles: group ? [{ group, contribution: 1 }] : [],
          recSets: 3,
          recRepsMin: 8,
          recRepsMax: 12,
        }}
        onSave={(data) => {
          const id = uuidv7();
          save.mutate(
            { id, isNew: true, data },
            {
              onSuccess: () =>
                navigate({
                  to: "/workouts/exercise/$exerciseId",
                  params: { exerciseId: id },
                  replace: true,
                }),
            },
          );
        }}
      />
    </Screen>
  );
}
