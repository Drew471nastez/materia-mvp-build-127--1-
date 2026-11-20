/**
 * Storelib Reviews on OnePage product cards and sheets, and Calendly and
 * Cal.com bookings in Storelib (run-now part 475).
 *
 *   ratings      aggregation, one query for a page's products, the app's
 *                switches, the fallback before part 134, the held read
 *   markup       the card's compact rating and the sheet's reviews, with
 *                "4.8 out of 5, 23 reviews" for a screen reader
 *   signatures   Calendly-Webhook-Signature and X-Cal-Signature-256: valid,
 *                invalid, replayed old
 *   mapping      created, cancelled, rescheduled for each provider
 *   writing      idempotent by the provider's booking id, cancel and
 *                reschedule only from confirmed, the bell once
 *   connecting   the subscription made with the token, removed on disconnect
 *
 * Calendly and Cal.com are never called: every request goes to a fake.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

process.env.COMMERCE_SECRETS_KEY = process.env.COMMERCE_SECRETS_KEY || "test-only-key-for-reviews-bookings"

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { aggregateRatings, allReviewsUrl, cleanRating, ratedProductIds, ratingWords, sheetReviewsFrom, withCardRatings, SHEET_REVIEWS_SHOWN } from "../lib/onepage/product-rating"
import { cardRatings, withProductRatings } from "../lib/onepage/product-rating-server"
import { readReviewsApp } from "../lib/reviews/app-settings"
import { CardRatingLine } from "../components/onepage/rating-stars"
import { SheetReviewList } from "../components/onepage/product-sheet"
import {
  CALENDLY_API,
  REPLAY_TOLERANCE_S,
  CALCOM_REPLAY_TOLERANCE_S,
  calcomChange,
  calcomFresh,
  calcomSignature,
  calendlyChange,
  calendlySignature,
  credentialProblem,
  parseCalendlySignature,
  verifyCalcom,
  verifyCalendly,
  type ProviderRequest,
} from "../lib/bookings/external/providers"
import { applyChange, connectExternal, disconnectExternal, openConnection, sealConnection, type ConnectionRow, type ExternalAnnounceDeps } from "../lib/bookings/external/server"
import { takeExternalEvent } from "../lib/bookings/external/hook-server"
import { mergeBookingPages } from "../lib/bookings/external/list"
import { removalPlan, installVerb } from "../lib/integrations/detail-actions"
import { integrationById } from "../lib/integrations/catalog"

let passed = 0
const failures: string[] = []
const tests: [string, () => unknown][] = []
const check = (name: string, fn: () => unknown) => tests.push([name, fn])
const read = (p: string) => readFileSync(p, "utf8")

/* ── A small in-memory Supabase: the query builder these modules use ── */

type Row = Record<string, any>
class Query implements PromiseLike<{ data: any; error: any; count?: number }> {
  private filters: ((r: Row) => boolean)[] = []
  private op: "select" | "update" | "delete" | "upsert" = "select"
  private patch: Row | null = null
  private payload: Row | null = null
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  private single = false
  private from = 0
  private to = Infinity
  constructor(private db: FakeDb, private table: string) {}
  select(_c?: string) {
    return this
  }
  eq(k: string, v: unknown) {
    this.filters.push((r) => r[k] === v)
    return this
  }
  neq(k: string, v: unknown) {
    this.filters.push((r) => r[k] !== v)
    return this
  }
  in(k: string, v: unknown[]) {
    this.filters.push((r) => v.includes(r[k]))
    return this
  }
  lt(k: string, v: string) {
    this.filters.push((r) => String(r[k]) < v)
    return this
  }
  gt(k: string, v: string) {
    this.filters.push((r) => String(r[k]) > v)
    return this
  }
  gte(k: string, v: string) {
    this.filters.push((r) => String(r[k]) >= v)
    return this
  }
  order() {
    return this
  }
  limit(n: number) {
    this.to = n - 1
    return this
  }
  range(a: number, b: number) {
    this.from = a
    this.to = b
    return this
  }
  update(p: Row) {
    this.op = "update"
    this.patch = p
    return this
  }
  delete() {
    this.op = "delete"
    return this
  }
  upsert(p: Row, opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert"
    this.payload = p
    this.opts = opts
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  private run() {
    this.db.calls.push({ table: this.table, op: this.op })
    const err = this.db.errors[`${this.table}:${this.op}`]
    if (err) return { data: null, error: err }
    const rows = (this.db.tables[this.table] ??= [])
    const hit = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.op === "select") {
      const page = hit.slice(this.from, this.to + 1)
      return { data: this.single ? page[0] ?? null : page, error: null }
    }
    if (this.op === "update") {
      for (const r of hit) Object.assign(r, this.patch)
      return { data: this.single ? hit[0] ?? null : hit.map((r) => ({ ...r })), error: null }
    }
    if (this.op === "delete") {
      this.db.tables[this.table] = rows.filter((r) => !hit.includes(r))
      return { data: null, error: null }
    }
    const keys = (this.opts.onConflict ?? "id").split(",")
    const same = rows.find((r) => keys.every((k) => r[k] === this.payload![k]))
    if (same) {
      if (this.opts.ignoreDuplicates) return { data: [], error: null }
      Object.assign(same, this.payload)
      return { data: [{ ...same }], error: null }
    }
    const row = { id: `row-${++this.db.seq}`, created_at: "2026-11-20T10:00:00.000Z", ...this.payload }
    rows.push(row)
    return { data: [{ ...row }], error: null }
  }
  then<A, B>(ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad)
  }
}
class FakeDb {
  tables: Record<string, Row[]> = {}
  calls: { table: string; op: string }[] = []
  errors: Record<string, { code: string; message?: string }> = {}
  seq = 0
  from(table: string) {
    return new Query(this, table)
  }
}

const appOn = (display: Record<string, unknown> = {}) => async () => readReviewsApp({ enabled: true, display })
const appOff = async () => readReviewsApp({ enabled: false })

/* ─────────────────────────── ratings ─────────────────────────── */

