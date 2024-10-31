import express from "express";
import { AuthRequiredError, parseReqNsid, verifyJwt } from "@atproto/xrpc-server";
import { DidResolver } from "@atproto/identity";

export const validateAuth = async (
  req: express.Request,
  serviceDid: string,
  didResolver: DidResolver,
): Promise<string> => {
  const { authorization = "" } = req.headers;
  if (!authorization.startsWith("Bearer ")) {
    throw new AuthRequiredError();
  }
  const jwt = authorization.replace("Bearer ", "").trim();
  const nsid = parseReqNsid(req);
  const parsed = await verifyJwt(jwt, serviceDid, nsid, (did: string) => {
    return didResolver.resolveAtprotoKey(did);
  });
  return parsed.iss;
};
