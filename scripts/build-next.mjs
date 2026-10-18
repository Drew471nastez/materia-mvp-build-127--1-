import { createRequire } from "node:module"

// Load build-only defaults before native pools initialize. The CLI --env-file
// flag cannot be used here: Next forwards execArgv to worker threads, which
// reject that flag. This API preserves explicit caller environment values.
process.loadEnvFile(new URL("./build-limits.env", import.meta.url))

const require = createRequire(import.meta.url)
const next = require.resolve("next/dist/bin/next")
process.argv.splice(1, 1, next, "build")
require(next)