check("ratings: averaged to one decimal from whole stars, bad rows left out", () => {
  const m = aggregateRatings([
    { product_id: "a", rating: 5 },
    { product_id: "a", rating: 4 },
    { product_id: "a", rating: 5 },
    { product_id: "b", rating: 3 },
    { product_id: "b", rating: 9 },
    { product_id: "", rating: 5 },
    { product_id: "c", rating: "x" },
  ])
  assert.deepEqual(m.get("a"), { count: 3, average: 4.7 })
  assert.deepEqual(m.get("b"), { count: 1, average: 3 })
  assert.equal(m.has("c"), false)
  assert.equal(cleanRating({ average: 0, count: 0 }), null)
  assert.equal(cleanRating({ average: 4.8, count: 0 }), null)
  assert.deepEqual(cleanRating({ average: "4.84", count: "23" }), { average: 4.8, count: 23 })
  assert.equal(ratingWords({ average: 4.8, count: 23 }), "4.8 out of 5, 23 reviews")
  assert.equal(ratingWords({ average: 5, count: 1 }), "5.0 out of 5, 1 review")
})

const PAGE = [
  { id: "b1", type: "product", data: { product_id: "p1" } },
  { id: "b2", type: "product", enabled: false, data: { product_id: "p-off" } },
  { id: "g", type: "group", data: { children: [{ id: "b3", type: "product", data: { product_id: "p2" } }] } },
  { id: "s", type: "storelib_shelf", data: { items: [{ id: "p3", kind: "digital" }, { id: "c1", kind: "community" }] } },
  { id: "t", type: "text", data: {} },
]

check("ratings: every card a page draws, in groups and shelves, never a community or a hidden block", () => {
  assert.deepEqual(ratedProductIds(PAGE).sort(), ["p1", "p2", "p3"])
})

check("ratings: written on product blocks, group children and shelf items; an old one taken off", () => {
  const was = [{ id: "x", type: "product", data: { product_id: "p9", product_rating: { average: 5, count: 1 } } }, ...PAGE]
  const out = withCardRatings(was, new Map([["p1", { average: 4.5, count: 2 }], ["p2", { average: 4, count: 1 }], ["p3", { average: 3.5, count: 4 }]]))
  assert.equal((out[0].data as any).product_rating, null)
  assert.deepEqual((out[1].data as any).product_rating, { average: 4.5, count: 2 })
  assert.deepEqual(((out[3].data as any).children[0].data).product_rating, { average: 4, count: 1 })
  assert.deepEqual((out[4].data as any).items[0].rating, { average: 3.5, count: 4 })
  assert.equal((out[4].data as any).items[1].rating, undefined)
  assert.equal((PAGE[0].data as any).product_rating, undefined, "the blocks given are not changed")
})

check("ratings: one query for the whole page, this store's shown and published reviews only", async () => {
  const db = new FakeDb()
  db.tables.reviews = [
    { id: "r1", creator_id: "c", product_id: "p1", rating: 5, status: "published", site_status: "shown" },
    { id: "r2", creator_id: "c", product_id: "p1", rating: 4, status: "published", site_status: "shown" },
    { id: "r3", creator_id: "c", product_id: "p1", rating: 1, status: "hidden", site_status: "shown" },
    { id: "r4", creator_id: "c", product_id: "p2", rating: 1, status: "published", site_status: "hidden" },
    { id: "r5", creator_id: "other", product_id: "p3", rating: 5, status: "published", site_status: "shown" },
    { id: "r6", creator_id: "c", product_id: "p3", rating: 3, status: "published", site_status: "shown" },
  ]
  const out = await withProductRatings(db, "c", PAGE, appOn())
  assert.equal(db.calls.filter((c) => c.table === "reviews").length, 1, "one request")
  assert.deepEqual((out[0].data as any).product_rating, { count: 2, average: 4.5 })
  assert.equal(((out[2].data as any).children[0].data).product_rating, undefined, "p2 has no shown review")
  assert.deepEqual((out[3].data as any).items[0].rating, { count: 1, average: 3 })
})

check("ratings: nothing when the app is off or Stars on product cards is off; nothing read for a page without cards", async () => {
  const db = new FakeDb()
  db.tables.reviews = [{ id: "r1", creator_id: "c", product_id: "p1", rating: 5, status: "published", site_status: "shown" }]
  assert.equal((await cardRatings(db, "c", ["p1"], appOff)).size, 0)
  assert.equal((await cardRatings(db, "c", ["p1"], appOn({ showCardRating: false }))).size, 0)
  assert.equal(db.calls.length, 0)
  const blocks = [{ id: "t", type: "text", data: {} }]
  assert.equal(await withProductRatings(db, "c", blocks, appOn()), blocks)
})

check("ratings: past PostgREST's 1,000 rows the next page is read; before part 134 the products' counts", async () => {
  const db = new FakeDb()
  db.tables.reviews = Array.from({ length: 1500 }, (_, i) => ({ id: `r${i}`, creator_id: "c", product_id: "p1", rating: i < 750 ? 5 : 4, status: "published", site_status: "shown" }))
  const m = await cardRatings(db, "c", ["p1"], appOn())
  assert.deepEqual(m.get("p1"), { count: 1500, average: 4.5 })
  assert.equal(db.calls.filter((c) => c.table === "reviews").length, 2)
  const old = new FakeDb()
  old.errors["reviews:select"] = { code: "42703" }
  /* Changed on purpose (merge): the fallback reads published products only, like every public read (tests/product-visibility). */
  old.tables.products = [{ id: "p1", creator_id: "c", status: "published", reviews_count: 7, reviews_average: 4.29 }, { id: "p2", creator_id: "c", status: "published", reviews_count: 0, reviews_average: 0 }]
  const m2 = await cardRatings(old, "c", ["p1", "p2"], appOn())
  assert.deepEqual(m2.get("p1"), { count: 7, average: 4.3 })
  assert.equal(m2.has("p2"), false)
  const broken = new FakeDb()
  broken.errors["reviews:select"] = { code: "57014" }
  assert.equal((await cardRatings(broken, "c", ["p1"], appOn())).size, 0, "a failed read draws no stars, never throws")
})

check("ratings: held with the page's products, cleared by a review change and by the app's settings", () => {
  const src = read("lib/onepage/published-page.ts")
  assert.match(src, /withProductRatings\(db, creatorId, storelib\)/)
  assert.match(src, /\["onepage-live-blocks", "v3", creatorId, fingerprint\]/)
  assert.match(src, /creatorTag\(creatorId\), reviewsAppTag\(creatorId\)\]/)
  assert.match(read("app/api/onepage/blocks-live/route.ts"), /withProductRatings/)
})

/* ─────────────────────────── markup ─────────────────────────── */

