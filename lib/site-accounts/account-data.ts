/**
 * ===========================================================================
 *  WHAT A SIGNED-IN CUSTOMER SEES ON A CREATOR'S ACCOUNT PAGE
 * ===========================================================================
 * Their name and email, and their orders from THIS creator, newest first.
 * Nothing about any other creator, ever: a website is one shop.
 *
 * WHICH ORDERS ARE THEIRS. The orders placed with the email they proved they
 * read, by typing the code sent to it: the address the receipt went to, the
 * rule Shopify uses to attach orders to a customer, and the one the orders
 * table's own policy already uses for a Storelib buyer. Compared without
 * case and without wildcards (`likeExact`: an address with an underscore in
 * it matches only itself). Kept to this creator by the order's own
 * `creator_id` (supabase/sql/run-now/32), or through this creator's products
 * on a database from before it.
 *
 * ONE ORDER IS ONE PAYMENT. A basket writes a row per product sharing the
 * payment's stripe_session_id, and the receipt shows them as one
 * (lib/receipts/load.ts); so does this, with the same money rules
 * (lib/receipts/rules.ts), so the total here is the total on the receipt.
 *
 * THE FILES. On a website whose account draws an order's own page (an
 * imported theme's, `orderPages`), a download's button opens
 * /account/orders/<id> on the website, and each file downloads there
 * (./order-files.ts). Otherwise it opens the receipt, behind the receipt's
 * own token, which is also its download page (lib/receipts/rules.ts, step 4)
 * and needs no Storelib login.
 *
 * Shaped for the template engine, which reads it as `customer`: plain
 * strings and lists, dates written out, money formatted, links absolute. A
 * template has no arithmetic and no dates.
 */

import { accessStateOf, formatMoney, isPlausibleToken, lineMoney, normaliseCurrency, orderNumberOf, overallState, type AccessState } from "@/lib/receipts/rules"
import { isMissingColumn, UUID, type Db } from "./db"
import type { CustomerRow } from "./customers"
import { carrierTrackingUrl } from "@/lib/physical/carriers"
import { orderPagePath } from "@/lib/physical/order-link"

export interface CustomerOrderItem {
  title: string
  image: string
  /** The product on this website, or "" when it is no longer for sale. */
  url: string
  /** The variant bought, e.g. "Blue", or "". */
  variant: string
}

export interface CustomerOrder {
  id: string
  /** The receipt's short number, e.g. "3F2A9C1B". */
  number: string
  /** "Sep 21, 2026". */
  date: string
  /** When it was placed, as the database wrote it (ISO 8601), for a theme that formats dates itself. */
  created_at?: string
  /** In words: Complete, Confirmed, Shipped, Delivered, Partly refunded, Refunded, Processing, On hold. */
  status: string
  /** open, pending, refunded or held (lib/receipts/rules.ts), for a template that styles by it. */
  state: AccessState
  /** "$93.00", or "Free". */
  total: string
  /** The same total in the currency's smallest unit, and the currency, for a theme that formats money itself (`| money`). */
  total_cents?: number
  currency?: string
  items: CustomerOrderItem[]
  item_count: number
  /** Download for something to download, Access for a course or community, View order for anything else. */
  action_label: string
  /** The order's receipt on storelib.com, which is also where its files are. */
  action_url: string
  /**
   * Something that ships: where it is, as the order page says it (unfulfilled,
   * processing, partially_fulfilled, fulfilled, delivered, cancelled), its
   * parcels, and the order's own page on this website, where the status, the
   * carrier and the tracking are (app/checkout/physical/order). Left out for
   * an order with nothing to ship.
   */
  fulfillment_status?: string
  delivery_method?: string
  tracking?: CustomerTracking[]
  order_url?: string
  /* The first item and the total, under the names a template written before orders had items reads. */
  title: string
  image: string
  url: string
  price: string
}

/** One parcel of an order, as the buyer follows it. */
export interface CustomerTracking {
  /** "UPS", or "" when the seller named none. */
  company: string
  number: string
  /** The carrier's own tracking page, or "" for a carrier with none we know. */
  url: string
  /** In words: Shipped, In transit, Out for delivery, Delivered, Ready for pickup, Picked up. */
  status: string
}

