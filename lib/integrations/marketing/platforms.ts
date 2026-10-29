/**
 * ===========================================================================
 *  BREVO, MAILERLITE AND KIT, BY THEIR PUBLIC APIS
 * ===========================================================================
 * The store's own key, connected in Emails › Platforms or Settings ›
 * Integrations, and the same sync Klaviyo and Omnisend have
 * (./sync-server.ts): consented subscribers onto the chosen list, an
 * unsubscribe on Storelib an unsubscribe there, unsubscribes there read
 * back, and order events in each one's own terms. Every call goes through
 * ./http.ts marketingCall (paced, timed out, retry or refused), so a test
 * replaces `fetch` and nothing real is called.
 *
 *   brevo       api.brevo.com/v3, header api-key
 *                 GET  /account                 the key works, and whose account
 *                 GET  /contacts/lists          the lists to choose from
 *                 POST /contacts                one contact, created or updated (updateEnabled)
 *                 POST /contacts/import         many at once onto the list (jsonBody)
 *                 PUT  /contacts/{email}        emailBlacklisted true: unsubscribed from marketing
 *                 POST /events                  order_placed, order_fulfilled, order_cancelled, order_refunded
 *                 GET  /contacts?modifiedSince  who was blocklisted since the last look
 *                 POST /webhooks                marketing webhook: unsubscribed, spam, hardBounce
 *   mailerlite  connect.mailerlite.com/api, Bearer token
 *                 GET  /groups                  the key works, and the groups to choose from
 *                 POST /groups                  the "Storelib buyers" and "Storelib refunded" groups
 *                 POST /subscribers             upsert by email (groups add, never remove)
 *                 POST /batch                   up to 50 of those in one request
 *                 GET  /subscribers?filter[status]=unsubscribed   who left
 *                 POST /webhooks                subscriber.unsubscribed, .bounced, .spam_reported (signed)
 *   kit         api.kit.com/v4, header X-Kit-Api-Key
 *                 GET  /account                 the key works, and whose account
 *                 GET  /tags                    the tags to choose from
 *                 POST /tags                    "Storelib buyer" and "Storelib refunded" (an existing name comes back)
 *                 POST /subscribers             upsert by email
 *                 POST /tags/{id}/subscribers   tag by email
 *                 GET  /subscribers?email_address    the id an unsubscribe needs
 *                 POST /subscribers/{id}/unsubscribe
 *                 GET  /subscribers?status=all&updated_after   who left, bounced or complained
 *                 POST /webhooks                subscriber_unsubscribe, _bounce, _complain
 *
 * CONSENT. Brevo keeps contacts apart from lists, so a buyer who did not
 * ask is a contact on no list, as Klaviyo's profiles are. MailerLite and
 * Kit have no such thing: everyone in them is a subscriber who can be
 * mailed. So a buyer who did not ask is never sent to either, and an order
 * event there (a group, a tag) is only for someone already subscribed.
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import { EMAIL_RE, ProviderError, marketingCall, type LimitName } from "./http"
import { major, type MarketingEvent, type MarketingOrder } from "./orders"
import type { PulledAddress } from "./klaviyo"
import { BREVO_API, MAILERLITE_API, keyProblem as pageKeyProblem } from "@/lib/onepage/integrations/providers"

export { BREVO_API, MAILERLITE_API }
export const KIT_API = "https://api.kit.com/v4"

export type PlatformId = "brevo" | "mailerlite" | "kit"
export const PLATFORM_IDS: PlatformId[] = ["brevo", "mailerlite", "kit"]
export const PLATFORM_NAME: Record<PlatformId, string> = { brevo: "Brevo", mailerlite: "MailerLite", kit: "Kit" }

export function isPlatform(p: unknown): p is PlatformId {
  return p === "brevo" || p === "mailerlite" || p === "kit"
}

export interface PlatformList {
  id: string
  name: string
}

export interface PlatformPerson {
  email: string
  firstName: string | null
  lastName: string | null
  /** When they said yes, for a past subscriber sent on connect. */
  consentedAt: string | null
}

/** Ids the order events use, made once when connecting. */
export interface PlatformSetup {
  buyer_id?: string | null
  refunded_id?: string | null
}