check("card: a compact rating a screen reader hears as one sentence; nothing without a rating", () => {
  const html = renderToStaticMarkup(createElement(CardRatingLine, { rating: { average: 4.84, count: 23 }, color: "#111111" }))
  assert.match(html, /role="img"/)
  assert.match(html, /aria-label="4\.8 out of 5, 23 reviews"/)
  assert.match(html, /data-product-rating="4\.8"/)
  assert.match(html, /aria-hidden="true"[^>]*>4\.8</)
  assert.match(html, /\(23\)/)
  assert.equal(renderToStaticMarkup(createElement(CardRatingLine, { rating: null })), "")
  assert.equal(renderToStaticMarkup(createElement(CardRatingLine, { rating: { average: 4, count: 0 } })), "")
})

check("card: every roomy layout draws it, the link's own label carries it, shelves pass it on", () => {
  const block = read("components/onepage/product-block.tsx")
  assert.equal((block.match(/\{ratingLine\(/g) ?? []).length, 6, "row, side, tile, overlay, card, compact")
  assert.match(block, /aria-label=\{`\$\{title\}\$\{showPrice \? `, \$\{now\}` : ""\}\$\{rating \? `, \$\{ratingAria\(rating\.average, rating\.count\)\}` : ""\}`\}/)
  assert.match(block, /rating=\{rating\}/, "the sheet gets the card's rating at once")
  const shelf = read("components/onepage/storelib-blocks.tsx")
  assert.match(shelf, /product_rating:item\.rating\?\?null/)
  assert.equal((shelf.match(/<CardRatingLine /g) ?? []).length, 2, "the plain list and the plain cards")
})

check("sheet: the newest three, See all to the product page's reviews", () => {
  const items = [1, 2, 3, 4].map((i) => ({ id: `r${i}`, rating: i + 1, title: `T${i}`, body: `Body ${i}`, author: `A${i}`, date: `Mar ${i}, 2026`, iso: `2026-03-0${i}T00:00:00.000Z`, verified: i % 2 === 0 }))
  const r = sheetReviewsFrom({ average: 4.84, count: 23 }, items, allReviewsUrl("/p/the-guide"))!
  assert.equal(r.items.length, SHEET_REVIEWS_SHOWN)
  assert.deepEqual(r.items.map((x) => x.id), ["r4", "r3", "r2"])
  assert.equal(r.allUrl, "/p/the-guide#reviews")
  assert.equal(sheetReviewsFrom({ average: 0, count: 0 }, items, null), null)
  assert.equal(allReviewsUrl("#"), null)
  const html = renderToStaticMarkup(createElement(SheetReviewList, { reviews: r, href: "https://storelib.com/p/the-guide#reviews", sectionRef: null }))
  assert.match(html, /data-product-sheet-reviews=""/)
  assert.match(html, /aria-label="4\.8 out of 5, 23 reviews"/)
  assert.equal((html.match(/data-product-sheet-review="/g) ?? []).length, 3)
  assert.match(html, /href="https:\/\/storelib\.com\/p\/the-guide#reviews"/)
  assert.match(html, /See all 23 reviews/)
  assert.match(html, /Verified buyer/)
  assert.match(html, /<h3[^>]*>Reviews<\/h3>/)
})

check("sheet: /api/onepage/product sends the reviews only with the app on, from the cached website read", () => {
  const route = read("app/api/onepage/product/route.ts")
  assert.match(route, /storefrontReviews\(creatorId, \{ id, title/)
  assert.match(route, /reviewsRead\?\.enabled && !reviewsRead\.sample && reviewsRead\.product\?\.id === id/)
  assert.match(route, /\n        reviews,\n/)
  const sheet = read("components/onepage/product-sheet.tsx")
  assert.match(sheet, /const shownRating = p \? cleanRating\(reviews\) : cleanRating\(rating\)/, "the card's rating drawn first, no jump")
  assert.match(sheet, /prefers-reduced-motion: reduce/)
})

/* ─────────────────────────── signatures ─────────────────────────── */

const NOW = Date.parse("2026-11-20T12:00:00.000Z")
const KEY = "signing-key-for-tests"
const signCalendly = (raw: string, t = Math.floor(NOW / 1000), key = KEY) => `t=${t},v1=${calendlySignature(key, t, raw)}`

check("Calendly: a valid signature holds; tampered, wrong key, malformed and missing do not", () => {
  const raw = JSON.stringify({ event: "invitee.created" })
  assert.deepEqual(verifyCalendly(signCalendly(raw), raw, KEY, NOW), { ok: true })
  assert.deepEqual(verifyCalendly(signCalendly(raw), raw.replace("created", "canceled"), KEY, NOW), { ok: false, reason: "mismatch" })
  assert.deepEqual(verifyCalendly(signCalendly(raw, undefined, "other-key"), raw, KEY, NOW), { ok: false, reason: "mismatch" })
  assert.deepEqual(verifyCalendly("v1=abc", raw, KEY, NOW), { ok: false, reason: "malformed" })
  assert.deepEqual(verifyCalendly(null, raw, KEY, NOW), { ok: false, reason: "missing" })
  assert.deepEqual(parseCalendlySignature("t=1492774577,v1=aa,v1=bb"), { t: 1492774577, v1: ["aa", "bb"] })
  const t = Math.floor(NOW / 1000)
  assert.deepEqual(verifyCalendly(`t=${t},v1=00,v1=${calendlySignature(KEY, t, raw)}`, raw, KEY, NOW), { ok: true }, "any of several v1")
})

check("Calendly: a replay older than the window is refused, even with a good signature", () => {
  const raw = "{}"
  const old = Math.floor(NOW / 1000) - REPLAY_TOLERANCE_S - 1
  assert.deepEqual(verifyCalendly(signCalendly(raw, old), raw, KEY, NOW), { ok: false, reason: "stale" })
  assert.deepEqual(verifyCalendly(signCalendly(raw, old + 2), raw, KEY, NOW), { ok: true })
})

check("Cal.com: X-Cal-Signature-256 over the raw body; createdAt read after it holds", () => {
  const raw = JSON.stringify({ triggerEvent: "BOOKING_CREATED", createdAt: new Date(NOW).toISOString() })
  assert.deepEqual(verifyCalcom(calcomSignature(KEY, raw), raw, KEY), { ok: true })
  assert.deepEqual(verifyCalcom(calcomSignature(KEY, raw), raw + " ", KEY), { ok: false, reason: "mismatch" })
  assert.deepEqual(verifyCalcom(calcomSignature("nope", raw), raw, KEY), { ok: false, reason: "mismatch" })
  assert.deepEqual(verifyCalcom("zz", raw, KEY), { ok: false, reason: "malformed" })
  assert.deepEqual(verifyCalcom(undefined, raw, KEY), { ok: false, reason: "missing" })
  assert.equal(calcomFresh({ createdAt: new Date(NOW - 60_000).toISOString() }, NOW), true)
  /* createdAt is when the booking changed and stays on a delivery sent again: an hour old is a retry, not a replay. */
  assert.equal(calcomFresh({ createdAt: new Date(NOW - 3600_000).toISOString() }, NOW), true)
  assert.equal(calcomFresh({ createdAt: new Date(NOW - (CALCOM_REPLAY_TOLERANCE_S + 5) * 1000).toISOString() }, NOW), false)
  assert.equal(calcomFresh({}, NOW), false)
})

check("credentials are checked for shape before anything is asked", () => {
  assert.notEqual(credentialProblem("calendly", "short"), null)
  assert.equal(credentialProblem("calendly", "eyJ".padEnd(60, "a")), null)
  assert.notEqual(credentialProblem("calcom", "sk_live_123"), null)
  assert.equal(credentialProblem("calcom", "cal_live_0123456789abcdef0123"), null)
  assert.equal(credentialProblem("calcom", "cal_0123456789abcdef0123"), null, "a test mode key starts cal_ only")
})

/* ─────────────────────────── mapping ─────────────────────────── */

const INVITEE = `${CALENDLY_API}/scheduled_events/EV1/invitees/INV1`
/*
  Shaped as Calendly documents an invitee webhook (developer.calendly.com, Get sample webhook data: the envelope's
  event, created_at, created_by and payload; InviteePayload with uri, email, first_name, last_name, name, status,
  timezone, event, rescheduled, old_invitee, new_invitee, cancel_url, reschedule_url and scheduled_event{uri, name,
  status, start_time, end_time, event_type, location}).
*/
const calendlyCreated = (over: Record<string, unknown> = {}) => ({
  event: "invitee.created",
  created_at: "2026-11-20T11:59:58.123456Z",
  created_by: `${CALENDLY_API}/users/U1`,
  payload: {
    uri: INVITEE,
    email: "Ana@Example.com",
    first_name: null,
    last_name: null,
    name: "Ana Lima",
    status: "active",
    questions_and_answers: [],
    timezone: "Europe/Lisbon",
    event: `${CALENDLY_API}/scheduled_events/EV1`,
    created_at: "2026-11-20T11:59:58.123456Z",
    updated_at: "2026-11-20T11:59:58.123456Z",
    tracking: {},
    text_reminder_number: null,
    rescheduled: false,
    old_invitee: null,
    new_invitee: null,
    cancel_url: "https://calendly.com/cancellations/INV1",
    reschedule_url: "https://calendly.com/reschedulings/INV1",
    routing_form_submission: null,
    payment: null,
    no_show: null,
    reconfirmation: null,
    scheduling_method: null,
    invitee_scheduled_by: null,
    scheduled_event: {
      uri: `${CALENDLY_API}/scheduled_events/EV1`,
      name: "Intro call",
      status: "active",
      start_time: "2026-12-01T10:00:00.000000Z",
      end_time: "2026-12-01T10:30:00.000000Z",
      event_type: `${CALENDLY_API}/event_types/ET1`,
      location: { type: "zoom", status: "pushed", join_url: "https://zoom.us/j/1" },
      invitees_counter: { total: 1, active: 1, limit: 1 },
      created_at: "2026-11-20T11:59:58.123456Z",
      updated_at: "2026-11-20T11:59:58.123456Z",
      event_memberships: [{ user: `${CALENDLY_API}/users/U1` }],
      event_guests: [],
    },
    ...over,
  },
})
/* invitee.canceled is the same InviteePayload with status canceled and a cancellation {canceled_by, reason, canceler_type, created_at}. */
const calendlyCanceled = (over: Record<string, unknown> = {}) => {
  const c = calendlyCreated({ status: "canceled", ...over })
  return { ...c, event: "invitee.canceled" }
}

check("Calendly: invitee.created, invitee.canceled, and a reschedule as a move", () => {
  const c = calendlyChange(calendlyCreated())
  assert.equal(c.kind, "created")
  if (c.kind !== "created") return
  assert.equal(c.booking.externalId, INVITEE)
  assert.equal(c.booking.inviteeEmail, "ana@example.com")
  assert.equal(c.booking.eventName, "Intro call")
  assert.equal(c.booking.startsAt, "2026-12-01T10:00:00.000Z")
  assert.equal(c.booking.timezone, "Europe/Lisbon")
  assert.equal(c.booking.location, "https://zoom.us/j/1")
  const cancel = calendlyChange(calendlyCanceled({ cancellation: { canceled_by: "Ana Lima", reason: "Ill", canceler_type: "invitee", created_at: "2026-11-20T12:00:00.000000Z" } }))
  assert.deepEqual(cancel, { kind: "cancelled", key: `calendly:cancelled:${INVITEE}`, externalId: INVITEE, reason: "Ill", by: "Ana Lima", byHost: false })
  /* The event's own cancellation when the invitee's is not there. */
  const viaEvent = calendlyChange(calendlyCanceled({ scheduled_event: { ...calendlyCreated().payload.scheduled_event, status: "canceled", cancellation: { canceled_by: "Sam", reason: null, canceler_type: "host" } } }))
  assert.equal(viaEvent.kind === "cancelled" && viaEvent.byHost, true)
  /* Rescheduled: invitee.canceled with rescheduled true and new_invitee, then invitee.created with old_invitee (Webhook Payloads for Rescheduled Events). */
  const away = calendlyChange(calendlyCanceled({ rescheduled: true, new_invitee: `${INVITEE}2` }))
  assert.deepEqual(away, { kind: "moved_away", key: `calendly:moved:${INVITEE}`, externalId: INVITEE, to: `${INVITEE}2` })
  const moved = calendlyChange(calendlyCreated({ uri: `${INVITEE}2`, old_invitee: INVITEE }))
  assert.equal(moved.kind === "created" && moved.rescheduledFrom, INVITEE)
  assert.equal(calendlyChange({ event: "routing_form_submission.created", payload: { uri: "x" } }).kind, "ignored")
  assert.equal(calendlyChange(calendlyCreated({ timezone: "Not/AZone" })).kind === "created" && (calendlyChange(calendlyCreated({ timezone: "Not/AZone" })) as any).booking.timezone, null)
})

/*
  Shaped as Cal.com's Webhooks guide documents version 2021-10-20 (cal.com/docs, Webhook payload reference): the
  envelope {triggerEvent, createdAt, payload}; BOOKING_CREATED with title, type, startTime, endTime, organizer,
  attendees [{email, name, firstName, lastName, timeZone}], location ("integrations:..."), uid, videoCallData,
  eventTitle, length, bookingId, status; BOOKING_CANCELLED with cancellationReason and status CANCELLED;
  BOOKING_RESCHEDULED with the new uid and rescheduleId, rescheduleUid, rescheduleStartTime, rescheduleEndTime.
*/
const calcomBody = (trigger: string, over: Record<string, unknown> = {}, createdAt = new Date(NOW).toISOString()) => ({
  triggerEvent: trigger,
  createdAt,
  payload: {
    bookerUrl: "https://cal.com",
    title: "30 min between Sam and Ana",
    startTime: "2026-12-02T09:00:00Z",
    endTime: "2026-12-02T09:30:00Z",
    additionalNotes: "",
    type: "30min",
    description: "",
    eventTypeId: 123,
    organizer: { id: 1, name: "Sam", email: "sam@studio.com", username: "sam", timeZone: "Europe/Berlin", language: { locale: "en" }, timeFormat: "h:mma", utcOffset: 60 },
    attendees: [{ email: "ana@example.com", name: "Ana", firstName: "Ana", lastName: "", timeZone: "America/Sao_Paulo", language: { locale: "en" }, utcOffset: -180 }],
    responses: {},
    location: "integrations:daily",
    iCalUID: "bk_1@Cal.com",
    iCalSequence: 0,
    uid: "bk_1",
    videoCallData: { type: "daily_video", id: "room", password: "x", url: "https://app.cal.com/video/bk_1" },
    eventTitle: "30 min",
    length: 30,
    bookingId: 41,
    status: "ACCEPTED",
    ...over,
  },
})

check("Cal.com: BOOKING_CREATED, BOOKING_CANCELLED (host or attendee), BOOKING_RESCHEDULED, PING", () => {
  const c = calcomChange(calcomBody("BOOKING_CREATED"))
  assert.equal(c.kind, "created")
  if (c.kind === "created") {
    assert.equal(c.booking.externalId, "bk_1")
    assert.equal(c.booking.externalEventId, "41")
    assert.equal(c.booking.location, "https://app.cal.com/video/bk_1")
    assert.equal(c.booking.startsAt, "2026-12-02T09:00:00.000Z")
    assert.equal(c.booking.eventName, "30 min")
    assert.equal(c.booking.inviteeName, "Ana")
    assert.equal(c.booking.timezone, "America/Sao_Paulo")
    assert.equal(c.rescheduledFrom, null)
  }
  const noRoom = calcomChange(calcomBody("BOOKING_CREATED", { videoCallData: undefined }))
  assert.equal(noRoom.kind === "created" && noRoom.booking.location, null, "an app id such as integrations:daily is never shown as a place")
  assert.deepEqual(calcomChange(calcomBody("BOOKING_CANCELLED", { status: "CANCELLED", cancellationReason: "Clash", cancelledBy: "sam@studio.com" })), { kind: "cancelled", key: "calcom:cancelled:bk_1", externalId: "bk_1", reason: "Clash", by: "sam@studio.com", byHost: true })
  assert.equal((calcomChange(calcomBody("BOOKING_CANCELLED", { cancelledBy: "ana@example.com" })) as any).byHost, false)
  const r = calcomChange(calcomBody("BOOKING_RESCHEDULED", { uid: "bk_2", bookingId: 42, rescheduleId: 41, rescheduleUid: "bk_1", rescheduleStartTime: "2026-12-02T09:00:00Z", rescheduleEndTime: "2026-12-02T09:30:00Z" }))
  assert.equal(r.kind === "created" && r.rescheduledFrom, "bk_1")
  assert.deepEqual(calcomChange({ triggerEvent: "PING", payload: {} }), { kind: "ignored", reason: "ping" })
})

/* ─────────────────────────── writing, idempotency, notices ─────────────────────────── */

const CONN: ConnectionRow = {
  id: "conn-1",
  creator_id: "creator-1",
  owner_id: "owner-1",
  provider: "calendly",
  hook_id: "h".repeat(32),
  mode: "api",
  status: "connected",
  secret_ciphertext: sealConnection({ credential: "eyJ".padEnd(60, "t"), signing: KEY }),
  remote_webhook_id: `${CALENDLY_API}/webhook_subscriptions/SUB1`,
  account_label: "sam@studio.com",
  last_event_at: null,
  last_error: null,
  last_error_at: null,
}

function told() {
  const bells: { title: string; dedupeKey: string; url: string }[] = []
  const mails: { to: string; subject: string }[] = []
  const deps: ExternalAnnounceDeps = {
    origin: "https://storelib.com",
    notify: async (n) => void bells.push(n),
    email: async (m) => (mails.push({ to: m.to, subject: m.subject }), { success: true }),
    identity: async () => ({ fromName: "Studio", sellerEmail: "owner@studio.com", replyTo: null }),
  }
  return { bells, mails, deps }
}

const hook = async (db: FakeDb, conn: ConnectionRow, body: unknown, headers: Record<string, string>, deps: ExternalAnnounceDeps, nowMs = NOW) =>
  takeExternalEvent(db, conn, { raw: typeof body === "string" ? body : JSON.stringify(body), headers: new Headers(headers) }, { origin: "https://storelib.com", deps, nowMs })

check("Calendly end to end: a booking written once, the bell once, the same event again changes nothing", async () => {
  const db = new FakeDb()
  db.tables.external_booking_connections = [{ ...CONN }]
  const { bells, mails, deps } = told()
  const raw = JSON.stringify(calendlyCreated())
  const first = await hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw) }, deps)
  assert.equal(first.status, 200)
  assert.equal(db.tables.external_bookings.length, 1)
  const row = db.tables.external_bookings[0]
  assert.equal(row.source, "calendly")
  assert.equal(row.owner_id, "owner-1")
  assert.equal(row.invitee_name, "Ana Lima")
  assert.equal(row.status, "confirmed")
  assert.equal(bells.length, 1)
  assert.equal(bells[0].title, "New booking on Calendly")
  assert.equal(bells[0].url, `/app/bookings?booking=${row.id}`)
  assert.equal(mails.length, 0, "a new booking: the bell only, Calendly already emailed")
  assert.ok(db.tables.external_booking_connections[0].last_event_at)
  const again = await hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw) }, deps)
  assert.equal(again.status, 200)
  assert.equal(again.body.duplicate, true)
  assert.equal(db.tables.external_bookings.length, 1)
  assert.equal(bells.length, 1)
})

check("Calendly: cancel only from confirmed, told once, the owner emailed when the invitee cancelled", async () => {
  const db = new FakeDb()
  const { bells, mails, deps } = told()
  const created = JSON.stringify(calendlyCreated())
  await hook(db, CONN, created, { "calendly-webhook-signature": signCalendly(created) }, deps)
  const cancel = JSON.stringify(calendlyCanceled({ cancellation: { canceled_by: "Ana Lima", reason: "Ill", canceler_type: "invitee", created_at: "2026-11-20T12:00:00.000000Z" } }))
  await hook(db, CONN, cancel, { "calendly-webhook-signature": signCalendly(cancel) }, deps)
  await hook(db, CONN, cancel, { "calendly-webhook-signature": signCalendly(cancel) }, deps)
  const row = db.tables.external_bookings[0]
  assert.equal(row.status, "cancelled")
  assert.equal(row.cancel_reason, "Ill")
  assert.deepEqual(bells.map((b) => b.title), ["New booking on Calendly", "Booking cancelled on Calendly"])
  assert.equal(mails.length, 1)
  assert.equal(mails[0].to, "owner@studio.com")
  const host = JSON.stringify(calendlyCreated({ uri: `${INVITEE}H` }))
  await hook(db, CONN, host, { "calendly-webhook-signature": signCalendly(host) }, deps)
  const hostCancel = JSON.stringify(calendlyCanceled({ uri: `${INVITEE}H`, cancellation: { canceled_by: "Sam", reason: null, canceler_type: "host", created_at: "2026-11-20T12:00:00.000000Z" } }))
  await hook(db, CONN, hostCancel, { "calendly-webhook-signature": signCalendly(hostCancel) }, deps)
  assert.equal(mails.length, 1, "the host cancelled it themselves: no email to them")
})

check("Calendly: a reschedule keeps the old booking as moved, the new one confirmed, one Booking moved", async () => {
  const db = new FakeDb()
  const { bells, deps } = told()
  const send = async (b: unknown) => {
    const raw = JSON.stringify(b)
    return hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw) }, deps)
  }
  await send(calendlyCreated())
  await send(calendlyCanceled({ rescheduled: true, new_invitee: `${INVITEE}2` }))
  await send(calendlyCreated({ uri: `${INVITEE}2`, old_invitee: INVITEE, scheduled_event: { ...calendlyCreated().payload.scheduled_event, uri: `${CALENDLY_API}/scheduled_events/EV2`, start_time: "2026-12-03T10:00:00.000000Z", end_time: "2026-12-03T10:30:00.000000Z" } }))
  const [old, now] = db.tables.external_bookings
  assert.equal(old.status, "rescheduled")
  assert.equal(old.rescheduled_to, `${INVITEE}2`)
  assert.equal(now.status, "confirmed")
  assert.equal(now.rescheduled_from, INVITEE)
  assert.deepEqual(bells.map((b) => b.title), ["New booking on Calendly", "Booking moved on Calendly"])
})

