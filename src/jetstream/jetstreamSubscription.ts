import { ClientOptions } from "ws";
import { WebSocketKeepAlive } from "@atproto/xrpc-server/dist/stream/websocket-keepalive";
import { CommitMeta } from "@atproto/api/dist/client/types/com/atproto/repo/defs";

export type JetstreamEvent = {
  did: string;
  time_us: number;
  kind: "commit";
  commit: CommitMeta;
};

export function isJetstreamEvent(event: unknown): event is JetstreamEvent {
  const e: JetstreamEvent = event as JetstreamEvent;
  return typeof e?.did === "string" && typeof e?.time_us === "number" && e?.kind === "commit" && isCommitMeta(e.commit);
}

export function isCommitMeta(commit: unknown): commit is CommitMeta {
  const c: CommitMeta = commit as CommitMeta;
  return typeof c?.cid === "string" && typeof c?.rev === "string";
}

export class JetstreamSubscription {
  constructor(
    public opts: ClientOptions & {
      service: string;
      method: string;
      maxReconnectSeconds?: number;
      heartbeatIntervalMs?: number;
      signal?: AbortSignal;
      validate: (obj: unknown) => JetstreamEvent | undefined;
      onReconnectError?: (error: unknown, n: number, initialSetup: boolean) => void;
      getParams?: () => Record<string, unknown> | Promise<Record<string, unknown> | undefined> | undefined;
    },
  ) {}

  async *[Symbol.asyncIterator](): AsyncGenerator<JetstreamEvent> {
    const ws = new WebSocketKeepAlive({
      ...this.opts,
      getUrl: async () => {
        const params = (await this.opts.getParams?.()) ?? {};
        const query = encodeQueryParams(params);
        return `${this.opts.service}/${this.opts.method}?${query}`;
      },
    });
    for await (const chunk of ws) {
      try {
        const jsonString = Buffer.from(chunk).toString("utf-8");
        const body = await JSON.parse(jsonString);
        const result = this.opts.validate(body);
        if (result !== undefined) {
          yield result;
        }
      } catch (error) {
        logger.info(error, `Jetstream message not in json format.`);
      }
    }
  }
}

export default JetstreamSubscription;

function encodeQueryParams(obj: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(obj).forEach(([key, value]) => {
    const encoded = encodeQueryParam(value);
    if (Array.isArray(encoded)) {
      encoded.forEach((enc) => params.append(key, enc));
    } else {
      params.set(key, encoded);
    }
  });
  return params.toString();
}

// Adapted from xrpc, but without any lex-specific knowledge
function encodeQueryParam(value: unknown): string | string[] {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "undefined") {
    return "";
  }
  if (typeof value === "object") {
    if (value instanceof Date) {
      return value.toISOString();
    } else if (Array.isArray(value)) {
      return value.flatMap(encodeQueryParam);
    } else if (!value) {
      return "";
    }
  }
  throw new Error(`Cannot encode ${typeof value}s into query params`);
}
