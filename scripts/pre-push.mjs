#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE FAST CHECKS, BEFORE A PUSH (a minute, not CI's forty)
 * ===========================================================================
 * CI (.github/workflows/ci.yml) runs the whole suite, lint, the type error
 * ratchet and a production build on every pull request and push to main.
 * This runs the part of that a change can break, on this machine, first:
 *
 *   1. ESLint on the changed .js/.mjs/.cjs files (the repo's ESLint covers only those);
 *   2. the test suites that are changed, or that read a changed file
 *      (by its path in the suite's source), from scripts/run-push-tests.mjs;
 *   3. with --types, the type error ratchet (scripts/ci/typecheck-ratchet.mjs, a few minutes).
 *
 *   node scripts/pre-push.mjs                     against the merge base with origin/main
 *   node scripts/pre-push.mjs --base main --types
 *   node scripts/pre-push.mjs --list              print what it would run, run nothing
 *
 * As a git hook (one time, per clone):
 *   printf '#!/bin/sh\nexec node scripts/pre-push.mjs\n' > .git/hooks/pre-push && chmod +x .git/hooks/pre-push
 *
 * Exits 1 when anything failed. It never changes a file in the checkout: the
 * filtered runner is written to the system's temp directory.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const argv = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback
}
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

/** The suites to run for a set of changed files. Exported for the test suite. */
export function suitesFor(changed, suites, readSource) {
  const stems = changed
    .filter((f) => /\.(ts|tsx|mjs|js|cjs|json|sql)$/.test(f) && !f.startsWith("tests/"))
    .map((f) => f.replace(/\.(ts|tsx|mjs|js|cjs)$/, ""))
  const out = []
  for (const s of suites) {
    if (changed.includes(s)) {
      out.push(s)
      continue
    }
    const src = readSource(s)
    if (src && stems.some((stem) => src.includes(stem))) out.push(s)
  }
  return out
}

/** SUITES and STRICT_SUITES as listed in scripts/run-push-tests.mjs. */
export function listedSuites(runnerSource) {
  const out = []
  for (const name of ["SUITES", "STRICT_SUITES"]) {
    const m = runnerSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`))
    if (m) for (const t of m[1].matchAll(/"(tests\/[^"]+\.test\.ts)"/g)) out.push(t[1])
  }
  return out
}

function main() {
  const base = opt("base", "origin/main")
  let from
  try {
    from = git("merge-base", base, "HEAD")
  } catch {
    console.error(`pre-push: cannot find the merge base with ${base}. Pass --base <branch>.`)
    process.exit(2)
  }
  const changed = [...new Set([...git("diff", "--name-only", `${from}...HEAD`).split("\n"), ...git("diff", "--name-only", "HEAD").split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")].filter(Boolean))].filter((f) => existsSync(f))
  const runner = readFileSync("scripts/run-push-tests.mjs", "utf8")
  const suites = suitesFor(changed, listedSuites(runner), (s) => (existsSync(s) ? readFileSync(s, "utf8") : ""))
  const lintable = changed.filter((f) => /\.(m?js|cjs)$/.test(f))
  console.log(`pre-push: ${changed.length} changed files since ${base}; ${lintable.length} to lint; ${suites.length} suites`)
  if (argv.includes("--list")) {
    for (const s of suites) console.log(`  ${s}`)
    return
  }
  let failed = 0
  if (lintable.length) {
    const r = spawnSync(process.execPath, ["node_modules/eslint/bin/eslint.js", ...lintable], { stdio: "inherit" })
    if (r.status !== 0) failed++
  }
  if (suites.length) {
    /* The same runner, with its lists cut to these suites; written outside the checkout. */
    const keep = (name, src) =>
      src.replace(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\]`), (_m, body) => {
        const lines = body.split("\n").filter((l) => {
          const t = l.match(/"(tests\/[^"]+)"/)
          return !t || suites.includes(t[1])
        })
        return `const ${name} = [${lines.join("\n")}\n]`
      })
    const dir = mkdtempSync(join(tmpdir(), "pre-push-"))
    const gen = join(dir, "run-push-tests.mjs")
    writeFileSync(gen, keep("STRICT_SUITES", keep("SUITES", runner)))
    const r = spawnSync(process.execPath, [gen], { stdio: "inherit" })
    rmSync(dir, { recursive: true, force: true })
    if (r.status !== 0) failed++
    /* The runner rebuilds the SQL catalog; put it back unless SQL changed. */
    if (!changed.some((f) => f.startsWith("supabase/"))) spawnSync("git", ["checkout", "--", "lib/admin/sql-catalog.generated.json"], { stdio: "ignore" })
  }
  if (argv.includes("--types")) {
    const r = spawnSync(process.execPath, ["scripts/ci/typecheck-ratchet.mjs"], { stdio: "inherit", env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=6144" } })
    if (r.status !== 0) failed++
  }
  if (failed) {
    console.error("\npre-push: failed. CI would fail the same way.")
    process.exit(1)
  }
  console.log("\npre-push: passed")
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main()
