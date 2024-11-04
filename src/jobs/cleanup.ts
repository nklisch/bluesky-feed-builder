import { and, isNull, lte, or } from "drizzle-orm";
import { Database } from "../db";
import { posts } from "../db/schema";
import { timestampFromNow } from "../db/sql";

export async function cleanupPosts(db: Database) {
  logger.info("Starting posts cleanup job.");
  try {
    await db
      .delete(posts)
      .where(
        or(
          lte(posts.touchedAt, timestampFromNow({ direction: "past", interval: { amount: 1, unit: "month" }, timezone: "Universal Time, Coordinated", unit: "millisecond" })),
          and(
            isNull(posts.touchedAt),
            lte(posts.indexedAt, timestampFromNow({ direction: "past", interval: { amount: 14, unit: "day" }, timezone: "Universal Time, Coordinated", unit: "datetime" })),
          ),
        ),
      );
  } catch (error) {
    logger.error(error, "Failed to deleted posts.");
  }
  logger.info("Finished posts cleanup job.");
}
