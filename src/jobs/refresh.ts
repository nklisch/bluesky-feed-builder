import { PgMaterializedView } from "drizzle-orm/pg-core";
import { Database } from "../db";

export async function refreshViews(db: Database, materializedViews: PgMaterializedView[]) {
  logger.info("Starting materialized view refresh job.");
  try {
    for (const materializedView of materializedViews) {
      await db.refreshMaterializedView(materializedView);
    }
  } catch (error) {
    logger.error(error, `Refreshing score materialized views failed.`);
  }
  logger.info("Finished materialized view refresh job.");
}
