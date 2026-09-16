/**
 * ===========================================================================
 *  THE ADMIN DASHBOARD: WHAT MUST NOT SLIP
 * ===========================================================================
 * Two things, and both of them are the kind that fail quietly.
 *
 * 1. THE GATE. Everything /admin shows is read through one route, and that
 *    route checks the admin cookie before it looks at anything else — before
 *    it even decides whether the section exists. One route is the point: a
 *    new panel cannot be added with the check left off, because there is
 *    nowhere to add it except behind the check. Verified over HTTP as well:
 *    every section, and an unknown one, answered 401 with no cookie.
 *
 * 2. A FAILED QUERY IS NOT A ZERO. PostgREST answers a query it cannot run
 *    with an error AND a null body, so the usual `const { data } = …` plus
 *    `data || []` turns a broken query into an empty result that reads
 *    exactly like "there are none". app/sitemap.ts shipped that line and
 *    listed zero creator pages for every request until somebody looked.
 *
 *    On a dashboard it is worse, because "Revenue today: $0" is a sentence an
 *    operator acts on. So the reader keeps every error, a figure that could
 *    not be read is null, and the card prints the reason instead of a number.
 *    Measured against a build whose database was unreachable: ten cards said
 *    "Unavailable", none said 0, and the Health tab named all twelve tables.
 */
import { readFileSync, existsSync } from "node:fs"

import { stripComments } from "./_source"

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
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "")
const code = (p: string) => stripComments(read(p))

const ROUTE = "app/api/admin/platform/[section]/route.ts"
const METRICS = "lib/admin/platform-metrics.ts"
const PAGE = "app/admin/page.tsx"
const SHELL = "app/admin/_admin-client.tsx"
const UI = "app/admin/_ui.tsx"

console.log("\nEverything the admin reads goes through one gated door\n")

const route = code(ROUTE)
check("the platform route exists", route.length > 0, ROUTE)
check(
  "and refuses anybody without the admin cookie",
  /if \(!\(await isAdminAuthenticated\(\)\)\)/.test(route),
  "the page gating itself is not a lock — this route is reachable with curl",
)
/**
 * Before the section is even looked at. Checking afterwards would answer 404
 * for a section that does not exist and 401 for one that does, which tells a
 * stranger what the sections are.
 */
{
  /* The CALL, not the identifier: the import line is at the top of the file
     and would satisfy this no matter where the check actually ran. */
  const gate = route.indexOf("if (!(await isAdminAuthenticated()))")
  const sectionLookup = route.indexOf("SECTIONS.includes")
  check(
    "before it decides whether the section exists",
    gate > 0 && sectionLookup > gate,
    `gate at ${gate}, section lookup at ${sectionLookup}`,
  )
}
check(
  "and it is read-only",
  !/export async function (POST|PUT|PATCH|DELETE)/.test(route),
  "an admin session must not be able to change data through the dashboard's own route",
)
check(
  "no second admin data route bypasses it",
  !existsSync("app/api/admin/platform/route.ts"),
  "a sibling route would be a second door with its own lock to forget",
)

console.log("\nA figure that could not be read is never printed as a zero\n")

const metrics = code(METRICS)
check("every read keeps its error", /if \(error\) \{[\s\S]{0,120}this\.note\(/.test(metrics))
check(
  "and returns null rather than an empty result",
  (metrics.match(/return null/g) ?? []).length >= 4,
  "an empty list is indistinguishable from a query that failed",
)
check(
  "a rejected query is one missing figure, not a blank page",
  /catch \(e\) \{[\s\S]{0,160}this\.note\(/.test(metrics),
  "an unreachable table would otherwise take the whole section down with it",
)
check(
  "the failures travel with the answer",
  /problems: r\.problems/.test(route),
  "the card cannot say why without them",
)
check(
  "and a card with no number says so",
  /unavailable \?/.test(code(UI)) && /Unavailable/.test(read(UI)),
  "this is the branch that stops a failed query looking like a quiet week",
)

console.log("\nThe page itself\n")

const page = code(PAGE)
check("is never indexed", /robots: \{ index: false/.test(page))
check(
  "and `admin` is a reserved handle",
  /"admin"/.test(read("lib/routes/reserved-segments.ts")),
  "otherwise a creator could take the handle and shadow this page",
)

const shell = code(SHELL)
check(
  "a 401 anywhere puts the login back",
  /unauthorised/.test(shell) && /signedOut\(\)/.test(shell),
  "an expired cookie and a missing one look the same from here",
)
check(
  "polling stops when the tab is not visible",
  (shell.match(/document\.visibilityState !== "visible"/g) ?? []).length >= 2,
  "a dashboard left open overnight should not be a thousand queries",
)
check(
  "the search box does not query per keystroke",
  /setTimeout\(\(\) => setDebounced/.test(shell),
)

/**
 * The buyer list is for telling rows apart, not for writing to. The masking
 * is one function, so there is one place to check.
 */
check(
  "buyer addresses are masked in the activity feed",
  /function maskEmail/.test(route) && /maskEmail\(o\.buyer_email\)/.test(route),
  "an operator does not need a buyer's address to read a list",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
