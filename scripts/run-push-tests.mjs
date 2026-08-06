/**
 * Runs every suite under tests/.
 *
 * tsc into a scratch directory, then node. There is no test runner in this
 * project and this does not add one: a runner is a dependency, a config file
 * and a watch mode, for a suite that is two files. If this grows past a
 * handful this should become vitest — that is the point at which the
 * dependency pays for itself, and not before.
 *
 * Both suites are compiled TOGETHER and run in separate processes. Together,
 * because they share modules and one tsc invocation is faster than two;
 * separately, because each suite calls process.exit(1) on failure and a shared
 * process would let the first failure hide the second suite entirely.
 *
 * `server-only` resolves to an empty module outside a bundler, so the modules
 * under test import cleanly here.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, basename } from "node:path"

const SUITES = [
  "tests/push-notifications.test.ts",
  "tests/activity-notifications.test.ts",
  "tests/auth-session.test.ts",
]

const out = mkdtempSync(join(tmpdir(), "storelib-push-"))
let anyFailed = false
try {
  execFileSync(
    "npx",
    [
      "tsc",
      ...SUITES,
      "--outDir", out,
      "--target", "es2022",
      "--module", "esnext",
      "--moduleResolution", "bundler",
      "--skipLibCheck",
      "--strict", "false",
    ],
    { stdio: "inherit" },
  )

  // Emitted ESM needs real extensions, and `server-only` is not resolvable
  // from a temp directory — it contributes nothing to these modules anyway.
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
  for (const file of walk(out)) {
    if (!file.endsWith(".js")) continue
    let src = readFileSync(file, "utf8")
    src = src.replace(/from\s+["'](\.[^"']*?)["']/g, (m, spec) =>
      spec.endsWith(".js") ? m : m.replace(spec, `${spec}.js`))
    src = src.replace(/^\s*import\s+["']server-only["'];?\s*$/gm, "")
    writeFileSync(file, src)
  }
  writeFileSync(join(out, "package.json"), '{"type":"module"}\n')

  const compiled = walk(out)
  for (const suite of SUITES) {
    const wanted = basename(suite).replace(/\.ts$/, ".js")
    const entry = compiled.find((f) => f.endsWith(wanted))
    if (!entry) throw new Error(`compiled test not found for ${suite}`)
    console.log(`\n──────── ${suite} ────────`)
    try {
      execFileSync(process.execPath, [entry], { stdio: "inherit" })
    } catch {
      // The suite already printed which assertions failed. Recorded and
      // carried on, so a failure in the first suite does not hide the second.
      anyFailed = true
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true })
}

if (anyFailed) {
  console.log("\nsome suites failed")
  process.exit(1)
}
console.log("\nall suites passed")
