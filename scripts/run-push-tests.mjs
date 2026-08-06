/**
 * Runs tests/push-notifications.test.ts.
 *
 * tsc into a scratch directory, then node. There is no test runner in this
 * project and this does not add one: a runner is a dependency, a config file
 * and a watch mode, for a suite that is one file. If the suite grows past a
 * few files this should become vitest — that is the point at which the
 * dependency pays for itself, and not before.
 *
 * `server-only` resolves to an empty module outside a bundler, so the modules
 * under test import cleanly here.
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"

const out = mkdtempSync(join(tmpdir(), "storelib-push-"))
try {
  execFileSync(
    "npx",
    [
      "tsc",
      "tests/push-notifications.test.ts",
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

  const entry = walk(out).find((f) => f.endsWith("push-notifications.test.js"))
  if (!entry) throw new Error("compiled test not found")
  execFileSync(process.execPath, [entry], { stdio: "inherit" })
} finally {
  rmSync(out, { recursive: true, force: true })
}
