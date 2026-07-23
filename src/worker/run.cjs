/**
 * Production worker launcher (plain Node, independent of the Next.js bundler).
 *
 * Responsibilities:
 *  1) Register tsx's CommonJS loader so we can require the TypeScript worker
 *     (src/worker/index.ts) directly.
 *  2) Neutralize the "server-only" guard. That module throws outside a Next.js
 *     server bundle, but the worker IS a legitimate Node server process. We
 *     intercept ONLY the "server-only" specifier at the module resolver level
 *     (no other module is affected).
 *
 * Used by the npm script: `node src/worker/run.cjs`. Works identically locally
 * (Windows/macOS/Linux), inside the Docker image, and on Render.
 */
const Module = require("module");
const path = require("path");

const NOOP_SERVER_ONLY = path.join(__dirname, "noop-server-only.cjs");

// 1) Register tsx's CJS loader (require of .ts files).
require("tsx/cjs");

// 2) Override resolution AFTER tsx (so it takes precedence), delegating
//    everything else to tsx/Node. Only "server-only" is redirected to a stub.
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return NOOP_SERVER_ONLY;
  return resolveFilename.apply(this, [request, ...rest]);
};

// 3) Start the worker.
require(path.join(__dirname, "index.ts"));