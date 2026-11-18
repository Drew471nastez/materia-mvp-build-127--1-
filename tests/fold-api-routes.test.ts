/**
 * The production build folds each area of app/api into one entry (scripts/fold-api-routes.mjs) so it fits
 * Vercel's Standard build machine: measured 7,954 MB peak unfolded against 6,558 MB folded, and every
 * folded address answered byte for byte the same on both builds (769 addresses, 2,307 requests).
 * What must stay true: it is off outside Vercel; payments, cron and sign-in keep their own entries; a
 * route with config a shared entry cannot carry is left alone; and the build runs it before Next.
 */
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail)}` : ""}`) }
}

const run = (args: string[], env: Record<string, string> = {}) =>
  execFileSync(process.execPath, ["scripts/fold-api-routes.mjs", ...args], { encoding: "utf8", env: { ...process.env, VERCEL: "", STORELIB_FOLD_API: "", ...env } })

const off = run([])
check("off on a laptop or in CI: it changes nothing unless on Vercel or asked", /fold-api-routes: off/.test(off), off)
const dry = run(["--dry"])
const total = Number(/: (\d+) routes in (\d+) entries \(dry run\)/.exec(dry)?.[1] ?? 0)
check("most routes are folded (hundreds), into a few dozen entries", total > 500, dry.split("\n").slice(-2))
for (const area of ["stripe", "cron", "auth", "webhooks"]) check(`${area} keeps its own entries`, !new RegExp(`fold-api-routes: ${area}:`).test(dry))
const src = readFileSync("scripts/fold-api-routes.mjs", "utf8")
check("a route with revalidate, static params, dynamicParams or a non-Node runtime is left as it is", /revalidate\|generateStaticParams\|dynamicParams/.test(src) && /runtime\\s\*=\\s\*\["'\]\(\?!nodejs\)/.test(src))
check("routes are matched static, then [dynamic], then [...catch-all], then [[...optional]]", /kindOf = \(s\) => \(s\.startsWith\("\[\[\.\.\."\) \? 3 : s\.startsWith\("\[\.\.\."\) \? 2 : s\.startsWith\("\["\) \? 1 : 0\)/.test(src))
check("an import of a folded route is pointed at its new name", /renamed\.has\(target\)/.test(src) && /\.folded\$\{q\}/.test(src))
check("HEAD falls back to GET, and an unknown method is a 405 with Allow", /method === "HEAD"\) fn = mod\.GET/.test(src) && /status: 405/.test(src))
const build = JSON.parse(readFileSync("package.json", "utf8")).scripts.build as string
check("the build folds just before Next compiles", build.includes("node scripts/fold-api-routes.mjs && node --max-old-space-size=5120 scripts/build-next.mjs"))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
