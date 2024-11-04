import { Server } from "../lexicons/index";
import { AppContext } from "../config";
import algos from "../algos/index";
import { AtUri } from "@atproto/syntax";

export default function (server: Server, ctx: AppContext) {
  server.app.bsky.feed.describeFeedGenerator(() => {
    const feeds = Object.keys(algos).map((shortname) => ({
      uri: AtUri.make(ctx.cfg.publisherDid, "app.bsky.feed.generator", shortname).toString(),
    }));
    return {
      encoding: "application/json",
      body: {
        did: ctx.cfg.serviceDid,
        feeds,
      },
    };
  });
}
