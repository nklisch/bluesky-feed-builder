import pino from "pino";

declare global {
  var logger: pino.Logger;
}

export {};
