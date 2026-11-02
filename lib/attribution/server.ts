import "server-only"

/**
 * ===========================================================================
 *  ATTRIBUTION ON THE SERVER: CHECKED, CARRIED THROUGH STRIPE, WRITTEN ONCE
 * ===========================================================================
 * docs/analytics/attribution.md is the full account. In short:
 *
 * UNTRUSTED UNTIL CHECKED. The touches arrive from a page, which a stranger
 * controls. lib/attribution/touch decodeTouches keeps only known fields
 * within their limits and works the source out again; here each touch must
 * also have landed on storelib.com, on storelib.me (the OnePages) or on one
 * of THIS creator's own addresses
 * (lib/checkout/site-hosts), or it is dropped. Nothing here is ever read for
 * a price, a product, a creator or a payment: the product decided the
 * creator before any of this runs.
 *
 * THE PROPERTY IS THE SERVER'S. Which property a purchase came through
 * follows the order's own Source (`orders.source`): website for a website
 * order, else the OnePage when checkout began there, else the creator page.
 * Its id is read from the database for the product's creator, never taken
 * from the page: the creator's id for the creator page, their published
 * website's install id (the one the site renderer draws), their published
 * OnePage's id.
 *
 * WRITTEN ONCE AND NEVER IN THE WAY. The columns arrive with
 * supabase/sql/run-now part `attribution`. Each write is an update after the
 * row exists, only onto a row with no `attributed_at` yet, so the webhook
 * and the buyer's browser racing write it once, and a database without the
 * columns refuses only this. Every function here catches its own failures:
 * an order without attribution is an order, one that failed is not.
 *
 * NO MONEY. Nothing here reads or writes an amount. Revenue, refunds and
 * disputes are read from orders by the reports.
 */

import { getMainDomain } from "@/lib/url-helpers"
import { isOnePageHost } from "@/lib/onepage/address"
import { siteHostsFor } from "@/lib/checkout/site-hosts"
import type { OrderOrigin, OrderSource } from "@/lib/orders/order-source"
import type { ContactSource } from "@/lib/contacts/contact-source"
import {
  decodeTouches,
  isPropertyType,
  storedTouch,
  touchFromMetadata,
  touchToMetadata,
  type PropertyType,
  type Touch,
  type Touches,
} from "./touch"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Attribution {
  property_type: PropertyType | null
  property_id: string | null
  first: Touch | null
  last: Touch | null
}

export const NO_ATTRIBUTION: Attribution = { property_type: null, property_id: null, first: null, last: null }

/** Stripe metadata keys. Present only when they hold something. */
export const ATTR_FIRST_KEY = "attr_first"
export const ATTR_LAST_KEY = "attr_last"
export const ATTR_PROPERTY_KEY = "attr_property"
/** Stripe allows 50 metadata keys on an object. Attribution never takes the last of them. */
const STRIPE_METADATA_KEYS = 50

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A database read that has not answered by then is treated as no answer. */
const LOOKUP_MS = 1500

function withTimeout<T>(work: PromiseLike<T>, fallback: T, ms = LOOKUP_MS): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms)
    Promise.resolve(work).then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      () => {
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/** Storelib's own hosts, every creator's: storelib.com and storelib.me, where every OnePage is. */
function platformHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  const main = getMainDomain().toLowerCase().replace(/^www\./, "").split(":")[0]
  return h === main || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app") || isOnePageHost(h)
}

/* ─── Which property ────────────────────────────────────────────────── */

/**
 * The property a purchase came through, from the same value the order's
 * Source column is written with, so the two always agree: `source` website
 * is property website, and `source` storelib is the OnePage or the creator
 * page. Explore, a product page and a checkout link opened on its own are the
 * creator page: they are Storelib's pages for this creator's products.
 */
export function purchaseProperty(source: OrderSource, origin: OrderOrigin | null | undefined): PropertyType {
  /*
    Round 49: a product that ships, bought from a OnePage, is paid for on the website's checkout (source website)
    with the OnePage named as where it began. It is the OnePage's sale, as the order's Source detail says
    (lib/analytics/properties placedOn reads the surface first).
  */
  if (origin?.surface === "onepage") return "onepage"
  if (source === "website") return "website"
  return "creator_page"
}

/** The property a sign-up happened on, from where the server placed it. Null for an import, a manual add or the API. */
export function contactProperty(source: ContactSource | null | undefined): PropertyType | null {
  switch (source?.surface) {
    case "website":
      return "website"
    case "onepage":
      return "onepage"
    case "profile":
    case "product":
      return "creator_page"
    default:
      return null
  }
}

