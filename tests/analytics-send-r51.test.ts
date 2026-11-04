/**
 * ===========================================================================
 *  ROUND 51: SEND ANALYTICS, EVERY EVENT OUT, AGAINST RECORDED ANSWERS
 * ===========================================================================
 * The owner: "Send analytics must work: Google Analytics 4, Meta Conversions
 * API, Google Ads, PostHog, Webhook and the Analytics API."
 *
 *   EVENTS     page_view, view_item, purchase, refund, sign_up and lead each
 *              go from Storelib's own records (lib/analytics/destinations
 *              forward-server) through the queue to every tool that takes
 *              it, and each request is checked field by field against the
 *              tool's documented format:
 *                GA4      Measurement Protocol /mp/collect
 *                Meta     Conversions API /<pixel>/events
 *                PostHog  capture /i/v0/e/
 *                Webhook  signed JSON, X-Storelib-Signature
 *   ANSWERS    each tool's documented answers, recorded as fixtures below
 *              (success, a bad key, a rate limit, a transient error, GA4's
 *              validation messages), and what the queue does with each
 *   STATUS     Connected and Last sent, read the way the status view reads
 *              them, also when the newest 25 rows hold no sent one (it said
 *              "nothing sent" before)
 *   SESSION    GA4's session_id from the _ga_<stream> cookie, both formats,
 *              only with analytics consent (it was never sent, so Realtime
 *              and the Google Ads import from GA4 had no session)
 *
 * Not reachable from here: a real Google, Meta or PostHog account. What a
 * live account says is for the owner to try (see the round's report).
 *
 *   npx tsx --conditions=react-server tests/analytics-send-r51.test.ts
 */
import { createHmac } from "node:crypto"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-commerce-secrets-key-for-analytics-destinations"

import { fakeDb } from "./_fake-db"
import { buildRequest, outcomeOf, refusalText, personFor, GOOGLE_ADS_STEPS, RETRY_AFTER_MS, type ProviderRequest } from "@/lib/analytics/destinations/providers"
import { drain, forgetDestinations, type Transport } from "@/lib/analytics/destinations/queue-server"
import { forwardLead, forwardOutboxEvent, forwardPageView, gaSessionsOf, personOf } from "@/lib/analytics/destinations/forward-server"
import { loadDestinations } from "@/lib/analytics/destinations/connect-server"
import { sealSecret } from "@/lib/physical/secrets"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 700)}`}`)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = (r: ProviderRequest) => JSON.parse(r.body) as Record<string, any>

const STORE = "51515151-1111-4111-8111-111111111111"
const NOW = Date.parse("2026-11-04T10:00:00Z")
const CONSENT_ALL = "2.p1.a1.m1.1793000000"

/* ── recorded answers, as each tool documents them ──────────────────── */
const ANSWERS = {
  /* GA4 /mp/collect answers 204 with no body, whatever it was sent. */
  ga4Ok: { status: 204, body: null },
  /* GA4 /debug/mp/collect: 200 with what it found. */
  ga4Validation: { status: 200, body: { validationMessages: [{ fieldPath: "events[0].name", description: "Event name is reserved.", validationCode: "NAME_RESERVED" }] } },
  ga4Busy: { status: 429, body: "" },
  /* Meta Conversions API success. */
  metaOk: { status: 200, body: { events_received: 1, messages: [], fbtrace_id: "AZ1yQ5T3" } },
  /* Meta: an expired or wrong token (OAuthException 190), and a transient service error (code 2). */
  metaBadToken: { status: 400, body: { error: { message: "Invalid OAuth access token - Cannot parse access token", type: "OAuthException", code: 190, fbtrace_id: "A1b2" } } },
  metaTransient: { status: 400, body: { error: { message: "An unexpected error has occurred. Please retry your request later.", type: "OAuthException", is_transient: true, code: 2, fbtrace_id: "A1b3" } } },
  /* PostHog capture: 200 {"status":"Ok"}; a wrong project key is a 401. */
  posthogOk: { status: 200, body: { status: "Ok" } },
  posthogBadKey: { status: 401, body: { type: "authentication_error", code: "invalid_api_key", detail: "Project API key invalid. You can find your project API key in PostHog project settings.", attr: null } },
  hookOk: { status: 200, body: { received: true } },
  hookDown: { status: 502, body: "<html>Bad gateway</html>" },
}

