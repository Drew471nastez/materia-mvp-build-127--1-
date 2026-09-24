/**
 * ===========================================================================
 *  EVERY IMPORT NAMES A FILE THAT IS THERE
 * ===========================================================================
 * Two changes landed together: one renamed the coupon pages' loading.tsx to
 * skeleton.tsx, the other had those pages import "./loading". Every suite
 * passed, because no suite compiles those pages, and the production build
 * failed. This is the check that would have caught it, in a second, without
 * a build: every relative and "@/" import in the app resolves to a file.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"

const root = process.cwd()
const DIRS = ["app", "components", "lib", "hooks"]
const SKIP = new Set(["node_modules", ".next", ".claude"])
const EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".json", ".css", "/index.ts", "/index.tsx", "/index.js"]

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name) && !name.endsWith(".d.ts")) out.push(p)
  }
}

const files: string[] = []
for (const d of DIRS) walk(join(root, d), files)

const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g
const missing: string[] = []
let checked = 0
for (const file of files) {
  /* Comments out, and template strings emptied: code written as text (a
     starter site's source, say) is not an import of this app. */
  const text = readFileSync(file, "utf8")
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, "``")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
  for (const m of text.matchAll(IMPORT)) {
    const spec = m[1] ?? m[2]
    if (!spec) continue
    let base: string | null = null
    if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(file), spec)
    else if (spec.startsWith("@/")) base = join(root, spec.slice(2))
    if (!base) continue
    checked++
    if (!EXT.some((e) => existsSync(base + e) && (e !== "" || statSync(base + e).isFile()))) {
      missing.push(`${relative(root, file)} imports "${spec}"`)
    }
  }
}

console.log(`\nEvery import names a file that is there (${files.length} files, ${checked} imports)`)
if (missing.length === 0) console.log("  ok    all resolve")
for (const m of missing) console.log(`  FAIL  ${m}`)
console.log(`\n${missing.length === 0 ? 1 : 0} passed, ${missing.length === 0 ? 0 : 1} failed`)
if (missing.length) process.exit(1)
