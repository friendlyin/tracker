import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useArchiveExercise, useExercises, useSaveExercise } from "../../features/workouts/api";
import { ExerciseForm, fromExercise } from "../../features/workouts/ExerciseForm";
import { useConfirm } from "../../lib/useConfirm";
import { Button } from "../../ui/Button";
import { Screen } from "../../ui/Screen";

export const Route = createFileRoute("/workouts/edit/$exerciseId")({ component: EditExercise });

function EditExercise() {
  const { exerciseId } = Route.useParams();
  const exercises = useExercises();
  const save = useSaveExercise();
  const archive = useArchiveExercise();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const ex = exercises.data?.find((e) => e.id === exerciseId);
  const back = () =>
    navigate({ to: "/workouts/exercise/$exerciseId", params: { exerciseId }, replace: true });

  return (
    <Screen back="/workouts/exercise/$exerciseId" backParams={{ exerciseId }}>
      {ex && (
        <>
          <ExerciseForm
            initial={fromExercise(ex)}
            saving={save.isPending}
            onSave={(data) => save.mutate({ id: ex.id, isNew: false, data }, { onSuccess: back })}
          />
          <Button
            variant="danger"
            className="mt-3"
            onClick={() =>
              ex.archived
                ? archive.mutate({ id: ex.id, archived: false })
                : confirm.run(() =>
                    archive.mutate(
                      { id: ex.id, archived: true },
                      { onSuccess: () => navigate({ to: "/workouts" }) },
                    ),
                  )
            }
          >
            {ex.archived ? "Restore" : confirm.armed ? "Archive?" : "Archive"}
          </Button>
        </>
      )}
    </Screen>
  );
}
