import http from "http";
import events from "events";
import express from "express";
import { DidResolver, MemoryCache } from "@atproto/identity";
import { createServer } from "./lexicons/index";
import feedGeneration from "./methods/feed-generation";
import describeGenerator from "./methods/describe-generator";
import { createDb, Database } from "./db/index";
import { FirehoseSubscription } from "./subscription";
import { AppContext, Config } from "./config";
import wellKnown from "./well-known";
import { AtpAgent } from "@atproto/api";
import cron from "node-cron";
import { backfillPosts } from "./jobs/backfills";
import { pinoHttp } from "pino-http";

export class FeedGenerator {
  public server?: http.Server;

  constructor(
    public app: express.Application,
    public db: Database,
    public atAgent: AtpAgent,
    public firehose: FirehoseSubscription,
    public cfg: Config,
  ) {}

  static async create(cfg: Config) {
    const app = express();
    const db = createDb();

    const firehose = new FirehoseSubscription(db, cfg.subscriptionEndpoint);
    const didCache = new MemoryCache();
    const didResolver = new DidResolver({
      plcUrl: "https://plc.directory",
      didCache,
    });

    const server = createServer({
      validateResponse: true,
      payload: {
        jsonLimit: 100 * 1024, // 100kb
        textLimit: 100 * 1024, // 100kb
        blobLimit: 5 * 1024 * 1024, // 5mb
      },
    });
    const ctx: AppContext = {
      db,
      didResolver,
      cfg,
    };
    const agent = new AtpAgent({
      service: "https://myydraal.com",
    });
    await agent.login({
      identifier: "did:plc:renrscaj6w33cbhsqddu54pf",
      password: "4q4z-xhwu-c6q4-aikp",
    });

    app.use(pinoHttp({ logger }));
    feedGeneration(server, ctx);
    describeGenerator(server, ctx);
    app.use(server.xrpc.router);
    app.use(wellKnown(ctx));
    return new FeedGenerator(app, db, agent, firehose, cfg);
  }

  crons() {
    try {
      cron.schedule("*/10 * * * *", () =>
        backfillPosts(this.db, this.atAgent)
          .then()
          .catch((error) => {
            logger.info(error);
          }));
    } catch (error) {
      logger.info(error, "Cron job failure");
    }
  }

  async start(): Promise<http.Server> {
    this.crons();
    this.firehose.run(this.cfg.subscriptionReconnectDelay);

    this.server = this.app.listen(this.cfg.port, this.cfg.listenhost);
    await events.once(this.server, "listening");
    return this.server;
  }
}

export default FeedGenerator;
