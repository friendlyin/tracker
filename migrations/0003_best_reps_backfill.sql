-- Backfill the new `exercise.best_reps` rollup (most reps in one working set, per exercise and day)
-- for days logged before it existed. Later writes keep it up to date through recomputeWorkoutDay.
INSERT OR REPLACE INTO `metric_daily` (`user_id`, `metric`, `local_date`, `dimension`, `value`)
SELECT s.`user_id`, 'exercise.best_reps', w.`local_date`, s.`exercise_id`, max(s.`reps`)
FROM `workout_set` s
JOIN `workout` w ON w.`id` = s.`workout_id` AND w.`user_id` = s.`user_id`
WHERE s.`kind` = 'working'
GROUP BY s.`user_id`, w.`local_date`, s.`exercise_id`;
