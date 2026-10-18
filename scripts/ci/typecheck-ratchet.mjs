#!/usr/bin/env node
/**
 * THE TYPE ERRORS MAY ONLY GO DOWN.
 *
 * next.config.mjs builds with `typescript.ignoreBuildErrors`, because the
 * codebase carries several hundred type errors from before anyone checked.
 * Turning that off today would stop every deploy. So the errors that exist
 * are written down, file by file, in .github/typescript-baseline.json, and
 * this fails when any file has MORE than it had, or a file that had none has
 * some. Fixing errors is always allowed; `--write` lowers the baseline to
 * match, so a fix cannot quietly be undone later. When the baseline is empty,
 * ignoreBuildErrors can go.
 *
 *   node scripts/ci/typecheck-ratchet.mjs          check (CI)
 *   node scripts/ci/typecheck-ratchet.mjs --write  record the current counts
 */
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const BASELINE = ".github/typescript-baseline.json"
let output = ""
try {
  output = execFileSync("pnpm", ["exec", "tsc", "--noEmit", "-p", "tsconfig.json", "--pretty", "false"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] })
} catch (e) {
  output = String(e.stdout ?? "") + String(e.stderr ?? "")
  // A killed compiler, missing executable, or exhausted heap is not zero errors.
  // Only a completed compiler with actual TS diagnostics can use the baseline.
  if (typeof e.status !== "number" || e.signal || !/error TS\d+/.test(output)) {
    console.error("TypeScript did not complete. Validation failed; the baseline was not changed.")
    console.error(output.slice(-2000))
    process.exit(1)
  }
}
const now = {}
const unlocated = []
for (const line of output.split("\n")) {
  const m = line.match(/^(.+?)\(\d+,\d+\): error TS\d+/)
  // Missing inputs and invalid compiler options have no source location.
  // They must not disappear merely because they cannot use a per-file budget.
  if (!m && /(?:^|\s)error TS\d+:/.test(line)) unlocated.push(line)
  /* .next/ is what a local build leaves behind; CI checks a fresh checkout, which has none. */
  if (m && !m[1].startsWith(".next/")) now[m[1]] = (now[m[1]] ?? 0) + 1
}
if (unlocated.length) {
  console.error("TypeScript reported validation errors without a source location. The baseline was not changed.")
  console.error(unlocated.join("\n"))
  process.exit(1)
}
const total = Object.values(now).reduce((a, b) => a + b, 0)
const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)))

if (process.argv.includes("--write")) {
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n")
  console.log(`baseline written: ${total} errors in ${Object.keys(sorted).length} files`)
  process.exit(0)
}

const before = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : {}
const worse = []
const better = []
for (const [file, n] of Object.entries(now)) {
  const was = before[file] ?? 0
  if (n > was) worse.push(`${file}: ${was} -> ${n}`)
}
for (const [file, was] of Object.entries(before)) {
  const n = now[file] ?? 0
  if (n < was) better.push(`${file}: ${was} -> ${n}`)
}
const baseTotal = Object.values(before).reduce((a, b) => a + b, 0)
console.log(`type errors: ${total} now, ${baseTotal} in the baseline`)
if (better.length) console.log(`fewer than the baseline (run with --write to keep them fixed):\n  ${better.join("\n  ")}`)
if (worse.length) {
  console.error(`MORE type errors than the baseline:\n  ${worse.join("\n  ")}`)
  const lines = output.split("\n").filter((l) => worse.some((w) => l.startsWith(w.split(":")[0] + "(")))
  console.error(lines.slice(0, 40).join("\n"))
  process.exit(1)
}
