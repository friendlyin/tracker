import { z } from "zod";
import { localDateSchema } from "../nutrition/schemas";

export const bucketSchema = z.enum(["day", "week", "month"]);

export const metricsQuery = z.object({
  from: localDateSchema,
  to: localDateSchema,
  bucket: bucketSchema.default("day"),
});

export const rangeQuery = z.object({ from: localDateSchema, to: localDateSchema });
