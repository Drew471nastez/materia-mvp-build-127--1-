/**
 * Three major issues, found by reading the money and access paths, each failing on the code before its fix.
 *
 *   1. A community subscription found by an address nobody proved. The membership and plan routes read
 *      `email_confirmed_at`, which Supabase stamps at sign up with nothing proven and which survives an email change
 *      made from the browser. An account set to somebody else's address could see that person's guest subscription,
 *      cancel it, or move it to a dearer plan charged to their card.
 *   2. A plan upgrade that was never charged. Billing's upgrade used create_prorations: the plan changed at once and
 *      nothing was invoiced until the next renewal, while the dialog said "You'll be charged {amount} today". Moving
 *      to Free afterwards (cancel at period end) meant the difference was never charged at all. Now it is invoiced
 *      at once and held until paid (pending_if_incomplete), with 3-D Secure confirmed in the dialog.
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
  const { startPlanUpgrade, upgradeLanded } = await import("@/lib/billing/plan-upgrade")
  const { paidPlanFromSubscription, paidPlanFromPrice } = await import("@/lib/billing/subscription-state")

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
    /* The live price ids the plan sync reads (lib/billing/subscription-state). */
    const PRO = "price_1SzBXSBYevnBVyznYjXfOOXX"
    const GROWTH = "price_1SzBWaBYevnBVyznNCTOXDoS"
    const input = { subscriptionId: "sub_1", itemId: "si_1", priceId: PRO }
    const asked: Record<string, unknown>[] = []

    /* Paid at once: Stripe answers the subscription on the new price, nothing held. */
    const paid = await startPlanUpgrade({ update: async (_id, params) => (asked.push(params), { id: "sub_1", status: "active", items: { data: [{ price: { id: PRO } }] } }) }, input)
    check("paid at once: answered paid, with the subscription on the new price", paid.kind === "paid" && upgradeLanded((paid as { subscription: Row }).subscription, PRO))
    check("  invoiced now (always_invoice) and held until paid (pending_if_incomplete)", asked[0]?.proration_behavior === "always_invoice" && asked[0]?.payment_behavior === "pending_if_incomplete")
    check("  nothing Stripe refuses with a held change (no metadata, no cancel_at_period_end)", !("metadata" in asked[0]) && !("cancel_at_period_end" in asked[0]))
    check("  and the invoice's payment secret is asked for", JSON.stringify(asked[0]?.expand) === JSON.stringify(["latest_invoice.confirmation_secret"]))

    /* 3-D Secure: Stripe holds the change and the invoice waits for the bank. */
    const held = { id: "sub_1", status: "active", pending_update: { subscription_items: [{ price: PRO }] }, items: { data: [{ price: { id: GROWTH } }] }, latest_invoice: { confirmation_secret: { client_secret: "pi_3ds_secret_x" } } }
    const action = await startPlanUpgrade({ update: async () => held }, input)
    check("requires action: the secret goes back for the dialog to confirm", action.kind === "needs_action" && (action as { clientSecret: string }).clientSecret === "pi_3ds_secret_x")
    check("  while it is held, the upgrade has not landed (a finish is refused)", !upgradeLanded(held, PRO))
    check("  and the plan sync reads the old plan from the unchanged price, so the webhook marks nothing early", paidPlanFromSubscription({ ...held, metadata: { plan_id: "pro" } } as never) === "growth" && paidPlanFromPrice(GROWTH) === "growth")
    const confirmed = { id: "sub_1", status: "active", items: { data: [{ price: { id: PRO } }] } }
    check("  once the bank confirmed, Stripe shows the new price with nothing held, and the finish records it", upgradeLanded(confirmed, PRO))

    /* Declined: Stripe's card error, or a held change with nothing to confirm. */
    const declined = await startPlanUpgrade({ update: async () => { throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined", raw: { message: "Your card was declined." } }) } }, input)
    check("declined: answered declined, with the card's words and that nothing changed", declined.kind === "declined" && /Your card was declined\./.test((declined as { error: string }).error) && /plan did not change/.test((declined as { error: string }).error))
    const noSecret = await startPlanUpgrade({ update: async () => ({ ...held, latest_invoice: { confirmation_secret: null } }) }, input)
    check("  a held change with no payment to confirm is declined too", noSecret.kind === "declined")
    let other: unknown = null
    try {
      await startPlanUpgrade({ update: async () => { throw Object.assign(new Error("timeout"), { type: "StripeConnectionError" }) } }, input)
    } catch (e) {
      other = e
    }
    check("  anything else is thrown, never read as a decline", other instanceof Error)

    const route = code("app/api/billing/subscription/change/route.ts")
    const upgrade = route.slice(route.indexOf("if (upgrading) {"), route.indexOf("// Downgrade: schedule"))
    check("the route never leaves an upgrade for the next renewal", !/create_prorations/.test(route) && !/error_if_incomplete/.test(route))
    check("  the preview is the invoice made now, so 'charged today' is what is charged", /proration_behavior: upgrading \? UPGRADE_PRORATION : "none"/.test(route))
    check("  the upgrade goes through startPlanUpgrade", /await startPlanUpgrade\(/.test(upgrade))
    check("  declined answers 402 and writes nothing", /outcome\.kind === "declined"\) \{\s*return NextResponse\.json\(\{ error: outcome\.error, code: "upgrade_not_paid" \}, \{ status: 402 \}\)/.test(upgrade) && upgrade.indexOf('outcome.kind === "declined"') < upgrade.indexOf("recordUpgrade("))
    check("  requires action answers the secret and writes nothing", /outcome\.kind === "needs_action"\) \{\s*return NextResponse\.json\(\{ success: true, type: "upgrade", needsAction: \{ clientSecret: outcome\.clientSecret \} \}\)/.test(upgrade) && upgrade.indexOf('outcome.kind === "needs_action"') < upgrade.indexOf("recordUpgrade("))
    check("  a finish records the plan only when Stripe shows it landed", /if \(finish === true && !previewOnly\) \{\s*if \(!upgradeLanded\(stripeSubscription, stripePriceId\)\) \{[\s\S]*?status: 409/.test(route))
    check("  metadata and cancel_at_period_end follow the paid change", /const recordUpgrade = async[\s\S]*?cancel_at_period_end: false,\s*metadata: \{ creator_id: creator\.id, plan_id: newPlanId, pending_plan_id: "" \}/.test(route))
    check("the route exports only its handler (Next refuses other exports from a route file)", (read("app/api/billing/subscription/change/route.ts").match(/^export /gm) ?? []).length === 1)
    const dialog = code("components/app/billing/billing-page-client.tsx")
    check("the dialog confirms a held upgrade with Stripe.js, then asks the route to finish", /if \(result\.needsAction\?\.clientSecret\) \{[\s\S]*?stripe\.confirmCardPayment\(result\.needsAction\.clientSecret\)[\s\S]*?finish: true/.test(dialog))
    check("  a bank that says no shows its words and that the plan did not change, and no finish is asked", /if \(!confirmed \|\| confirmed\.error\) \{\s*throw new Error\(/.test(dialog) && /tt\("Your plan did not change\."\)/.test(dialog))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = read(`lib/i18n/catalog/${lang}.ts`)
      check(`  its words in ${lang}`, /"Your bank did not approve the payment\.":/.test(cat) && /"Your plan did not change\.":/.test(cat))
    }
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
