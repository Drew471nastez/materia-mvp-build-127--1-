/**
 * For a probe run with tsx that draws server code in Node (scripts/check-sizefaq-r13.ts):
 * `server-only` resolves to its empty module, as it does on the server. Imported first.
 */
const Module = require("node:module")
const resolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === "server-only") return resolve.call(this, request, ...rest).replace(/index\.js$/, "empty.js")
  return resolve.call(this, request, ...rest)
}