/** Where reading unsubscribes back has got to, kept in the integration's config between runs. */
export interface PullState {
  since: string | null
  cursor: string | null
  offset: number
  initial_done: boolean
  walk_started: string | null
  walked_at: string | null
}

export interface PlatformWebhook {
  ids: string[]
  /** MailerLite signs each delivery with this (sealed before it is kept). */
  secret: string | null
}

/** One order event, as the platform takes it. `run` sends it. */
export interface PlatformEventCall {
  run: () => Promise<void>
}

export interface PlatformAdapter {
  id: PlatformId
  name: string
  limit: LimitName
  /** Where the seller makes a key, and what it needs. */
  permissions: string[]
  /** Buyers who did not ask may be sent (as contacts on no list). */
  takesCustomers: boolean
  /** Order events may go for anyone who bought; otherwise only for a subscriber. */
  eventsForEveryone: boolean
  /** A list (or group, or tag) can be made by Storelib on connect when "new" is chosen. */
  canMakeList: boolean
  /**
   * How many addresses one step sends: the sync writes down what each step
   * sent before the next, so a retry after a 429 halfway sends only the rest.
   * Kit and Brevo's unsubscribe take one address a request.
   */
  step: { subscribe: number; unsubscribe: number; customers: number }
  keyProblem: (key: string) => string | null
  connect: (key: string, scope: string) => Promise<{ account: string | null; accountId: string | null; lists: PlatformList[] }>
  lists: (key: string, scope: string) => Promise<PlatformList[]>
  makeList: (key: string, scope: string, name: string) => Promise<PlatformList>
  prepare: (key: string, scope: string) => Promise<PlatformSetup>
  subscribe: (key: string, scope: string, listId: string, people: PlatformPerson[], historical: boolean) => Promise<void>
  unsubscribe: (key: string, scope: string, listId: string, emails: string[]) => Promise<void>
  customers: (key: string, scope: string, people: PlatformPerson[]) => Promise<void>
  events: (key: string, scope: string, order: MarketingOrder, event: MarketingEvent, setup: PlatformSetup, now: string) => PlatformEventCall[]
  pull: (key: string, scope: string, state: PullState, now: number) => Promise<{ people: PulledAddress[]; state: PullState; more: boolean }>
  registerWebhook: (key: string, scope: string, url: string) => Promise<PlatformWebhook>
  removeWebhook: (key: string, scope: string, id: string) => Promise<void>
  /** The addresses a delivery to Storelib's webhook says left, bounced or complained. */
  parseWebhook: (body: unknown, kind?: string | null) => PulledAddress[]
}

export const EMPTY_PULL: PullState = { since: null, cursor: null, offset: 0, initial_done: false, walk_started: null, walked_at: null }
const EPOCH = "2012-01-01T00:00:00.000Z"
const DAY = 86_400_000

const clean = (email: unknown) => String(email ?? "").trim().toLowerCase()

function namedRows(raw: unknown): PlatformList[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => x as { id?: unknown; name?: unknown })
    .filter((x) => (typeof x.id === "string" || typeof x.id === "number") && typeof x.name === "string")
    .map((x) => ({ id: String(x.id), name: String(x.name).slice(0, 120) }))
}

/** A 404 for an address the platform never had: nothing to unsubscribe, which is what was wanted. */
async function unlessMissing(work: () => Promise<unknown>): Promise<void> {
  try {
    await work()
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) return
    throw e
  }
}

/** The facts every order event carries, the same words on each platform. */
export function orderFacts(o: MarketingOrder): Record<string, unknown> {
  return {
    order_id: o.id,
    order_number: o.number,
    currency: o.currency.toUpperCase(),
    total: major(o.totalCents, o.currency),
    refunded: major(o.refundedCents, o.currency),
    discount_code: o.discountCode,
    items: o.lines.map((l) => ({ product_id: l.productId, sku: l.sku, name: l.title, variant: l.variantName, quantity: l.quantity, price: major(l.unitCents, o.currency) })),
    item_names: o.lines.map((l) => l.title),
    order_url: o.orderUrl,
    source: "storelib",
  }
}

