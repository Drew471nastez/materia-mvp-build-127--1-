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
 * THE FILES STAY ON STORELIB.COM, behind the receipt's own token: each
 * order's button opens its receipt, which is also its download page
 * (lib/receipts/rules.ts, step 4) and needs no Storelib login.
 *
 * Shaped for the template engine, which reads it as `customer`: plain
 * strings and lists, dates written out, money formatted, links absolute. A
 * template has no arithmetic and no dates.
 */

import { accessStateOf, formatMoney, isPlausibleToken, lineMoney, normaliseCurrency, orderNumberOf, overallState, type AccessState } from "@/lib/receipts/rules"
import { isMissingColumn, UUID, type Db } from "./db"
import type { CustomerRow } from "./customers"

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
  /** In words: Complete, Confirmed, Shipped, Delivered, Partly refunded, Refunded, Processing, On hold. */
  status: string
  /** open, pending, refunded or held (lib/receipts/rules.ts), for a template that styles by it. */
  state: AccessState
  /** "$93.00", or "Free". */
  total: string
  items: CustomerOrderItem[]
  item_count: number
  /** Download for something to download, Access for a course or community, View order for anything else. */
  action_label: string
  /** The order's receipt on storelib.com, which is also where its files are. */
  action_url: string
  /* The first item and the total, under the names a template written before orders had items reads. */
  title: string
  image: string
  url: string
  price: string
}

export interface CustomerObject {
  /** What the customer typed on their profile, or "". */
  name: string
  first_name: string
  email: string
  orders: CustomerOrder[]
  orders_count: number
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

const ORDER_COLUMNS = "id, product_id, variant_name, amount_cents, tip_cents, currency, status, created_at, receipt_token, stripe_session_id, paypal_order_id, refund_amount_cents, shipped_at, delivered_at"

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

function statusWords(state: AccessState, rows: OrderRow[], physical: boolean, refundedCents: number): string {
  if (state === "pending") return "Processing"
  if (state === "refunded") return "Refunded"
  if (state === "held" || state === "failed") return "On hold"
  if (refundedCents > 0) return "Partly refunded"
  if (!physical) return "Complete"
  if (rows.some((r) => r.delivered_at)) return "Delivered"
  if (rows.some((r) => r.shipped_at)) return "Shipped"
  return "Confirmed"
}

/**
 * The orders placed with this email on this creator's website, one per
 * payment, newest first. `platform` is "https://storelib.com", where the
 * receipts are.
 */
export async function customerOrders(db: Db, scope: { creatorId: string; email: string }, platform: string): Promise<CustomerOrder[]> {
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
    const open = state === "open"
    const action_label = !open
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
        status: statusWords(state, lines, physical, money.refunded),
        state,
        total,
        items,
        item_count: items.length,
        action_label,
        action_url: token ? `${platform}/receipt/${encodeURIComponent(token)}` : "",
        title: label,
        image: items.find((i) => i.image)?.image ?? "",
        url: items[0]?.url ?? "",
        price: total,
      } satisfies CustomerOrder,
    }
  })

  return orders.sort((a, b) => b.at.localeCompare(a.at)).map((o) => o.order)
}

/** The `customer` object for one customer on one creator's website. */
export async function siteCustomer(db: Db, customer: CustomerRow, platform: string): Promise<CustomerObject> {
  const name = (customer.name ?? "").trim()
  const orders = await customerOrders(db, { creatorId: customer.creator_id, email: customer.email }, platform)
  return { name, first_name: firstName(name), email: customer.email, orders, orders_count: orders.length, sample: false }
}