export interface CustomerObject {
  /** What the customer typed on their profile, or "". */
  name: string
  first_name: string
  email: string
  orders: CustomerOrder[]
  orders_count: number
  /** Where their orders from this shop were sent, newest first, at most three. Empty for a shop with nothing to ship. */
  addresses?: CustomerAddress[]
  /**
   * True only in the builder, where there is no customer: the name and email
   * are placeholders and the orders are the creator's own products
   * (components/website-builder/sections/storelib-live.tsx). Never true on a
   * live page.
   */
  sample: boolean
}

/** Rows a customer is shown: paid, and paid then refunded or disputed. Never a payment that failed. */
const SHOWN = ["completed", "refunded", "partially_refunded", "disputed"]

const ORDER_COLUMNS = "id, product_id, variant_name, amount_cents, tip_cents, currency, status, created_at, receipt_token, stripe_session_id, paypal_order_id, refund_amount_cents, shipped_at, delivered_at, checkout_id"

interface OrderRow {
  id: string
  product_id: string | null
  variant_name?: string | null
  amount_cents?: number | null
  tip_cents?: number | null
  currency?: string | null
  status?: string | null
  created_at?: string | null
  receipt_token?: string | null
  stripe_session_id?: string | null
  paypal_order_id?: string | null
  refund_amount_cents?: number | null
  shipped_at?: string | null
  delivered_at?: string | null
  /** The physical checkout it was paid in (supabase/sql/run-now/78), whose order page follows it. */
  checkout_id?: string | null
}

interface ProductRow {
  id: string
  title: string | null
  slug: string | null
  thumbnail_url: string | null
  type: string | null
  status: string | null
  creator_id?: string | null
}

/** A LIKE pattern that matches only the text itself: `_`, `%` and `\` are taken literally. */
export function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

export function orderDate(iso: unknown): string {
  if (typeof iso !== "string") return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ""
}

/** The rows of the orders placed with this email, this creator's only. */
async function readOrders(db: Db, creatorId: string, email: string): Promise<OrderRow[]> {
  const pattern = likeExact(email)
  const byCreator = await db
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("creator_id", creatorId)
    .ilike("buyer_email", pattern)
    .in("status", SHOWN)
    .order("created_at", { ascending: false })
    .limit(200)
  if (!byCreator.error) return (byCreator.data ?? []) as OrderRow[]
  if (!isMissingColumn(byCreator.error)) return []

  /* A database from before orders carried their creator (part 32), or
     without one of the later columns: through this creator's products, whole rows. */
  const { data: mine } = await db.from("products").select("id").eq("creator_id", creatorId).limit(1000)
  const ids = ((mine ?? []) as { id: string }[]).map((p) => p.id).filter((id) => UUID.test(id))
  if (ids.length === 0) return []
  const loose = await db
    .from("orders")
    .select("*")
    .in("product_id", ids)
    .ilike("buyer_email", pattern)
    .in("status", SHOWN)
    .order("created_at", { ascending: false })
    .limit(200)
  return loose.error ? [] : ((loose.data ?? []) as OrderRow[])
}

function statusWords(state: AccessState, rows: OrderRow[], physical: boolean, refundedCents: number, ship: ShipFacts | null = null): string {
  if (state === "pending") return "Processing"
  if (state === "refunded") return "Refunded"
  if (state === "held" || state === "failed") return "On hold"
  /* Something that ships: where the parcel is says more than a part refund does. */
  if (physical && ship) return shipWords(ship)
  if (refundedCents > 0) return "Partly refunded"
  if (!physical) return "Complete"
  if (rows.some((r) => r.delivered_at)) return "Delivered"
  if (rows.some((r) => r.shipped_at)) return "Shipped"
  return "Confirmed"
}

/* ─── What ships: the checkout's own status and its parcels ─────────────── */