check("webhook: a bad or replayed signature is refused before anything is parsed or written", async () => {
  const db = new FakeDb()
  const { bells, deps } = told()
  const raw = JSON.stringify(calendlyCreated())
  const bad = await hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw, undefined, "wrong") }, deps)
  assert.equal(bad.status, 401)
  const old = await hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw, Math.floor(NOW / 1000) - 3600) }, deps)
  assert.equal(old.status, 401)
  const none = await hook(db, CONN, "not json", {}, deps)
  assert.equal(none.status, 401, "unsigned junk: refused by the signature, never parsed")
  assert.equal(db.tables.external_bookings, undefined)
  assert.equal(bells.length, 0)
  const src = read("lib/bookings/external/hook-server.ts")
  assert.ok(src.indexOf("verifyHook(conn") < src.indexOf("JSON.parse(input.raw)"), "verify, then parse")
  const route = read("app/api/bookings/external/hook/[provider]/[hook]/route.ts")
  assert.ok(route.indexOf("rateLimit(") < route.indexOf("request.text()"), "rate limited before the body is read")
  assert.match(route, /after\(fn\)/, "the notices go after the answer")
})

check("Cal.com end to end: signed, fresh, idempotent; a replayed old createdAt refused; reschedule and cancel", async () => {
  const db = new FakeDb()
  const conn: ConnectionRow = { ...CONN, id: "conn-2", provider: "calcom", mode: "manual", status: "waiting", remote_webhook_id: null, secret_ciphertext: sealConnection({ credential: null, signing: KEY }) }
  db.tables.external_booking_connections = [{ ...conn }]
  const { bells, mails, deps } = told()
  const send = (b: unknown) => {
    const raw = JSON.stringify(b)
    return hook(db, conn, raw, { "x-cal-signature-256": calcomSignature(KEY, raw) }, deps)
  }
  assert.equal((await send(calcomBody("BOOKING_CREATED"))).status, 200)
  assert.equal(db.tables.external_booking_connections[0].status, "connected", "a pasted webhook is connected from its first signed call")
  assert.equal((await send(calcomBody("BOOKING_CREATED"))).body.duplicate, true)
  const stale = await send(calcomBody("BOOKING_CREATED", { uid: "bk_9" }, new Date(NOW - 2 * 86_400_000).toISOString()))
  assert.equal(stale.status, 401)
  assert.equal(db.tables.external_bookings.length, 1)
  await send(calcomBody("BOOKING_RESCHEDULED", { uid: "bk_2", rescheduleUid: "bk_1", startTime: "2026-12-04T09:00:00.000Z", endTime: "2026-12-04T09:30:00.000Z" }))
  await send(calcomBody("BOOKING_CANCELLED", { uid: "bk_2", cancelledBy: "ana@example.com", cancellationReason: "Away" }))
  const rows = db.tables.external_bookings
  assert.deepEqual(rows.map((r) => [r.external_id, r.status]), [["bk_1", "rescheduled"], ["bk_2", "cancelled"]])
  assert.deepEqual(bells.map((b) => b.title), ["New booking on Cal.com", "Booking moved on Cal.com", "Booking cancelled on Cal.com"])
  assert.equal(mails.length, 2, "moved and cancelled by the attendee: the owner's email each")
  assert.equal(new Set(bells.map((b) => b.dedupeKey)).size, 3)
})

