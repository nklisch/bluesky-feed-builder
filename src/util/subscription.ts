import { BlobRef } from "@atproto/lexicon";
import { ids, lexicons } from "../lexicons/lexicons";
import { Record as PostRecord } from "../lexicons/types/app/bsky/feed/post";
import { Record as RepostRecord } from "../lexicons/types/app/bsky/feed/repost";
import { Record as LikeRecord } from "../lexicons/types/app/bsky/feed/like";
import { Record as FollowRecord } from "../lexicons/types/app/bsky/graph/follow";
import { Database } from "../db/index";
import { subscriptionStates } from "../db/schema";
import { eq } from "drizzle-orm";
import { isJetstreamEvent, JetstreamEvent, JetstreamSubscription } from "../jetstream/jetstreamSubscription";
export abstract class JetstreamSubscriptionBase {
  public sub: JetstreamSubscription;

  constructor(
    public db: Database,
    public service: string,
  ) {
    this.sub = new JetstreamSubscription({
      service: service,
      method: "subscribe",
      getParams: async () => {
        const params = {
          ...(await this.getCursor()),
          wantedCollections: [ids.AppBskyFeedLike, ids.AppBskyFeedRepost, ids.AppBskyFeedPost, ids.AppBskyFeedPost],
          maxMessageSizeBytes: 102400,
        };
        return params;
      },
      validate: (value: unknown) => {
        try {
          return isJetstreamEvent(value) ? value : undefined;
        } catch (err) {
          logger.error(err, "repo subscription skipped invalid message");
        }
      },
    });
  }

  abstract handleEvent(evt: JetstreamEvent): Promise<void>;

  async run(subscriptionReconnectDelay: number) {
    try {
      for await (const evt of this.sub) {
        try {
          await this.handleEvent(evt);
        } catch (err) {
          logger.error(err, "repo subscription could not handle message");
        }
        // update stored cursor every 20 events or so
        if (isJetstreamEvent(evt) && evt.time_us % 20 === 0) {
          await this.updateCursor(evt.time_us);
        }
      }
    } catch (err) {
      logger.error(err, "repo subscription errored");
      setTimeout(() => this.run(subscriptionReconnectDelay), subscriptionReconnectDelay);
    }
  }

  async updateCursor(cursor: number) {
    await this.db
      .insert(subscriptionStates)
      .values([{ cursor, service: this.service }])
      .onConflictDoUpdate({
        set: {
          cursor: cursor,
        },
        target: subscriptionStates.service,
      });
  }

  async getCursor(): Promise<{ cursor?: number }> {
    const res = await this.db.query.subscriptionStates.findFirst({
      where: eq(subscriptionStates.service, this.service),
    });
    return res ? { cursor: res.cursor } : {};
  }
}

export const getOpsByType = (evt: JetstreamEvent): OperationsByType => {
  const uri = `at://${evt.did}/${evt.commit.rev}`;
  const commit = evt.commit;
  const collection = commit.collection;
  const cid = commit.cid;
  if (commit.operation === "update") return {}; // updates not supported yet

  if (commit.operation === "create") {
    const create = { uri, cid: commit.cid.toString(), author: evt.did };
    const record = commit.record;
    if (commit.collection === ids.AppBskyFeedPost && isPost(record)) {
      return { post: { create: { ...create, record } } };
    } else if (commit.collection === ids.AppBskyFeedRepost && isRepost(record)) {
      return { repost: { create: { ...create, record } } };
    } else if (commit.collection === ids.AppBskyFeedLike && isLike(record)) {
      return { like: { create: { ...create, record } } };
    } else if (commit.collection === ids.AppBskyGraphFollow && isFollow(record)) {
      return { follow: { create: { ...create, record } } };
    }
  }

  if (commit.operation === "delete") {
    if (collection === ids.AppBskyFeedPost) {
      return { post: { delete: { uri, cid } } };
    } else if (collection === ids.AppBskyFeedRepost) {
      return { repost: { delete: { uri, cid } } };
    } else if (collection === ids.AppBskyFeedLike) {
      return { like: { delete: { uri, cid } } };
    } else if (collection === ids.AppBskyGraphFollow) {
      return { follow: { delete: { uri, cid } } };
    }
  }
  return {};
};

export type OperationsByType = {
  post?: Operations<PostRecord>;
  repost?: Operations<RepostRecord>;
  like?: Operations<LikeRecord>;
  follow?: Operations<FollowRecord>;
};

export type Operations<T = Record<string, unknown>> = {
  create?: CreateOp<T>;
  delete?: DeleteOp;
};

export type CreateOp<T> = {
  uri: string;
  cid: string;
  author: string;
  record: T;
};

export type DeleteOp = {
  uri: string;
  cid?: string;
};

export const isPost = (obj: unknown): obj is PostRecord => {
  return isType(obj, ids.AppBskyFeedPost);
};

export const isRepost = (obj: unknown): obj is RepostRecord => {
  return isType(obj, ids.AppBskyFeedRepost);
};

export const isLike = (obj: unknown): obj is LikeRecord => {
  return isType(obj, ids.AppBskyFeedLike);
};

export const isFollow = (obj: unknown): obj is FollowRecord => {
  return isType(obj, ids.AppBskyGraphFollow);
};

const isType = (obj: unknown, nsid: string) => {
  try {
    lexicons.assertValidRecord(nsid, fixBlobRefs(obj));
    return true;
  } catch (_err) {
    return false;
  }
};

const fixBlobRefs = (obj: unknown): unknown => {
  if (Array.isArray(obj)) {
    return obj.map(fixBlobRefs);
  }
  if (obj && typeof obj === "object") {
    if (obj.constructor.name === "BlobRef") {
      const blob = obj as BlobRef;
      return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original);
    }
    return Object.entries(obj).reduce(
      (acc, [key, val]) => {
        return Object.assign(acc, { [key]: fixBlobRefs(val) });
      },
      {} as Record<string, unknown>,
    );
  }
  return obj;
};
