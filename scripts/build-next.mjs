import { createRequire } from "node:module"

// Load build-only defaults before native pools initialize. The CLI --env-file
// flag cannot be used here: Next forwards execArgv to worker threads, which
// reject that flag. This API preserves explicit caller environment values.
process.loadEnvFile(new URL("./build-limits.env", import.meta.url))

// The stylesheet was compiled by scripts/build-css.mjs, in a process that has
// ended: this build hands that over instead of loading Tailwind beside
// Turbopack (postcss.config.mjs). Only when the file is there and newer than
// its source; otherwise the build compiles it itself, as before.
{
  const { existsSync, statSync } = await import("node:fs")
  const compiled = new URL("../.next-css/globals.css", import.meta.url)
  const source = new URL("../app/globals.css", import.meta.url)
  /* A published website's stylesheet, compiled beside it (scripts/site-css.cjs): both, or Tailwind compiles both here. */
  const site = new URL("../.next-css/site.css", import.meta.url)
  if (process.env.STORELIB_CSS_PRECOMPILED === undefined && existsSync(compiled) && statSync(compiled).mtimeMs >= statSync(source).mtimeMs && existsSync(site) && statSync(site).mtimeMs >= statSync(source).mtimeMs) {
    process.env.STORELIB_CSS_PRECOMPILED = "1"
  }
}

const require = createRequire(import.meta.url)
const next = require.resolve("next/dist/bin/next")
process.argv.splice(1, 1, next, "build")
require(next)