function destinations() {
  return [
    { id: "d-ga4", creator_id: STORE, provider: "ga4", status: "connected", account_label: "G-ABC1234", config: { measurement_id: "G-ABC1234" }, secret_ciphertext: sealSecret("ga-secret-1234567890") },
    { id: "d-meta", creator_id: STORE, provider: "meta", status: "connected", account_label: "123456789012345", config: { pixel_id: "123456789012345" }, secret_ciphertext: sealSecret("EAAB" + "x".repeat(60)) },
    { id: "d-ph", creator_id: STORE, provider: "posthog", status: "connected", account_label: "eu.i.posthog.com", config: { host: "https://eu.i.posthog.com" }, secret_ciphertext: sealSecret("phc_" + "a".repeat(40)) },
    { id: "d-hook", creator_id: STORE, provider: "webhook", status: "connected", account_label: "hooks.example.com", config: {}, secret_ciphertext: sealSecret(JSON.stringify({ url: "https://hooks.example.com/storelib", secret: "whsec_test_secret" })) },
  ]
}

function recorded() {
  const sent: ProviderRequest[] = []
  const t: Transport = {
    send: async (req) => {
      sent.push(req)
      if (req.url.startsWith("https://www.google-analytics.com")) return ANSWERS.ga4Ok
      if (req.url.startsWith("https://graph.facebook.com")) return ANSWERS.metaOk
      if (req.url.includes("posthog.com")) return ANSWERS.posthogOk
      return ANSWERS.hookOk
    },
  }
  return { t, sent }
}

/* ── each tool's documented request, as a checklist ─────────────────── */

/** GA4 Measurement Protocol: client_id, events[{ name, params }], 25 events at most, names of 40 characters, params of 25. */
function ga4Valid(b: Record<string, any>, event: string): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (typeof b.client_id !== "string" || !b.client_id) return "client_id"
  if (!Array.isArray(b.events) || b.events.length < 1 || b.events.length > 25) return "events"
  const e = b.events[0]
  if (e.name !== event || e.name.length > 40 || !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(e.name)) return `name ${e.name}`
  if (Object.keys(e.params).length > 25) return "too many params"
  if (typeof b.timestamp_micros !== "number" || NOW * 1000 - b.timestamp_micros > 72 * 3600e6) return "timestamp_micros older than 72 hours"
  if (["purchase", "refund"].includes(event) && (!e.params.transaction_id || typeof e.params.value !== "number" || !/^[A-Z]{3}$/.test(e.params.currency))) return "transaction_id, value, currency"
  if (event === "purchase" && !Array.isArray(e.params.items)) return "items"
  if (b.consent && !["GRANTED", "DENIED"].includes(b.consent.ad_user_data)) return "consent"
  return null
}

/** Meta CAPI: data[] of event_name, event_time in seconds within 7 days, action_source, user_data; website needs event_source_url and client_user_agent. */
function metaValid(b: Record<string, any>, event: string): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!b.access_token) return "access_token"
  const e = b.data?.[0]
  if (!e || e.event_name !== event) return `event_name ${e?.event_name}`
  if (!Number.isInteger(e.event_time) || NOW / 1000 - e.event_time > 7 * 86400) return "event_time"
  if (!["website", "system_generated", "email", "app", "phone_call", "chat", "physical_store", "business_messaging", "other"].includes(e.action_source)) return "action_source"
  if (e.action_source === "website" && (!e.event_source_url || !e.user_data.client_user_agent)) return "website needs event_source_url and client_user_agent"
  if (e.user_data.em && !e.user_data.em.every((h: string) => /^[0-9a-f]{64}$/.test(h))) return "em hashed"
  if (event === "Purchase" && (typeof e.custom_data?.value !== "number" || !/^[A-Z]{3}$/.test(e.custom_data?.currency))) return "Purchase value and currency"
  return null
}

/** PostHog capture: api_key, event, distinct_id, properties, an ISO timestamp. */
function posthogValid(b: Record<string, any>, event: string): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!/^phc_/.test(b.api_key)) return "api_key"
  if (b.event !== event) return `event ${b.event}`
  if (typeof b.distinct_id !== "string" || !b.distinct_id) return "distinct_id"
  if (typeof b.properties !== "object") return "properties"
  if (Number.isNaN(Date.parse(b.timestamp))) return "timestamp"
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(b.uuid)) return "uuid"
  return null
}