async function firstId(read: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<string | null> {
  try {
    const { data, error } = await read()
    if (error || !data) return null
    const row = (Array.isArray(data) ? data[0] : data) as { id?: unknown } | undefined
    return typeof row?.id === "string" && UUID.test(row.id) ? row.id.toLowerCase() : null
  } catch {
    return null
  }
}

/**
 * The property's id, for this creator only. The website is the published
 * install the site renderer draws (lib/website-builder/published-site
 * buildSite: published, lowest sort_order); the OnePage is the published one
 * the OnePage route finds (seller, then creator, then owner).
 */
export async function resolvePropertyId(db: Db, creatorId: string, type: PropertyType | null): Promise<string | null> {
  if (!type || typeof creatorId !== "string" || !UUID.test(creatorId)) return null
  if (type === "creator_page") return creatorId.toLowerCase()
  const lookup = async (): Promise<string | null> => {
    if (type === "website") {
      return firstId(() =>
        db.from("store_theme_installs").select("id").eq("creator_id", creatorId).eq("status", "published").order("sort_order", { ascending: true }).limit(1),
      )
    }
    const bySeller = await firstId(() => db.from("onepages").select("id").eq("seller_id", creatorId).eq("status", "published").limit(1))
    if (bySeller) return bySeller
    const byCreator = await firstId(() => db.from("onepages").select("id").eq("creator_id", creatorId).eq("status", "published").limit(1))
    if (byCreator) return byCreator
    let userId: string | null = null
    try {
      const { data } = await db.from("creators").select("user_id").eq("id", creatorId).maybeSingle()
      userId = typeof data?.user_id === "string" ? data.user_id : null
    } catch {
      userId = null
    }
    return userId ? firstId(() => db.from("onepages").select("id").eq("owner_id", userId).eq("status", "published").limit(1)) : null
  }
  return withTimeout(lookup(), null)
}

/* ─── The touches a page sent ───────────────────────────────────────── */

/** The touches inside a page's `origin`, decoded and checked field by field; null for none or for anything malformed. */
export function sentTouches(origin: unknown, now = Date.now()): Touches | null {
  if (!origin || typeof origin !== "object" || Array.isArray(origin)) return null
  return decodeTouches((origin as Record<string, unknown>).touches, now)
}

/**
 * Only touches that landed on storelib.com or on this creator's own
 * addresses. A touch naming a host that is not theirs is another shop's, or
 * made up, and is dropped whole. A website can only be a website's host.
 */
export async function verifyTouches(db: Db, creatorId: string, touches: Touches | null): Promise<Touches | null> {
  if (!touches) return null
  const all = [touches.first, touches.last].filter((t): t is Touch => Boolean(t))
  const needOwn = all.some((t) => t.landing_host && !platformHost(t.landing_host))
  const own = new Set(needOwn ? await withTimeout(siteHostsFor(creatorId, db as never), [] as string[]) : [])
  const keep = (t: Touch | null): Touch | null => {
    if (!t?.landing_host) return null
    if (platformHost(t.landing_host)) {
      if (t.property_type !== "website") return t
      const { property_type: _dropped, ...rest } = t // eslint-disable-line @typescript-eslint/no-unused-vars
      return rest
    }
    return own.has(t.landing_host) ? t : null
  }
  const first = keep(touches.first)
  const last = keep(touches.last)
  if (!first && !last) return null
  return { first: first ?? last, last: last ?? first }
}

/**
 * Everything a checkout knows about where it came from, checked, for the
 * creator whose product it is. Never throws; at worst the property alone.
 */
export async function attributionForCheckout(
  db: Db,
  input: { creatorId: string; source: OrderSource; origin: OrderOrigin | null | undefined; sent: unknown; now?: number },
): Promise<Attribution> {
  let property: PropertyType | null = null
  try {
    property = purchaseProperty(input.source, input.origin)
    const [touches, propertyId] = await Promise.all([
      verifyTouches(db, input.creatorId, sentTouches(input.sent, input.now ?? Date.now())).catch(() => null),
      resolvePropertyId(db, input.creatorId, property).catch(() => null),
    ])
    return { property_type: property, property_id: propertyId, first: touches?.first ?? null, last: touches?.last ?? null }
  } catch {
    return { ...NO_ATTRIBUTION, property_type: property }
  }
}

/** A sign-up's attribution: where the server placed it, and the touches the page sent. Null when it happened on no property. */
export async function contactAttribution(db: Db, input: { creatorId: string; source: ContactSource | null | undefined; sent: unknown; now?: number }): Promise<Attribution | null> {
  try {
    const property = contactProperty(input.source)
    if (!property) return null
    const [touches, propertyId] = await Promise.all([
      verifyTouches(db, input.creatorId, sentTouches(input.sent, input.now ?? Date.now())).catch(() => null),
      resolvePropertyId(db, input.creatorId, property).catch(() => null),
    ])
    return { property_type: property, property_id: propertyId, first: touches?.first ?? null, last: touches?.last ?? null }
  } catch {
    return null
  }
}

/* ─── Through Stripe and back ───────────────────────────────────────── */

/**
 * The attribution as metadata keys to merge into a payment's own, or none
 * when there is nothing to say or when adding them would pass Stripe's 50
 * keys (the payment is never refused for attribution).
 */
export function attributionToMetadata(a: Attribution | null | undefined, keysAlready: number): Record<string, string> {
  if (!a) return {}
  const out: Record<string, string> = {}
  if (a.property_type) out[ATTR_PROPERTY_KEY] = a.property_id ? `${a.property_type}:${a.property_id}` : a.property_type
  const first = touchToMetadata(a.first)
  const last = touchToMetadata(a.last)
  if (first) out[ATTR_FIRST_KEY] = first
  if (last && last !== first) out[ATTR_LAST_KEY] = last
  const count = Object.keys(out).length
  if (count === 0 || keysAlready + count > STRIPE_METADATA_KEYS) return {}
  return out
}

/**
 * Back from the metadata this server wrote, for the order made from the
 * payment. The property always follows the order's Source (`source`), so
 * the two agree even for a payment made before attribution existed, whose
 * metadata has none of it and whose order gets the property alone.
 */
export function attributionFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  fallback: { source: OrderSource; origin: OrderOrigin | null | undefined },
): Attribution {
  const expected = purchaseProperty(fallback.source, fallback.origin)
  const m = metadata ?? {}
  const rawProperty = typeof m[ATTR_PROPERTY_KEY] === "string" ? (m[ATTR_PROPERTY_KEY] as string) : ""
  const [type, id] = rawProperty.split(":")
  const recorded = isPropertyType(type) ? type : null
  const agrees = recorded !== null && (recorded === "website") === (expected === "website")
  const property_type = agrees ? recorded : expected
  const property_id = agrees && typeof id === "string" && UUID.test(id) ? id.toLowerCase() : null
  const first = touchFromMetadata(m[ATTR_FIRST_KEY])
  const last = touchFromMetadata(m[ATTR_LAST_KEY]) ?? first
  return { property_type, property_id, first: first ?? last, last }
}

