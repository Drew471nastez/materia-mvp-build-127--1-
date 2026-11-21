/** Round AV: major platform issues found in production logs and fixed. */
import { existsSync, readFileSync } from "node:fs"
import { needsPlatformApproval, paymentsSetupErrorMessage } from "@/lib/payments/stripe/setup-errors"
import { stripeRefusal } from "@/lib/stripe/refusal"
import { accountAttempts } from "@/lib/payments/stripe/account-attempts"

let failed = 0
let passed = 0
function check(name: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${name}`) } else { failed++; console.log(`  FAIL  ${name}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "")

console.log("\nA seller Stripe will not open a transfers-only account for is told why, not 'try again'")
/* The sentence production logged, Nov 6 to 10, for one seller, again and again. */
const STRIPE = "Your platform needs approval for accounts to have requested the `transfers` capability without the `card_payments` capability. If you would like to request transfers without card_payments, please contact us via https://support.stripe.com/contact."
check("the refusal is recognised", needsPlatformApproval(STRIPE))
check("other refusals are not", !needsPlatformApproval("You cannot request the card_payments capability for accounts in country DE") && !needsPlatformApproval("The country RO is not supported"))
const said = paymentsSetupErrorMessage({ message: STRIPE })
check("the seller is told it is on Storelib's side and nothing was saved", /not open on Storelib yet/.test(said) && /nothing was saved/.test(said) && /support@storelib\.com/.test(said))
check("never 'try again in a moment', which could not work", !/try again/i.test(said))
check("never 'choose another country' (the country is not the problem)", !/choose another country/i.test(said))
const refusal = stripeRefusal({ message: STRIPE })
check("the route answers it as a platform refusal (503), with the same words", refusal?.status === 503 && refusal?.code === "platform_needs_transfers_approval" && /not open on Storelib yet/.test(refusal.error))
check("its words carry no em dash and none of the banned words", !/—/.test(said) && !/unlock|elevate|seamless|powerful|effortlessly|supercharge|transform/i.test(said))
const connect = code("lib/payments/stripe/connect.ts")
check("after that refusal the other transfers-only attempts are skipped (each would get the same answer)", /if \(approvalNeeded && !params\.capabilities\?\.card_payments\) continue/.test(connect))
check("an attempt that asks card_payments is still tried", accountAttempts({}, "domestic").some((p) => !!p.capabilities?.card_payments))
check("the owner gets one plain log line saying what to ask Stripe for", /stripe_transfers_only_needs_platform_approval/.test(connect))
check("a platform block still wins, then a closed country, then this", /throw blocker \?\? countryBlocked \?\? approvalNeeded \?\? last/.test(connect))

console.log("\nA store's address answers from the last good lookup when the database is slow, not with a 500")
const data = read("lib/commerce/creator-page-data.ts")
const strictProfile = data.slice(data.indexOf("export const loadProfileByUsernameStrict"), data.indexOf("export const loadProfileByUsername = "))
check("the name is still read live on every request", /await publicProfileByNameStrict\(stranger\(\), username\)/.test(strictProfile))
check("a read that found someone is kept", /if \(row\) whoLastGood\.remember\(`profile:\$\{key\}`, row\)/.test(strictProfile))
check("a read that found no one forgets the name (a 404 stays a 404)", /else whoLastGood\.forget\(`profile:\$\{key\}`\)/.test(strictProfile))
check("only a read that FAILED answers from the kept copy, and with none it still throws", /catch \(error\) \{\s*const held = whoLastGood\.get\(`profile:\$\{key\}`\)\s*if \(held !== undefined\) return held[^\n]*\s*throw error/.test(strictProfile))
const strictCreator = data.slice(data.indexOf("export const loadCreatorForUserStrict"), data.indexOf("export const loadCreatorForUser = "))
check("the creator row the same way", /whoLastGood\.remember\(`creator:\$\{userId\}`, row\)/.test(strictCreator) && /whoLastGood\.forget\(`creator:\$\{userId\}`\)/.test(strictCreator) && /throw error/.test(strictCreator))
check("held for 15 minutes at most, on this instance", /WHO_LAST_GOOD_MAX_AGE_MS = 15 \* 60_000/.test(data))
check("the creator page and the storefront gate both use these lookups", /loadProfileByUsernameStrict\(username\)/.test(read("app/(storelib)/(marketing)/u/[username]/page.tsx")) && /loadProfileByUsernameStrict\(handle\)/.test(read("lib/profile/storefront-gate.ts")))

/* The class's behaviour, through a copy built from the module's own source (the module itself imports server-only clients). */
const classSrc = data.slice(data.indexOf("export class AgedLastGood"), data.indexOf("const whoLastGood"))
// eslint-disable-next-line @typescript-eslint/no-implied-eval
const make = new Function("WHO_LAST_GOOD_MAX_AGE_MS", "WHO_LAST_GOOD_MAX_KEYS", `${classSrc.replace("export class", "class").replace(/private readonly held = new Map<string, \{ value: unknown; at: number \}>\(\)/, "held = new Map()").replace(/\(key: string, value: unknown\)/g, "(key, value)").replace(/\(key: string\): unknown/g, "(key)").replace(/\(key: string\)/g, "(key)")}; return new AgedLastGood()`)
const realNow = Date.now
let clock = 1_000_000
Date.now = () => clock
try {
  const held = make(1000, 2) as { remember(k: string, v: unknown): void; forget(k: string): void; get(k: string): unknown }
  held.remember("a", { id: 1 })
  check("a kept row is answered", (held.get("a") as { id: number } | undefined)?.id === 1)
  clock += 1001
  check("past its age it is not", held.get("a") === undefined)
  held.remember("a", 1); held.remember("b", 2); held.remember("c", 3)
  check("bounded: the oldest goes first", held.get("a") === undefined && held.get("c") === 3)
  held.forget("c")
  check("forgotten is gone", held.get("c") === undefined)
} finally {
  Date.now = realNow
}

console.log("\nNo route shows one store's orders to another account")
check("/api/debug/orders is gone (any signed in account read the newest 50 orders of every store, with buyers' emails)", !existsSync("app/api/debug/orders/route.ts") && !existsSync("app/api/debug"))
check("  and nothing calls it", !/api\/debug\/orders/.test(read("proxy.ts")))

console.log("\nTwo OnePage saves at the same moment: one lands, the other is told")
const put = code("app/api/onepage/route.ts")
/* Changed on purpose (OnePage editor fixes 2): the settings come with the fingerprint, for the server's note of products it took off the page (lib/onepage/product-removals). */
check("the check reads the row's updated_at with the fingerprint", /select\("draft_blocks, archived_blocks, theme, bio, settings, updated_at"\)/.test(put))
check("the write lands only on the row the check saw", /checkedAt \? q\.eq\("updated_at", checkedAt\) : q/.test(put))
check("and moves updated_at on, always later than the one checked", /Math\.max\(Date\.now\(\), Date\.parse\(checkedAt\) \+ 1\)/.test(put) && /updates\.updated_at = new Date\(next\)\.toISOString\(\)/.test(put))
check("a write that found no such row is the same 409, and nothing was written", /if \(checkedAt && error && \(error as \{ code\?: string \}\)\.code === "PGRST116"\) return conflictAnswer\(\)/.test(put))
check("a save with no base (the creator chose to keep theirs) is not held to it", /let checkedAt: string \| null = null/.test(put) && /if \(base && draft_blocks !== undefined\) \{/.test(put))
check("a database without the column keeps the check as it was", /missingColumn\(read\.error, "updated_at"\)/.test(put))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