interface ShipFacts {
  /** The order page's key (commerce_checkouts.receipt_token). */
  token: string | null
  fulfillment: string
  method: string
  cancelled: boolean
  tracking: CustomerTracking[]
}

const PARCEL_WORDS: Record<string, [string, string]> = {
  shipped: ["Shipped", "Ready for pickup"],
  in_transit: ["In transit", "Ready for pickup"],
  out_for_delivery: ["Out for delivery", "Ready for pickup"],
  delivered: ["Delivered", "Picked up"],
  failed: ["Delivery problem", "Delivery problem"],
  submitted: ["Sent to be shipped", "Being prepared"],
  pending: ["Being prepared", "Being prepared"],
}

/** The order as its buyer reads it, from the checkout's fulfilment status (lib/physical/status). */
export function shipWords(f: Pick<ShipFacts, "fulfillment" | "method" | "cancelled">): string {
  const pickup = f.method === "pickup"
  if (f.cancelled || f.fulfillment === "cancelled") return "Cancelled"
  switch (f.fulfillment) {
    case "processing":
      return "Processing"
    case "partially_fulfilled":
      return pickup ? "Partly ready" : "Partly shipped"
    case "fulfilled":
      return pickup ? "Ready for pickup" : "Shipped"
    case "delivered":
      return pickup ? "Picked up" : "Delivered"
    default:
      return "Confirmed"
  }
}

