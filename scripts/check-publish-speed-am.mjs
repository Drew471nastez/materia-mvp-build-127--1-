/**
 * ===========================================================================
 *  A PUBLISH ON ONE SERVER, AS ITS VISITORS SEE IT (round AM)
 * ===========================================================================
 * Runs scripts/measure-speed18.mjs PUBLISH_FLOW (scripts/speed18/bench.tsx
 * publishFlow): an imported theme's live site on one server, through its
 * real route over the fake PostgREST, its first visitor, the held ones, a
 * page nobody opened on the warm server, then a real Publish purge and the
 * visitors after it, for BASE (default origin/main) and the working tree.
 *
 *   RTT        ms per database round trip (default 20)
 *   CACHE_RTT  ms per answer of the shared data cache (default 40; on
 *              Vercel each one is a request to it)
 *
 * Fails when, in the working tree, a visitor after the Publish is shown the
 * theme from before it, or a held page or a page nobody opened is slower
 * than before.
 *
 *   flock /tmp/v-heavy.lock node scripts/check-publish-speed-am.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const dir = mkdtempSync(join(tmpdir(), "publish-speed-"))
const out = join(dir, "flow.json")
try {
  execFileSync(process.execPath, ["scripts/measure-speed18.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PUBLISH_FLOW: "1", BASE: process.env.BASE ?? "origin/main", RTT: process.env.RTT ?? "20", CACHE_RTT: process.env.CACHE_RTT ?? "40", JSON_OUT: out },
  })
  const [before, now] = JSON.parse(readFileSync(out, "utf8"))
  const step = (r, name) => r.flow.find((s) => s.step === name)
  const problems = []
  for (const name of ["first visitor after Publish", "second visitor after Publish", "another page after Publish"]) {
    if (step(now, name)?.theme !== "new") problems.push(`${name}: shown the theme from before the Publish`)
  }
  for (const name of ["third visitor (held)", "a page nobody opened yet, warm server", "second visitor after Publish", "another page after Publish"]) {
    const b = step(before, name)?.ms
    const n = step(now, name)?.ms
    console.log(`${name.padEnd(40)} before ${String(b).padStart(5)}ms   now ${String(n).padStart(5)}ms`)
    if (typeof b === "number" && typeof n === "number" && n > b * 1.1 + 5) problems.push(`${name}: ${n}ms, slower than ${b}ms before`)
  }
  if (problems.length) {
    console.log(`\nFAIL\n  ${problems.join("\n  ")}`)
    process.exit(1)
  }
  console.log("\nok: the new theme from the first visitor after a Publish, and held pages and warm draws no slower")
} finally {
  rmSync(dir, { recursive: true, force: true })
}
