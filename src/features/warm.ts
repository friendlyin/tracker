import type { QueryClient } from "@tanstack/react-query";
import { focusDayQuery } from "./focus/api";
import { nutritionDayQuery, todayLocal } from "./nutrition/api";
import { homeQuery, meQuery } from "./profile";
import { waterDayQuery } from "./water/api";
import { exercisesQuery, overviewQuery } from "./workouts/api";

/**
 * Loads the data the main screens need, so they also work offline later (at the gym), not only the
 * screens opened since the last update (a new build starts with an empty cache). Runs after the
 * saved cache is restored; while offline the fetches wait for the network.
 */
export function warmCache(qc: QueryClient) {
  void qc.prefetchQuery(meQuery);
  void qc.prefetchQuery(homeQuery);
  void qc.prefetchQuery(overviewQuery);
  void qc.prefetchQuery(exercisesQuery);
  void qc.prefetchQuery(waterDayQuery);
  void qc.prefetchQuery(focusDayQuery);
  void qc.prefetchQuery(nutritionDayQuery(todayLocal()));
}
