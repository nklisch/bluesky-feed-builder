import { AtpAgent } from "@atproto/api";
import { Database } from "../db/index";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { posts } from "../db/schema";
import { RateLimiter } from "limiter";
import { Record as PostRecord } from "../lexicons/types/app/bsky/feed/post";
import { subDays } from "date-fns";
import { hasLanguage } from "../util/language";

const MAX_POSTS_TO_HYDRATE = 50000;
const MAX_QUERY_SIZE = 25;
const POSTS_BATCH_SIZE = 1000;
const limiter = new RateLimiter({ tokensPerInterval: 5, interval: "second" });
export async function backfillPosts(db: Database, atAgent: AtpAgent) {
  try {
    logger.info(`Starting posts hydration job.`);
    const uris = await db.query.posts.findMany({
      columns: {
        uri: true,
      },
      orderBy: [desc(posts.touchedAt)],
      limit: MAX_POSTS_TO_HYDRATE,
      where: and(isNotNull(posts.touchedAt), eq(posts.hydrated, false), gte(posts.indexedAt, subDays(new Date(), 1))),
    });
    if (uris.length === 0) {
      logger.info(`No posts to hydrate. Exiting.`);
      return true;
    }
    logger.info(`posts to hydrate: ${uris.length}`);
    for (let start = 0; start < uris.length; start += POSTS_BATCH_SIZE) {
      let uriChunk;
      if (start + POSTS_BATCH_SIZE >= uris.length) {
        uriChunk = uris.slice(start, -1);
      } else {
        uriChunk = uris.slice(start, start + POSTS_BATCH_SIZE);
      }
      const data = await getPosts(uriChunk);
      logger.info(`fetched ${start + POSTS_BATCH_SIZE} posts..%s`);
      Promise.all(
        data.map(async (post) => {
          return await db
            .update(posts)
            .set({
              hydrated: true,
              likes: post.likeCount ?? 0,
              replies: post.replyCount ?? 0,
              reposts: post.repostCount ?? 0,
              quotereposts: post.quoteCount ?? 0,
              locale: hasLanguage(post.record as PostRecord, "English") ? "en" : undefined,
              indexedAt: new Date(post.indexedAt),
            })
            .where(eq(posts.uri, post.uri))
            .catch((error) => {
              logger.error(error, `Failed to write post %o to database`);
            });
        }),
      );
    }
  } catch (e) {
    logger.error(e);
  }

  async function getPosts(uris: { uri: string }[]) {
    const promises: ReturnType<typeof atAgent.getPosts>[] = [];
    for (let start = 0; start < uris.length; start += MAX_QUERY_SIZE) {
      let uriChunk: { uri: string }[];
      if (start + MAX_QUERY_SIZE >= uris.length) {
        uriChunk = uris.slice(start, -1);
      } else {
        uriChunk = uris.slice(start, start + MAX_QUERY_SIZE);
      }
      const fetchRateLimited = async () => {
        await limiter.removeTokens(1);
        return await atAgent.getPosts({ uris: uriChunk.map((u) => u.uri) }).catch((error) => {
          logger.error(error, `getPosts failed for %d error.`, uriChunk.length);
          return {
            data: { posts: [] },
            success: true,
            headers: {},
          };
        });
      };
      promises.push(fetchRateLimited());
    }
    const results = await Promise.allSettled(promises);
    return results.flatMap((result) => {
      if (result.status === "fulfilled" && result.value.success) {
        return result.value.data.posts;
      }
      return [];
    });
  }
  logger.info(`Finished hydration job.`);
}