check("a cancel for a booking Storelib never had changes nothing and tells nobody", async () => {
  const db = new FakeDb()
  const out = await applyChange(db, CONN, { kind: "cancelled", key: "k", externalId: "nope", reason: null, by: null, byHost: false })
  assert.equal(out.tell, null)
  const other = new FakeDb()
  other.tables.external_bookings = [{ id: "x", owner_id: "someone-else", source: "calendly", external_id: INVITEE, status: "confirmed" }]
  const again = await applyChange(other, CONN, { kind: "cancelled", key: "k", externalId: INVITEE, reason: null, by: null, byHost: false })
  assert.equal(again.tell, null)
  assert.equal(other.tables.external_bookings[0].status, "confirmed", "another owner's booking is never touched")
})

check("before part 475 an event is a 503 so the provider sends it again", async () => {
  const db = new FakeDb()
  db.errors["external_bookings:upsert"] = { code: "42P01" }
  const { deps } = told()
  const raw = JSON.stringify(calendlyCreated())
  const out = await hook(db, CONN, raw, { "calendly-webhook-signature": signCalendly(raw) }, deps)
  assert.equal(out.status, 503)
})

/* ─────────────────────────── connecting and disconnecting ─────────────────────────── */

function fakeProvider(answers: Record<string, { status: number; body: unknown }>) {
  const asked: ProviderRequest[] = []
  const ask = async (req: ProviderRequest) => {
    asked.push(req)
    return answers[`${req.method} ${req.url}`] ?? { status: 404, body: null }
  }
  return { asked, ask }
}

