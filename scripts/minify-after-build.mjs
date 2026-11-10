/*
  MINIFIED AFTER TURBOPACK, NOT INSIDE IT (build memory, round 53).

  Vercel's Standard build machine has 8 GB and the build ran out of it: Turbopack
  holds the whole app's compiled graph in memory until it exits, and minifying
  ~24,000 chunk files inside that process was the last ~340 MB that tipped it
  over (measured on a cold `pnpm build`, 4 CPUs: 8.26 GB peak with Turbopack
  minifying, 7.92 GB without, and the compile 40 seconds faster).

  So next.config.mjs sets experimental.turbopackMinify: false and this step,
  a separate process that runs once Turbopack has exited and freed its memory,
  minifies the same files with esbuild: every browser chunk under
  .next/static and every server chunk under .next/server. What ships is
  minified as before; file names do not change (the pages and manifests point
  at them by name). A file esbuild cannot read is left exactly as Turbopack
  wrote it, and the step says how many, so a build never fails here.
*/
import { readdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { transform } from "esbuild"

const ROOT = new URL("../.next/", import.meta.url).pathname
const DIRS = ["static", "server"]
const CONCURRENCY = 8

async function* jsFiles(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* jsFiles(p)
    else if (e.name.endsWith(".js")) yield p
  }
}

const started = Date.now()
let files = 0
let before = 0
let after = 0
let skipped = 0

async function minifyOne(path) {
  const code = await readFile(path, "utf8")
  try {
    /* No format or target option: the file stays the script or module Turbopack wrote, in the same syntax; only whitespace, names inside functions and dead branches go. */
    const out = await transform(code, { minify: true, legalComments: "inline", charset: "utf8", logLevel: "silent" })
    if (out.code.length < code.length) {
      await writeFile(path, out.code)
      after += out.code.length
    } else {
      after += code.length
    }
  } catch {
    skipped++
    after += code.length
  }
  files++
  before += code.length
}

for (const d of DIRS) {
  const queue = []
  for await (const f of jsFiles(join(ROOT, d))) {
    queue.push(minifyOne(f))
    if (queue.length >= CONCURRENCY) await Promise.all(queue.splice(0))
  }
  await Promise.all(queue)
}

const mb = (n) => (n / 1048576).toFixed(1)
console.log(`Minified ${files} files after the build: ${mb(before)} MB to ${mb(after)} MB in ${((Date.now() - started) / 1000).toFixed(1)} s${skipped ? `, ${skipped} left as written` : ""}`)
