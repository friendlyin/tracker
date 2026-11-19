import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;

/** D1 allows at most 100 bound parameters per statement; split multi-row inserts accordingly. */
export function chunkRows<T extends object>(rows: T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(100 / columns));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}
