/**
 * ===========================================================================
 *  THE TWO WALLS AROUND WHAT A STRANGER CAN DO
 * ===========================================================================
 * tests/admin-key-routes.test.ts catalogued 32 routes that answer somebody
 * with no account, because they have to. Being open on purpose is not the
 * same as being safe: nothing limited how often any of them could be called,
 * and nothing told a browser what it was allowed to run on a page built from
 * a creator's own markup.
 *
 * Two pieces, and they fail in OPPOSITE directions on purpose.
 *
 *   THE LIMITER FAILS OPEN. If it cannot reach its table it lets the request
 *   through. A limiter that took subscribing and password resets down with
 *   it would be a worse outage than the abuse it prevents.
 *
 *   THE SECRET GUARD FAILS CLOSED, which is lib/api/require-secret.ts and the
 *   other suite. A missing secret must never mean "let everybody in".
 *
 * Getting those two the wrong way round is the classic mistake, so both are
 * asserted here together where the contrast is visible.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CONTENT_SECURITY_POLICY, CSP_REPORT_ONLY_HEADER, CSP_REPORT_PATH } from "@/lib/security/csp"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** The routes that send mail or answer "was that guess right". */
const LIMITED: Record<string, string> = {
  "app/api/subscribe/route.ts": "subscribe",
  "app/api/website-builder/subscribe/route.ts": "subscribe",
  "app/api/onepage/email-capture/route.ts": "email-capture",
  "app/api/coupons/validate/route.ts": "coupon",
  "app/api/auth/request-password-reset/route.ts": "password-reset",
  "app/api/receipt/resend/route.ts": "receipt-resend",
  "app/api/app/orders/[id]/resend/route.ts": "order-resend",
  "app/api/app/orders/[id]/email/route.ts": "order-email-change",
}

