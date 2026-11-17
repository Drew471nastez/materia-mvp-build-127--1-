/** The theme compiler's cache keys must stay identical in Node and browsers. */
import { strict as assert } from "node:assert"
import { createHash } from "node:crypto"
import { build } from "esbuild"
import { createContext, runInContext } from "node:vm"
import { sourceHash } from "../lib/storelib-theme/storelib/compile"

const samples = ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1_000_000), "Bună ziua 🌍 — <schema>é</schema>", "lone surrogate: \ud800", "<template>\r\nHello\n</template>"]
const expected = (source: string) => createHash("sha256").update(source, "utf8").digest("hex")
for (const source of samples) assert.equal(sourceHash(source), expected(source))
console.log(`  ok  ${samples.length} source hashes match the existing Node SHA-256, including UTF-8 and padding boundaries`)

// Browser bundling fails if a Node-only import leaks back into this graph.
const browser = await build({ stdin: { contents: 'import { sourceHash } from "./lib/storelib-theme/storelib/compile"; globalThis.__themeHash = sourceHash', resolveDir: process.cwd(), loader: "ts" }, alias: { "@": process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", target: "es2022", logLevel: "silent" })
const context = createContext({ TextEncoder })
runInContext(browser.outputFiles[0].text, context)
assert.equal(typeof context.require, "undefined")
assert.equal(typeof context.Buffer, "undefined")
for (const source of samples) assert.equal(context.__themeHash(source), expected(source))
console.log(`  ok  the browser bundle hashes all ${samples.length} sources without Node crypto, require or Buffer`)
console.log("\n2 checks passed")
