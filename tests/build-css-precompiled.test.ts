/**
 * THE STYLESHEET IS COMPILED BEFORE `next build`, SO THE BUILD FITS 8 GB
 *
 * Vercel's Standard build machine stopped round 41's deployment: "Build
 * Failed (out of memory)". `next build` peaked at 9.1 GB on 4 CPUs, a
 * PostCSS worker holding Tailwind's scan (0.86 GB) beside Turbopack. Now
 * scripts/build-css.mjs compiles app/globals.css first, in a process that
 * ends, and the build hands that result over (postcss.config.mjs with
 * STORELIB_CSS_PRECOMPILED=1, scripts/postcss-precompiled.cjs). Measured: the
 * peak fell to 8.4 GB, and the shipped CSS files were byte for byte the same
 * as a build that compiled Tailwind itself.
 *
 * Run with:  npx tsx tests/build-css-precompiled.test.ts
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { createRequire } from "node:module"
import postcss from "postcss"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `: ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  const build = JSON.parse(read("package.json")).scripts.build as string
  const at = (s: string) => build.indexOf(s)
  check("the stylesheet is compiled after every step that writes sources, before next build", at("gen-theme-dark.mjs") > 0 && at("gen-theme-dark.mjs") < at("scripts/build-css.mjs") && at("scripts/build-css.mjs") < at("scripts/build-next.mjs"), build)
  const compile = read("scripts/build-css.mjs")
  check("it compiles with the same plugin, optimized as in a production build", /tailwind\(\{ optimize: true \}\)/.test(compile) && /app", "globals\.css"/.test(compile) && /\.next-css/.test(compile))
  const config = read("postcss.config.mjs")
  check("Tailwind for every compile but the build that was handed the result", /STORELIB_CSS_PRECOMPILED === "1"/.test(config) && /"@tailwindcss\/postcss": \{\}/.test(config) && /postcss-precompiled\.cjs/.test(config))
  const next = read("scripts/build-next.mjs")
  check("the build uses it only when it is there and newer than its source; told otherwise, it compiles itself", /existsSync\(compiled\)/.test(next) && /statSync\(compiled\)\.mtimeMs >= statSync\(source\)\.mtimeMs/.test(next) && /process\.env\.STORELIB_CSS_PRECOMPILED === undefined/.test(next))
  check("the compiled file is never committed", /^\/\.next-css\/$/m.test(read(".gitignore")))

  /* The plugin, run as the build runs it: from the project root. */
  const dir = mkdtempSync(join(tmpdir(), "precss-"))
  const cwd = process.cwd()
  try {
    mkdirSync(join(dir, "app"))
    mkdirSync(join(dir, ".next-css"))
    writeFileSync(join(dir, ".next-css", "globals.css"), ".compiled{color:red}")
    process.chdir(dir)
    const plugin = createRequire(join(cwd, "package.json"))(join(cwd, "scripts", "postcss-precompiled.cjs"))
    const globals = await postcss([plugin()]).process('@import "tailwindcss";\n.x{}', { from: join(dir, "app", "globals.css") })
    check("app/globals.css becomes the compiled stylesheet", globals.css === ".compiled{color:red}", globals.css)
    const other = await postcss([plugin()]).process(".dark .a{color:#fff}", { from: join(dir, "app", "theme-dark.css") })
    check("every other stylesheet passes through untouched", other.css === ".dark .a{color:#fff}", other.css)
  } finally {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