function main() {
  const limiter = read("lib/api/rate-limit.ts")

  console.log("\nHow often a stranger may ask, counted where every function can see it")

  check("the count lives in Postgres, not in a variable",
    /from\("rate_limit_hits"\)/.test(limiter) && /createAdminClient/.test(limiter),
    "ten concurrent functions each start with an empty counter in memory and each let one through")
  check("and the table it counts in exists as a migration",
    /CREATE TABLE IF NOT EXISTS rate_limit_hits/.test(read("supabase/migrations/20260923_rate_limit_hits.sql")))
  check("which nothing but the server can reach",
    /ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY/.test(read("supabase/migrations/20260923_rate_limit_hits.sql")),
    "row level security on with no policies is the strictest setting, not an oversight")

  /*
    THE DIRECTION THIS ONE FAILS IN. Every path out of an error returns null,
    which means allow. The migration not having been run yet must not take
    subscribing down.
  */
  check("it allows the request when it cannot count",
    /if \(error\) \{[\s\S]{0,200}return null/.test(limiter)
      && /\} catch \(err\) \{[\s\S]{0,200}return null/.test(limiter),
    "a limiter that fails closed is an outage waiting for a database blip")
  check("and says so rather than failing quietly",
    /console\.error\(`\[rate-limit\]/.test(limiter))

  check("a refused request is not counted",
    /The refusal is NOT recorded/.test(limiter)
      && /return NextResponse\.json\(\s*\n\s*\{ error: options\.message/.test(limiter),
    "counting a rejection extends the block every time somebody retries, so they never get back under it")
  check("a missing address does not put every visitor in one bucket",
    /return address \? subjectKey\("ip", address\) : null/.test(limiter)
      && /const subjects = options\.subjects\.filter/.test(limiter),
    "one shared `unknown` subject lets one caller lock out everyone the header failed for")
  check("the forwarded address is read from the front of the list",
    /forwarded\?\.split\(","\)\[0\]/.test(limiter),
    "the later entries were appended by proxies in between and can be forged by the caller")
  check("and old rows are swept rather than kept for ever",
    /\.delete\(\)\.lt\("created_at", cutoff\)/.test(limiter))

  console.log("\nAnd it is on every route that sends mail or answers a guess")

  for (const [path, bucket] of Object.entries(LIMITED)) {
    const src = read(path)
    check(`${path.replace("app/api/", "")} is limited as "${bucket}"`,
      new RegExp(`bucket: "${bucket}"`).test(src) && /if \(limited\) return limited/.test(src))
  }
  /*
    Counting the address alone is not enough for anything that sends mail: a
    botnet rotates addresses. The address being MAILED is counted too, so one
    person cannot be sent a thousand messages however many machines ask.
  */
  check("anything that sends mail also counts the address being mailed",
    ["app/api/subscribe/route.ts", "app/api/auth/request-password-reset/route.ts", "app/api/onepage/email-capture/route.ts"]
      .every((p) => /emailSubject\(/.test(read(p))),
    "counting the caller alone is defeated by rotating the caller")

  console.log("\nAnd the browser is told what it may run, while nothing is enforced yet")

  const vercel = JSON.parse(read("vercel.json"))
  const headers = (vercel.headers ?? []).flatMap((h: { headers?: { key: string; value: string }[] }) => h.headers ?? [])
  const csp = headers.find((h: { key: string }) => h.key.startsWith("Content-Security-Policy"))

  check("the policy is served", !!csp)
  /*
    EITHER MODE IS VALID AND THE SWITCH IS DELIBERATE. Renaming the header to
    `Content-Security-Policy` is how this gets turned on once the reports have
    been quiet, and a test that failed on that would be friction against the
    one action it exists to lead to. What is asserted is that it is one of the
    two, and the mode is printed so a change of it is visible in the run.
  */
  const enforcing = csp?.key === "Content-Security-Policy"
  check("it is served in one of the two modes",
    enforcing || csp?.key === CSP_REPORT_ONLY_HEADER,
    `header is ${csp?.key}`)
  console.log(`  it is currently ${enforcing ? "ENFORCED" : "report-only, refusing nothing"}`)
  check("and the reports still have somewhere to go either way",
    CONTENT_SECURITY_POLICY.includes("report-uri"),
    "a policy with no report-uri stops telling you what it is breaking")
  /*
    ONE SOURCE. The header value is a long string in a JSON file and the
    reasoning behind every entry is in the module. Letting them drift means
    the comments describe a policy nobody is serving.
  */
  check("and it is exactly what lib/security/csp.ts builds",
    csp?.value === CONTENT_SECURITY_POLICY,
    "vercel.json and the module have drifted; copy the module's CONTENT_SECURITY_POLICY across")

  check("the things that need no exception at all are closed",
    /object-src 'none'/.test(CONTENT_SECURITY_POLICY) && /base-uri 'self'/.test(CONTENT_SECURITY_POLICY),
    "base-uri is the one that silently repoints every relative URL on a page")
  check("the hosts it allows are the ones the sanitiser already allows to be embedded",
    ["js.stripe.com", "player.vimeo.com", "open.spotify.com", "www.youtube-nocookie.com"]
      .every((host) => CONTENT_SECURITY_POLICY.includes(host)))
  check("and it says where to send what it would have refused",
    CONTENT_SECURITY_POLICY.includes(`report-uri ${CSP_REPORT_PATH}`))
  check("and the policy is driven in a browser rather than trusted to parse",
    /a strict control policy|default-src 'none'/.test(read("scripts/check-csp.mjs"))
      && /WHAT THIS CAN AND CANNOT SEE/.test(read("scripts/check-csp.mjs")),
    "report-only means a mistyped directive refuses nothing and shows up as nothing")
  check("the two admissions are written down rather than left to be discovered",
    /'unsafe-inline' in script-src\s+Next\.js hydrates/.test(read("lib/security/csp.ts")))

  console.log("\nAnd a report never carries a token into a log")

  const reporter = read("app/api/csp-report/route.ts")
  check("the reporting endpoint exists at the path the policy names",
    reporter.length > 0 && /export async function POST/.test(reporter))
  /*
    THE PART THAT MATTERS MOST HERE. A receipt link, a download link and a
    password reset link all carry their credential in the URL, and a
    violation report includes the address of the page it happened on.
  */
  check("everything after ? or # is cut before anything is logged",
    /const cut = raw\.split\(\/\[\?#\]\/\)\[0\]/.test(reporter)
      && (reporter.match(/pathOnly\(/g) ?? []).length >= 4,
    "a receipt token in a log is a receipt token somebody can read")
  check("script an extension injected is dropped, not reported as ours",
    /const EXTENSION = \/\^\(chrome\|moz\|safari/.test(reporter))
  check("the body is capped before it is parsed",
    /\.slice\(0, MAX_BODY\)/.test(reporter))
  check("and it always answers 204, whatever arrived",
    (reporter.match(/status: 204/g) ?? []).length >= 2,
    "a failing report endpoint must not look like a failing page")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
