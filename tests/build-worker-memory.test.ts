/** Exercise the real production launcher without running the compiler in these unit checks. */
import { strict as assert } from "node:assert"
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { pathToFileURL } from "node:url"

const scratch = mkdtempSync(join(tmpdir(), "storelib-build-worker-"))
const preload = join(scratch, "capture.cjs")
// Cache only the CLI entry; build-next.mjs itself still runs, loads its defaults,
// checks the real precompiled CSS and constructs the exact arguments Next sees.
writeFileSync(preload, `const { createRequire } = require("node:module");
const project = createRequire(${JSON.stringify(join(process.cwd(), "package.json"))});
const cli = project.resolve("next/dist/bin/next");
require.cache[cli] = { id: cli, filename: cli, loaded: true, exports: {} };
process.on("exit", () => process.stdout.write(JSON.stringify({ args: process.argv.slice(2), rayon: process.env.RAYON_NUM_THREADS, tokio: process.env.TOKIO_WORKER_THREADS })));
`)
let passed = 0
const check = (label: string, run: () => void) => { run(); passed++; console.log(`  ok  ${label}`) }
const launch = (flag?: string, callerThreads: string | null = "1") => {
  const env: NodeJS.ProcessEnv = { ...process.env }
  if (callerThreads === null) { delete env.RAYON_NUM_THREADS; delete env.TOKIO_WORKER_THREADS }
  else { env.RAYON_NUM_THREADS = callerThreads; env.TOKIO_WORKER_THREADS = callerThreads }
  delete env.STORELIB_BUILD_WEBPACK
  if (flag !== undefined) env.STORELIB_BUILD_WEBPACK = flag
  return JSON.parse(execFileSync(process.execPath, ["--require", preload, "scripts/build-next.mjs"], { encoding: "utf8", env })) as { args: string[]; rayon: string; tokio: string }
}
try {
  check("the default production build selects Webpack explicitly", () => assert.deepEqual(launch().args, ["build", "--webpack"]))
  check("an existing Webpack override still selects Webpack", () => assert.deepEqual(launch("1").args, ["build", "--webpack"]))
  check("Turbopack remains an explicit benchmark option", () => assert.deepEqual(launch("0").args, ["build", "--turbopack"]))
  check("an unrecognised value keeps the conservative production default", () => assert.deepEqual(launch("false").args, ["build", "--webpack"]))
  check("caller thread limits survive build-only initialization", () => { const r = launch(); assert.equal(r.rayon, "1"); assert.equal(r.tokio, "1") })
  check("the merged production defaults use one native thread", () => { const r = launch(undefined, null); assert.equal(r.rayon, "1"); assert.equal(r.tokio, "1") })
  const { default: config } = await import(pathToFileURL(join(process.cwd(), "next.config.mjs")).href)
  check("compiler workers and memory optimizations are enabled", () => { assert.equal(config.experimental.webpackBuildWorker, true); assert.equal(config.experimental.webpackMemoryOptimizations, true) })
  check("server compilation and tracing do not overlap their heaps", () => { assert.equal(config.experimental.parallelServerCompiles, false); assert.equal(config.experimental.parallelServerBuildTraces, false); assert.equal(config.experimental.cpus, 1) })
  check("server minification and the final chunk optimization remain enabled", () => {
    assert.equal(config.experimental.serverMinification, true)
    const pkg = JSON.parse(execFileSync(process.execPath, ["-p", "JSON.stringify(require('./package.json'))"], { encoding: "utf8" }))
    assert.ok(pkg.scripts.build.endsWith("node scripts/minify-after-build.mjs"))
  })
  check("production avoids the multi-gigabyte filesystem cache and resolves the published Supabase ESM entry", () => {
    const result = config.webpack({ cache: { type: "filesystem" }, resolve: { alias: { existing: "keep" } } }, { dev: false })
    assert.equal(result.cache, false)
    assert.equal(result.resolve.alias.existing, "keep")
    assert.ok(result.resolve.alias["@supabase/supabase-js$"].endsWith("/@supabase/supabase-js/dist/module/index.js"))
  })
  check("the development cache is preserved and Turbopack remains explicitly configured", () => {
    const cache = { type: "filesystem" }
    const result = config.webpack({ cache, resolve: { alias: {} } }, { dev: true })
    assert.equal(result.cache, cache)
    assert.deepEqual(config.turbopack, {})
  })
  check("development uses the unchanged Next dev command", () => { const pkg = JSON.parse(execFileSync(process.execPath, ["-p", "JSON.stringify(require('./package.json'))"], { encoding: "utf8" })); assert.ok(pkg.scripts.dev.endsWith("next dev")); assert.ok(!pkg.scripts.dev.includes("--webpack")) })
} finally { rmSync(scratch, { recursive: true, force: true }) }
console.log(`\n${passed} checks passed`)
