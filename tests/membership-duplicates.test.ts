/**
 * ===========================================================================
 *  NOBODY LEARNS WHO IS A MEMBER FROM THE CHECKOUT
 * ===========================================================================
 * /api/memberships/checkout answered a guest "You are already a member" for
 * whatever email they typed. Now:
 *
 *   a guest is never looked up by the typed email before paying (not for
 *   "already a member", not to continue somebody's half-finished payment,
 *   not for the trial); a signed in member is still refused and sent to
 *   Manage;
 *   a second membership of the same thing by the same buyer is settled on
 *   the server when it gets access (lib/memberships/duplicates via
 *   lib/memberships/sync): the later one is cancelled and refunded, the
 *   buyer emailed once, no welcome; the page is answered as for any member.
 */
import { readFileSync } from "node:fs"
import type Stripe from "stripe"
import { FakeSupabase } from "./fake-supabase"
import { originalOf, sameBuyer, duplicateEmail, type DuplicateDeps } from "@/lib/memberships/duplicates"
import { syncSubscription } from "@/lib/memberships/sync"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 500)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

const uuid = (n: number) => `${String(n).padStart(8, "0")}-4444-4444-8444-444444444444`
const CLUB = uuid(1)
const OTHER_CLUB = uuid(2)
const SHOP = uuid(100)
const NOW = Date.parse("2026-10-11T12:00:00Z")
const later = (days: number) => new Date(NOW + days * 86400_000).toISOString()

const member = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  product_id: CLUB,
  creator_id: SHOP,
  buyer_id: null as string | null,
  buyer_email: "ana@mail.test",
  buyer_name: "Ana",
  title: "Studio Club",
  stripe_subscription_id: `sub_${id.slice(0, 8)}`,
  status: "active",
  current_period_end: later(20),
  past_due_since: null,
  started_at: "2026-09-01T10:00:00Z",
  created_at: "2026-09-01T10:00:00Z",
  ...over,
})

function subscription(id: string, status: string, metadata: Record<string, string> = {}): Stripe.Subscription {
  return {
    id,
    status,
    customer: "cus_1",
    cancel_at_period_end: false,
    metadata: { kind: "membership", product_id: CLUB, creator_id: SHOP, buyer_id: "", buyer_email: "Ana@Mail.test", buyer_name: "Ana", title: "Studio Club", ...metadata },
    default_payment_method: { id: "pm_1", card: { brand: "visa", last4: "4242" } },
    items: { data: [{ current_period_start: Math.floor(NOW / 1000), current_period_end: Math.floor(NOW / 1000) + 30 * 86400, price: { id: "price_1", unit_amount: 900, currency: "usd", recurring: { interval: "month" } } }] },
    latest_invoice: "in_1",
  } as unknown as Stripe.Subscription
}

