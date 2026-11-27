/**
 * ===========================================================================
 *  NO FILE IS HALF MERGED
 * ===========================================================================
 * Two sessions commit to this branch and to main at once, so merges happen
 * constantly, and one of them left a conflict in the editor's source: the
 * `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` lines, committed.
 *
 * Every suite passed. They read source as text and match patterns in it, so
 * a file that cannot be parsed at all looks to them like a file with some
 * extra lines. Only the production build noticed — and only because its
 * exit status was read rather than a line of its output grepped for.
 *
 * This is the cheap check that would have caught it first: no tracked source
 * file contains a line that is a merge marker.
 *
 * Run with:  npm run test:push
 */

import { execSync } from "node:child_process"
import { readFileSync } from "node:fs"

let failed = 0
const MARKER = /^(<{7} |={7}$|>{7} )/m

console.log("\nNo file is half merged")

const files = execSync("git ls-files", { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) /* The list passed 1 MB, execSync's default (round 68). */
  .split("\n")
  .filter((f) => /\.(tsx?|mjs|mts|cjs|js|css|json|sql|storelib)$/.test(f))
  /* The lockfile is machine-written and long; a conflict in it fails install. */
  .filter((f) => f !== "pnpm-lock.yaml")

const hits: string[] = []
for (const f of files) {
  let text: string
  try {
    text = readFileSync(f, "utf8")
  } catch {
    continue
  }
  const m = MARKER.exec(text)
  if (m) {
    const line = text.slice(0, m.index).split("\n").length
    hits.push(`${f}:${line}`)
  }
}

if (hits.length) {
  failed++
  console.log(`  FAIL  no tracked source file contains a merge-conflict marker\n        ${hits.slice(0, 10).join("\n        ")}`)
} else {
  console.log(`  ok    no tracked source file contains a merge-conflict marker (${files.length} checked)`)
}

console.log(`\n  ${failed ? 0 : 1} passed, ${failed} failed\n`)
if (failed) process.exit(1)
