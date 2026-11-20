/**
 * Three major issues, found by reading the money and access paths, each failing on the code before its fix.
 *
 *   1. A community subscription found by an address nobody proved. The membership and plan routes read
 *      `email_confirmed_at`, which Supabase stamps at sign up with nothing proven and which survives an email change
 *      made from the browser. An account set to somebody else's address could see that person's guest subscription,
 *      cancel it, or move it to a dearer plan charged to their card.
 *   2. A plan upgrade that was never charged. Billing's upgrade used create_prorations: the plan changed at once and
 *      nothing was invoiced until the next renewal, while the dialog said "You'll be charged {amount} today". Moving
 *      to Free afterwards (cancel at period end) meant the difference was never charged at all.
 *   3. A guest basket written to whoever opened Stripe's return address. fulfilCartSession took the account signed
 *      in on storelib.com as the buyer, so a basket paid for another address went into that account's library, and
 *      which account got it depended on whether the browser or the webhook wrote the orders first.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail === undefined ? "" : ` (${JSON.stringify(detail)})`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

/* ── A database in memory: enough of supabase-js's query builder (as tests/checkout-receipt) ── */
type Row = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
class FakeDb {
  tables = new Map<string, Row[]>()
  users = new Map<string, Row>()
  auth = {
    admin: {
      getUserById: async (id: string) => ({ data: { user: this.users.get(id) ?? null }, error: null }),
      updateUserById: async () => ({ error: null }),
    },
  }
  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, [])
    return this.tables.get(table)!
  }
  from(table: string) {
    return query(this, table)
  }
  rpc() {
    return Promise.resolve({ data: null, error: null })
  }
}
function query(db: FakeDb, table: string) {
  let op: "select" | "insert" | "update" | "upsert" | "delete" = "select"
  let values: Row | Row[] | null = null
  let single: "single" | "maybe" | null = null
  const filters: ((r: Row) => boolean)[] = []
  const run = () => {
    const all = db.rows(table)
    if (op === "insert" || op === "upsert") {
      const out: Row[] = []
      for (const v of Array.isArray(values) ? values : [values!]) {
        const row = { id: randomUUID(), created_at: new Date().toISOString(), ...v }
        all.push(row)
        out.push(row)
      }
      return { data: single ? out[0] ?? null : out, error: null }
    }
    const hit = all.filter((r) => filters.every((f) => f(r)))
    if (op === "update") {
      for (const r of hit) Object.assign(r, values)
      return { data: hit, error: null }
    }
    if (op === "delete") {
      db.tables.set(table, all.filter((r) => !hit.includes(r)))
      return { data: hit, error: null }
    }
    if (single === "single") return hit.length === 1 ? { data: hit[0], error: null } : { data: null, error: { code: "PGRST116", message: "not one row" } }
    if (single === "maybe") return { data: hit[0] ?? null, error: null }
    return { data: hit, error: null, count: hit.length }
  }
  const api: Row = {
    select: () => proxy,
    insert: (v: Row) => ((op = "insert"), (values = v), proxy),
    update: (v: Row) => ((op = "update"), (values = v), proxy),
    upsert: (v: Row) => ((op = "upsert"), (values = v), proxy),
    delete: () => ((op = "delete"), proxy),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), proxy),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), proxy),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), proxy),
    is: (k: string, v: unknown) => (filters.push((r) => (v === null ? r[k] == null : r[k] === v)), proxy),
    single: () => ((single = "single"), proxy),
    maybeSingle: () => ((single = "maybe"), proxy),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(run).then(res, rej),
  }
  /* Anything else supabase-js has (order, limit, not, gte, ...) chains and changes nothing here. */
  const proxy: Row = new Proxy(api, { get: (t, p: string) => (p in t ? t[p] : () => proxy) })
  return proxy
}

/* Email and every other outside call: answered, and nothing leaves the process. */
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch

