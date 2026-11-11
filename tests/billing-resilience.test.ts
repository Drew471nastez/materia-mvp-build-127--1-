/**
 * Billing and payments under a failing Stripe, driven by a fake Stripe.
 *
 * The real Stripe SDK runs every request through lib/stripe/resilience's
 * transport into a fake Stripe server, so these are the SDK's own retries,
 * idempotency headers and error types, not a model of them:
 *
 *  - timeouts, 5xx and rate limits: bounded attempts, a bounded wait per
 *    attempt, and a circuit breaker that stops asking a Stripe that is down
 *  - the staleness window: Stripe's last answer, then the stored plan, never
 *    Free because a read failed (regression for the billing fallback bug)
 *  - double submits: the same press twice is one Stripe object; a creator
 *    already paying never gets a second plan checkout
 *  - duplicate and out of order webhooks: a late failed payment cannot mark a
 *    paid plan past due or take it away
 *
 *   node scripts/run-push-tests.mjs (or any single-suite runner)
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import Stripe from "stripe"
import {
  BREAKER_OPEN_CODE,
  breakerTransport,
  isBreakerRefusal,
  STRIPE_MAX_NETWORK_RETRIES,
  STRIPE_TIMEOUT_MS,
  StripeCircuitBreaker,
  cashoutIdempotencyKey,
  stripeIdempotencyKey,
  stripeIdentityKey,
  type Transport,
  type TransportResponse,
} from "@/lib/stripe/resilience"
import {
  alreadyPayingVerdict,
  createSubscriptionReader,
  resolveSubscriptionView,
  STORED_PLAN_GRACE_MS,
  SUBSCRIPTION_STALE_IF_ERROR_MS,
  type DbBilling,
  type StripeSubLike,
} from "@/lib/billing/subscription-state"
import { syncFromSubscriptionEvent, type SyncDeps } from "@/lib/billing/subscription-sync"
import { billingReturnUrl, trustedRequestOrigin, trustedReturnUrl } from "@/lib/billing/return-url"
import { perRequest, withRequestMemo } from "@/lib/billing/request-memo"

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

function sub(over: Partial<StripeSubLike> = {}): StripeSubLike {
  return {
    id: "sub_A",
    status: "active",
    customer: "cus_A",
    created: 1_700_000_000,
    cancel_at_period_end: false,
    metadata: { creator_id: CREATOR, plan_id: "growth" },
    items: { data: [{ price: { id: GROWTH_PRICE }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 }] },
    ...over,
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

// ---------------------------------------------------------------------------
// A fake Stripe server behind the SDK's transport
// ---------------------------------------------------------------------------

class FakeResponse implements TransportResponse {
  constructor(private status: number, private body: object, private headers: Record<string, string> = {}) {}
  getStatusCode() {
    return this.status
  }
  getHeaders() {
    return { "request-id": "req_fake", ...this.headers }
  }
  getRawResponse() {
    return {}
  }
  toStream(done: () => void) {
    done()
    return null
  }
  toJSON() {
    return Promise.resolve(this.body)
  }
}

type Answer = { status: number; body?: object; headers?: Record<string, string> } | "hang" | "reset" | "timeout"
interface Seen {
  method: string
  path: string
  timeout: number
  idempotencyKey: string | null
}

function fakeStripe(script: (n: number, seen: Seen) => Answer) {
  const seen: Seen[] = []
  /* What a real Stripe does with an idempotency key: the same key is the same answer, and nothing new is made. */
  const byKey = new Map<string, object>()
  let made = 0
  const transport: Transport = {
    getClientName: () => "fake",
    async makeRequest(_host, _port, path, method, headers, _data, _protocol, timeout) {
      const h = headers as Record<string, string>
      const key = h["Idempotency-Key"] ?? h["idempotency-key"] ?? null
      const s: Seen = { method, path, timeout, idempotencyKey: key }
      seen.push(s)
      const answer = script(seen.length, s)
      if (answer === "hang") return new Promise<never>(() => {})
      if (answer === "reset") throw Object.assign(new Error("socket hang up"), { code: "ECONNREFUSED" })
      if (answer === "timeout") throw Object.assign(new TypeError("ETIMEDOUT"), { code: "ETIMEDOUT" })
      if (answer.status === 200 && method === "POST" && key && byKey.has(key)) return new FakeResponse(200, { ...(byKey.get(key) as object) })
      const body = answer.body ?? (answer.status === 200 ? { id: `obj_${++made}`, object: "checkout.session" } : { error: { type: "api_error", message: `fake ${answer.status}` } })
      if (answer.status === 200 && method === "POST" && key) byKey.set(key, { ...body })
      return new FakeResponse(answer.status, { ...body }, answer.headers)
    },
  }
  return { transport, seen, made: () => made }
}

function sdk(transport: Transport, breaker: StripeCircuitBreaker, retries = 0) {
  return new Stripe("sk_test_fake", {
    timeout: STRIPE_TIMEOUT_MS,
    maxNetworkRetries: retries,
    httpClient: breakerTransport(transport, breaker) as unknown as Stripe.HttpClient,
  })
}

async function settle<T>(p: Promise<T>): Promise<{ ok: boolean; value?: T; error?: any }> {
  try {
    return { ok: true, value: await p }
  } catch (error) {
    return { ok: false, error }
  }
}

