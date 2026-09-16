/**
 * ===========================================================================
 *  A CRON THAT IS REDIRECTED IS A CRON THAT NEVER RAN
 * ===========================================================================
 * Found in the production logs while answering "are the emails working":
 *
 *   10:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
 *   09:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
 *   08:00:37 GET /api/cron/process-scheduled-emails 301 [serverless-middleware]
 *
 * every hour, and never a line from the route itself.
 *
 * Vercel invokes a cron on the project's own deployment host, which is a
 * `*.vercel.app` name. The proxy's canonicalisation treated any host that was
 * not storelib.com as a creator's custom domain and sent it to `www.`, so the
 * cron was answered with a 301 to a host that does not exist. Four jobs were
 * affected: scheduled flow emails, payout holds, the daily analytics rollup
 * and the chat attachment purge.
 *
 * Two rules keep it fixed, and this file is the only thing that will notice
 * if either is dropped, because a dead cron produces no error anywhere — it
 * produces nothing at all, which looks exactly like a quiet week.
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

const proxy = stripComments(readFileSync("proxy.ts", "utf8"))
const vercelJson = JSON.parse(readFileSync("vercel.json", "utf8"))

console.log("\nNothing under /api is redirected for tidiness\n")

check(
  "the proxy knows an API call when it sees one",
  /const isApiCall = pathname === "\/api" \|\| pathname\.startsWith\("\/api\/"\)/.test(proxy),
)

/**
 * Every host-canonicalising redirect, by the condition that guards it. A 301
 * here does two bad things to an API call: it never reaches the route, and it
 * rewrites a POST into a GET, so a webhook arrives as an empty request rather
 * than failing in a way somebody would see.
 */
for (const [name, pattern] of [
  ["www.storelib.com to the apex", /if \(!isApiCall && bareHost === `www\.\$\{MAIN_DOMAIN\}`\)/],
  ["a custom domain to its www", /if \(!isApiCall && isExternalDomain && !hostWithoutPort\.startsWith\("www\."\)\)/],
] as const) {
  check(`${name} skips API calls`, pattern.test(proxy))
}

console.log("\nThe platform's own deployment host is not a creator's domain\n")

check(
  "a vercel.app host is recognised as the platform's",
  /const isPlatformHost = hostWithoutPort\.endsWith\("\.vercel\.app"\)/.test(proxy),
)
check(
  "and is therefore not treated as an external domain",
  /const isExternalDomain = !isPlatformHost &&/.test(proxy),
  "this is the host Vercel invokes every cron on",
)

console.log("\nEvery scheduled job still has a route to reach\n")

const crons: { path: string; schedule: string }[] = vercelJson.crons ?? []
check("vercel.json declares the crons", crons.length >= 4, `${crons.length} found`)
for (const cron of crons) {
  const route = `app${cron.path}/route.ts`
  check(`${cron.path} has a route`, existsSync(route), route)
  if (!existsSync(route)) continue
  const src = stripComments(readFileSync(route, "utf8"))
  check(`${cron.path} answers GET`, /export async function GET/.test(src))
  /* Vercel sends the secret as a bearer token; a cron with no check is a
     public button that anybody can press. */
  check(
    `${cron.path} checks CRON_SECRET`,
    /CRON_SECRET/.test(src),
    "otherwise anybody can trigger it",
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log("\nFailures:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
