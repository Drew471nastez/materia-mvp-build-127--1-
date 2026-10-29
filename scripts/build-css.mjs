/**
 * ===========================================================================
 *  THE STYLESHEET, COMPILED BEFORE `next build`, IN A PROCESS THAT ENDS
 * ===========================================================================
 * Vercel's Standard build machine has 8 GB. `next build` peaked at 9.2 GB on
 * a 4 CPU machine (round 41, "Build Failed (out of memory)"): Turbopack's own
 * memory, plus a PostCSS worker that held Tailwind's scan of the whole
 * project (0.86 GB) at the same moment, for one file, app/globals.css.
 *
 * This runs the same compile (the same plugin, @tailwindcss/postcss, from the
 * same file, at the same project root) on its own and exits, writing the
 * result to .next-css/globals.css. scripts/build-next.mjs then tells
 * postcss.config.mjs to hand that result over instead of compiling again
 * (scripts/postcss-precompiled.cjs), so the worker inside `next build` loads
 * no Tailwind at all. The CSS the site ships is the same: the build then
 * minifies it exactly as before. `next dev` never uses this.
 *
 * Runs after every step that writes sources Tailwind scans (gen-theme-dark
 * and the rest of `pnpm build`), so no class is missed.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const root = process.cwd()
const from = join(root, "app", "globals.css")
const outDir = join(root, ".next-css")
const out = join(outDir, "globals.css")

const started = Date.now()
/* As inside `next build`, where NODE_ENV is production: Tailwind optimizes its output there, and the stylesheet must be the same. */
const result = await postcss([tailwind({ optimize: true })]).process(readFileSync(from, "utf8"), { from, to: from })
mkdirSync(outDir, { recursive: true })
writeFileSync(out, result.css)
console.log(`Stylesheet compiled before the build: ${Math.round(result.css.length / 1024)} KB in ${Date.now() - started} ms (.next-css/globals.css)`)