async function main() {
  console.log("\nEvery Stripe call has a bounded wait and bounded retries")
  {
    const lib = code("lib/stripe.ts")
    check("the one client sets a timeout, the retries and the breaker's transport",
      /timeout: STRIPE_TIMEOUT_MS/.test(lib) && /maxNetworkRetries: STRIPE_MAX_NETWORK_RETRIES/.test(lib) && /httpClient: breakerTransport\(Stripe\.createNodeHttpClient\(\)/.test(lib))
    check("the timeout is far under the SDK's 80s default, and two retries at most", STRIPE_TIMEOUT_MS <= 20_000 && STRIPE_MAX_NETWORK_RETRIES === 2)
    const f = fakeStripe(() => ({ status: 200, body: { object: "list", data: [] } }))
    const client = sdk(f.transport, new StripeCircuitBreaker())
    await client.subscriptions.list({ customer: "cus_A" })
    await client.subscriptions.list({ customer: "cus_A" }, { timeout: 5_000 })
    check("each attempt carries the client's timeout, and a call's own timeout wins", f.seen[0].timeout === STRIPE_TIMEOUT_MS && f.seen[1].timeout === 5_000, f.seen)
  }

  console.log("\nA 5xx is retried a bounded number of times, with one idempotency key")
  {
    const f = fakeStripe(() => ({ status: 500 }))
    const client = sdk(f.transport, new StripeCircuitBreaker({ threshold: 100 }), 1)
    const started = Date.now()
    const r = await settle(client.checkout.sessions.create({ mode: "payment", success_url: "https://x.test/s" }, { idempotencyKey: "storelib:test:1" }))
    const took = Date.now() - started
    check("one retry: exactly two attempts, then a StripeAPIError", !r.ok && r.error?.type === "StripeAPIError" && f.seen.length === 2, { n: f.seen.length, type: !r.ok && r.error?.type })
    check("  both attempts send the same Idempotency-Key, so a retry never makes a second object", f.seen.every((s) => s.idempotencyKey === "storelib:test:1"))
    check("  the backoff waited (jittered, at least 0.5s) but is capped", took >= 450 && took < 6_000, took)
    const g = fakeStripe(() => ({ status: 400, body: { error: { type: "invalid_request_error", message: "bad" } } }))
    const c2 = sdk(g.transport, new StripeCircuitBreaker(), 2)
    await settle(c2.customers.retrieve("cus_x"))
    check("a 4xx (Stripe answered no) is not retried", g.seen.length === 1)
  }

  console.log("\nThe circuit breaker: an outage stops being asked")
  {
    let now = 1_000_000
    const changes: string[] = []
    const breaker = new StripeCircuitBreaker({ threshold: 5, cooldownMs: 10_000, maxCooldownMs: 60_000, now: () => now, onChange: (a, b) => changes.push(`${a}>${b}`) })
    const f = fakeStripe(() => ({ status: 503 }))
    const client = sdk(f.transport, breaker)
    for (let i = 0; i < 5; i++) await settle(client.subscriptions.list({ customer: "cus_A" }))
    check("five failures in a row open it", breaker.snapshot().state === "open" && f.seen.length === 5 && changes.includes("closed>open"), breaker.snapshot())
    const before = f.seen.length
    const t0 = Date.now()
    const refused = await settle(client.subscriptions.list({ customer: "cus_A" }))
    const took = Date.now() - t0
    check("while open a call never reaches Stripe", f.seen.length === before)
    check("  and fails at once (no timeout, no retry wait)", took < 200, took)
    check("  as a StripeAPIError 503 every caller already treats as 'Stripe could not be asked'",
      !refused.ok && refused.error?.type === "StripeAPIError" && refused.error?.statusCode === 503 && refused.error?.code === BREAKER_OPEN_CODE && isBreakerRefusal(refused.error), !refused.ok && { type: refused.error?.type, code: refused.error?.code })
    const withRetries = sdk(f.transport, breaker, 2)
    const t1 = Date.now()
    await settle(withRetries.subscriptions.list({ customer: "cus_A" }))
    check("  even with retries on, a refused call is not retried (stripe-should-retry: false)", Date.now() - t1 < 200 && f.seen.length === before)
    const reader = createSubscriptionReader({ list: (p, o) => client.subscriptions.list(p as any, o) as any })
    const view = resolveSubscriptionView(paidDb, await reader.read(["cus_A"]))
    check("  and a billing read through it still shows the paid plan, marked stale", view.planId === "growth" && view.stale === true, view)

    now += 10_000
    const probeFails = fakeStripe(() => ({ status: 500 }))
    const probeClient = sdk(probeFails.transport, breaker)
    await settle(probeClient.subscriptions.list({ customer: "cus_A" }))
    check("after the cooldown one probe goes; it failing opens it again for twice as long", probeFails.seen.length === 1 && breaker.snapshot().state === "open" && breaker.snapshot().cooldownMs === 20_000, breaker.snapshot())
    now += 19_000
    await settle(probeClient.subscriptions.list({ customer: "cus_A" }))
    check("  still refused before the longer cooldown ends", probeFails.seen.length === 1)
    now += 1_000
    const healthy = fakeStripe(() => ({ status: 200, body: { object: "list", data: [] } }))
    const healthyClient = sdk(healthy.transport, breaker)
    const ok = await settle(healthyClient.subscriptions.list({ customer: "cus_A" }))
    check("a probe Stripe answers closes it, and calls flow again", ok.ok && breaker.snapshot().state === "closed" && breaker.snapshot().cooldownMs === 10_000)
    for (let i = 0; i < 4; i++) await settle(sdk(fakeStripe(() => ({ status: 429 })).transport, breaker).subscriptions.list({ customer: "cus_A" }))
    await settle(healthyClient.subscriptions.list({ customer: "cus_A" }))
    for (let i = 0; i < 4; i++) await settle(sdk(fakeStripe(() => "reset").transport, breaker).subscriptions.list({ customer: "cus_A" }))
    check("rate limits and dropped connections count, but any answer in between resets the count", breaker.snapshot().state === "closed" && breaker.snapshot().consecutiveFailures === 4, breaker.snapshot())
    await settle(sdk(fakeStripe(() => "timeout").transport, breaker).subscriptions.list({ customer: "cus_A" }))
    check("  a fifth (a timeout) opens it", breaker.snapshot().state === "open")

    const halfOpen = new StripeCircuitBreaker({ threshold: 1, cooldownMs: 10, now: () => now })
    halfOpen.failure()
    now += 10
    check("half open lets exactly one probe through at a time", halfOpen.allow() === true && halfOpen.allow() === false && halfOpen.allow() === false)
  }

  console.log("\nThe staleness window: Stripe's last answer, then the stored plan, never Free on an error")
  {
    let now = 5_000_000
    let mode: "ok" | "fail" | "canceled" = "ok"
    let calls = 0
    const reader = createSubscriptionReader({
      now: () => now,
      list: async () => {
        calls++
        if (mode === "fail") throw Object.assign(new Error("Stripe 503"), { type: "StripeAPIError", statusCode: 503 })
        return { data: [mode === "canceled" ? sub({ status: "canceled" }) : sub()] }
      },
    })
    const freeDb: DbBilling = { planId: "free", status: "active", row: null }
    const first = await reader.read(["cus_A"])
    check("Stripe answers: not stale", first.ok && !first.stale && resolveSubscriptionView(freeDb, first).planId === "growth")
    mode = "fail"
    now += 31_000
    const stale = await reader.read(["cus_A"])
    const view = resolveSubscriptionView(freeDb, stale)
    check("Stripe fails inside the window: its last answer, marked stale (even when the database lags behind)", stale.ok && stale.stale === true && view.planId === "growth" && view.stale === true && view.source === "stripe", view)
    const callsAfterStale = calls
    await reader.read(["cus_A"])
    check("  a stale answer is reused only briefly, so an outage is not asked by every request", calls === callsAfterStale)
    now += 6_000
    await reader.read(["cus_A"])
    check("  and Stripe is asked again after the failure TTL", calls === callsAfterStale + 1)
    now += SUBSCRIPTION_STALE_IF_ERROR_MS
    const past = await reader.read(["cus_A"])
    const pastView = resolveSubscriptionView(paidDb, past)
    check("past the window: not an answer, and the stored paid plan is served", !past.ok && pastView.planId === "growth" && pastView.source === "database" && pastView.stale === true, pastView)

    mode = "canceled"
    now += 31_000
    await reader.read(["cus_A"], { fresh: true })
    mode = "fail"
    now += 31_000
    const staleCanceled = await reader.read(["cus_A"])
    const keepPaid = resolveSubscriptionView(paidDb, staleCanceled)
    check("a stale 'nothing is paying' never moves a paying creator to Free: the stored plan wins", staleCanceled.ok && staleCanceled.stale === true && keepPaid.planId === "growth" && keepPaid.stale === true, keepPaid)

    mode = "ok"
    now += 31_000
    await reader.read(["cus_A"], { fresh: true })
    reader.invalidate("cus_A")
    mode = "fail"
    const afterWebhook = await reader.read(["cus_A"])
    check("a webhook for the customer forgets the last answer, so it cannot hide a real change", !afterWebhook.ok)

    const oldRow: DbBilling = { ...paidDb, row: { ...paidDb.row!, current_period_end: new Date(Date.parse("2026-11-01T00:00:00.000Z") - STORED_PLAN_GRACE_MS - 1000).toISOString() } }
    const expired = resolveSubscriptionView(oldRow, { ok: false, reason: "timeout", message: "x" }, Date.parse("2026-11-01T00:00:00.000Z"))
    check("a stored paid row long past its period is still served on an error, flagged for the reconciliation", expired.planId === "growth" && expired.storedExpired === true, expired)
    const fresh = resolveSubscriptionView(paidDb, { ok: false, reason: "timeout", message: "x" }, Date.parse("2026-10-15T00:00:00.000Z"))
    check("  a row inside its period is not flagged", fresh.planId === "growth" && !fresh.storedExpired)
  }

  console.log("\nRegression: the billing fallback bug (an error read as canceled or Free)")
  {
    const errors = [
      ["timeout", Object.assign(new Error("Request aborted due to timeout being reached (5000ms)"), { type: "StripeConnectionError" })],
      ["5xx", Object.assign(new Error("Stripe 502"), { type: "StripeAPIError", statusCode: 502 })],
      ["rate limit", Object.assign(new Error("Too many requests"), { type: "StripeRateLimitError", statusCode: 429 })],
      ["breaker open", Object.assign(new Error("paused"), { type: "StripeAPIError", statusCode: 503, code: BREAKER_OPEN_CODE })],
      ["auth", Object.assign(new Error("Invalid API Key"), { type: "StripeAuthenticationError", statusCode: 401 })],
    ] as const
    for (const status of ["active", "trialing", "past_due"] as const) {
      for (const [label, err] of errors) {
        const db: DbBilling = { ...paidDb, status, row: { ...paidDb.row!, status } }
        const r = await createSubscriptionReader({ list: async () => { throw err } }).read(["cus_A"])
        const v = resolveSubscriptionView(db, r)
        check(`${status} + ${label}: still growth with its subscription, never free/canceled/inactive`, v.planId === "growth" && v.status === status && v.subscription?.status === status && v.stale === true, v)
      }
    }
    const routes = ["app/api/billing/subscription/route.ts", "lib/billing/overview.ts", "app/(storelib)/app/settings/billing/upgrade/page.tsx"]
    check("no billing read writes a plan (one writer: the webhook's sync)", routes.every((p) => !/\.update\(\s*\{[^}]*subscription_plan_id/.test(code(p))))
  }

  console.log("\nThe billing page says it could not refresh, softly")
  {
    const overview = code("lib/billing/overview.ts")
    const page = read("components/app/billing/billing-page-client.tsx")
    check("the overview passes on whether the plan is stale", /stale: view\.stale/.test(overview))
    check("the page draws a quiet status line for it, and keeps the plan as it is", /data-billing-stale=""/.test(page) && /role="status"/.test(page) && /liveStale \?/.test(page))
    check("  a refresh after an action follows the answer's stale flag", /setLiveStale\(subData\.stale === true\)/.test(page))
    const line = "Stripe didn't answer just now, so this is your plan as of its last update. Nothing about it has changed."
    check("  in every dashboard language", ["de", "es", "fr", "it", "pl", "pt-BR"].every((l) => read(`lib/i18n/catalog/${l}.ts`).includes(JSON.stringify(line))))
    check("  in Storelib's words (no em dash, nothing banned)", !/[—]|seamless|unlock|effortless/i.test(line))
  }

  console.log("\nDouble submits make one Stripe object")
  {
    const params = { mode: "subscription", line_items: [{ price: GROWTH_PRICE, quantity: 1 }], metadata: { creator_id: CREATOR, plan_id: "growth" } }
    const t = 1_800_000_000_000
    const k1 = stripeIdempotencyKey("plan-checkout", [CREATOR, "growth"], params, { now: t, windowMs: 600_000 })
    const k2 = stripeIdempotencyKey("plan-checkout", [CREATOR, "growth"], { metadata: { plan_id: "growth", creator_id: CREATOR }, line_items: [{ quantity: 1, price: GROWTH_PRICE }], mode: "subscription" }, { now: t + 1_000, windowMs: 600_000 })
    check("the same press twice is the same key (key order does not matter)", k1 === k2, { k1, k2 })
    check("changed params are a different key, so Stripe never refuses a reused key", k1 !== stripeIdempotencyKey("plan-checkout", [CREATOR, "growth"], { ...params, mode: "payment" }, { now: t, windowMs: 600_000 }))
    check("after the window the same params are a new key (a second purchase later is its own)", k1 !== stripeIdempotencyKey("plan-checkout", [CREATOR, "growth"], params, { now: t + 600_000, windowMs: 600_000 }))
    check("keys fit Stripe's 255 characters whatever the parts", stripeIdempotencyKey("x", ["a".repeat(400), "b".repeat(400)], params).length <= 255)

    const f = fakeStripe(() => ({ status: 200 }))
    const client = sdk(f.transport, new StripeCircuitBreaker())
    const [a, b] = await Promise.all([
      client.checkout.sessions.create(params as any, { idempotencyKey: k1 }),
      client.checkout.sessions.create(params as any, { idempotencyKey: k2 }),
    ])
    check("two concurrent presses against a Stripe that honours the key: one session", a.id === b.id && f.made() === 1, { a: a.id, b: b.id, made: f.made() })

    const create = code("app/api/billing/subscription/create/route.ts")
    check("the plan checkout is keyed on the creator, the plan and its exact params",
      /stripe\.checkout\.sessions\.create\(sessionParams, \{\s*idempotencyKey: stripeIdempotencyKey\("plan-checkout", \[creator\.id, planId\], sessionParams/.test(create))
    check("  and refuses a creator who already pays (409), or when that cannot be checked (503), before any checkout",
      create.indexOf("alreadyPayingVerdict(") > 0 && create.indexOf("alreadyPayingVerdict(") < create.indexOf("stripe.checkout.sessions.create") && /status: 409/.test(create) && /status: 503/.test(create))
    const subs = (s: string[]) => ({ ok: true as const, customers: ["cus_A"], subscriptions: s.map((status) => sub({ status })) })
    const row = (status: string | null) => ({ stripe_subscription_id: status ? "sub_A" : null, status })
    check("already paying: Stripe says active, trialing or past_due",
      alreadyPayingVerdict(null, subs(["active"])) === "paying" && alreadyPayingVerdict(row("canceled"), subs(["trialing"])) === "paying" && alreadyPayingVerdict(null, subs(["canceled", "past_due"])) === "paying")
    check("clear: Stripe says nothing is paying, even if the stored row lags", alreadyPayingVerdict(row("active"), subs(["canceled"])) === "clear" && alreadyPayingVerdict(null, subs([])) === "clear")
    check("unknown: Stripe cannot be asked (or only stale) and the stored row says they pay",
      alreadyPayingVerdict(row("active"), { ok: false, reason: "timeout", message: "" }) === "unknown" && alreadyPayingVerdict(row("past_due"), { ...subs(["canceled"]), stale: true }) === "unknown")
    check("  but a creator who never paid is not blocked by an outage", alreadyPayingVerdict(null, { ok: false, reason: "unreachable", message: "" }) === "clear" && alreadyPayingVerdict(row("canceled"), null) === "clear")

    const membershipRoute = code("app/api/memberships/checkout/route.ts")
    const membershipBilling = code("lib/memberships/billing.ts")
    check("a membership Join twice inside a minute is one subscription (the key was the time in milliseconds)",
      !/idempotencyKey: `membership:\$\{productId\}:\$\{email\}:\$\{interval\}:\$\{Date\.now\(\)\}`/.test(membershipRoute) && /idempotencyKey: `\$\{productId\}:\$\{email\}:\$\{interval\}`/.test(membershipRoute) &&
        /stripe\.subscriptions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("membership-subscription", \[p\.idempotencyKey\], params\) \}\)/.test(membershipBilling))
    check("a member's Stripe customer is replaced only when Stripe says it is gone, and made once per press",
      /if \(!isStripeNotFound\(error\)\) throw error/.test(membershipBilling) && /stripe\.customers\.create\(params, \{\s*idempotencyKey: stripeIdempotencyKey\("membership-buyer"/.test(membershipBilling))
    check("a membership confirm that cannot reach Stripe says try again (503), never 'not found'", /if \(!isStripeNotFound\(error\)\) return NextResponse\.json\([^)]*\{ status: 503 \}\)/.test(code("app/api/memberships/confirm/route.ts")))
    check("a creator's payout account is opened once per press", /stripe\.accounts\.create\(params, options\.keyParts \? \{ idempotencyKey: stripeIdempotencyKey\("connect-account"/.test(code("lib/payments/stripe/connect.ts")))
    const keyed: [string, RegExp][] = [
      /* PAY-9: the product checkout's key is the attempt's (stripeIdentityKey of its row and the exact params) or, with no attempt, the short one from the exact params. */
      ["app/api/checkout/stripe-session/route.ts", /paymentIntents\.create\(params, \{ idempotencyKey: intentIdempotencyKey\(\) \}\)/g],
      ["app/api/checkout/stripe-session/route.ts", /const intentIdempotencyKey = \(\) =>\s+att\.current \? stripeIdentityKey\("product-intent", \[att\.current\.id\], params\) : stripeIdempotencyKey\("product-intent", \[creator\.id, product\.id\], params\)/g],
      ["app/api/checkout/stripe-session/route.ts", /checkout\.sessions\.create\(walletParams, \{\s+idempotencyKey: att\.current \? stripeIdentityKey\("product-wallet", \[att\.current\.id\], walletParams\) : stripeIdempotencyKey\("product-wallet", \[creator\.id, product\.id\], walletParams\)/g],
      ["app/api/checkout/site/route.ts", /paymentIntents\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("site-intent"/g],
      ["app/api/checkout/cart/route.ts", /checkout\.sessions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("cart-session"/g],
      ["lib/communities/server/event-checkout.ts", /sessions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("community-event"/g],
      ["lib/communities/server/learn-checkout.ts", /sessions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("community-program"/g],
      ["lib/communities/server/library-checkout.ts", /sessions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("community-library"/g],
      ["lib/communities/server/module-sales.ts", /sessions\.create\(params, \{ idempotencyKey: stripeIdempotencyKey\("community-module"/g],
    ]
    check("every storefront checkout and payment create carries a key from its exact params", keyed.every(([p, re]) => re.test(code(p))))
    const unkeyed = ["app/api/checkout/stripe-session/route.ts", "app/api/checkout/site/route.ts", "app/api/checkout/cart/route.ts"].filter((p) => /(?:paymentIntents|checkout\.sessions)\.create\([a-zA-Z]+\)/.test(code(p)))
    check("  and none is left without one", unkeyed.length === 0, unkeyed)
  }

  console.log("\nA cashout is keyed by the payout itself, never the clock")
  {
    const base = { creatorId: CREATOR, accountId: "acct_1Seller", lastCashoutEventId: "9f0c0000-0000-4000-8000-000000000001", walletMinor: 12_345, params: { amount: 12_345, currency: "usd", description: "Storelib cashout" } }
    const k1 = cashoutIdempotencyKey(base)
    const realNow = Date.now
    let k2 = ""
    try {
      Date.now = () => realNow() + 3 * 60 * 60_000
      k2 = cashoutIdempotencyKey(base)
    } finally {
      Date.now = realNow
    }
    check("the same payout pressed again hours later is the same key (no time in it)", k1 === k2, { k1, k2 })
    check("a genuinely new cashout (the last cashout moved on) is a new key, even for the same amount", k1 !== cashoutIdempotencyKey({ ...base, lastCashoutEventId: "9f0c0000-0000-4000-8000-000000000002" }))
    check("the first cashout ever has its own anchor", k1 !== cashoutIdempotencyKey({ ...base, lastCashoutEventId: null }) && /:first:/.test(cashoutIdempotencyKey({ ...base, lastCashoutEventId: null })))
    check("a different amount or currency is a different key, so Stripe never refuses a changed request", k1 !== cashoutIdempotencyKey({ ...base, walletMinor: 99 }) && k1 !== cashoutIdempotencyKey({ ...base, params: { ...base.params, currency: "eur" } }))
    check("another store's identical balance never shares a key", k1 !== cashoutIdempotencyKey({ ...base, creatorId: "22222222-2222-4222-8222-222222222222", accountId: "acct_2Other" }))
    check("cashout keys fit Stripe's 255 characters", k1.length <= 255 && stripeIdentityKey("x", ["a".repeat(500)], {}).length <= 255)

    /* The answer is lost (the payout made, the route rolled the ledger back), and the seller presses again. */
    const f = fakeStripe(() => ({ status: 200, body: { id: `po_${Math.random().toString(36).slice(2)}`, object: "payout" } }))
    const client = sdk(f.transport, new StripeCircuitBreaker())
    const first = await client.payouts.create(base.params as any, { stripeAccount: base.accountId, idempotencyKey: k1 })
    const again = await client.payouts.create(base.params as any, { stripeAccount: base.accountId, idempotencyKey: cashoutIdempotencyKey(base) })
    check("a retry after a lost answer gets the first payout back: one payout, not two", first.id === again.id && f.seen.filter((x) => x.method === "POST").length === 2, { first: first.id, again: again.id })
    const next = await client.payouts.create(base.params as any, { stripeAccount: base.accountId, idempotencyKey: cashoutIdempotencyKey({ ...base, lastCashoutEventId: "after-first" }) })
    check("  and the next real cashout, once the first is recorded, is paid", next.id !== first.id)

    const route = code("app/api/stripe/cashout/route.ts")
    check("the cashout route no longer keys the payout on the time", !/cashout_\$\{creator\.id\}_\$\{Date\.now\(\)\}/.test(route) && !/idempotencyKey[^\n]*Date\.now/.test(route))
    check("  it keys it on the account, the last recorded cashout and the amount",
      /cashoutIdempotencyKey\(\{\s*creatorId: creator\.id,\s*accountId: stripeAccountId,\s*lastCashoutEventId:[^,]+,\s*walletMinor: cashoutWalletMinor,\s*params: payoutParams,?\s*\}\)/.test(route) &&
        /stripe\.payouts\.create\(payoutParams, \{ stripeAccount: stripeAccountId, idempotencyKey \}\)/.test(route))
    check("  the anchor is this store's latest cashout_initiated event, read after the ledger lock and before the payout",
      /\.eq\("event_type", "cashout_initiated"\)\s*\.order\("created_at", \{ ascending: false \}\)/.test(route) &&
        route.indexOf('.eq("in_transit_amount", 0)') < route.indexOf('.eq("event_type", "cashout_initiated")') && route.indexOf('.eq("event_type", "cashout_initiated")') < route.indexOf("stripe.payouts.create"))
    check("  an unread anchor pays nothing: the ledger is put back and the seller is told to try again", /if \(lastCashoutErr\) \{\s*await rollback\(\)\s*return NextResponse\.json\([^)]*\{ status: 503 \}\)/.test(route))
    check("  the double press is still refused by the ledger lock (409)", /\.eq\("in_transit_amount", 0\)/.test(route) && /status: 409/.test(route))
  }

  console.log("\nThe downgrade schedule is created once per downgrade")
  {
    const change = code("app/api/billing/subscription/change/route.ts")
    check("subscriptionSchedules.create carries a key from the subscription, the released schedule and the new plan",
      /stripe\.subscriptionSchedules\.create\(scheduleParams, \{\s*idempotencyKey: stripeIdentityKey\("plan-downgrade-schedule", \[stripeSubscription\.id, existingScheduleId \?\? "none", newPlanId\], scheduleParams\)/.test(change))
    check("  and no schedule is created without one", (change.match(/subscriptionSchedules\.create\(/g) ?? []).length === (change.match(/subscriptionSchedules\.create\(scheduleParams, \{\s*idempotencyKey: stripeIdentityKey\(/g) ?? []).length)
    check("  a key that hands back a released schedule is followed by a new one, a bounded number of times",
      /for \(let i = 0; i < 3 && \(schedule\.status === "released"/.test(change) && /`after-\$\{schedule\.id\}`/.test(change))
    const p = { from_subscription: "sub_A" }
    const a = stripeIdentityKey("plan-downgrade-schedule", ["sub_A", "none", "free"], p)
    check("the schedule key is deterministic, and another plan or released schedule is another key",
      a === stripeIdentityKey("plan-downgrade-schedule", ["sub_A", "none", "free"], { ...p }) && a !== stripeIdentityKey("plan-downgrade-schedule", ["sub_A", "none", "growth"], p) && a !== stripeIdentityKey("plan-downgrade-schedule", ["sub_A", "sub_sched_1", "free"], p))
  }

  console.log("\nStripe sends people back to Storelib, never anywhere a request names")
  {
    const saved = { main: process.env.NEXT_PUBLIC_MAIN_DOMAIN, app: process.env.APP_URL, pub: process.env.NEXT_PUBLIC_APP_URL, site: process.env.NEXT_PUBLIC_SITE_URL, env: process.env.NODE_ENV }
    const env = process.env as Record<string, string | undefined>
    env.NEXT_PUBLIC_MAIN_DOMAIN = "storelib.com"
    delete env.APP_URL
    delete env.NEXT_PUBLIC_APP_URL
    delete env.NEXT_PUBLIC_SITE_URL
    env.NODE_ENV = "production"
    try {
      const kept = ["https://storelib.com/app/settings/billing?success=1", "https://www.storelib.com/sell?stripe_success=1&tier=growth"]
      check("Storelib's own pages are kept as sent", kept.every((u) => trustedReturnUrl(u) === u), kept.map((u) => trustedReturnUrl(u)))
      check("surrounding spaces are trimmed, not trusted blindly", trustedReturnUrl(" https://storelib.com/app ") === "https://storelib.com/app" && trustedReturnUrl(" https://evil.example/ ") === null)
      check("a path is resolved on the platform", trustedReturnUrl("/app/settings/billing/upgrade") === "https://storelib.com/app/settings/billing/upgrade")
      const refused = [
        "https://evil.example/receipt",
        "https://storelib.com.evil.example/",
        "https://evilstorelib.com/",
        "https://someoneelse.storelib.com/",
        "https://user:pw@storelib.com/",
        "https://evil.example\\@storelib.com/",
        "//evil.example/x",
        "/\\evil.example",
        "http://storelib.com/app",
        "https://storelib.com:8443/app",
        "javascript:alert(1)",
        "data:text/html,hi",
        "https://storelib.com/\nx",
        "",
        42,
        null,
      ]
      const leaks = refused.filter((u) => trustedReturnUrl(u) !== null)
      check("every other address is refused (other hosts, look alikes, other creators' subdomains, userinfo, http, ports, schemes, control characters)", leaks.length === 0, leaks)
      check("a refused address falls back to the platform page", billingReturnUrl("https://evil.example/", "/app/settings/billing?success=1") === "https://storelib.com/app/settings/billing?success=1")
      check("a store's verified domain passes only when the caller names it", trustedReturnUrl("https://mybrand.example/thanks", { ownHosts: ["mybrand.example"] }) === "https://mybrand.example/thanks" && trustedReturnUrl("https://mybrand.example/thanks") === null)
      check("a request's origin is used only when it is Storelib's", trustedRequestOrigin("https://storelib.com/api/payments/identity") === "https://storelib.com" && trustedRequestOrigin("https://evil.example/api/payments/identity") === "https://storelib.com" && trustedRequestOrigin("not a url") === "https://storelib.com")
      env.APP_URL = "https://app.storelib-staging.example"
      check("  and APP_URL's host is Storelib too", trustedReturnUrl("https://app.storelib-staging.example/app") !== null)
    } finally {
      for (const [k, v] of [["NEXT_PUBLIC_MAIN_DOMAIN", saved.main], ["APP_URL", saved.app], ["NEXT_PUBLIC_APP_URL", saved.pub], ["NEXT_PUBLIC_SITE_URL", saved.site], ["NODE_ENV", saved.env]] as const) {
        if (v === undefined) delete env[k]
        else env[k] = v
      }
    }
    const create = code("app/api/billing/subscription/create/route.ts")
    check("the plan checkout's success_url and cancel_url pass the check, else the billing page",
      /const successUrl = trustedReturnUrl\(customSuccessUrl\) \?\? `\$\{appUrl\}\/app\/settings\/billing\?success=1`/.test(create) && /const cancelUrl = trustedReturnUrl\(customCancelUrl\) \?\? `\$\{appUrl\}\/app\/settings\/billing\?canceled=1`/.test(create) && !/customSuccessUrl \|\||customCancelUrl \|\|/.test(create))
    check("Connect's return_url and refresh_url come from Storelib's origin only", /return trustedRequestOrigin\(request\.nextUrl\.toString\(\)\)/.test(code("app/api/payments/[action]/route.ts")) && !/request\.nextUrl\.origin/.test(code("app/api/payments/[action]/route.ts")))
    const wallet = code("app/api/checkout/stripe-session/route.ts")
    check("the app's wallet Checkout returns to Storelib's origin only", /const originHost = trustedRequestOrigin\(request\.url\)/.test(wallet) && !/new URL\(request\.url\)\.origin/.test(wallet))
    check("the billing portals return to a fixed Storelib page", /return_url: `\$\{process\.env\.APP_URL/.test(code("app/api/billing/customer-portal/route.ts")) && /return_url: `\$\{appUrl\}\/app\/settings\/billing\?setup_success=1`/.test(code("app/api/billing/checkout/setup/route.ts")))
  }

  console.log("\nThe billing overview reads each row once per request, never across requests")
  {
    let loads = 0
    const read = perRequest("t", async (id: string) => {
      loads++
      return { id, n: loads }
    })
    const [a, b, c] = await withRequestMemo(() => Promise.all([read("creator-1"), read("creator-1"), read("creator-2")]))
    check("inside one request the same creator is read once", a === b && loads === 2, { loads })
    check("  and another creator is its own read", c.id === "creator-2" && c !== a)
    const before = loads
    const d = await withRequestMemo(() => read("creator-1"))
    check("the next request reads afresh (nothing kept between requests or people)", loads === before + 1 && d !== a)
    const outside = loads
    await read("creator-1")
    await read("creator-1")
    check("outside a request scope every call reads (no process wide cache)", loads === outside + 2)
    let fails = 0
    const flaky = perRequest("f", async () => {
      fails++
      if (fails === 1) throw new Error("db timeout")
      return "row"
    })
    const second = await withRequestMemo(async () => {
      await flaky("x").catch(() => null)
      await new Promise((r) => setTimeout(r, 0))
      return flaky("x")
    })
    check("a failed read is not kept: the next ask in the same request tries again", second === "row" && fails === 2)

    const overview = code("lib/billing/overview.ts")
    check("the overview reads the creator, the stored row and the override together, through the per request reads",
      /await Promise\.all\(\[\s*billingCreatorFor\(creatorId\),\s*billingSubscriptionRowFor\(creatorId\),\s*billingPlanOverrideFor\(creatorId\),/.test(overview) && !/readSubscriptionRow\(admin/.test(overview) && !/readPlanOverride\(admin/.test(overview))
    check("  and does not ask who is signed in again when the route already did", /* Changed on purpose (rel2-auth): when it asks, it asks Supabase Auth itself through routeUser({ fresh: true }). */ /if \(!creatorId\) \{\s*const who = await routeUser\(\{ fresh: true \}\)/.test(overview))
    check("the overview route gives the request its own memo", /withBillingRequest\(\(\) => loadBillingOverview\(\{ creatorId: who\.creatorId \}\)\)/.test(code("app/api/billing/overview/route.ts")))
    const reads = code("lib/billing/request-reads.ts")
    const memo = code("lib/billing/request-memo.ts")
    check("the reads are keyed by the creator's id and scoped per request (React cache, or the route's own map)",
      /perRequest\("creator"/.test(reads) && /perRequest\("subscription-row"/.test(reads) && /perRequest\("plan-override"/.test(reads) && /cache\(load\)/.test(memo) && /scope\.run\(new Map\(\), work\)/.test(memo))
  }

  console.log("\nPayout setup stops asking when nobody is looking")
  {
    const flow = code("components/app/settings/payments-setup-flow.tsx")
    const hook = flow.slice(flow.indexOf("function useWhenPayoutsOn"), flow.indexOf("function InAppSetup"))
    check("no fixed 4s interval any more", !/setInterval\(/.test(hook))
    check("a hidden tab asks nothing, and coming back asks at once",
      /document\.addEventListener\("visibilitychange", onVisibility\)/.test(hook) && /document\.removeEventListener\("visibilitychange", onVisibility\)/.test(hook) && /if \(document\.hidden\) stop\(\)\s*else void look\(\)/.test(hook) && /if \(gone \|\| document\.hidden \|\| Date\.now\(\) >= stopAt\) return/.test(hook))
    check("it stops after a bounded time (15 minutes), and never overlaps a slow answer",
      /const PAYOUTS_POLL_LIMIT_MS = 15 \* 60_000/.test(flow) && /const PAYOUTS_POLL_MS = 4000/.test(flow) && /const stopAt = Date\.now\(\) \+ PAYOUTS_POLL_LIMIT_MS/.test(hook) && /if \(gone \|\| busy \|\|/.test(hook))
  }

  console.log("\nThe other Stripe creates on a press carry a key")
  {
    check("a payout bank is added once per press", /stripe\.accounts\.createExternalAccount\(account\.id, bankParams, \{\s*idempotencyKey: stripeIdempotencyKey\("connect-bank", \[account\.id\], bankParams/.test(code("lib/payments/stripe/own-form.ts")))
    check("a business representative is added once per save", /stripe\.accounts\.createPerson\(accountId, params as Stripe\.AccountCreatePersonParams, \{\s*idempotencyKey: stripeIdempotencyKey\("connect-representative"/.test(code("lib/payments/stripe/connect.ts")))
    check("the membership portal configuration is made once", /billingPortal\.configurations\.create\(configParams, \{\s*idempotencyKey: stripeIdempotencyKey\("membership-portal-config"/.test(code("lib/memberships/billing.ts")))
    const refunds: [string, RegExp][] = [
      ["app/api/stripe/refund/route.ts", /refunds\.create\(refundParams, \{ idempotencyKey: `storelib-refund:/],
      ["app/api/admin/orders/refund/route.ts", /\{ idempotencyKey: plan\.idempotencyKey \}/],
      ["lib/physical/buyer-cancel-server.ts", /idempotencyKey: `storelib-buyer-cancel:/],
      ["lib/checkout/sold-out-refund.ts", /idempotencyKey: `storelib-sold-out:/],
      ["lib/memberships/duplicates.ts", /idempotencyKey: `membership-duplicate:/],
      ["lib/stripe/disputes.ts", /idempotencyKey: `storelib:dispute:\$\{dispute\.id\}:reversal`/],
      ["lib/stripe/disputes.ts", /idempotencyKey: `storelib:dispute:\$\{dispute\.id\}:restore`/],
      ["lib/memberships/billing.ts", /idempotencyKey: `membership-price:/],
      ["lib/tax/membership.ts", /idempotencyKey: `storelib-tax-rate:/],
    ]
    const missing = refunds.filter(([p, re]) => !re.test(code(p))).map(([p]) => p)
    check("refunds, transfers, reversals, prices and tax rates stay keyed by what they are", missing.length === 0, missing)
  }

  console.log("\nDuplicate and out of order webhooks never take a paid plan away")
  {
    const state = {
      creators: [{ id: CREATOR, stripe_customer_id: "cus_A", subscription_plan_id: "growth", subscription_status: "active" }],
      subscriptions: [{ creator_id: CREATOR, stripe_subscription_id: "sub_A", stripe_customer_id: "cus_A", plan_id: "growth", status: "active", cancel_at_period_end: false }],
    }
    const writes: string[] = []
    const db = {
      from(table: "creators" | "subscriptions") {
        const filters: [string, unknown][] = []
        let mode: "read" | "update" | "upsert" = "read"
        let values: Record<string, unknown> = {}
        const rows = () => (state[table] as Record<string, unknown>[]).filter((r) => filters.every(([k, v]) => r[k] === v))
        const b: Record<string, unknown> = {
          select: () => b,
          eq: (k: string, v: unknown) => { filters.push([k, v]); return b },
          limit: () => b,
          update: (v: Record<string, unknown>) => { mode = "update"; values = v; return b },
          upsert: (v: Record<string, unknown>) => { mode = "upsert"; values = v; return b },
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (res: (v: unknown) => unknown) => {
            if (mode !== "read") {
              writes.push(`${table}:${mode}:${JSON.stringify(values)}`)
              for (const r of rows().length ? rows() : (state[table] as Record<string, unknown>[]).filter((r) => r.creator_id === values.creator_id)) Object.assign(r, values)
            }
            return Promise.resolve({ data: mode === "read" ? rows() : null, error: null }).then(res)
          },
        }
        return b
      },
    }
    let listed = 0
    const deps: SyncDeps = { db: db as SyncDeps["db"], listSubscriptions: async () => { listed++; return [sub({ status: "active" })] } }
    /* invoice.payment_failed for an attempt that a later retry paid, delivered late, twice. */
    const lateFailed = { id: "sub_A", status: "past_due", customer: "cus_A", metadata: {} }
    const r1 = await syncFromSubscriptionEvent(deps, lateFailed)
    const r2 = await syncFromSubscriptionEvent(deps, lateFailed)
    check("a late failed payment for a renewal that was paid: still growth and active, not past_due", r1?.plan.status === "active" && state.creators[0].subscription_status === "active" && state.subscriptions[0].status === "active", { r1: r1?.plan, state })
    check("  delivered twice, nothing on creators changes either time", r1?.plan.creatorUpdate === null && r2?.plan.creatorUpdate === null && !writes.some((w) => w.startsWith("creators")))
    check("  one Stripe list per delivery (bounded)", listed === 2)
    const hook = code("app/api/stripe/webhook/route.ts")
    const failedBranch = hook.slice(hook.indexOf('event.type === "invoice.payment_failed"'))
    check("the webhook syncs from Stripe on a failed payment instead of writing past_due blindly",
      /syncFromSubscriptionEvent\(subscriptionSyncDeps\(\), \{ id: subscriptionId, status: "past_due"/.test(failedBranch))
    check("  and when Stripe cannot be asked, writes past_due only over active or trialing (past_due keeps the features)",
      /\.eq\("stripe_subscription_id", subscriptionId\)\s*\.in\("status", \["active", "trialing"\]\)/.test(failedBranch) && /\.in\("subscription_status", \["active", "trialing"\]\)/.test(failedBranch))
    check("every event is claimed once by its id before anything runs (stripe_webhook_events)", /claimStripeEvent\(supabaseAdmin, \{ id: event\.id/.test(hook) && /if \(claim === "done"\) return NextResponse\.json\(\{ received: true, duplicate: true \}\)/.test(hook))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