/** The checkouts these orders were paid in, this creator's only, with their parcels. Empty before physical commerce's tables exist. */
async function shippingFacts(db: Db, creatorId: string, checkoutIds: string[]): Promise<Map<string, ShipFacts>> {
  const out = new Map<string, ShipFacts>()
  const ids = [...new Set(checkoutIds.filter((id) => UUID.test(id)))].slice(0, 200)
  if (ids.length === 0) return out
  try {
    const { data, error } = await db.from("commerce_checkouts").select("id, creator_id, receipt_token, fulfillment_status, delivery_method, cancelled_at").in("id", ids).eq("creator_id", creatorId)
    if (error || !Array.isArray(data)) return out
    for (const c of data as { id: string; creator_id?: string; receipt_token?: string | null; fulfillment_status?: string | null; delivery_method?: string | null; cancelled_at?: string | null }[]) {
      if (c.creator_id && c.creator_id !== creatorId) continue
      out.set(c.id, {
        token: orderPagePath(c.receipt_token) ? (c.receipt_token as string) : null,
        fulfillment: String(c.fulfillment_status ?? "unfulfilled"),
        method: String(c.delivery_method ?? "ship"),
        cancelled: !!c.cancelled_at,
        tracking: [],
      })
    }
    if (out.size === 0) return out
    const parcels = await db.from("fulfillments").select("checkout_id, status, carrier, tracking_number, tracking_url, created_at").in("checkout_id", [...out.keys()]).order("created_at", { ascending: true })
    if (parcels.error || !Array.isArray(parcels.data)) return out
    for (const f of parcels.data as { checkout_id: string; status?: string | null; carrier?: string | null; tracking_number?: string | null; tracking_url?: string | null }[]) {
      const facts = out.get(f.checkout_id)
      if (!facts || f.status === "cancelled") continue
      const number = typeof f.tracking_number === "string" ? f.tracking_number.trim() : ""
      const pickup = facts.method === "pickup"
      /* A pickup has no parcel to follow; a shipment sent without a number still says it shipped, on the status. */
      if (pickup || !number) continue
      const saved = typeof f.tracking_url === "string" && /^https:\/\/[^\s"'<>]+$/.test(f.tracking_url) ? f.tracking_url : ""
      const words = PARCEL_WORDS[String(f.status ?? "shipped")] ?? PARCEL_WORDS.shipped
      facts.tracking.push({ company: (f.carrier ?? "").trim(), number, url: saved || carrierTrackingUrl(f.carrier, number) || "", status: words[0] })
    }
  } catch {
    /* Drawn from the order rows alone. */
  }
  return out
}

/**
 * The orders placed with this email on this creator's website, one per
 * payment, newest first. `platform` is "https://storelib.com", where the
 * receipts are.
 */
export async function customerOrders(db: Db, scope: { creatorId: string; email: string }, platform: string, opts: OrderLinks = {}): Promise<CustomerOrder[]> {
  if (!UUID.test(scope.creatorId) || !scope.email) return []
  let rows: OrderRow[] = []
  try {
    rows = await readOrders(db, scope.creatorId, scope.email)
  } catch {
    rows = []
  }
  if (rows.length === 0) return []

  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => typeof id === "string" && UUID.test(id)))]
  const products = new Map<string, ProductRow>()
  if (productIds.length > 0) {
    try {
      const { data } = await db.from("products").select("id, title, slug, thumbnail_url, type, status, creator_id").in("id", productIds)
      for (const p of (data ?? []) as ProductRow[]) {
        /* Belt and braces: a product that is not this creator's is not drawn. */
        if (p.creator_id && p.creator_id !== scope.creatorId) continue
        products.set(p.id, p)
      }
    } catch {
      /* Drawn with the words below instead. */
    }
  }

  /* One payment, one order: a basket's rows share their checkout. */
  const groups = new Map<string, OrderRow[]>()
  for (const r of rows) {
    const key = r.stripe_session_id ? `s:${r.stripe_session_id}` : r.paypal_order_id ? `p:${r.paypal_order_id}` : `o:${r.id}`
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  /* Something that ships: its checkout's status, parcels and order page (lib/physical). */
  const ships = await shippingFacts(db, scope.creatorId, rows.map((r) => r.checkout_id ?? "").filter(Boolean))

  const orders = [...groups.values()].map((list) => {
    const lines = [...list].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
    const first = lines[0]
    const items: CustomerOrderItem[] = lines.map((r) => {
      const p = r.product_id ? products.get(r.product_id) : undefined
      return {
        title: p?.title?.trim() || "No longer available",
        image: p?.thumbnail_url ?? "",
        url: p && p.status === "published" && p.slug ? `/products/${p.slug}` : "",
        variant: (r.variant_name ?? "").toString().trim(),
      }
    })
    const types = lines.map((r) => (r.product_id ? products.get(r.product_id)?.type ?? null : null))
    const state = overallState(lines.map((r) => accessStateOf(r)))
    const money = lines.reduce(
      (acc, r) => {
        const m = lineMoney(r)
        acc.total += m.totalCents
        acc.refunded += m.refundedCents
        return acc
      },
      { total: 0, refunded: 0 },
    )
    const physical = types.some((t) => t === "physical")
    const shipFacts = physical ? (lines.map((r) => (r.checkout_id ? ships.get(r.checkout_id) : undefined)).find(Boolean) ?? null) : null
    /* The order's own page: on whatever host this account is drawn on (the website's, or storelib.com), it is the same page. */
    const orderPage = shipFacts ? orderPagePath(shipFacts.token) : null
    const open = state === "open"
    /* An order that ships is followed on its own page: status, carrier and tracking (app/checkout/physical/order), the way a shop's own account does it. */
    const shipsOnly = physical && types.every((t) => t === "physical")
    const action_label = shipsOnly
      ? "Track order"
      : !open
      ? "View order"
      : types.some((t) => t === "digital" || t === null)
        ? "Download"
        : types.some((t) => t === "course" || t === "community")
          ? "Access"
          : "View order"
    const token = lines.map((r) => r.receipt_token).find((t) => isPlausibleToken(t))
    const total = money.total > 0 ? formatMoney(money.total, normaliseCurrency(first.currency), "en-US") : "Free"
    const label = items.length > 1 ? `${items[0].title} and ${items.length - 1} more` : items[0]?.title ?? ""
    return {
      at: String(first.created_at ?? ""),
      order: {
        id: first.id,
        number: orderNumberOf(first.id),
        date: orderDate(first.created_at),
        created_at: String(first.created_at ?? ""),
        status: statusWords(state, lines, physical, money.refunded, shipFacts),
        state,
        total,
        total_cents: money.total,
        currency: normaliseCurrency(first.currency),
        items,
        item_count: items.length,
        action_label,
        /* A download on a website whose account draws order pages (an imported theme's): that page, on the website, where each file downloads (./order-files.ts). */
        /*
          Something that only ships opens its order page, keyed by its
          checkout's token (the order rows' own tokens are receipts, which
          send a parcel on to that same page: lib/receipts/physical-order).
        */
        action_url:
          opts.orderPages && action_label === "Download"
            ? `/account/orders/${first.id}`
            : shipsOnly && orderPage
              ? orderPage
              : token
                ? `${platform}/receipt/${encodeURIComponent(token)}`
                : "",
        ...(shipFacts
          ? { fulfillment_status: shipFacts.cancelled ? "cancelled" : shipFacts.fulfillment, delivery_method: shipFacts.method, tracking: shipFacts.tracking, order_url: orderPage ?? "" }
          : {}),
        title: label,
        image: items.find((i) => i.image)?.image ?? "",
        url: items[0]?.url ?? "",
        price: total,
      } satisfies CustomerOrder,
    }
  })

  return orders.sort((a, b) => b.at.localeCompare(a.at)).map((o) => o.order)
}

