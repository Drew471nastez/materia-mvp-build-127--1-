/**
 * A name the code uses that nothing defines is a crash waiting for its first
 * visitor. next.config.mjs builds with typescript.ignoreBuildErrors (the
 * project carries a few hundred older type errors), so the production build
 * lets these through, and they reach storelib.com as ReferenceErrors:
 * lib/github-sync/own-install.ts called routeUser and createClient without
 * importing them (every GitHub site route answered 500), and the sections
 * page named a FooterSettingsForm that was never written.
 *
 * This runs the whole project's type check and fails on the errors that mean
 * "this name or module does not exist", whatever else is in the log:
 *   TS2304 Cannot find name
 *   TS2552 Cannot find name, did you mean
 *   TS2307 Cannot find module
 *   TS2582 / TS2583 / TS2584 Cannot find name (a missing lib or types package)
 *
 * Usage: node scripts/check-unbound-names.mjs [--log <tsc output file>]
 * With --log it reads a saved `tsc --noEmit` output instead of running tsc.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

export const UNBOUND_CODES = ["TS2304", "TS2552", "TS2307", "TS2582", "TS2583", "TS2584"]

/** The unbound-name errors in a tsc log, one entry per error line. */
export function unboundNames(log) {
  const out = []
  for (const line of String(log).split("\n")) {
    const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line.trim())
    if (m && UNBOUND_CODES.includes(m[4])) out.push({ file: m[1], line: Number(m[2]), code: m[4], message: m[5] })
  }
  return out
}

function runTsc() {
  try {
    execFileSync("pnpm", ["exec", "tsc", "--noEmit", "--pretty", "false", "-p", "tsconfig.json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    })
    return ""
  } catch (error) {
    /* tsc exits 2 when there are any errors at all; its log is what matters. */
    const e = /** @type {{ stdout?: string, stderr?: string }} */ (error)
    if (!e.stdout && e.stderr) throw error
    return e.stdout ?? ""
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const at = process.argv.indexOf("--log")
  const log = at > 0 ? readFileSync(process.argv[at + 1], "utf8") : runTsc()
  const found = unboundNames(log)
  if (found.length) {
    console.error(`\n${found.length} name(s) used but never defined. Each is a crash on the live site:`)
    for (const f of found) console.error(`  ${f.file}:${f.line}  ${f.code}  ${f.message}`)
    process.exit(1)
  }
  console.log("unbound names: none (TS2304, TS2552, TS2307 and the missing-lib codes)")
}
