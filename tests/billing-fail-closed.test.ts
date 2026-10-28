/**
 * A Stripe timeout or error is never read as "no subscription".
 *
 * GET /api/billing/subscription and the billing overview used to catch a
 * failed Stripe call, fall through to "no active subscription" and write the
 * creator back to the free plan; lib/stripe.ts made a new Stripe customer on
 * any retrieve error. This pins the fixes:
 *
 *  - an outage or a timeout keeps the stored paid plan (lib/billing/subscription-state)
 *  - only a verified deleted/missing customer is replaced (lib/billing/stripe-customer)
 *  - the webhook's plan sync is idempotent, order proof, and fails loud (lib/billing/subscription-sync)
 *  - concurrent reads make one Stripe call (the shared reader, and lib/billing/plan-client in the browser)
 *  - no read creates a customer or writes a plan (source checks)
 *
 *   npx tsx tests/billing-fail-closed.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  createSubscriptionReader,
  isStripeNotFound,
  paidPlanFromPrice,
  resolveSubscriptionView,
  type DbBilling,
  type ListSubscriptions,
  type StripeSubLike,
} from "@/lib/billing/subscription-state"
import { checkStripeCustomer, resolveStripeCustomer, type CustomerDeps } from "@/lib/billing/stripe-customer"
import { syncCreatorFromStripe, syncFromSubscriptionEvent, type CreatorBilling, type SyncDeps } from "@/lib/billing/subscription-sync"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const GROWTH_PRICE = "price_1SzBWaBYevnBVyznNCTOXDoS"
const CREATOR = "11111111-1111-4111-8111-111111111111"
const connectionError = () => Object.assign(new Error("An error occurred with our connection to Stripe."), { type: "StripeConnectionError" })
const apiError = () => Object.assign(new Error("Stripe 500"), { type: "StripeAPIError", statusCode: 500 })
const rateLimit = () => Object.assign(new Error("Too many requests"), { type: "StripeRateLimitError", statusCode: 429 })
const notFound = () => Object.assign(new Error("No such customer: 'cus_old'"), { type: "StripeInvalidRequestError", statusCode: 404, code: "resource_missing" })

function sub(over: Partial<StripeSubLike> & { price?: string } = {}): StripeSubLike {
  const { price = GROWTH_PRICE, ...rest } = over
  return {
    id: "sub_A",
    status: "active",
    customer: "cus_A",
    created: 1_700_000_000,
    cancel_at_period_end: false,
    metadata: { creator_id: CREATOR, plan_id: "growth" },
    items: { data: [{ price: { id: price }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 }] },
    ...rest,
  }
}

const paidDb: DbBilling = {
  planId: "growth",
  status: "active",
  row: {
    stripe_subscription_id: "sub_A",
    stripe_customer_id: "cus_A",
    plan_id: "growth",
    status: "active",
    current_period_start: "2026-10-01T00:00:00.000Z",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
  },
}

async function main() {
  console.log("\nA Stripe outage or timeout keeps the paid plan")
  {
    for (const [label, err] of [["connection error", connectionError()], ["Stripe 500", apiError()], ["rate limit", rateLimit()]] as const) {
      const reader = createSubscriptionReader({ list: async () => { throw err } })
      const r = await reader.read(["cus_A"])
      const view = resolveSubscriptionView(paidDb, r)
      check(`${label}: the read is not an answer`, r.ok === false)
      check(`${label}: still growth, from the database, marked stale`, view.planId === "growth" && view.source === "database" && view.stale === true && view.subscription?.stripe_subscription_id === "sub_A", view)
    }
    const hang: ListSubscriptions = () => new Promise(() => {})
    const reader = createSubscriptionReader({ list: hang, timeoutMs: 30 })
    const started = Date.now()
    const r = await reader.read(["cus_A"])
    const took = Date.now() - started
    check("a Stripe call that never answers is cut at its deadline", r.ok === false && (r as { reason: string }).reason === "timeout" && took < 2_000, { r, took })
    check("  and the plan is still growth", resolveSubscriptionView(paidDb, r).planId === "growth")
    let asked: { timeout?: number } | null = null
    const timed = createSubscriptionReader({ list: async (_p, o) => { asked = o; return { data: [sub()] } }, timeoutMs: 1234 })
    await timed.read(["cus_A"])
    check("the Stripe request itself carries the timeout (the client cancels the HTTP call)", (asked as { timeout?: number } | null)?.timeout === 1234)

    const unknownPrice = resolveSubscriptionView(paidDb, { ok: true, customers: ["cus_A"], subscriptions: [sub({ price: "price_new_unknown", metadata: {} })] })
    check("a paying subscription on a price the code does not know is not Free", unknownPrice.planId === "growth" && unknownPrice.drift === true, unknownPrice)
    check("an unknown price maps to null, never 'free'", paidPlanFromPrice("price_new_unknown") === null && paidPlanFromPrice(undefined) === null && paidPlanFromPrice(GROWTH_PRICE) === "growth")
    const pastDue = resolveSubscriptionView(paidDb, { ok: true, customers: ["cus_A"], subscriptions: [sub({ status: "past_due" })] })
    check("past_due keeps the plan while Stripe retries the card", pastDue.planId === "growth" && pastDue.status === "past_due")
    const none = resolveSubscriptionView(paidDb, { ok: true, customers: ["cus_A"], subscriptions: [sub({ status: "canceled", canceled_at: 1_761_000_000 })] })
    check("only Stripe answering 'nothing is paying' shows Free (and flags the drift)", none.planId === "free" && none.source === "stripe" && none.drift === true && none.subscription?.status === "canceled")
    const noCustomer = resolveSubscriptionView(paidDb, null)
    check("no customer to ask: the stored plan, not Free", noCustomer.planId === "growth" && noCustomer.source === "database" && noCustomer.stale === false)
    const twoCustomers = createSubscriptionReader({ list: async ({ customer }) => { if (customer === "cus_new") throw connectionError(); return { data: [sub({ customer })] } } })
    const both = await twoCustomers.read(["cus_new", "cus_A"])
    check("a paying subscription on one customer is a fact even when another customer could not be read", both.ok && resolveSubscriptionView(paidDb, both).planId === "growth")
  }

  console.log("\nA Stripe customer is replaced only when Stripe verifies it is gone")
  {
    const made: { params: unknown; options: { idempotencyKey: string } }[] = []
    const persisted: unknown[] = []
    const deps = (retrieve: CustomerDeps["retrieve"]): CustomerDeps => ({
      retrieve,
      create: async (params, options) => { made.push({ params, options }); return { id: "cus_NEW" } },
      persist: async (creatorId, expected, next) => { persisted.push({ creatorId, expected, next }); return { stored: next } },
      warn: () => {},
    })
    const args = { creatorId: CREATOR, existingCustomerId: "cus_old", email: "a@b.c", userId: "u1", username: "maker" }
    for (const [label, err] of [["connection error", connectionError()], ["Stripe 500", apiError()], ["rate limit", rateLimit()]] as const) {
      made.length = 0
      persisted.length = 0
      let threw = false
      try {
        await resolveStripeCustomer(deps(async () => { throw err }), args)
      } catch {
        threw = true
      }
      check(`${label}: thrown, no customer created, nothing written`, threw && made.length === 0 && persisted.length === 0)
    }
    {
      made.length = 0
      let threw = false
      try {
        await resolveStripeCustomer({ ...deps(() => new Promise(() => {})), timeoutMs: 20 }, args)
      } catch {
        threw = true
      }
      check("a retrieve that never answers: thrown at the deadline, no customer created", threw && made.length === 0)
    }
    made.length = 0
    persisted.length = 0
    const kept = await resolveStripeCustomer(deps(async (id) => ({ id })), args)
    check("a customer Stripe has is kept", kept === "cus_old" && made.length === 0 && persisted.length === 0)
    const replacedDeleted = await resolveStripeCustomer(deps(async (id) => ({ id, deleted: true })), args)
    check("a deleted customer (deleted: true) is replaced once, under an idempotency key", replacedDeleted === "cus_NEW" && made.length === 1 && made[0].options.idempotencyKey === `storelib-creator-customer:${CREATOR}:cus_old`)
    check("  and the row is written only over the id that was checked", JSON.stringify(persisted[0]) === JSON.stringify({ creatorId: CREATOR, expected: "cus_old", next: "cus_NEW" }))
    made.length = 0
    const replacedMissing = await resolveStripeCustomer(deps(async () => { throw notFound() }), args)
    check("a missing customer (404 resource_missing) is replaced", replacedMissing === "cus_NEW" && made.length === 1)
    const lost = await resolveStripeCustomer({ ...deps(async () => { throw notFound() }), persist: async () => ({ stored: "cus_OTHER" }) }, args)
    check("a race another request won answers the stored customer", lost === "cus_OTHER")
    check("checkStripeCustomer says present, deleted, missing, and throws otherwise",
      (await checkStripeCustomer({ retrieve: async (id) => ({ id }) }, "cus_x")) === "present" &&
        (await checkStripeCustomer({ retrieve: async (id) => ({ id, deleted: true }) }, "cus_x")) === "deleted" &&
        (await checkStripeCustomer({ retrieve: async () => { throw notFound() } }, "cus_x")) === "missing" &&
        (await checkStripeCustomer({ retrieve: async () => { throw connectionError() } }, "cus_x").then(() => false, () => true)))
    check("isStripeNotFound is only a 404 resource_missing", isStripeNotFound(notFound()) && !isStripeNotFound(connectionError()) && !isStripeNotFound(apiError()) && !isStripeNotFound(Object.assign(new Error("auth"), { type: "StripeAuthenticationError", statusCode: 401 })))
  }

  console.log("\nThe webhook's plan sync: idempotent, order proof, loud on failure")
  {
    const makeDb = (state: { creators: Record<string, unknown>[]; subscriptions: Record<string, unknown>[] }, failWrites = false) => {
      const writes: { table: string; kind: string; values: unknown }[] = []
      const db = {
        from(table: "creators" | "subscriptions") {
          const filters: [string, unknown][] = []
          let mode: "read" | "update" | "upsert" = "read"
          let values: Record<string, unknown> = {}
          let limitN: number | null = null
          const rows = () => state[table].filter((r) => filters.every(([k, v]) => r[k] === v))
          const run = () => {
            if (mode === "read") return { data: limitN == null ? rows() : rows().slice(0, limitN), error: null }
            if (failWrites) return { data: null, error: { message: "database unavailable" } }
            writes.push({ table, kind: mode, values })
            if (mode === "update") for (const r of rows()) Object.assign(r, values)
            else {
              const existing = state[table].find((r) => r.creator_id === values.creator_id)
              if (existing) Object.assign(existing, values)
              else state[table].push({ ...values })
            }
            return { data: null, error: null }
          }
          const b: Record<string, unknown> = {
            select: () => b,
            eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
            limit: (n: number) => { limitN = n; return b },
            update: (v: Record<string, unknown>) => { mode = "update"; values = v; return b },
            upsert: (v: Record<string, unknown>) => { mode = "upsert"; values = v; return b },
            maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
            then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
          }
          return b
        },
      }
      return { db, writes }
    }
    const paidState = () => ({
      creators: [{ id: CREATOR, stripe_customer_id: "cus_A", subscription_plan_id: "growth", subscription_status: "active" }],
      subscriptions: [{ creator_id: CREATOR, stripe_subscription_id: "sub_A", stripe_customer_id: "cus_A", plan_id: "growth", status: "active", cancel_at_period_end: false }],
    })
    const deps = (db: unknown, list: (c: string) => Promise<StripeSubLike[]>): SyncDeps => ({ db: db as SyncDeps["db"], listSubscriptions: list })
    const creatorOf = (state: ReturnType<typeof paidState>) => state.creators[0] as { subscription_plan_id: string; subscription_status: string; stripe_customer_id: string }

    {
      const state = paidState()
      state.creators[0].subscription_plan_id = "free"
      const { db, writes } = makeDb(state)
      const d = deps(db, async () => [sub()])
      const first = await syncFromSubscriptionEvent(d, sub())
      const firstCreatorWrites = writes.filter((w) => w.table === "creators").length
      const second = await syncFromSubscriptionEvent(d, sub())
      check("an event applied writes the plan Stripe says", first?.plan.outcome === "paid" && creatorOf(state).subscription_plan_id === "growth" && firstCreatorWrites === 1)
      check("the same event again changes nothing on creators (idempotent)", second?.plan.creatorUpdate === null && writes.filter((w) => w.table === "creators").length === 1)
    }
    {
      const state = paidState()
      const { db } = makeDb(state)
      /* A late customer.subscription.updated whose copy says canceled, while Stripe now says active. */
      const r = await syncFromSubscriptionEvent(deps(db, async () => [sub({ status: "active" })]), sub({ status: "canceled" }))
      check("an out of order event cannot move a paid plan backwards: Stripe now is what is written", r?.plan.outcome === "paid" && creatorOf(state).subscription_plan_id === "growth")
    }
    {
      const state = paidState()
      state.subscriptions[0].stripe_subscription_id = "sub_NEW"
      const { db } = makeDb(state)
      const old = sub({ id: "sub_OLD", status: "canceled", created: 1_600_000_000 })
      const r = await syncFromSubscriptionEvent(deps(db, async () => [old, sub({ id: "sub_NEW", created: 1_750_000_000 })]), old)
      check("customer.subscription.deleted for an old subscription keeps the paid plan of the current one", r?.plan.outcome === "paid" && creatorOf(state).subscription_plan_id === "growth" && state.subscriptions[0].stripe_subscription_id === "sub_NEW")
    }
    {
      const state = paidState()
      const { db, writes } = makeDb(state)
      let threw = false
      try {
        await syncFromSubscriptionEvent(deps(db, async () => { throw connectionError() }), sub({ status: "canceled" }))
      } catch {
        threw = true
      }
      check("Stripe failing during the sync throws (the webhook answers 500 and Stripe retries) and writes nothing", threw && writes.length === 0 && creatorOf(state).subscription_plan_id === "growth")
    }
    {
      const state = paidState()
      const { db } = makeDb(state, true)
      let threw = false
      try {
        await syncFromSubscriptionEvent(deps(db, async () => [sub({ status: "canceled" })]), sub({ status: "canceled" }))
      } catch {
        threw = true
      }
      check("a database write that fails throws instead of answering 200", threw)
    }
    {
      const state = paidState()
      const { db, writes } = makeDb(state)
      const r = await syncFromSubscriptionEvent(deps(db, async () => [sub({ price: "price_unknown", metadata: {} })]), sub({ price: "price_unknown", metadata: {} }))
      check("a paying subscription on an unknown price writes nothing", r?.plan.outcome === "unknown_price" && writes.length === 0 && creatorOf(state).subscription_plan_id === "growth")
    }
    {
      const state = paidState()
      const { db } = makeDb(state)
      const r = await syncFromSubscriptionEvent(deps(db, async () => [sub({ status: "canceled", canceled_at: 1_761_000_000 })]), sub({ status: "canceled" }))
      check("a verified end (Stripe answered, nothing paying) is Free", r?.plan.outcome === "free" && creatorOf(state).subscription_plan_id === "free" && state.subscriptions[0].status === "canceled")
    }
    {
      const state = paidState()
      state.creators[0].stripe_customer_id = "cus_REPLACEMENT"
      state.creators[0].subscription_plan_id = "free"
      const { db } = makeDb(state)
      const lists: string[] = []
      const r = await syncCreatorFromStripe(deps(db, async (c) => { lists.push(c); return c === "cus_A" ? [sub()] : [] }), { ...(state.creators[0] as object), row: null } as unknown as CreatorBilling, { dryRun: true, extraCustomers: ["cus_A"] })
      check("dry run: says what it would write and writes nothing", r.outcome === "paid" && r.creatorUpdate?.subscription_plan_id === "growth" && creatorOf(state).subscription_plan_id === "free")
      check("  and a replacement customer made after an error is repaired to the one that pays", r.creatorUpdate?.stripe_customer_id === "cus_A" && lists.includes("cus_REPLACEMENT") && lists.includes("cus_A"))
    }
    {
      const state = paidState()
      const { db } = makeDb(state)
      const listed: string[] = []
      const creator = { ...(state.creators[0] as object), row: state.subscriptions[0] } as unknown as CreatorBilling
      ;(creator as { stripe_customer_id: string }).stripe_customer_id = "cus_REPLACEMENT"
      await syncCreatorFromStripe(deps(db, async (c) => { listed.push(c); return c === "cus_A" ? [sub()] : [] }), creator, { dryRun: true })
      check("the sync reads every customer the creator has had (stored and on the subscriptions row)", listed.includes("cus_A") && listed.includes("cus_REPLACEMENT"))
    }
    {
      const state = paidState()
      const { db } = makeDb(state)
      const listed: string[] = []
      const r = await syncFromSubscriptionEvent(deps(db, async (c) => { listed.push(c); if (c === "cus_A") throw notFound(); return [] }), sub())
      check("a customer Stripe verifies missing counts as no subscriptions there", r?.plan.outcome === "free")
    }
  }

  console.log("\nConcurrent reads make one Stripe call")
  {
    let calls = 0
    let release: (() => void) | null = null
    const gate = new Promise<void>((r) => { release = r })
    let clock = 1_000
    const reader = createSubscriptionReader({ list: async () => { calls++; await gate; return { data: [sub()] } }, ttlMs: 30_000, now: () => clock })
    const all = Promise.all(Array.from({ length: 10 }, () => reader.read(["cus_A"])))
    release!()
    const answers = await all
    check("ten reads at once: one Stripe call, ten answers", calls === 1 && answers.every((a) => a.ok), { calls })
    await reader.read(["cus_A"])
    check("within the TTL: no new call", calls === 1)
    clock += 31_000
    await reader.read(["cus_A"])
    check("after the TTL: one new call", calls === 2)
    await Promise.all([reader.read(["cus_A"], { fresh: true }), reader.read(["cus_A"], { fresh: true })])
    check("fresh skips the cache but two fresh reads still share one call", calls === 3)
    let failingCalls = 0
    const failing = createSubscriptionReader({ list: async () => { failingCalls++; throw connectionError() }, failureTtlMs: 5_000, now: () => clock })
    await failing.read(["cus_A"])
    await failing.read(["cus_A"])
    check("during an outage a failure is reused briefly instead of every request asking again", failingCalls === 1)
  }

  console.log("\nThe browser shares one request too (lib/billing/plan-client)")
  {
    let fetches = 0
    const urls: string[] = []
    ;(globalThis as { fetch: unknown }).fetch = async (url: string) => {
      fetches++
      urls.push(url)
      await new Promise((r) => setTimeout(r, 5))
      return { ok: true, json: async () => ({ subscription: null, currentPlan: { id: "growth" } }) }
    }
    const { fetchBillingSubscription, planIdOf, forgetBillingSubscription } = await import("@/lib/billing/plan-client")
    const answers = await Promise.all([fetchBillingSubscription(), fetchBillingSubscription(), fetchBillingSubscription()])
    check("three panels asking at once: one request", fetches === 1 && answers.every((a) => planIdOf(a) === "growth"))
    await fetchBillingSubscription()
    check("asked again a moment later: the same answer, no request", fetches === 1)
    await fetchBillingSubscription({ fresh: true })
    check("after a change: a fresh request that skips the server's cache", fetches === 2 && urls[1] === "/api/billing/subscription?fresh=1")
    forgetBillingSubscription()
    ;(globalThis as { fetch: unknown }).fetch = async () => ({ ok: false, json: async () => ({}) })
    check("a failed request answers null, never a made up Free", (await fetchBillingSubscription()) === null && planIdOf(null) === null)
  }

  console.log("\nNo read creates a customer or writes a plan")
  {
    const reads = ["app/api/billing/subscription/route.ts", "lib/billing/overview.ts", "app/api/billing/invoices/route.ts", "app/app/settings/billing/upgrade/page.tsx", "lib/billing/subscription-reader.ts", "lib/billing/subscription-state.ts"]
    for (const f of reads) {
      const src = code(f)
      check(`${f}: no getOrCreateStripeCustomer, no customers.create`, !/getOrCreateStripeCustomer|customers\.create/.test(src))
      check(`${f}: no plan written (no update/upsert, no reset to free)`, !/\.update\(|\.upsert\(|recordPaidPlan\(|subscription_plan_id: "free"/.test(src))
    }
    check("GET /api/billing/subscription reads through the shared reader", /loadSubscriptionView\(/.test(code("app/api/billing/subscription/route.ts")))
    check("the overview reads its subscriptions through the shared reader", /subscriptionReader\.read\(/.test(code("lib/billing/overview.ts")))
    const stripeLib = code("lib/stripe.ts")
    check("lib/stripe.ts delegates to the verified-missing rule", /resolveStripeCustomer\(customerDeps\(\), args\)/.test(stripeLib) && !/catch \(err: any\) \{\s*\/\/ Customer doesn't exist/.test(read("lib/stripe.ts")))
    check("  and writes the new id only over the id that was checked", /q\.eq\("stripe_customer_id", expected\)/.test(stripeLib) && /q\.is\("stripe_customer_id", null\)/.test(stripeLib))
    const hook = code("app/api/stripe/webhook/route.ts")
    const block = hook.slice(hook.indexOf('event.type === "customer.subscription.created" ||'), hook.indexOf("INVOICE EVENTS"))
    check("the webhook's subscription events go through the sync", /await syncFromSubscriptionEvent\(subscriptionSyncDeps\(\), subscription\)/.test(block))
    check("  and a failure is no longer swallowed into a 200", !/catch \(error\) \{\s*console\.error\("\[Subscription\]/.test(block))
    check("  and the old 'not active means free' write is gone", !/isSubscriptionActive \? planId : "free"/.test(hook))
    check("every Settings plan read shares one request", ["components/app/settings-form-new.tsx", "components/onepage/onepage-editor.tsx", "components/onepage/tabs/settings-tab.tsx", "components/app/billing/billing-page-client.tsx"].every((f) => /fetchBillingSubscription\(/.test(code(f)) && !/fetch\("\/api\/billing\/subscription"\)/.test(code(f))))
    check("the billing tab no longer refetches on mount what the overview just read", !/useEffect\(\(\) => \{\s*refreshBillingData\(\)/.test(code("components/app/billing/billing-page-client.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main()
