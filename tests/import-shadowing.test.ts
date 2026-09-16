/**
 * ===========================================================================
 *  A LOCAL WITH AN IMPORT'S NAME TAKES THE WHOLE SITE DOWN
 * ===========================================================================
 * conditional-header imports `isSellerPage` and, further down the same
 * effect, declared `const isSellerPage = isSubdomain || isSellerPath`. A
 * `const` shadows the import for the ENTIRE block, not from its own line
 * onward, so the call above it reads a binding in its temporal dead zone:
 *
 *   ReferenceError: Cannot access 'a' before initialization
 *
 * That component is in the root layout, so every page on the site rendered
 * its error boundary instead — "Something went wrong on this page", on the
 * home page, every creator page and every product page. The server HTML was
 * fine and `curl` returned 200 the whole time; it died on hydration.
 *
 * IT SHIPPED BECAUSE NOTHING LOOKED. TypeScript reports this as TS2448 and
 * `next build` is configured to ignore type errors, so the build was green.
 * `tsc --noEmit` takes a minute and three quarters on this repo and reports
 * a few hundred pre-existing errors of other kinds, which is why it is not
 * the gate. This is the one rule that matters, and it runs in milliseconds:
 *
 *   a local binding may not have the same name as an imported one.
 *
 * The repository satisfies it with no exemptions, which is what makes it
 * worth enforcing rather than annotating.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n${detail}` : ""}`)
  }
}

const SKIP = new Set(["node_modules", ".next", ".git", "dist", "out"])
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx|ts)$/.test(name)) out.push(p)
  }
  return out
}

/** The names a file pulls in, reading `as` aliases as the local name. */
function importedNames(src: string): Set<string> {
  const names = new Set<string>()
  for (const m of src.matchAll(/^\s*import\s+\{([^}]*)\}\s+from\s+["'][^"']+["']/gm)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) names.add(name)
    }
  }
  return names
}

console.log("\nNothing shadows a name it imported\n")

const files = [...walk("app"), ...walk("components"), ...walk("lib"), ...walk("hooks")]
check("there are files to check", files.length > 100, `${files.length} found`)

const hits: string[] = []
for (const file of files) {
  const src = readFileSync(file, "utf8")
  const imported = importedNames(src)
  if (imported.size === 0) continue
  for (const m of src.matchAll(/(?:^|[;{}\s])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/g)) {
    if (!imported.has(m[1])) continue
    const line = src.slice(0, m.index ?? 0).split("\n").length
    hits.push(`          ${file}:${line}  declares "${m[1]}", which this file imports`)
  }
}

check(
  "no local declaration reuses an imported name",
  hits.length === 0,
  hits.join("\n") + "\n          a const shadows the import for the whole block, so any earlier call throws",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