check("Calendly connect: the account read, a user scoped subscription with a signing key, the token sealed", async () => {
  const db = new FakeDb()
  const token = "eyJ".padEnd(80, "k")
  const p = fakeProvider({
    [`GET ${CALENDLY_API}/users/me`]: { status: 200, body: { resource: { uri: `${CALENDLY_API}/users/U1`, name: "Sam", slug: "sam", email: "sam@studio.com", scheduling_url: "https://calendly.com/sam", timezone: "Europe/Berlin", current_organization: `${CALENDLY_API}/organizations/O1` } } },
    /* Create Webhook Subscription's 201: { resource: WebhookSubscription } with uri, callback_url, state, events, scope, organization, user. */
    [`POST ${CALENDLY_API}/webhook_subscriptions`]: { status: 201, body: { resource: { uri: `${CALENDLY_API}/webhook_subscriptions/SUB9`, callback_url: "https://storelib.com/x", state: "active", events: ["invitee.created", "invitee.canceled"], scope: "user", organization: `${CALENDLY_API}/organizations/O1`, user: `${CALENDLY_API}/users/U1`, group: null, creator: `${CALENDLY_API}/users/U1` } } },
  })
  const out = await connectExternal(db, { creatorId: "creator-1", ownerId: "owner-1" }, { provider: "calendly", token }, "https://storelib.com", p.ask)
  assert.deepEqual(out, { ok: true })
  const sub = JSON.parse(p.asked[1].body!)
  assert.deepEqual(sub.events, ["invitee.created", "invitee.canceled"])
  assert.equal(sub.scope, "user")
  assert.equal(sub.user, `${CALENDLY_API}/users/U1`)
  assert.equal(sub.organization, `${CALENDLY_API}/organizations/O1`)
  assert.match(sub.url, /^https:\/\/storelib\.com\/api\/bookings\/external\/hook\/calendly\/[A-Za-z0-9_-]{32}$/)
  assert.equal(p.asked[1].headers.authorization, `Bearer ${token}`)
  const row = db.tables.external_booking_connections[0]
  assert.equal(row.remote_webhook_id, `${CALENDLY_API}/webhook_subscriptions/SUB9`)
  assert.equal(row.account_label, "sam@studio.com")
  assert.ok(!JSON.stringify(row).includes(token), "the token is never stored in the clear")
  const sealed = openConnection(row.secret_ciphertext)!
  assert.equal(sealed.credential, token)
  assert.equal(sealed.signing, sub.signing_key)
  const refused = await connectExternal(new FakeDb(), { creatorId: "c", ownerId: "o" }, { provider: "calendly", token }, "https://storelib.com", fakeProvider({ [`GET ${CALENDLY_API}/users/me`]: { status: 401, body: null } }).ask)
  assert.equal(refused.ok, false)
  /* A token without the scopes: Calendly answers 403 (InsufficientScopeError), and the creator is told which scopes. */
  const scopeless = await connectExternal(new FakeDb(), { creatorId: "c", ownerId: "o" }, { provider: "calendly", token }, "https://storelib.com", fakeProvider({ [`GET ${CALENDLY_API}/users/me`]: { status: 403, body: { title: "Insufficient scope" } } }).ask)
  assert.match(scopeless.ok === false ? scopeless.error : "", /users:read, scheduled_events:read and webhooks:write/)
})

