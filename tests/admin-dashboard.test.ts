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
const PAGE = "app/(storelib)/admin/page.tsx"
const SHELL = "app/(storelib)/admin/_console/console.tsx"
const UI = "app/(storelib)/admin/_console/ui.tsx"

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
  const sectionLookup = route.indexOf("VIEWS.includes")
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

console.log("\nThe login refuses the wrong password, not the wrong capital letter\n")

/**
 * The username is not a secret: its default is written in the auth route, in
 * this repository. So comparing it case-sensitively can only ever refuse the
 * right person — and because the refusal deliberately says nothing about
 * which half was wrong, "Storelib" instead of "storelib" reads as a bad
 * password until somebody spots the capital.
 *
 * The password keeps every byte. A loose comparison there would hand an
 * attacker a smaller space to search, which is the opposite trade.
 */
const auth = code("app/api/admin/blog/auth/route.ts")
check(
  "the username is compared without case",
  /sameSecret\(username\.toLowerCase\(\), EXPECTED_USER\.toLowerCase\(\)\)/.test(auth),
)
check(
  "the password is compared exactly",
  /sameSecret\(password, EXPECTED_PASSWORD\)/.test(auth) && !/password\.toLowerCase\(\)/.test(auth),
  "every byte of a secret counts",
)
/**
 * `typeof body.username === "string"` contains the words but is not a
 * comparison of credentials, and a first version of this check failed on it.
 * What must never appear is either credential compared to what it is checked
 * against with `===`, which short-circuits on the first wrong byte.
 */
check(
  "and both stay constant time",
  /timingSafeEqual/.test(auth) &&
    !/username(\.toLowerCase\(\))? === EXPECTED_USER/.test(auth) &&
    !/password === EXPECTED_PASSWORD/.test(auth),
)
/**
 * THE CREDENTIAL IS IN THE ROUTE, AND THAT IS THE OWNER'S DECISION.
 *
 * This asked twice for the opposite — first for no default at all, then for a
 * scrypt digest — and both were declined in favour of the two values written
 * out, with no environment variable to set. So the checks are about what is
 * still true rather than about the shape of the secret: the environment can
 * still take over without a deploy, and the comparison is still constant
 * time, which is the part that would be a bug rather than a trade.
 */
check(
  "the environment can still take over from what is in the file",
  /process\.env\.BLOG_ADMIN_USER \|\| "/.test(auth) && /process\.env\.BLOG_ADMIN_PASSWORD \|\| "/.test(auth),
  "otherwise the only way to change the credential is a deploy",
)
check(
  "and the comparison does not short-circuit on the first wrong byte",
  /sameSecret\(password, EXPECTED_PASSWORD\)/.test(auth) && /timingSafeEqual/.test(auth),
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
  /f\.unreadable \?/.test(code(UI)) && /Could not be read/.test(read(UI)),
  "this is the branch that stops a failed query looking like a quiet week",
)
check(
  "in plain words, not the database's",
  /plainReason\(error, table\)/.test(metrics) && /problems\.push\(\{ metric, table, reason \}\)/.test(metrics),
  "raw PostgREST text stays in the server log",
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
  (shell.match(/status === 401\)[\s\S]{0,40}window\.location\.reload\(\)/g) ?? []).length >= 2,
  "an expired cookie and a missing one look the same from here",
)
check(
  "polling stops when the tab is not visible",
  (shell.match(/document\.visibilityState/g) ?? []).length >= 2,
  "a dashboard left open overnight should not be a thousand queries",
)
check(
  "the search box does not query per keystroke",
  /setTimeout\(\(\) => go\(\{ q, page: 1 \}, true\), 350\)/.test(shell),
)

/**
 * The buyer list is for telling rows apart, not for writing to. The masking
 * is one function, so there is one place to check.
 */
check(
  "buyer and account addresses are masked in every list",
  /buyer: email \? maskEmail\(email\)/.test(code("lib/admin/views/creators.ts")) &&
    /email: u\.email \? maskEmail\(u\.email\)/.test(code("lib/admin/views/platform.ts")),
  "an operator does not need a buyer's address to read a list",
)

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
