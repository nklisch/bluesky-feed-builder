import { InsertPost, posts } from "./db/schema";
import { isCommit, OutputSchema as RepoEvent } from "./lexicons/types/com/atproto/sync/subscribeRepos";
import { FirehoseSubscriptionBase, getOpsByType } from "./util/subscription";
import { AppBskyEmbedRecord } from "@atproto/api";
import { eq, inArray } from "drizzle-orm";
import { addOnUpdate, increment } from "./db/sql";
import { Database } from "./db/index";
import { hasLanguage } from "./util/language";
import process from "process";

const repostType = "app.bsky.embed.record" as const;

function reducePosts(acc: InsertPost[], post: InsertPost): InsertPost[] {
  const existingPost = acc.find((p) => p.uri === post.uri);
  if (existingPost) {
    existingPost.likes = (existingPost.likes ?? 0) + (post.likes ?? 0);
    existingPost.replies = (existingPost.replies ?? 0) + (post.replies ?? 0);
    existingPost.quotereposts = (existingPost.quotereposts ?? 0) + (post.quotereposts ?? 0);
    existingPost.reposts = (existingPost.reposts ?? 0) + (post.reposts ?? 0);
  } else {
    acc.push({
      ...post,
      likes: post.likes ?? 0,
      replies: post.replies ?? 0,
      quotereposts: post.quotereposts ?? 0,
      reposts: post.reposts ?? 0,
    });
  }
  return acc;
}

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  constructor(db: Database, service: string) {
    super(db, service);
    this.handleExit();
  }

  handleExit() {
    const exit = () => {
      logger.warn("Service shutting down, saving queued records to database.");
      this.updateDb();
      process.exit(0);
    };
    process.on("SIGINT", exit);
    process.on("SIGTERM", exit);
  }

  private readonly MAX_QUEUE_SIZE = 10000;
  private postsToCreate: InsertPost[] = [];
  private postsToUpdate: InsertPost[] = [];
  private postsToDelete: string[] = [];
  async updateDb() {
    if (this.postsToCreate.length > this.MAX_QUEUE_SIZE) {
      let postsToCreate = [...this.postsToCreate];
      this.postsToCreate = [];
      postsToCreate = postsToCreate.reduce<InsertPost[]>(reducePosts, []);
      await this.db
        .insert(posts)
        .values(postsToCreate)
        .onConflictDoUpdate({
          set: {
            likes: addOnUpdate(posts.likes),
            quotereposts: addOnUpdate(posts.quotereposts),
            replies: addOnUpdate(posts.replies),
            reposts: addOnUpdate(posts.reposts),
            touchedAt: Date.now(),
          },
          target: posts.uri,
        });
    }
    if (this.postsToUpdate.length > this.MAX_QUEUE_SIZE) {
      let postsToUpdate = [...this.postsToUpdate];
      this.postsToUpdate = [];
      postsToUpdate = postsToUpdate.reduce<InsertPost[]>(reducePosts, []);
      const promises: Promise<unknown>[] = [];
      for (const post of postsToUpdate) {
        promises.push(
          this.db
            .update(posts)
            .set({
              likes: increment(posts.likes, post.likes ?? 0),
              replies: increment(posts.replies, post.replies ?? 0),
              reposts: increment(posts.reposts, post.reposts ?? 0),
              quotereposts: increment(posts.quotereposts, post.quotereposts ?? 0),
              touchedAt: Date.now(),
            })
            .where(eq(posts.uri, post.uri)),
        );
      }
      await Promise.all(promises);
    }
    if (this.postsToDelete.length > this.MAX_QUEUE_SIZE) {
      const postsToDelete = [...this.postsToDelete];
      this.postsToDelete = [];
      this.db.delete(posts).where(inArray(posts.uri, postsToDelete));
    }
  }
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return;
    const ops = await getOpsByType(evt);

    for (const like of ops.likes.creates) {
      modifyCount(like.record.subject, 1, "likes", this.postsToCreate, this.postsToUpdate);
    }

    for (const repost of ops.reposts.creates) {
      modifyCount(repost.record.subject, 1, "reposts", this.postsToCreate, this.postsToUpdate);
    }

    for (const post of ops.posts.creates) {
      if (hasLanguage(post.record, "English")) {
        continue;
      }
      const replies = post.record.reply?.root;
      if (replies) {
        modifyCount(replies, 1, "replies", this.postsToCreate, this.postsToUpdate);
        continue;
      }
      if (post.record.embed?.$type === repostType) {
        const quoterepost = (post.record.embed as AppBskyEmbedRecord.Main).record;
        modifyCount(quoterepost, 1, "quotereposts", this.postsToCreate, this.postsToUpdate);
      }
      modifyCount({ ...post, locale: "en" }, 0, "quotereposts", this.postsToCreate, this.postsToUpdate);
    }

    for (const post of ops.posts.deletes) {
      this.postsToDelete.push(post.uri);
    }
    await this.updateDb();
  }
}

function modifyCount(
  { cid, uri, locale }: { cid?: string; uri: string; locale?: string },
  amount: number,
  column: "likes" | "replies" | "reposts" | "quotereposts",
  postsToCreate: InsertPost[],
  postsToUpdate: InsertPost[],
) {
  if (cid) {
    postsToCreate.push({
      cid,
      uri,
      [column]: amount,
      locale,
    });
    return;
  }
  postsToUpdate.push({
    uri,
    cid: cid!,
    [column]: amount,
  });
}