check("disconnect removes the provider's webhook with the stored token, then the connection; bookings stay", async () => {
  const db = new FakeDb()
  db.tables.external_booking_connections = [{ ...CONN }]
  db.tables.external_bookings = [{ id: "b1", owner_id: "owner-1", source: "calendly", external_id: INVITEE, status: "confirmed" }]
  const p = fakeProvider({ [`DELETE ${CALENDLY_API}/webhook_subscriptions/SUB1`]: { status: 204, body: null } })
  const out = await disconnectExternal(db, "creator-1", "calendly", p.ask)
  assert.deepEqual(out, { ok: true, remoteRemoved: true, manual: false })
  assert.equal(p.asked.length, 1)
  assert.equal(p.asked[0].method, "DELETE")
  assert.equal(p.asked[0].headers.authorization, `Bearer ${"eyJ".padEnd(60, "t")}`)
  assert.equal(db.tables.external_booking_connections.length, 0)
  assert.equal(db.tables.external_bookings.length, 1)
  /* A pasted Cal.com webhook: nothing asked of Cal.com, and the answer says so. */
  const manual = new FakeDb()
  manual.tables.external_booking_connections = [{ ...CONN, provider: "calcom", mode: "manual", remote_webhook_id: null }]
  const m = fakeProvider({})
  assert.deepEqual(await disconnectExternal(manual, "creator-1", "calcom", m.ask), { ok: true, remoteRemoved: true, manual: true })
  assert.equal(m.asked.length, 0)
  /* A subscription address that is not Calendly's is never sent the token. */
  const odd = new FakeDb()
  odd.tables.external_booking_connections = [{ ...CONN, remote_webhook_id: "https://evil.example/webhook_subscriptions/SUB1" }]
  const o = fakeProvider({})
  const r = await disconnectExternal(odd, "creator-1", "calendly", o.ask)
  assert.equal(o.asked.length, 0)
  assert.equal(r.ok && r.remoteRemoved, false)
})

