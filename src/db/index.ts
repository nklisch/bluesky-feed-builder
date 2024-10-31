import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import process from "node:process";

export const createDb = () =>
  // @ts-ignore // Drizzle has a typescript error at the moment.
  drizzle({ schema, connection: process.env.DATABASE_URL });
export type Database = ReturnType<typeof createDb>;