async function main() {
  console.log("\nWhich of two is the duplicate")
  {
    const original = member(uuid(10))
    const second = member(uuid(11), { started_at: later(0), created_at: later(0), buyer_email: "ana@mail.test" })
    check("the one that got access later is the duplicate, of the first", originalOf(second, [original, second], NOW)?.id === original.id)
    check("the first is never a duplicate of the second", originalOf(original, [original, second], NOW) === null)
    const tieA = member(uuid(20), { started_at: later(0), created_at: later(0) })
    const tieB = member(uuid(21), { started_at: later(0), created_at: later(0) })
    check("a tie goes by id, so both sides of a race pick the same one", originalOf(tieB, [tieA, tieB], NOW)?.id === tieA.id && originalOf(tieA, [tieA, tieB], NOW) === null)
    check("another product, or another buyer, is not a duplicate", originalOf(second, [member(uuid(12), { product_id: OTHER_CLUB })], NOW) === null && originalOf(second, [member(uuid(13), { buyer_email: "bob@mail.test" })], NOW) === null)
    check("a membership that ended long ago does not make a new one a duplicate", originalOf(second, [member(uuid(14), { status: "expired" })], NOW) === null)
    check("the same account under another email is the same buyer; letter case does not matter", sameBuyer({ buyer_id: "u1", buyer_email: "a@x.test" }, { buyer_id: "u1", buyer_email: "b@x.test" }) && sameBuyer({ buyer_id: null, buyer_email: "Ana@Mail.test" }, { buyer_id: null, buyer_email: "ana@mail.test" }))
    check("placeholder addresses never match", !sameBuyer({ buyer_id: null, buyer_email: "unknown+sub_1@storelib.invalid" }, { buyer_id: null, buyer_email: "unknown+sub_1@storelib.invalid" }))
    const mail = duplicateEmail({ title: "<b>Club</b>" }, "https://storelib.com/account/library/memberships/x")
    check("the email says it plainly, escapes the title and links to Manage", /already a member/.test(mail.subject) && /refunded its payment in full/.test(mail.text) && /&lt;b&gt;Club&lt;\/b&gt;/.test(mail.html) && /Manage your membership/.test(mail.html) && !/—/.test(mail.text))
  }

  console.log("\nSettled by the sync, once")
  {
    const original = member(uuid(30))
    const db = new FakeSupabase().table("memberships", {}, [original])
    const calls: string[] = []
    let cancelled = false
    const deps: DuplicateDeps = {
      cancel: async (id, originalId) => {
        calls.push(`cancel:${id}:${originalId}`)
        if (cancelled) return false
        cancelled = true
        return true
      },
      refundFirstPayment: async (sub) => void calls.push(`refund:${sub.id}`),
      retrieve: async (id) => subscription(id, "canceled", { duplicate_of: original.id }),
      tell: async (row, o) => void calls.push(`tell:${row.buyer_email}:${o.id}`),
    }
    const first = await syncSubscription(db as never, "sub_dup", { subscription: subscription("sub_dup", "active"), duplicateDeps: deps, now: NOW })
    check("a guest's second membership of the same club is found the moment it gets access", first.duplicateOf === original.id, first)
    check("  cancelled, refunded, and the buyer told at the membership's own address", calls.join(",") === `cancel:sub_dup:${original.id},refund:sub_dup,tell:ana@mail.test:${original.id}`, calls)
    check("  its row is written as Stripe has it now: no access, no welcome", first.row?.status === "expired" && first.transitions.length === 0, first.row)
    const kept = (db.tables.memberships as Record<string, unknown>[]).find((r) => r.id === original.id)
    check("  the original is untouched", kept?.status === "active")
    calls.length = 0
    const again = await syncSubscription(db as never, "sub_dup", { subscription: subscription("sub_dup", "canceled", { duplicate_of: original.id }), duplicateDeps: deps, now: NOW })
    check("the webhook arriving after it settles nothing twice and tells nobody again", again.duplicateOf === original.id && calls.length === 0, calls)

    const lone = new FakeSupabase().table("memberships", {}, [])
    const none: string[] = []
    const fresh = await syncSubscription(lone as never, "sub_new", { subscription: subscription("sub_new", "active"), duplicateDeps: { ...deps, cancel: async () => (none.push("cancel"), true) }, now: NOW })
    check("a first membership is a membership: nothing cancelled", !fresh.duplicateOf && none.length === 0 && fresh.row?.status === "active" && fresh.transitions.includes("access_on"), fresh)
  }

  console.log("\nThe checkout says nothing about a typed email")
  {
    const route = code("app/api/memberships/checkout/route.ts")
    check("a guest is not looked up by the email they type", !/buyer_email\.eq\."\$\{email/.test(route) && /if \(user\) \{\n\s+const owner = ownerFilter\(\{ id: user\.id, email: \(user\.email \?\? ""\)\.toLowerCase\(\) \|\| null, emailConfirmed: !!user\.email_confirmed_at \}\)/.test(route))
    check("  a guest's half-finished payment is continued only when the page names its own row, for the same email", /typeof body\.previousMembershipId === "string" && UUID\.test\(body\.previousMembershipId\)/.test(route) && /mine && mine\.buyer_email === email && mine\.status === "incomplete"/.test(route))
    check("a signed in member is still refused before paying", /code: "already_member"/.test(route) && /const hadTrial = rows\.some/.test(route))
    const confirm = code("app/api/memberships/confirm/route.ts")
    check("a duplicate is answered as any member is, pointing at the membership they have", /if \(duplicateOf\) return NextResponse\.json\(\{ membershipId: duplicateOf, status: "active", access: true \}\)/.test(confirm))
    const client = code("app/checkout/membership-checkout.tsx")
    check("the page names its own last try", /previousMembershipId: started\.current\?\.membershipId \|\| undefined/.test(client))
    const sync = code("lib/memberships/sync.ts")
    check("every path that syncs settles a duplicate, before any welcome", sync.indexOf("originalOf(row, await otherMemberships(admin, row), now)") > 0 && sync.indexOf("originalOf(row, await otherMemberships(admin, row), now)") < sync.indexOf("await applyEffects(admin, before, row, changed"))
    check("a settled duplicate's paid invoice is not a sale", /if \(s\?\.metadata\?\.duplicate_of\) return \{ orderId: null \}/.test(sync))
    const dup = code("lib/memberships/duplicates.ts")
    check("one refund, in full, the creator's share reversed, by its own key", /reverse_transfer: true, refund_application_fee: true/.test(dup) && /idempotencyKey: `membership-duplicate:\$\{sub\.id\}`/.test(dup))
    check("the email goes only from the call that cancelled", /if \(cancelledHere\) \{/.test(dup))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
