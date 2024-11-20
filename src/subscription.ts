import { InsertPost, posts as postsSchema } from "./db/schema";
import { JetstreamSubscriptionBase, getOpsByType } from "./util/subscription";
import { AppBskyEmbedRecord } from "@atproto/api";
import { inArray } from "drizzle-orm";
import { addOnUpdate } from "./db/sql";
import { Database } from "./db/index";
import { hasLanguage } from "./util/language";
import process from "process";
import { JetstreamEvent } from "./jetstream/jetstreamSubscription";

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

export class FirehoseSubscription extends JetstreamSubscriptionBase {
  constructor(db: Database, service: string) {
    super(db, service);
    this.handleExit();
  }

  handleExit() {
    const exit = () => {
      logger.warn("Service shutting down, saving queued records to database.");
      this.updateDb().then(() => process.exit(0));
    };
    process.on("SIGINT", exit);
    process.on("SIGTERM", exit);
  }

  private readonly MAX_QUEUE_SIZE = 1000;
  private posts: InsertPost[] = [];
  private postsToDelete: string[] = [];
  async updateDb() {
    if (this.posts.length > this.MAX_QUEUE_SIZE) {
      let postsToCreate = [...this.posts];
      this.posts = [];
      postsToCreate = postsToCreate.reduce<InsertPost[]>(reducePosts, []);
      await this.db
        .insert(postsSchema)
        .values(postsToCreate)
        .onConflictDoUpdate({
          set: {
            likes: addOnUpdate(postsSchema.likes),
            quotereposts: addOnUpdate(postsSchema.quotereposts),
            replies: addOnUpdate(postsSchema.replies),
            reposts: addOnUpdate(postsSchema.reposts),
            touchedAt: Date.now(),
          },
          target: postsSchema.uri,
        });
    }
    if (this.postsToDelete.length > this.MAX_QUEUE_SIZE) {
      const postsToDelete = [...this.postsToDelete];
      this.postsToDelete = [];
      this.db.delete(postsSchema).where(inArray(postsSchema.uri, postsToDelete));
    }
  }
  async handleEvent(evt: JetstreamEvent) {
    const ops = getOpsByType(evt);
    if (ops?.like?.create) {
      const like = ops.like.create;
      modifyCount(like.record.subject, 1, "likes", this.posts);
    }

    if (ops?.repost?.create) {
      const repost = ops.repost?.create;
      modifyCount(repost.record.subject, 1, "reposts", this.posts);
    }

    if (ops?.post?.create) {
      const post = ops.post.create;
      if (hasLanguage(post.record, "English")) {
        return;
      }
      const replies = post.record.reply?.root;
      if (replies) {
        modifyCount({ ...replies, locale: "en" }, 1, "replies", this.posts);
      } else if (post.record.embed?.$type === repostType) {
        const quoterepost = (post.record.embed as AppBskyEmbedRecord.Main).record;
        modifyCount({ ...quoterepost, locale: "en" }, 1, "quotereposts", this.posts);
      } else {
        modifyCount({ ...post, locale: "en" }, 0, "quotereposts", this.posts);
      }
    }
    if (ops?.post?.delete) {
      const post = ops?.post?.delete;
      this.postsToDelete.push(post.uri);
    }
    await this.updateDb();
  }
}

function modifyCount(
  { cid, uri, locale }: { cid?: string; uri: string; locale?: string },
  amount: number,
  column: "likes" | "replies" | "reposts" | "quotereposts",
  posts: InsertPost[],
) {
  posts.push({
    uri,
    cid: cid!,
    [column]: amount,
    locale,
  });
}
