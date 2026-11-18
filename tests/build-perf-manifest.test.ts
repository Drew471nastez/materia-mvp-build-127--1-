import { strict as assert } from "node:assert"
import { pathToFileURL } from "node:url"
import { join } from "node:path"
const { entryChunks } = await import(pathToFileURL(join(process.cwd(), "scripts/perf-budget.mjs")).href)
assert.deepEqual([...entryChunks({ entryJSFiles: { layout: ["static/a.js"], page: ["static/a.js", "static/b.js"] } })], ["static/a.js", "static/b.js"])
console.log("  ok  Turbopack entry chunks remain deduplicated")
assert.deepEqual([...entryChunks({ clientModules: { layout: { chunks: ["42", "static/a.js"] }, page: { chunks: [51, "static/app/%5Bid%5D/page.js", "42", "static/a.js"] } } })], ["static/a.js", "static/app/[id]/page.js"])
console.log("  ok  Webpack module chunks count files, exclude ids and decode route paths")
assert.throws(() => entryChunks({ clientModules: { bad: { chunks: { unsupported: true } } } }))
console.log("  ok  unknown chunk formats fail rather than passing with only the runtime")
console.log("\n3 checks passed")