check("Cal.com connect: with a key the webhook is made and deleted by id; without, address and secret once", async () => {
  const key = "cal_live_0123456789abcdef0123"
  const db = new FakeDb()
  /* UserWebhookOutputResponseDto: { status, data: { id (a number), subscriberUrl, triggers, active, ... } }. */
  const p = fakeProvider({ "POST https://api.cal.com/v2/webhooks": { status: 201, body: { status: "success", data: { id: 77, userId: 5, subscriberUrl: "https://storelib.com/x", triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"], active: true, payloadTemplate: null, version: "2021-10-20" } } } })
  assert.deepEqual(await connectExternal(db, { creatorId: "creator-1", ownerId: "owner-1" }, { provider: "calcom", apiKey: key }, "https://storelib.com", p.ask), { ok: true })
  const body = JSON.parse(p.asked[0].body!)
  assert.equal(p.asked[0].headers.authorization, `Bearer ${key}`)
  assert.equal(body.active, true)
  assert.match(body.subscriberUrl, /^https:\/\/storelib\.com\/api\/bookings\/external\/hook\/calcom\//)
  assert.deepEqual(body.triggers, ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"])
  assert.equal(body.secret, openConnection(db.tables.external_booking_connections[0].secret_ciphertext)!.signing)
  const d = fakeProvider({ "DELETE https://api.cal.com/v2/webhooks/77": { status: 200, body: null } })
  assert.deepEqual(await disconnectExternal(db, "creator-1", "calcom", d.ask), { ok: true, remoteRemoved: true, manual: false })
  const m = new FakeDb()
  const out = await connectExternal(m, { creatorId: "creator-1", ownerId: "owner-1" }, { provider: "calcom", manual: true }, "https://storelib.com", fakeProvider({}).ask)
  assert.equal(out.ok, true)
  if (out.ok) {
    assert.match(out.webhookUrl!, /\/api\/bookings\/external\/hook\/calcom\//)
    assert.equal(out.secret, openConnection(m.tables.external_booking_connections[0].secret_ciphertext)!.signing)
  }
  assert.equal(m.tables.external_booking_connections[0].status, "waiting")
})

check("before part 475, connecting says which part to run", async () => {
  const db = new FakeDb()
  db.errors["external_booking_connections:select"] = { code: "42P01" }
  const out = await connectExternal(db, { creatorId: "c", ownerId: "o" }, { provider: "calcom", manual: true }, "https://storelib.com", fakeProvider({}).ask)
  assert.equal(out.ok === false && out.status, 409)
})

/* ─────────────────────────── the screens and the SQL ─────────────────────────── */

check("Bookings: both kinds in one page by time, the cursor after the last", () => {
  const native = [{ id: "n1", starts_at: "2026-12-01T09:00:00Z" }, { id: "n2", starts_at: "2026-12-01T12:00:00Z" }]
  const ext = [{ id: "e1", source: "calendly" as const, starts_at: "2026-12-01T10:00:00Z", ends_at: "2026-12-01T10:30:00Z", status: "confirmed" as const, timezone: null, invitee_name: "Ana", invitee_email: null, event_name: null, created_at: "" }]
  const m = mergeBookingPages(native, ext, { past: false, limit: 2 })
  assert.deepEqual(m.native.map((n) => n.id), ["n1"])
  assert.equal(m.next, "2026-12-01T10:00:00Z")
  const page = m.order((n) => ({ id: n.id, source: "storelib" }))
  assert.deepEqual(page.map((r) => [r.id, r.source]), [["n1", "storelib"], ["e1", "calendly"]])
  assert.equal((page[1] as any).form_title, "Calendly")
  const client = read("app/(storelib)/app/bookings/bookings-client.tsx")
  assert.match(client, /const active = d && !external &&/, "a booking from Calendly or Cal.com is changed there, never here")
})

check("Settings › Integrations: Calendly and Cal.com, connected and disconnected through the same route", () => {
  for (const id of ["calendly", "cal-com"]) {
    const item = integrationById(id)!
    assert.equal(item.appId, "booking_sync")
    assert.equal(installVerb(item), "Connect")
    const plan = removalPlan(item, { installed: true })!
    assert.equal(plan.verb, "disconnect")
    assert.deepEqual(plan.calls[0], { path: "/api/bookings/external", method: "POST", body: { provider: item.bookingProvider, disconnect: true } })
  }
  assert.match(read("components/app/settings/integration-detail.tsx"), /<ExternalBookingPanel provider=\{item\.bookingProvider\}/)
  assert.match(read("components/onepage/settings-integrations.tsx"), /<ExternalBookingsSection \/>/)
  const route = read("app/api/bookings/external/route.ts")
  assert.match(route, /isOwner === false/, "only the owner connects or disconnects")
})

check("part 475: idempotent, server only connections, owner read bookings, one row per provider booking", () => {
  const sql = read("supabase/sql/run-now/475_external_bookings.sql")
  assert.equal(sql, read("supabase/migrations/20271475_external_bookings.sql"))
  assert.equal((sql.match(/create table if not exists/g) ?? []).length, 2)
  assert.doesNotMatch(sql, /drop table|drop policy|alter table public\.(form_bookings|creators)/i)
  assert.match(sql, /revoke all on public\.external_booking_connections from public, anon, authenticated;/)
  assert.match(sql, /if not exists \(select 1 from pg_policies where schemaname = 'public' and tablename = 'external_bookings' and policyname = 'external_bookings_owner_read'\)/)
  assert.match(sql, /using \(owner_id = auth\.uid\(\)\)/)
  assert.match(sql, /constraint external_bookings_once unique \(owner_id, source, external_id\)/)
  /* Changed on purpose (merge): the part's column is now in the check after. */
  assert.match(read("supabase/sql/run-now/99_check_after.sql"), /as p475_external_bookings/)
})

;(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn()
      passed++
      console.log("ok -", name)
    } catch (e) {
      failures.push(name)
      console.log("FAIL -", name, "\n   ", e instanceof Error ? e.message.split("\n").slice(0, 6).join("\n    ") : e)
    }
  }
  console.log(`\nonepage-reviews-bookings: ${passed} passed, ${failures.length} failed`)
  if (failures.length) process.exit(1)
})()
