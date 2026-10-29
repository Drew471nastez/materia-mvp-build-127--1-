/**
 * ===========================================================================
 *  ROUND ANA-1029: STORELIB ANALYTICS SENT ON TO A STORE'S OTHER TOOLS
 * ===========================================================================
 *   HASHING     emails and phones by Google's and Meta's own rules, SHA-256
 *   CONSENT     what each tool may have of a person, and nothing without it
 *   REQUESTS    the exact request GA4 (Measurement Protocol), Meta
 *               (Conversions API), PostHog (capture) and a webhook (signed)
 *               receive, through a fake transport
 *   DEDUPE      a purchase told twice is one row and one request; Meta's
 *               event_id is the browser pixel's order id; PostHog's uuid and
 *               the webhook's delivery id are the same on a retry
 *   QUEUE       held for the thank you page, retried with backoff, failed
 *               on a refusal or after the last try, the person emptied
 *   EVENTS      purchases read back from the orders (items, currency), test
 *               sales and free claims never sent, refunds by the purchase's
 *               id, page views only with consent
 *   CONNECTING  a key tried before it is kept, sealed, shown as four
 *               characters; a webhook's secret once; Test in the log
 *   EXPORT      GET /api/v1/analytics's figures, CSV, keys
 *   SQL         part 338
 *
 * Real Google, Meta and PostHog accounts are not reachable from here: every
 * request is checked against the documented shape, not a live answer.
 *
 * Run: npx tsx --conditions=react-server tests/analytics-destinations.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createHash, createHmac } from "node:crypto"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-commerce-secrets-key-for-analytics-destinations"

import { fakeDb } from "./_fake-db"
import {
  buildRequest,
  hashEmail,
  hashPhone,
  major,
  nextAttemptAt,
  normalizeEmail,
  normalizePhone,
  outcomeOf,
  parseConnect,
  personFor,
  posthogHost,
  stableUuid,
  webhookSignature,
  MAX_ATTEMPTS,
  type BuildInput,
  type ForwardFacts,
  type PersonInput,
  type ProviderRequest,
} from "@/lib/analytics/destinations/providers"
import { drain, enqueue, forgetDestinations, noteBrowser, type Transport } from "@/lib/analytics/destinations/queue-server"
import { forwardLead, forwardOutboxEvent, forwardPageView, gaClientIdOf, personOf, purchaseRef } from "@/lib/analytics/destinations/forward-server"
import { loadDestinations, saveDestination } from "@/lib/analytics/destinations/connect-server"
import { aggregate, exportCsv, parseExportQuery, dayIn } from "@/lib/analytics/destinations/export-api"
import { bearerOf, hashApiToken, looksLikeApiToken, mintApiToken, storeOfApiToken } from "@/lib/analytics/destinations/api-tokens-server"
import { sealSecret, openSecret } from "@/lib/physical/secrets"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`)
  }
}
function section(name: string) {
  console.log(`\n${name}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const json = (r: ProviderRequest) => JSON.parse(r.body) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const STORE = "11111111-1111-4111-8111-111111111111"
const NOW = Date.parse("2026-10-29T10:00:00Z")
const CONSENT_ALL = "2.p1.a1.m1.1793000000"
const CONSENT_ANALYTICS = "2.p0.a1.m0.1793000000"

function fakeTransport(answer: (req: ProviderRequest, n: number) => { status: number; body: unknown } = () => ({ status: 200, body: {} })) {
  const sent: { req: ProviderRequest; publicOnly: boolean }[] = []
  const t: Transport = {
    send: async (req, publicOnly) => {
      sent.push({ req, publicOnly })
      return answer(req, sent.length)
    },
  }
  return { t, sent }
}

function destinations() {
  return [
    { id: "d-ga4", creator_id: STORE, provider: "ga4", status: "connected", account_label: "G-ABC1234", config: { measurement_id: "G-ABC1234" }, secret_ciphertext: sealSecret("ga-secret-1234567890") },
    { id: "d-meta", creator_id: STORE, provider: "meta", status: "connected", account_label: "123456789012345", config: { pixel_id: "123456789012345" }, secret_ciphertext: sealSecret("EAAB" + "x".repeat(60)) },
    { id: "d-ph", creator_id: STORE, provider: "posthog", status: "connected", account_label: "eu.i.posthog.com", config: { host: "https://eu.i.posthog.com" }, secret_ciphertext: sealSecret("phc_" + "a".repeat(40)) },
    { id: "d-hook", creator_id: STORE, provider: "webhook", status: "connected", account_label: "hooks.example.com", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url: "https://hooks.example.com/storelib", secret: "whsec_test_secret" })) },
  ]
}

const FACTS: ForwardFacts = { ref: "ord-1", at: "2026-10-29T09:00:00.000Z", valueCents: 2599, currency: "eur", items: [{ id: "prod-1", name: "Poster", priceCents: 1299, quantity: 2 }], url: "https://shop.example.com/checkout/thanks/x" }
const PERSON: PersonInput = { consent: { analytics: true, marketing: true }, gaClientId: "123456789.1700000000", visitorId: "v_abc", email: "  Jane.Doe@GMail.com ", phone: "+40 712 345 678", ip: "203.0.113.9", userAgent: "Mozilla/5.0 Test", fbp: "fb.1.1700000000.111", fbc: "fb.1.1700000000.AbC", country: "RO" }

function built(over: Partial<BuildInput> & Pick<BuildInput, "tool">): ProviderRequest | string {
  const secret = over.tool === "webhook" ? { url: "https://hooks.example.com/storelib", secret: "whsec_test_secret" } : { key: over.tool === "ga4" ? "ga-secret-1234567890" : over.tool === "meta" ? "EAABtoken" : "phc_key" }
  const config = over.tool === "ga4" ? { measurement_id: "G-ABC1234" } : over.tool === "meta" ? { pixel_id: "123456789012345" } : over.tool === "posthog" ? { host: "https://eu.i.posthog.com" } : {}
  const b = buildRequest({ event: "purchase", eventKey: "purchase:ord-1", facts: FACTS, person: null, config, secret, storeId: STORE, now: NOW, ...over })
  return "skip" in b ? b.skip : b.request
}

async function main() {
  section("Hashing, by Google's and Meta's own rules")
  {
    check("Meta: an email trimmed and lowercased", normalizeEmail("  Jane.Doe@GMail.com ", "meta") === "jane.doe@gmail.com")
    check("Google: the dots before @gmail.com go, too", normalizeEmail("  Jane.Doe@GMail.com ", "google") === "janedoe@gmail.com" && normalizeEmail("a.b@example.com", "google") === "a.b@example.com")
    check("not an email: nothing", normalizeEmail("nope", "meta") === null && hashEmail("", "google") === null)
    check("a phone: its digits with the country code (Meta), with the + (Google)", normalizePhone("+40 712 345 678", "meta") === "40712345678" && normalizePhone("0040 712-345-678", "google") === "+40712345678")
    check("a phone without its code is left out", normalizePhone("0712 345 678", "meta") === null)
    check("SHA-256 as lowercase hex", hashEmail("Jane.Doe@gmail.com", "meta") === sha("jane.doe@gmail.com") && hashPhone("+40712345678", "meta") === sha("40712345678"))
  }

  section("Consent: what each tool may have")
  {
    const none: PersonInput = { ...PERSON, consent: { analytics: false, marketing: false } }
    check("GA4 without consent: no client id, no hash", JSON.stringify(personFor("ga4", none, "purchase")) === JSON.stringify({ consent: { analytics: false, marketing: false } }))
    const ga = personFor("ga4", PERSON, "purchase")
    check("GA4 with consent: the _ga client id, the Google hashes", ga.clientId === "123456789.1700000000" && ga.emailHash === sha("janedoe@gmail.com") && ga.phoneHash === sha("+40712345678") && !("email" in ga) && !("ip" in ga))
    check("Meta without marketing consent: nothing at all", Object.keys(personFor("meta", { ...PERSON, consent: { analytics: true, marketing: false } }, "purchase")).join() === "consent")
    const meta = personFor("meta", PERSON, "purchase")
    check("Meta with it: the Meta hashes, address, agent, _fbp, _fbc", meta.emailHash === sha("jane.doe@gmail.com") && meta.phoneHash === sha("40712345678") && meta.ip === "203.0.113.9" && meta.fbp === "fb.1.1700000000.111" && meta.fbc === "fb.1.1700000000.AbC" && meta.country === "ro")
    check("PostHog never gets an email or a phone", JSON.stringify(personFor("posthog", PERSON, "purchase")) === JSON.stringify({ consent: { analytics: true, marketing: true }, visitorId: "v_abc" }))
    check("a webhook: a buyer's email only with marketing consent", !personFor("webhook", none, "purchase").email && personFor("webhook", PERSON, "purchase").email === "jane.doe@gmail.com")
    check("  a signup's email always (what the person gave the store)", personFor("webhook", none, "lead").email === "jane.doe@gmail.com")
    check("the _ga cookie read as GA4's client id", gaClientIdOf("GA1.1.123456789.1700000000") === "123456789.1700000000" && gaClientIdOf("junk") === null)
    const headers = new Headers({ "user-agent": "UA", "x-forwarded-for": "198.51.100.1, 10.0.0.1", "x-vercel-ip-country": "DE" })
    const cookies: Record<string, string> = { storelib_consent: CONSENT_ANALYTICS, _ga: "GA1.1.42.43", _fbp: "fb.1.2.3" }
    const p = personOf({ headers, cookie: (n) => cookies[n] }, {}, Date.parse("2026-10-29T00:00:00Z"))
    check("a request's consent cookie read as it is kept (lib/consent)", p.consent.analytics === true && p.consent.marketing === false && p.gaClientId === "42.43" && p.ip === "198.51.100.1")
  }

  section("Google Analytics 4: the Measurement Protocol request")
  {
    const r = built({ tool: "ga4" }) as ProviderRequest
    const b = json(r)
    check("POST /mp/collect with the measurement id and the API secret", r.url === "https://www.google-analytics.com/mp/collect?measurement_id=G-ABC1234&api_secret=ga-secret-1234567890" && r.method === "POST")
    check("purchase: transaction_id, value in major units, currency in capitals, items", b.events[0].name === "purchase" && b.events[0].params.transaction_id === "ord-1" && b.events[0].params.value === 25.99 && b.events[0].params.currency === "EUR" && JSON.stringify(b.events[0].params.items) === JSON.stringify([{ item_id: "prod-1", item_name: "Poster", price: 12.99, quantity: 2 }]))
    check("no consent: a client id made from the event, ad consent DENIED, no user_data", /^\d+\.\d+$/.test(b.client_id) && b.consent.ad_user_data === "DENIED" && b.consent.ad_personalization === "DENIED" && b.non_personalized_ads === true && !("user_data" in b))
    check("  the same event, the same anonymous client id", json(built({ tool: "ga4" }) as ProviderRequest).client_id === b.client_id)
    const c = json(built({ tool: "ga4", person: personFor("ga4", PERSON, "purchase") }) as ProviderRequest)
    check("with consent: the _ga client id, GRANTED, sha256_email_address and sha256_phone_number", c.client_id === "123456789.1700000000" && c.consent.ad_user_data === "GRANTED" && c.user_data.sha256_email_address[0] === sha("janedoe@gmail.com") && c.user_data.sha256_phone_number[0] === sha("+40712345678"))
    check("yen has no decimals: 2500 is 2500", major(2500, "JPY") === 2500 && major(1250, "KWD") === 1.25 && major(1250, "usd") === 12.5)
    const refund = json(built({ tool: "ga4", event: "refund", eventKey: "refund:x", facts: { ref: "ord-1", at: FACTS.at, valueCents: 500, currency: "EUR" } }) as ProviderRequest)
    check("refund: the purchase's transaction_id and the refunded value", refund.events[0].name === "refund" && refund.events[0].params.transaction_id === "ord-1" && refund.events[0].params.value === 5)
    const lead = json(built({ tool: "ga4", event: "lead", eventKey: "lead:x", facts: { ref: "lead-1", at: FACTS.at, form: "signup" } }) as ProviderRequest)
    check("a signup is generate_lead, a membership sign_up", lead.events[0].name === "generate_lead" && lead.events[0].params.lead_source === "signup" && json(built({ tool: "ga4", event: "sign_up", eventKey: "s", facts: { ref: "m-1", at: FACTS.at, form: "membership" } }) as ProviderRequest).events[0].params.method === "membership")
    check("a page view without analytics consent is not built", built({ tool: "ga4", event: "page_view", eventKey: "v", facts: { ref: "pv-1", at: FACTS.at } }) === "No analytics consent from this visitor.")
    const v = buildRequest({ tool: "ga4", event: "test", eventKey: "t", facts: { ref: "t", at: FACTS.at, test: true }, person: null, config: { measurement_id: "G-ABC1234" }, secret: { key: "k".repeat(12) }, storeId: STORE, validate: true })
    check("a test asks the validation endpoint first", v.ok && v.request.url.startsWith("https://www.google-analytics.com/debug/mp/collect?"))
    check("GA4's validation messages are a refusal", outcomeOf("ga4", 200, { validationMessages: [{ description: "bad" }] }) === "refused" && outcomeOf("ga4", 204, "") === "ok")
  }

  section("Meta Conversions API: the request, and one event with the pixel's")
  {
    check("nothing without marketing consent", built({ tool: "meta" }) === "No marketing consent from this visitor.")
    const r = built({ tool: "meta", person: personFor("meta", PERSON, "purchase") }) as ProviderRequest
    const b = json(r)
    const e = b.data[0]
    check("POST graph.facebook.com/<version>/<pixel>/events, the token in the body, never the address", /^https:\/\/graph\.facebook\.com\/v\d+\.0\/123456789012345\/events$/.test(r.url) && b.access_token === "EAABtoken" && !r.url.includes("EAAB"))
    check("Purchase, event_id the order's id (the thank you page's fbq eventID)", e.event_name === "Purchase" && e.event_id === "ord-1" && e.event_time === Math.floor(Date.parse(FACTS.at) / 1000))
    check("user_data: em and ph as Meta hashes, address, agent, fbp, fbc", e.user_data.em[0] === sha("jane.doe@gmail.com") && e.user_data.ph[0] === sha("40712345678") && e.user_data.client_ip_address === "203.0.113.9" && e.user_data.client_user_agent === "Mozilla/5.0 Test" && e.user_data.fbp === "fb.1.1700000000.111")
    check("  with the browser's agent it is a website event, with its page", e.action_source === "website" && e.event_source_url === FACTS.url)
    check("custom_data: value, currency, contents, num_items, order_id", e.custom_data.value === 25.99 && e.custom_data.currency === "EUR" && e.custom_data.contents[0].id === "prod-1" && e.custom_data.num_items === 2 && e.custom_data.order_id === "ord-1")
    const noUa = json(built({ tool: "meta", person: personFor("meta", { ...PERSON, userAgent: null, ip: null }, "purchase") }) as ProviderRequest).data[0]
    check("without the browser (a Stripe webhook): system_generated", noUa.action_source === "system_generated" && !("event_source_url" in noUa))
    check("a signup is Lead, a membership Subscribe", json(built({ tool: "meta", event: "lead", eventKey: "l", facts: { ref: "lead-1", at: FACTS.at, form: "signup" }, person: personFor("meta", PERSON, "lead") }) as ProviderRequest).data[0].event_name === "Lead" && json(built({ tool: "meta", event: "sign_up", eventKey: "s", facts: { ref: "m", at: FACTS.at }, person: personFor("meta", PERSON, "sign_up") }) as ProviderRequest).data[0].event_name === "Subscribe")
    const test = buildRequest({ tool: "meta", event: "test", eventKey: "t", facts: { ref: "t1", at: FACTS.at, test: true }, person: null, config: { pixel_id: "123456789012345", test_event_code: "TEST555" }, secret: { key: "tok" }, storeId: STORE })
    check("a test carries the test_event_code, so it never counts", test.ok && json(test.request).test_event_code === "TEST555")
    check("Meta's transient codes are retried", outcomeOf("meta", 400, { error: { code: 2, message: "Service temporarily unavailable" } }) === "retry" && outcomeOf("meta", 400, { error: { code: 190, message: "Invalid OAuth access token" } }) === "refused")
  }

  section("PostHog: the capture request")
  {
    const r = built({ tool: "posthog" }) as ProviderRequest
    const b = json(r)
    check("POST <host>/i/v0/e/ with the project key in the body", r.url === "https://eu.i.posthog.com/i/v0/e/" && b.api_key === "phc_key")
    check("purchase with revenue, currency, order_id, products", b.event === "purchase" && b.properties.revenue === 25.99 && b.properties.currency === "EUR" && b.properties.order_id === "ord-1" && b.properties.products.length === 1)
    check("no consent: an anonymous distinct id, no person profile, no GeoIP of Storelib's server", b.distinct_id.startsWith("storelib_") && b.properties.$process_person_profile === false && b.properties.$geoip_disable === true)
    check("never an email, even with consent", !JSON.stringify(json(built({ tool: "posthog", person: personFor("posthog", PERSON, "purchase") }) as ProviderRequest)).includes("gmail"))
    check("the uuid is the same on a retry (PostHog keeps one)", json(built({ tool: "posthog" }) as ProviderRequest).uuid === b.uuid && b.uuid === stableUuid("posthog:purchase:ord-1") && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.uuid))
    check("hosts: US, EU, the old app address, a self hosted https one; never http", posthogHost(undefined) === "https://us.i.posthog.com" && posthogHost("https://app.posthog.com") === "https://us.i.posthog.com" && posthogHost("https://ph.example.com/") === "https://ph.example.com" && posthogHost("http://ph.example.com") === null)
  }

  section("Webhook: signed JSON, the same delivery id on a retry")
  {
    const r = built({ tool: "webhook" }) as ProviderRequest
    const b = json(r)
    const sig = r.headers["x-storelib-signature"]
    const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(sig)
    check("X-Storelib-Signature: t=<seconds>,v1=HMAC-SHA256 of \"<t>.<body>\"", !!m && m[2] === createHmac("sha256", "whsec_test_secret").update(`${m[1]}.${r.body}`).digest("hex") && webhookSignature("whsec_test_secret", r.body, Number(m![1])) === sig)
    check("the body: id, type, created_at, store_id, data", b.type === "analytics.purchase" && b.store_id === STORE && b.data.value === 25.99 && b.data.value_minor === 2599 && b.data.currency === "EUR" && b.data.ref === "ord-1")
    check("no email without consent", !("email" in b.data))
    check("the delivery id is the event's, every try", r.headers["x-storelib-delivery"] === b.id && json(built({ tool: "webhook", now: NOW + 60_000 }) as ProviderRequest).id === b.id)
    check("no page views to a webhook", built({ tool: "webhook", event: "page_view", eventKey: "v", facts: { ref: "p", at: FACTS.at } }) === "Webhook does not take this event.")
  }

  section("The queue: once per event, held, retried, failed, emptied")
  {
    forgetDestinations(STORE)
    const db = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [], store_settings: [] }, { unique: { analytics_forward_jobs: [["destination_id", "event_key"]] } })
    const r1 = await enqueue(db, { creatorId: STORE, event: "purchase", key: "purchase:ord-1", facts: FACTS, person: null, holdMs: 120_000, now: NOW })
    const r2 = await enqueue(db, { creatorId: STORE, event: "purchase", key: "purchase:ord-1", facts: FACTS, person: null, holdMs: 120_000, now: NOW + 5000 })
    const jobs = db.tables.analytics_forward_jobs
    check("a purchase: one row per tool", r1.queued === 4 && jobs.length === 4, jobs.length)
    check("  told again (the webhook and the buyer's return): still one row each", jobs.length === 4 && r2.queued >= 0)
    check("  held two minutes for the thank you page", jobs.every((j) => j.next_attempt_at === new Date(NOW + 120_000).toISOString()))
    check("  no person kept without consent", jobs.every((j) => JSON.stringify(j.person) === JSON.stringify({ consent: { analytics: false, marketing: false } })))

    const n = await noteBrowser(db, STORE, "ord-1", PERSON)
    const metaJob = jobs.find((j) => j.destination_id === "d-meta")!
    check("the thank you page's consent arrives: each row takes what its tool may have", n === 4 && metaJob.person.emailHash === sha("jane.doe@gmail.com") && !jobs.find((j) => j.destination_id === "d-ph")!.person.emailHash)

    const hook = fakeTransport((req, i) => (req.url.startsWith("https://hooks.example.com") && i <= 4 ? { status: 503, body: "busy" } : { status: 200, body: {} }))
    const s1 = await drain(db, { transport: hook.t, now: () => NOW + 1000 })
    check("drained: GA4, Meta and PostHog sent, the busy webhook to retry", s1.sent === 3 && s1.retried === 1, s1)
    const hookJob = jobs.find((j) => j.destination_id === "d-hook")!
    check("  retried in a minute, its try and the error kept", hookJob.status === "queued" && hookJob.attempts === 1 && hookJob.next_attempt_at === new Date(NOW + 1000 + 60_000).toISOString() && /503/.test(hookJob.last_error))
    check("  a webhook is sent through the public-only socket", hook.sent.find((s) => s.req.url.startsWith("https://hooks"))!.publicOnly === true && hook.sent.find((s) => s.req.url.includes("graph.facebook.com"))!.publicOnly === false)
    check("  sent rows: the person emptied, the answer code kept", jobs.filter((j) => j.status === "sent").every((j) => j.person === null && j.response_status === 200 && j.sent_at))
    const metaSent = hook.sent.find((s) => s.req.url.includes("graph.facebook.com"))!
    check("  Meta's request carried the hashed email from the thank you page", json(metaSent.req).data[0].user_data.em[0] === sha("jane.doe@gmail.com"))
    const firstId = json(hook.sent.find((s) => s.req.url.startsWith("https://hooks"))!.req).id
    const s2 = await drain(db, { transport: hook.t, now: () => NOW + 30_000 })
    check("not due yet: nothing taken", s2.taken === 0)
    await drain(db, { transport: hook.t, now: () => NOW + 120_000 })
    const again = hook.sent.filter((s) => s.req.url.startsWith("https://hooks"))
    check("the retry goes, with the same delivery id", hookJob.status === "sent" && again.length === 2 && json(again[1].req).id === firstId && again[1].req.headers["x-storelib-delivery"] === firstId)

    check("backoff: a minute, five, half an hour … then failed", nextAttemptAt(1, 0) === new Date(60_000).toISOString() && nextAttemptAt(2, 0) === new Date(300_000).toISOString() && nextAttemptAt(MAX_ATTEMPTS, 0) === null)
    const dead = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [{ id: "j1", destination_id: "d-hook", creator_id: STORE, event_name: "lead", event_key: "lead:z", subject_ref: "lead-z", facts: { ref: "lead-z", at: FACTS.at }, person: { consent: { analytics: false, marketing: false }, email: "a@b.co" }, status: "queued", attempts: MAX_ATTEMPTS - 1, next_attempt_at: new Date(NOW - 1).toISOString() }] })
    await drain(dead, { transport: fakeTransport(() => ({ status: 500, body: "down" })).t, now: () => NOW })
    check("the last try fails it, and empties the person", dead.tables.analytics_forward_jobs[0].status === "failed" && dead.tables.analytics_forward_jobs[0].person === null)
    const refused = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [{ id: "j2", destination_id: "d-ga4", creator_id: STORE, event_name: "purchase", event_key: "p", subject_ref: "p", facts: FACTS, person: null, status: "queued", attempts: 0, next_attempt_at: new Date(NOW - 1).toISOString() }] })
    await drain(refused, { transport: fakeTransport(() => ({ status: 401, body: { error: { message: "bad secret" } } })).t, now: () => NOW })
    check("a refusal (401) fails at once, in the tool's words", refused.tables.analytics_forward_jobs[0].status === "failed" && /refused the key: bad secret/.test(refused.tables.analytics_forward_jobs[0].last_error))
    const twice = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [{ id: "j3", destination_id: "d-ga4", creator_id: STORE, event_name: "purchase", event_key: "p", subject_ref: "p", facts: FACTS, person: null, status: "queued", attempts: 0, next_attempt_at: new Date(NOW - 1).toISOString() }] })
    const both = fakeTransport()
    await Promise.all([drain(twice, { transport: both.t, now: () => NOW }), drain(twice, { transport: both.t, now: () => NOW })])
    check("two runs at once send one row once (claimed by its try count)", both.sent.length === 1, both.sent.length)
  }

  section("Page views: only with consent, only to the tools that take them")
  {
    forgetDestinations(STORE)
    const db = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [], store_settings: [{ creator_id: STORE, tracking: { meta_pixel: "123456789012345" } }] })
    const row = { creator_id: STORE, product_id: "prod-9", visitor_id: "v_abc", path: "/products/poster", page_url: "https://shop.example.com/", page_title: "Poster", referrer: null, created_at: "2026-10-29T09:30:00.000Z" }
    const headers = new Headers({ referer: "https://shop.example.com/products/poster", "user-agent": "UA" })
    const quiet = fakeTransport()
    const none = await forwardPageView(db, row, { headers, cookie: () => undefined }, NOW, quiet.t)
    check("no consent: not a single row", none === 0 && db.tables.analytics_forward_jobs.length === 0)
    const cookies: Record<string, string> = { storelib_consent: CONSENT_ANALYTICS, _ga: "GA1.1.77.88" }
    await forwardPageView(db, row, { headers, cookie: (n) => cookies[n] }, NOW, quiet.t)
    const jobs = db.tables.analytics_forward_jobs
    const where = jobs.map((j) => `${j.destination_id}:${j.event_name}`).sort().join(",")
    check("analytics consent: page_view and view_item to GA4 and PostHog; Meta needs marketing; no webhook", where === "d-ga4:page_view,d-ga4:view_item,d-ph:page_view,d-ph:view_item", where)
    const pv = quiet.sent.find((s) => s.req.url.startsWith("https://www.google-analytics.com/mp/collect"))
    check("  sent at once: GA4's page_view with the page, the title and the _ga client id", !!pv && json(pv.req).client_id === "77.88" && json(pv.req).events[0].name === "page_view" && json(pv.req).events[0].params.page_location === "https://shop.example.com/products/poster" && json(pv.req).events[0].params.page_title === "Poster")
    forgetDestinations(STORE)
    const db2 = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [], store_settings: [{ creator_id: STORE, tracking: { meta_pixel: "123456789012345" } }] })
    const all: Record<string, string> = { storelib_consent: CONSENT_ALL }
    await forwardPageView(db2, row, { headers, cookie: (n) => all[n] }, NOW, quiet.t)
    check("with marketing consent, Meta's ViewContent is left to the store's own pixel (same pixel id, no id to match)", !db2.tables.analytics_forward_jobs.some((j) => j.destination_id === "d-meta"))
  }

  section("Purchases, refunds and signups, from Storelib's own records")
  {
    forgetDestinations(STORE)
    const orders = [
      { id: "o1", creator_id: STORE, product_id: "p1", amount_cents: 2000, quantity: 2, currency: "ron", status: "completed", created_at: "2026-10-29T09:00:00Z", checkout_id: null, stripe_session_id: "cs_1", receipt_token: "rt", source_detail: null, buyer_email: "a@b.co" },
      { id: "o2", creator_id: STORE, product_id: "p2", amount_cents: 500, quantity: 1, currency: "ron", status: "completed", created_at: "2026-10-29T09:00:01Z", checkout_id: null, stripe_session_id: "cs_1", receipt_token: null, source_detail: null, buyer_email: "a@b.co" },
      { id: "o3", creator_id: STORE, product_id: "p1", amount_cents: 0, quantity: 1, currency: "usd", status: "completed", created_at: "2026-10-29T09:00:00Z", source_detail: { surface: "admin" } },
      { id: "o4", creator_id: STORE, product_id: "p3", amount_cents: 4000, quantity: 1, currency: "eur", status: "completed", created_at: "2026-10-29T09:00:00Z", checkout_id: "co-77", source_detail: null, buyer_email: "c@d.co" },
      { id: "o5", creator_id: STORE, product_id: "p1", amount_cents: 900, quantity: 1, currency: "usd", status: "completed", created_at: "2026-10-29T09:00:00Z", source_detail: { surface: "admin" } },
    ]
    const products = [{ id: "p1", title: "Poster" }, { id: "p2", title: "Sticker" }, { id: "p3", title: "Mug" }]
    const db = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [], orders, products, store_settings: [] })
    const quiet = fakeTransport()
    const n = await forwardOutboxEvent(db, { name: "order.created", key: "order:o1:created", creatorId: STORE, payload: { orderId: "o1", amountCents: 2500, currency: "ron" } }, null, quiet.t)
    const ga = db.tables.analytics_forward_jobs.find((j) => j.destination_id === "d-ga4" && j.event_name === "purchase")!
    check("a basket: one purchase, its value and currency, every line an item", n === 4 && ga.facts.ref === "o1" && ga.facts.valueCents === 2500 && ga.facts.currency === "RON" && ga.facts.items.map((i: { id: string; priceCents: number; quantity: number; name: string }) => `${i.id}:${i.priceCents}x${i.quantity}:${i.name}`).join() === "p1:1000x2:Poster,p2:500x1:Sticker")
    const before = db.tables.analytics_forward_jobs.length
    check("an admin's test sale is never sent", (await forwardOutboxEvent(db, { name: "order.created", key: "k5", creatorId: STORE, payload: { orderId: "o5", amountCents: 900, currency: "usd" } }, null)) === 0 && db.tables.analytics_forward_jobs.length === before)
    check("a free claim is not a purchase", (await forwardOutboxEvent(db, { name: "order.created", key: "k3", creatorId: STORE, payload: { orderId: "o3", amountCents: 0 } }, null)) === 0)
    await forwardOutboxEvent(db, { name: "order.created", key: "k4", creatorId: STORE, payload: { orderId: "o4", amountCents: 4000, currency: "eur" } }, null)
    check("a shipped cart is told by its checkout's id (the thank you page's pixel id)", db.tables.analytics_forward_jobs.some((j) => j.event_key === "purchase:co-77" && j.facts.ref === "co-77"))
    check("  purchaseRef: checkout, else the order with the receipt, else the row", purchaseRef({ id: "x", checkout_id: "co" }) === "co" && purchaseRef({ id: "o2", checkout_id: null }, [orders[1], orders[0]]) === "o1" && purchaseRef({ id: "z" }) === "z")
    await forwardOutboxEvent(db, { name: "order.refunded", key: "refund:o2:re_1", creatorId: STORE, payload: { orderId: "o2", refundId: "re_1", amountCents: 500, currency: "ron", full: true } }, null, quiet.t)
    const refund = db.tables.analytics_forward_jobs.find((j) => j.event_name === "refund" && j.destination_id === "d-ga4")
    check("a refund of a basket's line: the purchase's id, the refunded amount; never to Meta", !!refund && refund.facts.ref === "o1" && refund.facts.valueCents === 500 && !db.tables.analytics_forward_jobs.some((j) => j.event_name === "refund" && j.destination_id === "d-meta"))
    await forwardOutboxEvent(db, { name: "membership.started", key: "m", creatorId: STORE, payload: { membershipId: "mem-1", amountCents: 900, currency: "usd", buyerEmail: "m@x.co" } }, null)
    check("a membership is a sign up", db.tables.analytics_forward_jobs.some((j) => j.event_name === "sign_up" && j.facts.form === "membership" && j.facts.ref === "mem-1"))
    const before2 = db.tables.analytics_forward_jobs.length
    await forwardLead(db, STORE, { email: "lead@x.co", form: "signup", eventId: "lead-uuid-1", key: "lead@x.co|signup||b1|op1" }, null, quiet.t)
    const lead = db.tables.analytics_forward_jobs.slice(before2)
    check("a signup is a lead, by the page pixel's own id, with its email to the webhook only", lead.length === 4 && lead.every((j) => j.facts.ref === "lead-uuid-1") && quiet.sent.some((s) => s.req.url.startsWith("https://hooks.example.com") && json(s.req).data.email === "lead@x.co") && !quiet.sent.some((s) => s.req.url.includes("google-analytics.com") && "user_data" in json(s.req)), lead.map((j) => j.destination_id))
    check("  without marketing consent Meta's row is skipped, not sent", lead.find((j) => j.destination_id === "d-meta")!.status === "skipped" && !quiet.sent.some((s) => s.req.url.includes("graph.facebook.com")))
    check("  sent at once: generate_lead to GA4, a lead to PostHog, signed JSON to the webhook", ["https://www.google-analytics.com/mp/collect", "https://eu.i.posthog.com/i/v0/e/", "https://hooks.example.com/storelib"].every((u) => quiet.sent.some((s) => s.req.url.startsWith(u) && s.req.body.includes("lead"))))
    const empty = fakeDb({ orders, products })
    forgetDestinations(STORE)
    await forwardOutboxEvent(empty, { name: "order.created", key: "x", creatorId: STORE, payload: { orderId: "o1", amountCents: 2500 } }, null)
    check("a store with no tool connected: the order is not even read", !empty.log.some((l) => l.table === "orders"))
  }

  section("Connecting: tried first, sealed, four characters back")
  {
    forgetDestinations(STORE)
    const db = fakeDb({ analytics_destinations: [], analytics_forward_jobs: [] })
    const bad = await saveDestination(db, STORE, { provider: "ga4", step: "connect", measurementId: "UA-123", apiSecret: "x" })
    check("a measurement id of the wrong shape is refused before anything is asked", bad.ok === false && /G-XXXXXXXXXX/.test(bad.error))
    const tr = fakeTransport((req) => (req.url.includes("/debug/") ? { status: 200, body: { validationMessages: [] } } : { status: 204, body: "" }))
    const ok = await saveDestination(db, STORE, { provider: "ga4", step: "connect", measurementId: "g-abc1234", apiSecret: "secret-abcdef-1234" }, tr.t)
    const row = db.tables.analytics_destinations[0]
    check("GA4: validated, then a debug_mode event, then kept", ok.ok && tr.sent.length === 2 && tr.sent[0].req.url.includes("/debug/mp/collect") && json(tr.sent[1].req).events[0].params.debug_mode === true)
    check("  the secret sealed (v1.…), never in the clear", !!row && row.secret_ciphertext.startsWith("v1.") && !JSON.stringify(row).includes("secret-abcdef-1234") && openSecret(row.secret_ciphertext) === "secret-abcdef-1234")
    const view = await loadDestinations(db, STORE)
    const g = view.destinations.find((d) => d.provider === "ga4")!
    check("  the status shows the id and the key's last four only", g.connected && g.label === "G-ABC1234" && g.hint === "1234" && !JSON.stringify(view).includes("secret-abcdef"))
    const refusedTr = fakeTransport(() => ({ status: 200, body: { validationMessages: [{ fieldPath: "events", description: "Event name is reserved." }] } }))
    const r2 = await saveDestination(db, STORE, { provider: "ga4", step: "connect", measurementId: "G-ABC1234", apiSecret: "other-secret-123456" }, refusedTr.t)
    check("GA4's validation message is said, and nothing is changed", r2.ok === false && /Event name is reserved/.test(r2.error) && openSecret(db.tables.analytics_destinations[0].secret_ciphertext) === "secret-abcdef-1234")
    const hookTr = fakeTransport(() => ({ status: 200, body: "ok" }))
    const hook = await saveDestination(db, STORE, { provider: "webhook", step: "connect", url: "https://hooks.example.com/in" }, hookTr.t)
    check("a webhook: tested, kept, its signing secret answered once", hook.ok && typeof hook.signingSecret === "string" && hook.signingSecret.length >= 30 && json(hookTr.sent[0].req).type === "analytics.test")
    const again = await saveDestination(db, STORE, { provider: "webhook", step: "connect", url: "https://hooks.example.com/in" }, hookTr.t)
    check("  saved again with the same address: the same secret, not shown again", again.ok && !again.signingSecret)
    const test = await saveDestination(db, STORE, { provider: "webhook", step: "test" }, hookTr.t)
    const logged = db.tables.analytics_forward_jobs.filter((j) => j.event_name === "test")
    check("Send test: sent, and in the delivery log", test.ok && logged.length === 1 && logged[0].status === "sent")
    const failTr = fakeTransport(() => ({ status: 410, body: "gone" }))
    const failedTest = await saveDestination(db, STORE, { provider: "webhook", step: "test" }, failTr.t)
    const v2 = await loadDestinations(db, STORE)
    check("  a failed test is said and listed among the recent errors", failedTest.ok === false && v2.destinations.find((d) => d.provider === "webhook")!.errors.some((e) => /410/.test(e.error)))
    check("parseConnect: Meta's pixel id is digits, PostHog's key starts phc_", parseConnect("meta", { pixelId: "abc" }).ok === false && parseConnect("posthog", { projectKey: "nope" }).ok === false && parseConnect("webhook", { url: "http://x.com" }).ok === false)
    await saveDestination(db, STORE, { provider: "webhook", disconnect: true })
    check("Disconnect removes it", !db.tables.analytics_destinations.some((d) => d.provider === "webhook"))
  }

  section("GET /api/v1/analytics: the figures, CSV and keys")
  {
    const q = parseExportQuery(new URLSearchParams("from=2026-10-27&to=2026-10-28&tz=Europe/Bucharest&format=csv"), NOW)
    check("the query: days, a time zone, a format", q.ok && q.q.timeZone === "Europe/Bucharest" && q.q.format === "csv")
    check("  refused: a bad day, from after to, over 366 days, a bad zone", !parseExportQuery(new URLSearchParams("from=2026-1-1")).ok && !parseExportQuery(new URLSearchParams("from=2026-10-28&to=2026-10-01")).ok && !parseExportQuery(new URLSearchParams("from=2024-01-01&to=2026-01-01")).ok && !parseExportQuery(new URLSearchParams("tz=Mars/Base")).ok)
    check("a day in its time zone: 22:30 UTC is the next day in Bucharest", dayIn("2026-10-27T22:30:00Z", "Europe/Bucharest") === "2026-10-28")
    const views = [
      { created_at: "2026-10-27T08:00:00Z", visitor_id: "a", path: "/", property_type: "website" },
      { created_at: "2026-10-27T09:00:00Z", visitor_id: "a", path: "/shop", property_type: "website" },
      { created_at: "2026-10-27T22:30:00Z", visitor_id: "b", path: "/", property_type: "website" },
      { created_at: "2026-10-25T10:00:00Z", visitor_id: "c", path: "/", property_type: "website" },
    ]
    const orders = [
      { id: "1", product_id: "p1", amount_cents: 1000, refund_amount_cents: 200, quantity: 1, currency: "eur", created_at: "2026-10-27T10:00:00Z", stripe_session_id: "s1", product: { title: "=HYPERLINK(1)" } },
      { id: "2", product_id: "p2", amount_cents: 500, quantity: 2, currency: "eur", created_at: "2026-10-27T10:00:00Z", stripe_session_id: "s1", product: { title: "Mug" } },
      { id: "3", product_id: "p1", amount_cents: 9999, quantity: 1, currency: "usd", created_at: "2026-10-28T10:00:00Z", source_detail: { surface: "admin" } },
      { id: "4", product_id: "p1", amount_cents: 300, quantity: 1, currency: "usd", created_at: "2026-10-28T11:00:00Z" },
    ]
    const a = aggregate(q.ok ? q.q : (null as never), views, orders)
    check("per day: visitors, views, orders (a basket is one), revenue less refunds per currency", JSON.stringify(a.daily) === JSON.stringify([{ date: "2026-10-27", visitors: 1, views: 2, orders: 1, revenue: { EUR: 13 } }, { date: "2026-10-28", visitors: 1, views: 1, orders: 1, revenue: { USD: 3 } }]), a.daily)
    check("an admin's test sale is not counted", a.totals.orders === 2 && !("9999" in a.totals.revenue) && a.totals.revenue.USD === 3)
    check("top products and pages", a.top_products[0].product_id === "p1" && a.top_products[0].units === 2 && a.top_pages[0].path === "/" && a.top_pages[0].views === 2)
    const csv = exportCsv(a, "daily")
    check("CSV: a column per currency", csv.split("\r\n")[0] === "date,visitors,views,orders,revenue_eur,revenue_usd" && csv.split("\r\n")[1] === "2026-10-27,1,2,1,13,0")
    check("  a product named like a formula stays text", !exportCsv(a, "products").includes(",=HYPERLINK"))
    const t = mintApiToken()
    check("a key: sla_ and 43 characters, kept as its SHA-256", looksLikeApiToken(t.token) && t.hash === hashApiToken(t.token) && t.prefix.length === 10 && bearerOf(`Bearer ${t.token}`) === t.token && bearerOf("Bearer nope") === null)
    const db = fakeDb({ analytics_api_tokens: [{ id: "tk1", creator_id: STORE, token_hash: t.hash, revoked_at: null, last_used_at: null }] })
    const who = await storeOfApiToken(db, t.token, NOW)
    check("the key names its store, and is marked used", who?.creatorId === STORE && db.tables.analytics_api_tokens[0].last_used_at === new Date(NOW).toISOString())
    db.tables.analytics_api_tokens[0].revoked_at = new Date(NOW).toISOString()
    check("revoked: refused", (await storeOfApiToken(db, t.token, NOW)) === null)
    const route = read("app/api/v1/analytics/route.ts")
    check("the route: Bearer key, rate limited per key, wrong keys per address, never cached", /storeOfApiToken\(db, token\)/.test(route) && /bucket: "analytics-api", subjects: \[`token:\$\{who\.tokenId\}`\]/.test(route) && /analytics-api-auth-fail/.test(route) && /no-store/.test(route))
  }

  section("Hooked into the pipeline, on the page, and SQL part 338")
  {
    check("emit() forwards order.created, order.refunded and membership.started once, after the response", /FORWARDED_EVENTS = new Set\(\["order\.created", "order\.refunded", "membership\.started"\]\)/.test(read("lib/notify/outbox.ts")) && /result\.status === "inserted" && event\.creatorId && FORWARDED_EVENTS\.has/.test(read("lib/notify/outbox.ts")))
    check("a recorded page view is forwarded (lib/analytics/collect-route)", /kind === "view" && outcome\.recorded && outcome\.row/.test(read("lib/analytics/collect-route.ts")))
    check("a OnePage signup and a newsletter signup are leads", /forwardLead\(db, creatorId/.test(read("lib/onepage/integrations/deliver-server.ts")) && /forwardLead\(adminSupabase, resolvedCreatorId/.test(read("app/api/subscribe/route.ts")))
    check("the thank you page adds the buyer's consent", /await noteThanks\(admin, site\.creatorId, order\.ga\.id, order\.email\)/.test(read("app/checkout/site/thanks/[token]/page.tsx")))
    check("the notification cron drains what is due", /drainForwarded\(/.test(read("app/api/cron/notify/route.ts")))
    check("Analytics: Send to beside Export", /<SendAnalyticsButton \/>\s*<ExportButton/.test(read("app/app/analytics/analytics-client.tsx")))
    check("Integrations: Send analytics, the same list", /appId: "analytics_destinations"/.test(read("lib/integrations/catalog.ts")) && /AnalyticsDestinationsPanel/.test(read("components/app/settings/integration-detail.tsx")))
    const sql = read("supabase/sql/run-now/338_analytics_destinations.sql")
    check("338: three tables, row level security on, nothing for anon or authenticated", ["analytics_destinations", "analytics_forward_jobs", "analytics_api_tokens"].every((t) => sql.includes(`CREATE TABLE IF NOT EXISTS public.${t}`) && sql.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`) && sql.includes(`REVOKE ALL ON public.${t} FROM PUBLIC, anon, authenticated`)))
    check("  one row per tool and event; a key's hash, unique", /CONSTRAINT analytics_forward_jobs_once UNIQUE \(destination_id, event_key\)/.test(sql) && /token_hash text NOT NULL UNIQUE CHECK \(token_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(sql) && /secret_ciphertext LIKE 'v1\.%'/.test(sql))
    check("  listed in the README and checked after", read("supabase/sql/run-now/README.md").includes("`338_analytics_destinations.sql`") && read("supabase/sql/run-now/99_check_after.sql").includes("as p338_analytics_destinations"))
    const ui = read("components/app/analytics/send-analytics.tsx")
    check("no AI copy in the dialog", !/(?<![-\w])(unlock|elevate|seamless|powerful|effortless|supercharge|transform)/i.test(ui) && !ui.includes("—"))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