async function main() {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder"
  process.env.RECEIPT_TOKEN_SECRET = "test-secret"
  const { provenViewer } = await import("@/lib/memberships/viewer")
  const { membershipFor, changeCommunityMembership } = await import("@/lib/communities/server/membership-lifecycle")
  const { stripe } = await import("@/lib/stripe")
  const { fulfilCartSession } = await import("@/lib/checkout/fulfil-cart-session")
  const { packItems } = await import("@/lib/checkout/cart-items")

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n1. A community subscription is found by an address only when the account proved it")
  {
    const COMMUNITY = "c1000000-0000-4000-8000-000000000001"
    const PLAN = "p1000000-0000-4000-8000-000000000001"
    const VICTIM = "victim@example.test"
    const ATTACKER = "a1000000-0000-4000-8000-000000000001"
    const db = new FakeDb()
    db.rows("products").push({ id: PLAN, type: "membership", title: "Inner circle", creator_id: "cr1", community_id: COMMUNITY })
    /* Paid as a guest: no account yet, only the address. */
    db.rows("memberships").push({ id: "m1", product_id: PLAN, buyer_id: null, buyer_email: VICTIM, status: "active", stripe_subscription_id: "sub_victim", created_at: new Date().toISOString() })
    /* Signed up with the victim's address (or switched to it): Supabase stamped email_confirmed_at, nothing was proven. */
    db.users.set(ATTACKER, { id: ATTACKER, email: VICTIM, email_confirmed_at: new Date().toISOString(), app_metadata: {}, identities: [{ provider: "email", identity_data: { email: VICTIM } }] })
    const asTheRouteRead = { id: ATTACKER, email: VICTIM, emailConfirmed: true }

    check("the danger, kept in view: read as confirmed, the stranger's guest subscription is found", (await membershipFor(db as never, COMMUNITY, asTheRouteRead))?.id === "m1")
    const proven = await provenViewer(asTheRouteRead, db)
    check("provenViewer takes the address away from an account that never proved it", !!proven && proven.emailConfirmed === false)
    check("  and with it nothing is found", (await membershipFor(db as never, COMMUNITY, proven!)) === null)
    const calls: string[] = []
    const out = await changeCommunityMembership(db as never, { communityId: COMMUNITY, person: proven!, action: "cancel" }, { update: async (id: string) => { calls.push(id) }, sync: async () => null } as never)
    check("  so Cancel is refused and Stripe is never asked to change the subscription", out.ok === false && (out as { status?: number }).status === 404 && calls.length === 0, { out, calls })

    /* The real owner, who proved the address (the stamp /api/auth/confirm-email writes). */
    const OWNER = "o1000000-0000-4000-8000-000000000001"
    db.users.set(OWNER, { id: OWNER, email: VICTIM, email_confirmed_at: new Date().toISOString(), app_metadata: { verified_email: VICTIM }, identities: [] })
    const owner = await provenViewer({ id: OWNER, email: VICTIM, emailConfirmed: true }, db)
    check("the account that proved the address still finds its guest subscription", owner?.emailConfirmed === true && (await membershipFor(db as never, COMMUNITY, owner!))?.id === "m1")

    for (const route of ["app/api/community/[communityId]/membership/route.ts", "app/api/community/[communityId]/membership/plan/route.ts"]) {
      const src = code(route)
      const person = src.slice(src.indexOf("async function person()"), src.indexOf("export async function GET"))
      check(`${route.replace("app/api/community/[communityId]/", "")}: the person is passed through provenViewer`, /import \{ provenViewer \} from "@\/lib\/memberships\/viewer"/.test(src) && /return provenViewer\(\{ id: user\.id,/.test(person))
      check("  and every action in it reads that person (GET and POST)", (src.match(/const who = await person\(\)/g) ?? []).length === 2)
    }
    const lifecycleCallers = ["app/api/community/[communityId]/membership/route.ts", "app/api/community/[communityId]/membership/plan/route.ts"]
    check("no other route reaches a community subscription by address", lifecycleCallers.every((f) => /provenViewer/.test(read(f))))
  }

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n2. A plan upgrade is charged when it is made, and only applied when it is paid")
  {
    const route = code("app/api/billing/subscription/change/route.ts")
    const upgrade = route.slice(route.indexOf("if (upgrading) {"), route.indexOf("// Downgrade: schedule"))
    check("upgrades are invoiced now (always_invoice), never left for the next renewal", /const UPGRADE_PRORATION = "always_invoice" as const/.test(route) && !/create_prorations/.test(route))
    check("  the preview is that same invoice, so the dialog's 'charged today' is what is charged", /proration_behavior: upgrading \? UPGRADE_PRORATION : "none"/.test(route))
    check("  the update itself uses it", /proration_behavior: UPGRADE_PRORATION,/.test(upgrade))
    check("  and is not applied when the card does not pay (error_if_incomplete)", /payment_behavior: "error_if_incomplete"/.test(upgrade))
    const writes = upgrade.indexOf('.from("subscriptions")')
    const refused = upgrade.indexOf('status: 402')
    check("  a declined card answers 402 before anything is written to the plan", refused > 0 && writes > refused && /code: "upgrade_not_paid"/.test(upgrade))
    check("  the new plan's own price is still read for the next renewal", /stripe\.prices\.retrieve\(stripePriceId\)/.test(route))
    check("the route exports only its handler (Next refuses other exports from a route file)", (read("app/api/billing/subscription/change/route.ts").match(/^export /gm) ?? []).length === 1)
    check("the dialog still promises a charge today, which is now true", /You'll be charged \{amount\} today/.test(read("components/app/billing/billing-page-client.tsx")))
  }

  /* ───────────────────────────────────────────────────────────────────── */
  console.log("\n3. A guest basket belongs to the address that paid, not to whoever opens the return address")
  {
    const CREATOR = "c3000000-0000-4000-8000-000000000001"
    const PRODUCT = "p3000000-0000-4000-8000-000000000001"
    const VIEWER = "v3000000-0000-4000-8000-000000000001"
    const items = [{ productId: PRODUCT, variantId: null, quantity: 1, priceCents: 2500, discountCents: 0 }]
    const session = {
      id: "cs_test_gift_basket",
      object: "checkout.session",
      mode: "payment",
      payment_status: "paid",
      amount_total: 2500,
      currency: "usd",
      /* Paid as a guest on the creator's website: no account in the metadata, a friend's address. */
      metadata: { cart: "1", creator_id: CREATOR, buyer_id: "", buyer_email: "friend@example.test", platform_fee_cents: "200", ...packItems(items) },
      customer_details: { email: "friend@example.test", name: "Dana Friend" },
      payment_intent: { id: "pi_gift_basket", latest_charge: { payment_method_details: { type: "card", card: { brand: "visa", last4: "4242" } } } },
    }
    ;(stripe.checkout.sessions as any).retrieve = async () => session // eslint-disable-line @typescript-eslint/no-explicit-any
    const db = new FakeDb()
    db.rows("creators").push({ id: CREATOR, user_id: "u3", display_name: "Mara Studio", username: "mara" })
    db.rows("products").push({ id: PRODUCT, title: "Watercolour brushes", creator_id: CREATOR, type: "digital" })
    /* The browser that came back is signed in to storelib.com as somebody else. The old option is sent as the route sent it. */
    const result = await fulfilCartSession(db as never, session.id, { baseUrl: "https://storelib.com", viewerId: VIEWER } as never)
    const orders = db.rows("orders")
    check("the basket is written", result.ok === true && orders.length === 1, { ok: result.ok, n: orders.length })
    check("  not on the account that opened the return address", orders.every((o) => o.buyer_id !== VIEWER), orders.map((o) => o.buyer_id))
    check("  and that account gets no library entry for it", db.rows("entitlements").every((e) => e.buyer_id !== VIEWER), db.rows("entitlements").map((e) => e.buyer_id))
    check("  the order keeps the address that paid, which its owner can claim", orders[0]?.buyer_email === "friend@example.test" && orders[0]?.buyer_id == null)
    check("  and the answer says who it belongs to (nobody yet)", result.ok === true && (result as { buyerId?: string | null }).buyerId == null)

    const lib = code("lib/checkout/fulfil-cart-session.ts")
    check("both ways in (return address and webhook) take the buyer from the payment only", (lib.match(/let buyerId = metadata\.buyer_id \|\| null/g) ?? []).length === 2 && !/opts\.viewerId/.test(lib))
    const complete = code("app/api/checkout/cart/complete/route.ts")
    check("the return route no longer hands its viewer to fulfilment", !/viewerId/.test(complete))
    check("  and remembers the purchase on the website unless it really is in this account's library", /const inLibrary = !!user && result\.buyerId === user\.id/.test(complete) && /inLibrary \? paidReturnUrl\(back\) : rememberOnSiteUrl\(paidReturnUrl\(back\), result\.receiptToken\)/.test(complete))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