/* ─── Addresses ─────────────────────────────────────────────────────────── */

export interface CustomerAddress {
  /** The address as the label on a parcel reads, one line each: name, street, city line, country. */
  lines: string[]
}

const ADDRESSES_SHOWN = 3

function countryName(code: unknown): string {
  if (typeof code !== "string" || !/^[A-Za-z]{2}$/.test(code)) return typeof code === "string" ? code.trim() : ""
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/** One shipping address as the checkout stored it (lib/physical/checkout-server), as lines. Null when there is nothing to show. */
export function addressLines(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const a = raw as Record<string, unknown>
  const t = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 200) : "")
  const city = [t(a.city), [t(a.region), t(a.postalCode)].filter(Boolean).join(" ")].filter(Boolean).join(", ")
  const lines = [t(a.name), t(a.line1), t(a.line2), city, countryName(a.country)].filter(Boolean)
  return lines.length >= 2 ? lines : null
}

/**
 * The addresses this customer's physical orders from THIS creator were sent
 * to, newest first, each once. Read by the same rule as the orders: the
 * creator's own checkouts, with the email this customer proved, compared
 * exactly. Before physical commerce's tables exist there are none.
 */
export async function customerAddresses(db: Db, scope: { creatorId: string; email: string }): Promise<CustomerAddress[]> {
  if (!UUID.test(scope.creatorId) || !scope.email) return []
  try {
    const { data, error } = await db
      .from("commerce_checkouts")
      .select("shipping_address, paid_at")
      .eq("creator_id", scope.creatorId)
      .ilike("buyer_email", likeExact(scope.email))
      .in("status", ["paid", "refunded", "partially_refunded"])
      .order("paid_at", { ascending: false })
      .limit(25)
    if (error || !Array.isArray(data)) return []
    const seen = new Set<string>()
    const out: CustomerAddress[] = []
    for (const row of data as { shipping_address?: unknown }[]) {
      const lines = addressLines(row.shipping_address)
      if (!lines) continue
      const key = lines.join("|").toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ lines })
      if (out.length >= ADDRESSES_SHOWN) break
    }
    return out
  } catch {
    return []
  }
}

/** How an order's button links: `orderPages`, to the order's own page on the website, for a download. */
export interface OrderLinks {
  orderPages?: boolean
}

/** The `customer` object for one customer on one creator's website. */
export async function siteCustomer(db: Db, customer: CustomerRow, platform: string, opts: OrderLinks = {}): Promise<CustomerObject> {
  const name = (customer.name ?? "").trim()
  const scope = { creatorId: customer.creator_id, email: customer.email }
  const [orders, addresses] = await Promise.all([customerOrders(db, scope, platform, opts), customerAddresses(db, scope)])
  return { name, first_name: firstName(name), email: customer.email, orders, orders_count: orders.length, addresses, sample: false }
}
