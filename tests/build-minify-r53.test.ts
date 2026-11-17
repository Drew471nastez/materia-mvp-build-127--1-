/**
 * TURBOPACK DOES NOT MINIFY; A STEP AFTER IT DOES (round 53).
 * Vercel's 8 GB Standard build machine ran out of memory on every deploy
 * (exit 137). Cold `pnpm build` on 4 CPUs: 8.26 GB peak with Turbopack
 * minifying, about 7.9 GB with scripts/minify-after-build.mjs doing it in its
 * own process after Turbopack exits. What ships stays minified.
 */
import { readFileSync } from "node:fs"
import { transform } from "esbuild"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}`)
  }
}

const config = readFileSync("next.config.mjs", "utf8")
const build = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: { build: string } }).scripts.build
const step = readFileSync("scripts/minify-after-build.mjs", "utf8")

check("Turbopack's own minifier is off in the production build", /^\s*turbopackMinify: false,$/m.test(config))
check("the build minifies after Turbopack has exited, as its last step", /scripts\/trace-error-pages\.mjs && node scripts\/minify-after-build\.mjs"$/.test(build.trim() + '"'))
check("browser and server chunks are both minified", /const DIRS = \["static", "server"\]/.test(step))
check("a file keeps its name, and one esbuild cannot read is left as written", /writeFile\(path, out\.code\)/.test(step) && /skipped\+\+/.test(step) && !/rename|unlink/.test(step))
check("the file stays the script or module it was (no format or target given)", /transform\(code, \{ minify: true,/.test(step) && !/format:|target:/.test(step))

/* The same transform on a chunk shaped like Turbopack's: smaller, and it still runs the same. */
const chunk = `module.exports=[123456,(e)=>{"use strict";let words={cart:"Cart",total:"Total"};function label(key){if(false){console.log("dev only")}return words[key]||key}e.s(["label",()=>label])}];`
const out = await transform(chunk, { minify: true, legalComments: "inline", charset: "utf8", logLevel: "silent" })
const run = (code: string) => {
  const module = { exports: [] as unknown[] }
  new Function("module", code)(module)
  const exported: Record<string, () => unknown> = {}
  ;(module.exports[1] as (e: unknown) => void)({ s: (pairs: unknown[]) => { exported[pairs[0] as string] = pairs[1] as () => unknown } })
  return (exported.label() as (k: string) => string)("cart") + "|" + (exported.label() as (k: string) => string)("x")
}
check("a minified chunk is smaller and behaves the same", out.code.length < chunk.length && run(out.code) === run(chunk) && run(chunk) === "Cart|x")
check("dead development branches are dropped", !out.code.includes("dev only"))

/* Production can use Webpack workers too; preserve its CommonJS chunk exports. */
const webpackChunk = `exports.id=42;exports.ids=[42];exports.modules={42:(module)=>{function label(key){if(false){console.log("dev only")}return key==="cart"?"Cart":key}module.exports=label}};`
const webpackOut = await transform(webpackChunk, { minify: true, legalComments: "inline", charset: "utf8", logLevel: "silent" })
const runWebpack = (code: string) => {
  const exported: { modules?: Record<string, (module: { exports: unknown }) => void> } = {}
  new Function("exports", code)(exported)
  const module: { exports: unknown } = { exports: {} }
  exported.modules!["42"](module)
  return (module.exports as (key: string) => string)("cart")
}
check("Webpack chunks retain their exports after separate minification", webpackOut.code.length < webpackChunk.length && runWebpack(webpackChunk) === "Cart" && runWebpack(webpackOut.code) === "Cart")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
