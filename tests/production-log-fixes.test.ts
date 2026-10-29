/**
 * ===========================================================================
 *  WHAT THE PRODUCTION LOG SAID, AND WHAT STOPS IT SAYING IT AGAIN
 * ===========================================================================
 * Each check here is one error group from the live runtime log:
 *
 *   "Country 'United States' is unknown"      the payout signup sent a name
 *   analytics_events_event_type_check          funnel steps were refused
 *   email_logs_email_type_check                receipt logs were refused
 *   "Cannot find module 'sharp'"               every invoice lost its mark
 *
 * and two things the same lines showed that should not have been there: a
 * buyer's address in a log line, and a database message in a public answer.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { countryCode } from "../lib/checkout/countries"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

console.log("\nA country is a code by the time it reaches Stripe")
for (const [given, want] of [
  ["US", "US"], ["us", "US"], [" ro ", "RO"], ["United States", "US"], ["united states of america", "US"],
  ["USA", "US"], ["UK", "GB"], ["United Kingdom", "GB"], ["Romania", "RO"], ["Germany", "DE"],
  ["Narnia", null], ["", null], [null, null], ["ZZ", null],
] as const) {
  check(`${JSON.stringify(given)} is ${JSON.stringify(want)}`, countryCode(given) === want, countryCode(given))
}
{
  const route = strip(read("app/api/stripe/connect/start/route.ts"))
  check("hosted payout signup does not create an account link", !/accountLinks\.create/.test(route))
}

console.log("\nThe database accepts every event and email type the app writes")
{
  const sql = read("supabase/sql/RUN_EVENT_AND_EMAIL_TYPES.sql")
  const migration = read("supabase/migrations/20260924_event_and_email_types.sql")
  check("the migration is the same file the owner runs", sql === migration)
  const events = /const EVENTS = \[([^\]]+)\]/.exec(read("app/api/track-event/route.ts"))?.[1] ?? ""
  const tracked = [...events.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  /* A page view is stored as EVENT.pageView (lib/analytics/events); part 61 carries the check that allows link_click. */
  const eventsTs = read("lib/analytics/events.ts")
  const eventBlock = eventsTs.slice(eventsTs.indexOf("export const EVENT = {"), eventsTs.indexOf("} as const", eventsTs.indexOf("export const EVENT = {")))
  const written = [...eventBlock.matchAll(/^\s+[a-zA-Z]+: "([a-z_]+)",$/gm)].map((m) => m[1])
  /* Changed on purpose (round 42): part 331 carries the check again, with nav_click (clicks between pages). */
  const part54 = read("supabase/sql/run-now/61_analytics_one_pipeline.sql") + "\n" + read("supabase/sql/run-now/331_analytics_clicks_between_pages_and_row_lines.sql")
  const allowed = [/analytics_events_event_type_check\s+check \(event_type in \(([\s\S]*?)\)\) not valid/.exec(sql)?.[1] ?? "", ...[...part54.matchAll(/analytics_events_event_type_check CHECK \(event_type IN \(([\s\S]*?)\)\) NOT VALID/g)].map((m) => m[1])].join(", ")
  const missing = [...new Set([...tracked, ...written, "purchase"])].filter((t) => !allowed.includes(`'${t}'`))
  check("every funnel step and view type is allowed", tracked.length >= 4 && written.includes("view") && written.includes("link_click") && missing.length === 0, missing)
  const types = /emailType: ([^\n]+)/.exec(read("lib/email.tsx"))?.[1] ?? ""
  const emailTypes = [...types.matchAll(/"([a-z_]+)"/g)].map((m) => m[1])
  const emailAllowed = /email_logs_email_type_check\s+check \(email_type in \(([^)]*)\)\) not valid/.exec(sql)?.[1] ?? ""
  check("every email type is allowed", emailTypes.length >= 3 && emailTypes.every((t) => emailAllowed.includes(`'${t}'`)), emailTypes)
  check("old rows are left alone (NOT VALID)", (sql.match(/not valid;/g) ?? []).length === 2)
}

console.log("\nLogs and answers carry no private data")
{
  const email = strip(read("lib/email.tsx"))
  check("a failed email log writes the code and message, not the row with the address in it",
    /Failed to log email attempt:", error\.code, error\.message\)/.test(email) && !/Failed to log email attempt:", error\)/.test(email))
  /* Every tracking answer is an empty 204 now (lib/analytics/collect-route); the log has the code and the message, the answer nothing. */
  const track = strip(read("lib/analytics/collect.ts")) + strip(read("lib/analytics/collect-route.ts"))
  check("a failed event says so without the database's words", /console\.error\("\[analytics\] insert failed:", error\.code/.test(track) && !/error: error\.message/.test(track) && /new NextResponse\(null, \{ status: 204 \}\)/.test(track))
}

console.log("\nThe invoice keeps its mark")
{
  const invoice = strip(read("app/api/invoice/route.ts"))
  check("no sharp, which the serverless bundle does not have", !/import\("sharp"\)/.test(invoice))
  check("a PNG the PDF library draws as it is, checked by its signature", /LOGO_PATH = STORELIB_LOGO_PNG/.test(invoice) && /export const STORELIB_LOGO_PNG = "\/images\/brand\/storelib-logo-v2\.png"/.test(read("lib/brand/logo.ts")) && /0x89, 0x50, 0x4e, 0x47/.test(invoice))
}

console.log("\nThe Mailgun webhook trusts only a signed delivery")
{
  const hook = strip(read("app/api/webhooks/mailgun/route.ts"))
  check("no signature is no entry (it used to skip the check when the field was missing)",
    /if \(!verifyWebhookSignature\(body\?\.signature\)\)/.test(hook) && !/if \(signature && MAILGUN_SIGNING_KEY\)/.test(hook))
  check("no key configured refuses everybody", /if \(SIGNING_KEYS\.length === 0\)[\s\S]{0,200}status: 401/.test(hook))
  check("the comparison is timing safe", /crypto\.timingSafeEqual\(/.test(hook) && !/encodedToken === signature/.test(hook))
  check("no address is written to the log in full", !/\$\{(recipient|email)\}/.test(hook))
}

console.log("\nA long AI edit ends before the platform ends it")
{
  const route = strip(read("app/api/website-builder/themes/[installId]/agent/route.ts"))
  check("the loop stops fifteen seconds before maxDuration, keeping what it did",
    /const deadline = AbortSignal\.timeout\(\(maxDuration - 15\) \* 1000\)/.test(route) && /signal: eitherSignal\(request\.signal, deadline\)/.test(route))
  check("and says it ran out of time rather than failing silently", /deadline\.aborted && !request\.signal\.aborted/.test(route))
}

console.log("\nNo dedupe lives only in one function's memory")
{
  const indexnow = strip(read("lib/seo/indexnow.ts"))
  check("IndexNow's ten minutes are counted in Postgres, in batches",
    /\.from\("rate_limit_hits"\)[\s\S]*?\.in\("subject", subjects\)/.test(indexnow) && /const fresh = await notSentElsewhere\(local, now\)/.test(indexnow))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log("\nFailed:")
  for (const f of failures) console.log(`  - ${f}`)
  process.exit(1)
}
