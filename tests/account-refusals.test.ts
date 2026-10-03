/**
 * ===========================================================================
 *  ACCOUNT AND CONFIGURATION REFUSALS FAIL CALMLY, AND SAY SO ONCE
 * ===========================================================================
 * The production log's groups that are not faults in the code but in an
 * account or a setting, each made to answer plainly and log one line:
 *
 *   CRON_SECRET not set        every scheduled job refused (447 times). The
 *                              check stays closed; the jobs Vercel runs are
 *                              the routes that exist, and each accepts
 *                              Vercel's own "Authorization: Bearer" header.
 *   Stripe rejected accounts   a calm sentence and a code, not Stripe's words
 *                              about "your account" with a 500.
 *   Anthropic credit           the category suggestion falls back to its
 *                              keywords and says so once.
 *   Firebase push              "app/no-app" was code: the sender never made
 *                              the app. Without credentials, one line.
 */
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import Anthropic from "@anthropic-ai/sdk"
import { requireBearerSecret } from "@/lib/api/require-secret"
import { stripeRefusal } from "@/lib/stripe/refusal"
import { isBillingRefusal } from "@/lib/products/category-suggest-claude"
import { getFirebaseAdmin } from "@/lib/firebase/admin"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
const out = console.log.bind(console)
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; out(`  ok    ${label}`) }
  else { failed++; failures.push(label); out(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const errors: string[] = []
const warns: string[] = []
console.error = (...a: unknown[]) => void errors.push(a.map(String).join(" "))
console.warn = (...a: unknown[]) => void warns.push(a.map(String).join(" "))

async function main() {
  out("\nScheduled jobs")
  {
    const scheduled = (JSON.parse(read("vercel.json")).crons as Array<{ path: string }>).map((c) => c.path).sort()
    const routes = readdirSync(join(process.cwd(), "app/api/cron")).map((d) => `/api/cron/${d}`).sort()
    check("every job Vercel runs is a route that exists, and every route is scheduled", JSON.stringify(scheduled) === JSON.stringify(routes), { scheduled, routes })
    for (const path of routes) {
      const src = read(`app${path}/route.ts`)
      check(`${path}: a GET, behind CRON_SECRET`, /export async function GET/.test(src) && /requireBearerSecret\(request, "CRON_SECRET"\)/.test(src))
    }
    delete process.env.CRON_SECRET
    errors.length = 0
    const unset = requireBearerSecret(new Request("https://storelib.com/api/cron/notify", { headers: { authorization: "Bearer undefined" } }), "CRON_SECRET")
    check("not set: refused, with one line naming the variable", unset?.status === 401 && errors.length === 1 && /CRON_SECRET is not configured/.test(errors[0]), errors)
    process.env.CRON_SECRET = "s3cret-value"
    const vercel = requireBearerSecret(new Request("https://storelib.com/api/cron/notify", { headers: { authorization: "Bearer s3cret-value" } }), "CRON_SECRET")
    check("set: Vercel's Authorization: Bearer <CRON_SECRET> is let through", vercel === null)
    const wrong = requireBearerSecret(new Request("https://storelib.com/api/cron/notify", { headers: { authorization: "Bearer guess" } }), "CRON_SECRET")
    check("and anything else is refused", wrong?.status === 401)
  }

  out("\nStripe accounts that were rejected")
  {
    const platform = stripeRefusal(new Error("You cannot create new accounts because your account has been rejected."))
    check("Storelib's account rejected: 503, platform_rejected, and it says it is not the creator's doing", platform?.status === 503 && platform.code === "platform_rejected" && /not yours/.test(platform.error), platform)
    const account = stripeRefusal(new Error("An account link cannot be created for this account because the account has been rejected."))
    check("the creator's payout account rejected: 409, account_rejected, and who to write to", account?.status === 409 && account.code === "account_rejected" && /support@storelib\.com/.test(account.error), account)
    const charges = stripeRefusal(new Error("Your account cannot currently make live charges."))
    check("no live charges: 503, and nothing was charged", charges?.status === 503 && charges.code === "platform_cannot_charge" && /nothing was charged/.test(charges.error), charges)
    const restricted = stripeRefusal(new Error("We've temporarily restricted your ability to create this type of connected account due to suspicious activity. Please log in to the Stripe Dashboard to confirm that you intended to create these accounts."))
    check("platform held for a check: 503, platform_restricted, not the creator's doing, and no raw Stripe words about logging in", restricted?.status === 503 && restricted.code === "platform_restricted" && /not yours/.test(restricted.error) && !/suspicious|Dashboard|log in/i.test(restricted.error), restricted)
    check("anything else is not taken for one of these", stripeRefusal(new Error("Your card was declined.")) === null && stripeRefusal(null) === null)
    check("no em dash, no Stripe jargon in what the creator reads", [platform, account, charges, restricted].every((r) => r && !/—|express|connect/i.test(r.error)))
    for (const [route, where] of [["app/api/billing/subscription/create/route.ts", "billing/subscription/create"]]) {
      const src = read(route)
      check(`${where} answers with it before its generic failure`, src.indexOf("stripeRefusal(error)") > 0 && src.indexOf("stripeRefusal(error)") < src.lastIndexOf("console.error(") && src.includes(`logStripeRefusal("${where}", refusal)`))
    }
    check("hosted account links are not created", !/accountLinks\.create/.test(read("app/api/stripe/account-link/route.ts")) && !/accountLinks\.create/.test(read("app/api/stripe/connect/start/route.ts")))
  }

  out("\nAnthropic credit")
  {
    const credit = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } }, undefined, new Headers())
    check("the credit refusal is recognised", isBillingRefusal(credit))
    check("an ordinary bad request is not", !isBillingRefusal(new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error", message: "messages: roles must alternate" } }, undefined, new Headers())))
    const src = read("lib/products/category-suggest-claude.ts")
    check("it pauses asking and says so once", /pausedUntil = Date\.now\(\) \+ BILLING_PAUSE_MS/.test(src) && /if \(!saidBilling\) console\.warn/.test(src) && /if \(Date\.now\(\) < pausedUntil\) return null/.test(src))
    const client = read("app/app/products/new/category-suggestion.ts")
    check("the editor shows nothing for a failed answer", /if \(!res\.ok\) return/.test(client) && !/toast/i.test(client))
  }

  out("\nPush to phones")
  {
    const sender = stripComments(read("lib/push/sender.ts"))
    check("the sender makes the Firebase app before its first message", /getFirebaseAdmin\(\)/.test(sender) && /firebase\.messaging\(\)\.send\(message\)/.test(sender) && !/admin\.messaging\(\)/.test(sender))
    delete process.env.FIREBASE_PROJECT_ID
    warns.length = 0
    errors.length = 0
    check("without credentials there is no app", getFirebaseAdmin() === null && getFirebaseAdmin() === null)
    check("and one quiet line, however often it is asked", warns.length === 1 && /Push to phones is off/.test(warns[0]) && errors.length === 0, { warns, errors })
  }

  out(`\n${passed} passed, ${failed} failed`)
  if (failed) { for (const f of failures) out(`  - ${f}`); process.exit(1) }
}
main()