/* ─── Writing it down ───────────────────────────────────────────────── */

function columns(a: Attribution) {
  return {
    first_touch: storedTouch(a.first),
    last_touch: storedTouch(a.last),
    property_type: a.property_type,
    property_id: a.property_id,
  }
}

/** The columns not there yet (the SQL part has not run): expected, and not worth a log line. */
function missingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (error?.code === "42703" || error?.code === "PGRST204") return true
  return /(column|could not find)[^]*(first_touch|last_touch|property_type|property_id|attributed_at)/i.test(String(error?.message ?? ""))
}

async function write(label: string, run: () => PromiseLike<{ error: { code?: string; message?: string } | null }>) {
  try {
    const { error } = await run()
    if (error && !missingColumn(error)) console.warn(`[attribution] could not record ${label}:`, error.code ?? "", error.message ?? "")
  } catch (error) {
    console.warn(`[attribution] could not record ${label}:`, (error as Error)?.message)
  }
}

/**
 * Onto the orders just made (every line of a basket gets the same), once:
 * only rows with no `attributed_at` are written, so a second caller changes
 * nothing. Never touches any other column.
 */
export async function recordOrderAttribution(db: Db, orderIds: string | Array<string | null | undefined>, a: Attribution | null | undefined): Promise<void> {
  if (!a) return
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds]).filter((id): id is string => typeof id === "string" && id.length > 0)
  if (ids.length === 0) return
  await write("an order's source", () =>
    db.from("orders").update({ ...columns(a), attributed_at: new Date().toISOString() }).in("id", ids).is("attributed_at", null),
  )
}

/** Onto a contact, the first time one is recorded for them: the first door wins, as with `source_detail`. */
export async function recordContactAttribution(db: Db, creatorId: string, email: string, a: Attribution | null | undefined): Promise<void> {
  if (!a || !creatorId || typeof email !== "string" || !email.trim()) return
  await write("a contact's source", () =>
    db
      .from("subscribers")
      .update({ ...columns(a), attributed_at: new Date().toISOString() })
      .eq("creator_id", creatorId)
      .eq("email", email.trim().toLowerCase())
      .is("attributed_at", null),
  )
}

/**
 * A sign-up, in one call for every door: where the server placed it (the
 * same ContactSource its `source_detail` gets) and the touches the page sent
 * in its `origin`. Never throws; writes nothing for a door that is no
 * property (an import, a manual add, the API).
 */
export async function recordSignupAttribution(
  db: Db,
  input: { creatorId: string | null | undefined; email: string | null | undefined; source: ContactSource | null | undefined; sent: unknown },
): Promise<void> {
  try {
    if (!input.creatorId || !input.email) return
    const a = await contactAttribution(db, { creatorId: input.creatorId, source: input.source, sent: input.sent })
    await recordContactAttribution(db, input.creatorId, input.email, a)
  } catch (error) {
    console.warn("[attribution] could not record a sign-up's source:", (error as Error)?.message)
  }
}

/** Onto the started checkout the reminder is made from, so an abandoned one says where it came from. */
export async function recordCheckoutStartAttribution(db: Db, paymentIntentId: string, a: Attribution | null | undefined): Promise<void> {
  if (!a || typeof paymentIntentId !== "string" || !paymentIntentId) return
  await write("a started checkout's source", () =>
    db.from("checkout_starts").update(columns(a)).eq("payment_intent_id", paymentIntentId).is("property_type", null),
  )
}
