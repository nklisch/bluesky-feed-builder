import { Subscription } from "@atproto/xrpc-server";
import { cborToLexRecord, readCar } from "@atproto/repo";
import { BlobRef } from "@atproto/lexicon";
import { ids, lexicons } from "../lexicons/lexicons";
import { Record as PostRecord } from "../lexicons/types/app/bsky/feed/post";
import { Record as RepostRecord } from "../lexicons/types/app/bsky/feed/repost";
import { Record as LikeRecord } from "../lexicons/types/app/bsky/feed/like";
import { Record as FollowRecord } from "../lexicons/types/app/bsky/graph/follow";
import { Commit, isCommit, OutputSchema as RepoEvent } from "../lexicons/types/com/atproto/sync/subscribeRepos";
import { Database } from "../db/index";
import { subscriptionStates } from "../db/schema";
import { eq } from "drizzle-orm";

export abstract class FirehoseSubscriptionBase {
  public sub: Subscription<RepoEvent>;

  constructor(
    public db: Database,
    public service: string,
  ) {
    this.sub = new Subscription({
      service: service,
      method: ids.ComAtprotoSyncSubscribeRepos,
      getParams: () => this.getCursor(),
      validate: (value: unknown) => {
        try {
          return lexicons.assertValidXrpcMessage<RepoEvent>(ids.ComAtprotoSyncSubscribeRepos, value);
        } catch (err) {
          logger.error(err, "repo subscription skipped invalid message");
        }
      },
    });
  }

  abstract handleEvent(evt: RepoEvent): Promise<void>;

  async run(subscriptionReconnectDelay: number) {
    try {
      for await (const evt of this.sub) {
        try {
          await this.handleEvent(evt);
        } catch (err) {
          logger.error(err, "repo subscription could not handle message");
        }
        // update stored cursor every 20 events or so
        if (isCommit(evt) && evt.seq % 20 === 0) {
          await this.updateCursor(evt.seq);
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

export const getOpsByType = async (evt: Commit): Promise<OperationsByType> => {
  const car = await readCar(evt.blocks);
  const opsByType: OperationsByType = {
    posts: { creates: [], deletes: [] },
    reposts: { creates: [], deletes: [] },
    likes: { creates: [], deletes: [] },
    follows: { creates: [], deletes: [] },
  };

  for (const op of evt.ops) {
    const uri = `at://${evt.repo}/${op.path}`;
    const [collection] = op.path.split("/");

    if (op.action === "update") continue; // updates not supported yet

    if (op.action === "create") {
      if (!op.cid) continue;
      const recordBytes = car.blocks.get(op.cid);
      if (!recordBytes) continue;
      const record = cborToLexRecord(recordBytes);
      const create = { uri, cid: op.cid.toString(), author: evt.repo };
      if (collection === ids.AppBskyFeedPost && isPost(record)) {
        opsByType.posts.creates.push({ record, ...create });
      } else if (collection === ids.AppBskyFeedRepost && isRepost(record)) {
        opsByType.reposts.creates.push({ record, ...create });
      } else if (collection === ids.AppBskyFeedLike && isLike(record)) {
        opsByType.likes.creates.push({ record, ...create });
      } else if (collection === ids.AppBskyGraphFollow && isFollow(record)) {
        opsByType.follows.creates.push({ record, ...create });
      }
    }

    if (op.action === "delete") {
      const cid = op.cid?.toString();
      if (collection === ids.AppBskyFeedPost) {
        opsByType.posts.deletes.push({ uri, cid });
      } else if (collection === ids.AppBskyFeedRepost) {
        opsByType.reposts.deletes.push({ uri, cid });
      } else if (collection === ids.AppBskyFeedLike) {
        opsByType.likes.deletes.push({ uri, cid });
      } else if (collection === ids.AppBskyGraphFollow) {
        opsByType.follows.deletes.push({ uri, cid });
      }
    }
  }

  return opsByType;
};

export type OperationsByType = {
  posts: Operations<PostRecord>;
  reposts: Operations<RepostRecord>;
  likes: Operations<LikeRecord>;
  follows: Operations<FollowRecord>;
};

export type Operations<T = Record<string, unknown>> = {
  creates: CreateOp<T>[];
  deletes: DeleteOp[];
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
