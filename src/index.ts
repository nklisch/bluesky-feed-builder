import dotenv from "dotenv";
import FeedGenerator from "./server";
import logger from "./logger";
import process from "process";

globalThis.logger = logger;

const run = async () => {
  dotenv.config();
  const hostname = maybeStr(process.env.FEEDGEN_HOSTNAME) ?? "example.com";
  const serviceDid = maybeStr(process.env.FEEDGEN_SERVICE_DID) ??
    `did:web:${hostname}`;
  const server = await FeedGenerator.create({
    port: maybeInt(process.env.FEEDGEN_PORT) ?? 3000,
    listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? "localhost",
    subscriptionEndpoint: maybeStr(process.env.FEEDGEN_SUBSCRIPTION_ENDPOINT) ??
      "wss://bsky.network",
    publisherDid: maybeStr(process.env.FEEDGEN_PUBLISHER_DID) ??
      "did:example:alice",
    subscriptionReconnectDelay: maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
    hostname,
    serviceDid,
  });
  await server.start();
  logger.info(
    `🤖 running feed generator at http://${server.cfg.listenhost}:${server.cfg.port}`,
  );
};

const maybeStr = (val?: string) => {
  if (!val) return undefined;
  return val;
};

const maybeInt = (val?: string) => {
  if (!val) return undefined;
  const int = parseInt(val, 10);
  if (isNaN(int)) return undefined;
  return int;
};

run();