/* ── Brevo ─────────────────────────────────────────────────────────────── */

const BREVO = "Brevo"
function brevoHeaders(key: string): Record<string, string> {
  return { "api-key": key.trim(), accept: "application/json", "content-type": "application/json" }
}
const bl = (scope: string) => ({ key: scope, name: "brevo" as const })

export const BREVO_EVENT: Record<Exclude<MarketingEvent, "started">, string> = {
  placed: "order_placed",
  fulfilled: "order_fulfilled",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
}

function brevoAttributes(p: PlatformPerson): Record<string, string> | undefined {
  const a: Record<string, string> = {}
  if (p.firstName) a.FIRSTNAME = p.firstName
  if (p.lastName) a.LASTNAME = p.lastName
  return Object.keys(a).length ? a : undefined
}

export function brevoContactBody(p: PlatformPerson, listId: number | null): Record<string, unknown> {
  const attributes = brevoAttributes(p)
  return { email: p.email, ...(attributes ? { attributes } : {}), ...(listId ? { listIds: [listId] } : {}), updateEnabled: true }
}

export function brevoImportBody(people: PlatformPerson[], listId: number): Record<string, unknown> {
  return {
    jsonBody: people.map((p) => ({ email: p.email, ...(brevoAttributes(p) ? { attributes: brevoAttributes(p) } : {}) })),
    listIds: [listId],
    updateExistingContacts: true,
    emptyContactsAttributes: false,
    disableNotification: true,
  }
}

export function brevoEventBody(o: MarketingOrder, event: Exclude<MarketingEvent, "started">, now: string): Record<string, unknown> {
  return {
    event_name: BREVO_EVENT[event],
    event_date: event === "placed" ? (o.paidAt ?? o.createdAt) : event === "cancelled" ? (o.cancelledAt ?? now) : now,
    identifiers: { email_id: o.email },
    event_properties: orderFacts(o),
  }
}

export function brevoPullUrl(state: PullState): string {
  const q = new URLSearchParams()
  q.set("limit", "1000")
  q.set("offset", String(state.offset || 0))
  q.set("sort", "asc")
  q.set("modifiedSince", new Date(state.since ?? EPOCH).toISOString())
  return `${BREVO_API}/contacts?${q.toString()}`
}