function hookValid(r: ProviderRequest, type: string): string | null {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(r.headers["x-storelib-signature"] ?? "")
  if (!m) return "signature header"
  if (createHmac("sha256", "whsec_test_secret").update(`${m[1]}.${r.body}`).digest("hex") !== m[2]) return "signature"
  const b = JSON.parse(r.body)
  if (b.type !== type || r.headers["x-storelib-event"] !== type || r.headers["x-storelib-delivery"] !== b.id) return `type ${b.type}`
  return null
}

async function main() {
  console.log("\nEvery event goes out, from Storelib's own records, in each tool's format")
  forgetDestinations(STORE)
  const orders = [{ id: "o1", creator_id: STORE, product_id: "p1", amount_cents: 4200, quantity: 1, currency: "eur", status: "completed", created_at: "2026-11-04T09:58:00Z", checkout_id: null, stripe_session_id: null, receipt_token: "rt1", source_detail: null, buyer_email: "Jane@Example.com" }]
  const db = fakeDb({ analytics_destinations: destinations(), analytics_forward_jobs: [], orders, products: [{ id: "p1", title: "Course" }], store_settings: [] }, { unique: { analytics_forward_jobs: [["destination_id", "event_key"]] } })
  const r = recorded()
  const cookieHeader = "storelib_consent=2.p1.a1.m1.1793000000; _ga=GA1.1.77.88; _ga_ABC1234=GS2.1.s1762250000$o3$g1$t1762250300$j60$l0$h0; _fbp=fb.1.1700000000.111"
  const cookies: Record<string, string> = { storelib_consent: CONSENT_ALL, _ga: "GA1.1.77.88", _fbp: "fb.1.1700000000.111" }
  const visitor = { headers: new Headers({ cookie: cookieHeader, referer: "https://shop.example.com/p/course", "user-agent": "Mozilla/5.0 Test" }), cookie: (n: string) => cookies[n] }
  const person = personOf(visitor, {}, NOW)

  await forwardPageView(db, { creator_id: STORE, product_id: "p1", visitor_id: "v_1", path: "/p/course", page_url: "https://shop.example.com/p/course", page_title: "Course", referrer: null, created_at: "2026-11-04T09:57:00Z" }, visitor, NOW, r.t)
  await forwardOutboxEvent(db, { name: "order.created", key: "order:o1", creatorId: STORE, payload: { orderId: "o1", amountCents: 4200, currency: "eur" } }, personOf(visitor, { email: "Jane@Example.com" }, NOW), r.t)
  await forwardOutboxEvent(db, { name: "membership.started", key: "m1", creatorId: STORE, payload: { membershipId: "mem-1", amountCents: 900, currency: "eur" } }, person, r.t)
  await forwardLead(db, STORE, { email: "lead@example.com", form: "signup", eventId: "lead-1", key: "lead@example.com|signup", url: "https://shop.example.com/" }, person, r.t)
  /* The purchase and the sign up are held for the thank you page (two minutes): the next cron run sends them. */
  await drain(db, { transport: r.t, now: () => Date.now() + 3 * 60_000 })
  await forwardOutboxEvent(db, { name: "order.refunded", key: "refund:o1:re_1", creatorId: STORE, payload: { orderId: "o1", refundId: "re_1", amountCents: 4200, currency: "eur", full: true } }, null, r.t)

  const to = (host: string) => r.sent.filter((x) => x.url.includes(host))
  const ga = to("google-analytics.com/mp/collect").map(json)
  const gaNames = ga.map((b) => b.events[0].name).sort().join()
  check("GA4 got page_view, view_item, purchase, refund, sign_up and generate_lead", gaNames === "generate_lead,page_view,purchase,refund,sign_up,view_item", gaNames)
  const gaBad = ga.map((b) => ga4Valid(b, b.events[0].name)).filter(Boolean)
  check("  every GA4 request is a valid Measurement Protocol body", gaBad.length === 0, gaBad)
  const gaPurchase = ga.find((b) => b.events[0].name === "purchase")!
  check("  purchase: transaction_id o1, value 42, EUR, the item, with the visitor's client id and session", gaPurchase.events[0].params.transaction_id === "o1" && gaPurchase.events[0].params.value === 42 && gaPurchase.events[0].params.currency === "EUR" && gaPurchase.events[0].params.items[0].item_id === "p1" && gaPurchase.client_id === "77.88" && gaPurchase.events[0].params.session_id === "1762250000", gaPurchase)

  const meta = to("graph.facebook.com").map(json)
  const metaNames = meta.map((b) => b.data[0].event_name).sort().join()
  /* Meta takes no page_view (its pixel does) and no refund (it has no refund event); ViewContent is sent when the store has no browser pixel of its own. */
  check("Meta got ViewContent, Purchase, Subscribe and Lead; no page view, no refund", metaNames === "Lead,Purchase,Subscribe,ViewContent", metaNames)
  const metaBad = meta.map((b) => metaValid(b, b.data[0].event_name)).filter(Boolean)
  check("  every Meta request is a valid Conversions API body", metaBad.length === 0, metaBad)
  const metaPurchase = meta.find((b) => b.data[0].event_name === "Purchase")!.data[0]
  check("  Purchase: event_id o1 (the thank you page pixel's), hashed email, _fbp, value 42 EUR", metaPurchase.event_id === "o1" && /^[0-9a-f]{64}$/.test(metaPurchase.user_data.em[0]) && metaPurchase.user_data.fbp === "fb.1.1700000000.111" && metaPurchase.custom_data.value === 42, metaPurchase)

  const ph = to("posthog.com").map(json)
  const phNames = ph.map((b) => b.event).sort().join()
  check("PostHog got $pageview, product_viewed, purchase, refund, sign_up and lead", phNames === "$pageview,lead,product_viewed,purchase,refund,sign_up", phNames)
  const phBad = ph.map((b) => posthogValid(b, b.event)).filter(Boolean)
  check("  every PostHog request is a valid capture body", phBad.length === 0, phBad)

  const hooks = to("hooks.example.com")
  const hookTypes = hooks.map((x) => json(x).type).sort().join()
  check("the webhook got purchase, refund, sign_up and lead, no page views", hookTypes === "analytics.lead,analytics.purchase,analytics.refund,analytics.sign_up", hookTypes)
  const hookBad = hooks.map((x) => hookValid(x, json(x).type)).filter(Boolean)
  check("  every delivery is signed: HMAC-SHA256 of \"<t>.<body>\" with the signing secret", hookBad.length === 0, hookBad)

  const left = db.tables.analytics_forward_jobs.filter((j) => j.status !== "sent")
  check("the queue is empty: every row sent", left.length === 0, left.map((j) => `${j.destination_id}:${j.event_name}:${j.status}:${j.last_error}`))

  console.log("\nConnected and Last sent, as the status view reads them")
  const view = await loadDestinations(db, STORE)
  check("every tool connected, each with a last sent time and event", view.destinations.every((d) => d.connected && !!d.lastSentAt && !!d.lastEvent), view.destinations.map((d) => [d.provider, d.connected, d.lastSentAt, d.lastEvent]))
  const busy = fakeDb({
    analytics_destinations: destinations().slice(1, 2),
    /* Newest first, as the status view's read orders them (the fake keeps the order it is given). */
    analytics_forward_jobs: [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `j${i + 1}`, destination_id: "d-meta", creator_id: STORE, event_name: "lead", status: "skipped", attempts: 0, response_status: null, last_error: "No marketing consent from this visitor.", sent_at: null, updated_at: new Date(Date.parse("2026-11-04T09:30:00Z") - i * 1000).toISOString() })),
      { id: "j0", destination_id: "d-meta", creator_id: STORE, event_name: "purchase", status: "sent", attempts: 1, response_status: 200, last_error: null, sent_at: "2026-11-04T08:00:00Z", updated_at: "2026-11-04T08:00:00Z" },
    ],
  })
  const v2 = (await loadDestinations(busy, STORE)).destinations.find((d) => d.provider === "meta")!
  console.log(`   after 30 skipped leads: last sent ${v2.lastSentAt} (${v2.lastEvent})`)
  check("after 30 skipped leads, Last sent is still the purchase sent at 08:00 (it said nothing sent)", v2.lastSentAt === "2026-11-04T08:00:00Z" && v2.lastEvent === "purchase", v2)

  console.log("\nEach tool's recorded answers, and what the queue does")
  check("GA4 204: sent", outcomeOf("ga4", ANSWERS.ga4Ok.status, ANSWERS.ga4Ok.body) === "ok")
  check("GA4 validation messages: refused, in Google's words", outcomeOf("ga4", 200, ANSWERS.ga4Validation.body) === "refused" && /events\[0\]\.name: Event name is reserved/.test(refusalText("ga4", 200, ANSWERS.ga4Validation.body)))
  check("GA4 429: tried again", outcomeOf("ga4", 429, "") === "retry")
  check("Meta success: sent", outcomeOf("meta", 200, ANSWERS.metaOk.body) === "ok")
  check("Meta bad token (190): refused at once, Meta's words, no token in them", outcomeOf("meta", 400, ANSWERS.metaBadToken.body) === "refused" && /Invalid OAuth access token/.test(refusalText("meta", 400, ANSWERS.metaBadToken.body)))
  check("Meta transient (code 2, is_transient): tried again", outcomeOf("meta", 400, ANSWERS.metaTransient.body) === "retry")
  check("PostHog Ok: sent; a wrong key: refused with PostHog's detail", outcomeOf("posthog", 200, ANSWERS.posthogOk.body) === "ok" && outcomeOf("posthog", 401, ANSWERS.posthogBadKey.body) === "refused" && /refused the key: Project API key invalid/.test(refusalText("posthog", 401, ANSWERS.posthogBadKey.body)))
  check("a webhook 502 with an HTML page: tried again, the page never shown", outcomeOf("webhook", 502, ANSWERS.hookDown.body) === "retry" && refusalText("webhook", 502, ANSWERS.hookDown.body) === "Webhook answered 502.")
  {
    forgetDestinations(STORE)
    const d = fakeDb({ analytics_destinations: destinations().slice(3), analytics_forward_jobs: [], orders, products: [], store_settings: [] })
    let tries = 0
    const down: Transport = { send: async () => (tries++, ANSWERS.hookDown) }
    await forwardOutboxEvent(d, { name: "order.refunded", key: "r", creatorId: STORE, payload: { orderId: "o1", refundId: "re_9", amountCents: 100, currency: "eur" } }, null, down)
    let t = Date.now()
    for (const wait of RETRY_AFTER_MS) {
      t += wait + 1000
      await drain(d, { transport: down, now: () => t })
    }
    const job = d.tables.analytics_forward_jobs[0]
    check(`a webhook down all day: ${tries} tries over a minute, five, half an hour, two hours, six, a day, then failed with its reason`, tries === 7 && job.status === "failed" && /502/.test(job.last_error) && job.person === null, { tries, status: job.status, err: job.last_error })
  }

  console.log("\nGA4's session, from the gtag cookie")
  check("GS2 (since 2025) and GS1 cookies read as session ids", JSON.stringify(gaSessionsOf("_ga_ABC1234=GS2.1.s1762250000$o3$g1$t1762250300$j60$l0$h0; _ga_XYZ9876=GS1.1.1699999999.5.1.1700000100.0.0.0; other=1")) === JSON.stringify({ ABC1234: "1762250000", XYZ9876: "1699999999" }))
  const noAnalytics = personFor("ga4", { ...person, consent: { analytics: false, marketing: true } }, "purchase")
  check("without analytics consent no session id is kept", !("gaSessions" in noAnalytics))
  const other = buildRequest({ tool: "ga4", event: "purchase", eventKey: "k", facts: { ref: "o9", at: "2026-11-04T09:00:00Z", valueCents: 100, currency: "EUR" }, person: personFor("ga4", person, "purchase"), config: { measurement_id: "G-OTHER99" }, secret: { key: "ga-secret-1234567890" }, storeId: STORE })
  check("another data stream's session is never sent", other.ok && !("session_id" in json(other.request).events[0].params))

  console.log("\nGoogle Ads")
  check("Google Ads takes GA4's purchase and generate_lead as conversions (the steps the form shows)", GOOGLE_ADS_STEPS.some((s) => /Google Ads links/.test(s)) && GOOGLE_ADS_STEPS.some((s) => /Import › Google Analytics 4/.test(s)))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