const brevo: PlatformAdapter = {
  id: "brevo",
  name: BREVO,
  limit: "brevo",
  permissions: ["An API key (SMTP & API › API keys)"],
  takesCustomers: true,
  eventsForEveryone: true,
  canMakeList: false,
  step: { subscribe: 500, unsubscribe: 1, customers: 1 },
  keyProblem: (key) => pageKeyProblem("brevo", key),
  async connect(key, scope) {
    const r: any = await marketingCall(BREVO, `${BREVO_API}/account`, { headers: brevoHeaders(key), limit: bl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
    if (!r || typeof r !== "object" || !r.email) throw new ProviderError("Brevo did not say which account the key belongs to.", 400, false)
    return { account: (r.companyName || r.email || null) as string | null, accountId: String(r.organization_id ?? r.email), lists: await brevo.lists(key, scope) }
  },
  async lists(key, scope) {
    const out: PlatformList[] = []
    for (let page = 0; page < 10; page++) {
      const r: any = await marketingCall(BREVO, `${BREVO_API}/contacts/lists?limit=50&offset=${page * 50}&sort=desc`, { headers: brevoHeaders(key), limit: bl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows = namedRows(r?.lists)
      out.push(...rows)
      if (rows.length < 50) break
    }
    return out
  },
  async makeList() {
    throw new ProviderError("Choose one of your Brevo lists.", 400, false)
  },
  async prepare() {
    return {}
  },
  async subscribe(key, scope, listId, people) {
    const id = Number(listId)
    if (!Number.isInteger(id) || id <= 0) throw new ProviderError("Choose the Brevo list your subscribers go to.", 400, false)
    if (people.length === 1) {
      await marketingCall(BREVO, `${BREVO_API}/contacts`, { method: "POST", headers: brevoHeaders(key), body: brevoContactBody(people[0], id), limit: bl(scope) })
      return
    }
    for (let i = 0; i < people.length; i += 500) {
      await marketingCall(BREVO, `${BREVO_API}/contacts/import`, { method: "POST", headers: brevoHeaders(key), body: brevoImportBody(people.slice(i, i + 500), id), limit: bl(scope) })
    }
  },
  async unsubscribe(key, scope, _listId, emails) {
    for (const email of emails) {
      await unlessMissing(() => marketingCall(BREVO, `${BREVO_API}/contacts/${encodeURIComponent(email)}?identifierType=email_id`, { method: "PUT", headers: brevoHeaders(key), body: { emailBlacklisted: true }, limit: bl(scope) }))
    }
  },
  async customers(key, scope, people) {
    for (const p of people) await marketingCall(BREVO, `${BREVO_API}/contacts`, { method: "POST", headers: brevoHeaders(key), body: brevoContactBody(p, null), limit: bl(scope) })
  },
  events(key, scope, order, event, _setup, now) {
    if (event === "started") return []
    return [{ run: async () => void (await marketingCall(BREVO, `${BREVO_API}/events`, { method: "POST", headers: brevoHeaders(key), body: brevoEventBody(order, event, now), limit: bl(scope) })) }]
  },
  async pull(key, scope, state, now) {
    const s = { ...EMPTY_PULL, ...state }
    if (!s.walk_started) s.walk_started = new Date(now).toISOString()
    const people: PulledAddress[] = []
    let latest: string | null = null
    let more = false
    for (let page = 0; page < (s.initial_done ? 3 : 10); page++) {
      const r: any = await marketingCall(BREVO, brevoPullUrl(s), { headers: brevoHeaders(key), limit: bl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows: any[] = Array.isArray(r?.contacts) ? r.contacts : [] // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const c of rows) {
        if (c?.modifiedAt && (!latest || Date.parse(c.modifiedAt) > Date.parse(latest))) latest = c.modifiedAt
        const email = clean(c?.email)
        if (c?.emailBlacklisted === true && EMAIL_RE.test(email)) people.push({ email, reason: "UNSUBSCRIBE", at: c.modifiedAt ?? null })
      }
      if (rows.length < 1000) {
        more = false
        break
      }
      s.offset += rows.length
      more = true
    }
    if (!more) {
      /* The walk is done: the next look starts from what it saw last (or when it began), from the first page. */
      s.since = latest ?? new Date(Date.parse(s.walk_started) - 60_000).toISOString()
      s.offset = 0
      s.initial_done = true
      s.walk_started = null
      s.walked_at = new Date(now).toISOString()
    }
    return { people, state: s, more }
  },
  async registerWebhook(key, scope, url) {
    const r: any = await marketingCall(BREVO, `${BREVO_API}/webhooks`, { method: "POST", headers: brevoHeaders(key), body: { url, description: "Storelib: unsubscribes", events: ["unsubscribed", "spam", "hardBounce"], type: "marketing" }, limit: bl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
    return { ids: r?.id != null ? [String(r.id)] : [], secret: null }
  },
  async removeWebhook(key, scope, id) {
    await unlessMissing(() => marketingCall(BREVO, `${BREVO_API}/webhooks/${encodeURIComponent(id)}`, { method: "DELETE", headers: brevoHeaders(key), limit: bl(scope) }))
  },
  parseWebhook(body) {
    const items = Array.isArray(body) ? body : [body]
    const out: PulledAddress[] = []
    for (const raw of items) {
      const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
      const email = clean(b.email)
      const ev = String(b.event ?? "").toLowerCase()
      if (!EMAIL_RE.test(email)) continue
      const reason = /spam/.test(ev) ? "SPAM_COMPLAINT" : /hard/.test(ev) ? "HARD_BOUNCE" : /unsub/.test(ev) ? "UNSUBSCRIBE" : null
      if (!reason) continue
      const at = typeof b.date_event === "string" ? b.date_event : typeof b.ts_event === "number" ? new Date(b.ts_event * 1000).toISOString() : null
      out.push({ email, reason, at })
    }
    return out
  },
}

/* ── MailerLite ────────────────────────────────────────────────────────── */

const ML = "MailerLite"
function mlHeaders(key: string): Record<string, string> {
  return { authorization: `Bearer ${key.trim()}`, accept: "application/json", "content-type": "application/json" }
}
const ml = (scope: string) => ({ key: scope, name: "mailerlite" as const })

/** "2026-09-01 10:00:00", the way MailerLite writes a time. */
export function mlTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").slice(0, 19)
}

/** MailerLite's "2026-09-01 10:00:00" (UTC) as an ISO time, or null. */
export function mlDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v.replace(" ", "T") : `${v.replace(" ", "T")}Z`)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

export function mlSubscriberBody(p: PlatformPerson, groups: string[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  const fields: Record<string, string> = {}
  if (p.firstName) fields.name = p.firstName
  if (p.lastName) fields.last_name = p.lastName
  return { email: p.email, ...(Object.keys(fields).length ? { fields } : {}), ...(groups.length ? { groups } : {}), ...(p.consentedAt ? { subscribed_at: mlTime(p.consentedAt), opted_in_at: mlTime(p.consentedAt) } : {}), ...extra }
}

async function mlSend(key: string, scope: string, bodies: Record<string, unknown>[]): Promise<void> {
  if (bodies.length === 1) {
    await marketingCall(ML, `${MAILERLITE_API}/subscribers`, { method: "POST", headers: mlHeaders(key), body: bodies[0], limit: ml(scope) })
    return
  }
  for (let i = 0; i < bodies.length; i += 50) {
    await marketingCall(ML, `${MAILERLITE_API}/batch`, { method: "POST", headers: mlHeaders(key), body: { requests: bodies.slice(i, i + 50).map((body) => ({ method: "POST", path: "api/subscribers", body })) }, limit: ml(scope) })
  }
}

async function mlGroup(key: string, scope: string, name: string): Promise<PlatformList> {
  const found: any = await marketingCall(ML, `${MAILERLITE_API}/groups?limit=25&filter[name]=${encodeURIComponent(name)}`, { headers: mlHeaders(key), limit: ml(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const same = namedRows(found?.data).find((g) => g.name.toLowerCase() === name.toLowerCase())
  if (same) return same
  const made: any = await marketingCall(ML, `${MAILERLITE_API}/groups`, { method: "POST", headers: mlHeaders(key), body: { name }, limit: ml(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = namedRows(made?.data ? [made.data] : [])[0]
  if (!g) throw new ProviderError(`MailerLite did not make the group ${name}.`, 400, false)
  return g
}

export function mlPullUrl(state: PullState): string {
  const q = new URLSearchParams()
  q.set("filter[status]", "unsubscribed")
  q.set("limit", "1000")
  if (state.cursor) q.set("cursor", state.cursor)
  return `${MAILERLITE_API}/subscribers?${q.toString()}`
}

const ML_REASON: Record<string, string> = { unsubscribed: "UNSUBSCRIBE", bounced: "HARD_BOUNCE", junk: "SPAM_COMPLAINT" }

const mailerlite: PlatformAdapter = {
  id: "mailerlite",
  name: ML,
  limit: "mailerlite",
  permissions: ["An API token (Integrations › API)"],
  takesCustomers: false,
  eventsForEveryone: false,
  canMakeList: true,
  step: { subscribe: 50, unsubscribe: 50, customers: 50 },
  keyProblem: (key) => pageKeyProblem("mailerlite", key),
  async connect(key, scope) {
    return { account: null, accountId: null, lists: await mailerlite.lists(key, scope) }
  },
  async lists(key, scope) {
    const out: PlatformList[] = []
    for (let page = 1; page <= 5; page++) {
      const r: any = await marketingCall(ML, `${MAILERLITE_API}/groups?limit=100&page=${page}&sort=name`, { headers: mlHeaders(key), limit: ml(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      const rows = namedRows(r?.data)
      out.push(...rows)
      if (rows.length < 100) break
    }
    return out
  },
  makeList: (key, scope, name) => mlGroup(key, scope, name),
  async prepare(key, scope) {
    const [buyer, refunded] = [await mlGroup(key, scope, "Storelib buyers"), await mlGroup(key, scope, "Storelib refunded")]
    return { buyer_id: buyer.id, refunded_id: refunded.id }
  },
  async subscribe(key, scope, listId, people, historical) {
    /* No status: a new address is active (or unconfirmed, if the account asks API signups to confirm); someone who left in MailerLite stays left. */
    await mlSend(key, scope, people.map((p) => mlSubscriberBody(historical ? p : { ...p, consentedAt: null }, listId ? [listId] : [])))
  },
  async unsubscribe(key, scope, _listId, emails) {
    await mlSend(key, scope, emails.map((email) => ({ email, status: "unsubscribed" })))
  },
  async customers() {
    /* Everyone in MailerLite can be mailed: a buyer who did not ask is never sent. */
  },
  events(key, scope, order, event, setup) {
    const group = event === "placed" ? setup.buyer_id : event === "refunded" ? setup.refunded_id : null
    if (!group) return []
    return [{ run: () => mlSend(key, scope, [{ email: order.email, groups: [group] }]) }]
  },
  async pull(key, scope, state, now) {
    let s = { ...EMPTY_PULL, ...state }
    /* MailerLite cannot be asked "since when": the whole list of the unsubscribed is walked, then again each day (the webhook brings each one as it happens). */
    if (s.initial_done && !s.cursor && s.walked_at && now - Date.parse(s.walked_at) < DAY) return { people: [], state: s, more: false }
    if (s.initial_done && !s.cursor) s = { ...s, walk_started: new Date(now).toISOString() }
    const people: PulledAddress[] = []
    let more = false
    for (let page = 0; page < 5; page++) {
      const r: any = await marketingCall(ML, mlPullUrl(s), { headers: mlHeaders(key), limit: ml(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of Array.isArray(r?.data) ? r.data : []) {
        const email = clean(x?.email)
        if (EMAIL_RE.test(email)) people.push({ email, reason: "UNSUBSCRIBE", at: mlDate(x?.unsubscribed_at) })
      }
      const next = r?.meta?.next_cursor
      s.cursor = typeof next === "string" && next ? next : null
      if (!s.cursor) break
      more = true
    }
    if (!s.cursor) {
      more = false
      s.initial_done = true
      s.walked_at = new Date(now).toISOString()
      s.walk_started = null
    }
    return { people, state: s, more }
  },
  async registerWebhook(key, scope, url) {
    const r: any = await marketingCall(ML, `${MAILERLITE_API}/webhooks`, { method: "POST", headers: mlHeaders(key), body: { name: "Storelib: unsubscribes", events: ["subscriber.unsubscribed", "subscriber.bounced", "subscriber.spam_reported"], url }, limit: ml(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
    const d = r?.data ?? {}
    return { ids: d.id != null ? [String(d.id)] : [], secret: typeof d.secret === "string" ? d.secret : null }
  },
  async removeWebhook(key, scope, id) {
    await unlessMissing(() => marketingCall(ML, `${MAILERLITE_API}/webhooks/${encodeURIComponent(id)}`, { method: "DELETE", headers: mlHeaders(key), limit: ml(scope) }))
  },
  parseWebhook(body) {
    const b = (body && typeof body === "object" ? body : {}) as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
    /* One subscriber, { events: [...] } when batched, or { data: subscriber }. */
    const items: any[] = Array.isArray(b.events) ? b.events.map((e: any) => ({ ...(e?.data ?? e), type: e?.type ?? e?.event })) : [{ ...(b.data ?? b), type: b.type ?? b.event }] // eslint-disable-line @typescript-eslint/no-explicit-any
    const out: PulledAddress[] = []
    for (const x of items) {
      const email = clean(x?.email)
      const type = String(x?.type ?? "")
      const reason = /spam/.test(type) ? "SPAM_COMPLAINT" : /bounce/.test(type) ? "HARD_BOUNCE" : /unsubscribe/.test(type) ? "UNSUBSCRIBE" : ML_REASON[String(x?.status ?? "")] ?? null
      if (!reason || !EMAIL_RE.test(email)) continue
      out.push({ email, reason, at: mlDate(x?.unsubscribed_at) })
    }
    return out
  },
}

/** MailerLite's Signature header: HMAC SHA-256 of the raw body with the webhook's secret, in hex. */
export function mailerliteSignatureOk(secret: string, raw: string, header: string | null): boolean {
  if (!header) return false
  const want = Buffer.from(createHmac("sha256", secret).update(raw).digest("hex"))
  const got = Buffer.from(header.trim())
  return want.length === got.length && timingSafeEqual(want, got)
}

/* ── Kit ───────────────────────────────────────────────────────────────── */

const KIT = "Kit"
function kitHeaders(key: string): Record<string, string> {
  return { "x-kit-api-key": key.trim(), accept: "application/json", "content-type": "application/json" }
}
const kl = (scope: string) => ({ key: scope, name: "kit" as const })

async function kitTag(key: string, scope: string, name: string): Promise<PlatformList> {
  const r: any = await marketingCall(KIT, `${KIT_API}/tags`, { method: "POST", headers: kitHeaders(key), body: { name }, limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = namedRows(r?.tag ? [r.tag] : [])[0]
  if (!t) throw new ProviderError(`Kit did not make the tag ${name}.`, 400, false)
  return t
}

async function kitTagEmail(key: string, scope: string, tagId: string, email: string): Promise<void> {
  await marketingCall(KIT, `${KIT_API}/tags/${encodeURIComponent(tagId)}/subscribers`, { method: "POST", headers: kitHeaders(key), body: { email_address: email }, limit: kl(scope) })
}

export function kitPullUrl(state: PullState): string {
  const q = new URLSearchParams()
  q.set("status", "all")
  q.set("per_page", "1000")
  q.set("sort_field", "id")
  q.set("updated_after", new Date(state.since ?? EPOCH).toISOString())
  if (state.cursor) q.set("after", state.cursor)
  return `${KIT_API}/subscribers?${q.toString()}`
}

const KIT_REASON: Record<string, string> = { cancelled: "UNSUBSCRIBE", bounced: "HARD_BOUNCE", complained: "SPAM_COMPLAINT" }

const kit: PlatformAdapter = {
  id: "kit",
  name: KIT,
  limit: "kit",
  permissions: ["A v4 API key (Settings › Developer)"],
  takesCustomers: false,
  eventsForEveryone: false,
  canMakeList: true,
  step: { subscribe: 1, unsubscribe: 1, customers: 1 },
  keyProblem: (key) => pageKeyProblem("kit", key),
  async connect(key, scope) {
    const r: any = await marketingCall(KIT, `${KIT_API}/account`, { headers: kitHeaders(key), limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
    const acc = r?.account
    if (!acc) throw new ProviderError("Kit did not say which account the key belongs to.", 400, false)
    return { account: (acc.name || acc.primary_email_address || r?.user?.email || null) as string | null, accountId: acc.id != null ? String(acc.id) : null, lists: await kit.lists(key, scope) }
  },
  async lists(key, scope) {
    const out: PlatformList[] = []
    let after: string | null = null
    for (let page = 0; page < 5; page++) {
      const r: any = await marketingCall(KIT, `${KIT_API}/tags?per_page=1000${after ? `&after=${encodeURIComponent(after)}` : ""}`, { headers: kitHeaders(key), limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      out.push(...namedRows(r?.tags))
      after = r?.pagination?.has_next_page && typeof r.pagination.end_cursor === "string" ? r.pagination.end_cursor : null
      if (!after) break
    }
    return out
  },
  makeList: (key, scope, name) => kitTag(key, scope, name),
  async prepare(key, scope) {
    const [buyer, refunded] = [await kitTag(key, scope, "Storelib buyer"), await kitTag(key, scope, "Storelib refunded")]
    return { buyer_id: buyer.id, refunded_id: refunded.id }
  },
  async subscribe(key, scope, listId, people) {
    for (const p of people) {
      await marketingCall(KIT, `${KIT_API}/subscribers`, { method: "POST", headers: kitHeaders(key), body: { email_address: p.email, ...(p.firstName ? { first_name: p.firstName } : {}), state: "active" }, limit: kl(scope) })
      if (listId) await kitTagEmail(key, scope, listId, p.email)
    }
  },
  async unsubscribe(key, scope, _listId, emails) {
    for (const email of emails) {
      const r: any = await marketingCall(KIT, `${KIT_API}/subscribers?status=all&email_address=${encodeURIComponent(email)}`, { headers: kitHeaders(key), limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      const id = Array.isArray(r?.subscribers) ? r.subscribers[0]?.id : null
      if (id == null) continue
      await unlessMissing(() => marketingCall(KIT, `${KIT_API}/subscribers/${encodeURIComponent(String(id))}/unsubscribe`, { method: "POST", headers: kitHeaders(key), body: {}, limit: kl(scope) }))
    }
  },
  async customers() {
    /* Everyone in Kit can be mailed: a buyer who did not ask is never sent. */
  },
  events(key, scope, order, event, setup) {
    const tag = event === "placed" ? setup.buyer_id : event === "refunded" ? setup.refunded_id : null
    if (!tag) return []
    return [{ run: () => kitTagEmail(key, scope, tag, order.email) }]
  },
  async pull(key, scope, state, now) {
    const s = { ...EMPTY_PULL, ...state }
    if (!s.walk_started) s.walk_started = new Date(now).toISOString()
    const people: PulledAddress[] = []
    let more = false
    for (let page = 0; page < (s.initial_done ? 3 : 10); page++) {
      const r: any = await marketingCall(KIT, kitPullUrl(s), { headers: kitHeaders(key), limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const x of Array.isArray(r?.subscribers) ? r.subscribers : []) {
        const email = clean(x?.email_address)
        const reason = KIT_REASON[String(x?.state ?? "")]
        if (reason && EMAIL_RE.test(email)) people.push({ email, reason, at: null })
      }
      const next = r?.pagination?.has_next_page && typeof r.pagination.end_cursor === "string" ? r.pagination.end_cursor : null
      s.cursor = next
      if (!next) break
      more = true
    }
    if (!s.cursor) {
      more = false
      /* Kit's rows carry no time of their own change: the next look is from when this one began. */
      s.since = new Date(Date.parse(s.walk_started) - 60_000).toISOString()
      s.initial_done = true
      s.walk_started = null
      s.walked_at = new Date(now).toISOString()
    }
    return { people, state: s, more }
  },
  async registerWebhook(key, scope, url) {
    const ids: string[] = []
    /* One hook per event, each address saying which it is: Kit's body is the subscriber alone. */
    for (const [name, kind] of [["subscriber.subscriber_unsubscribe", "unsubscribe"], ["subscriber.subscriber_bounce", "bounce"], ["subscriber.subscriber_complain", "complain"]] as const) {
      const r: any = await marketingCall(KIT, `${KIT_API}/webhooks`, { method: "POST", headers: kitHeaders(key), body: { target_url: `${url}&kind=${kind}`, event: { name } }, limit: kl(scope) }) // eslint-disable-line @typescript-eslint/no-explicit-any
      if (r?.webhook?.id != null) ids.push(String(r.webhook.id))
    }
    return { ids, secret: null }
  },
  async removeWebhook(key, scope, id) {
    await unlessMissing(() => marketingCall(KIT, `${KIT_API}/webhooks/${encodeURIComponent(id)}`, { method: "DELETE", headers: kitHeaders(key), limit: kl(scope) }))
  },
  parseWebhook(body, kind) {
    const s = (body && typeof body === "object" ? (body as Record<string, any>).subscriber : null) as Record<string, unknown> | null // eslint-disable-line @typescript-eslint/no-explicit-any
    const email = clean(s?.email_address)
    const byKind: Record<string, string> = { unsubscribe: "UNSUBSCRIBE", bounce: "HARD_BOUNCE", complain: "SPAM_COMPLAINT" }
    const reason = KIT_REASON[String(s?.state ?? "")] ?? byKind[String(kind ?? "")] ?? null
    return reason && EMAIL_RE.test(email) ? [{ email, reason, at: null }] : []
  },
}

export const PLATFORMS: Record<PlatformId, PlatformAdapter> = { brevo, mailerlite, kit }
