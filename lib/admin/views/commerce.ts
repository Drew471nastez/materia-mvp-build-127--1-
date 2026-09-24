import "server-only"

import { REVIEW_SCORE, scoreHandle } from "@/lib/security/spam-signals"

import type { LedgerRow, OrdersPayload, PayoutsPayload, ProductRow, ProductsPayload } from "../types"
import { PAGE_SIZE, Reader, UUID_RE, isoDaysAgo, searchText } from "../platform-metrics"
import { orderTotals } from "../sales"
import { creatorRef, one } from "./common"
import { ORDER_COLUMNS, PAYOUT_COLUMNS, creatorsById, toOrderRow, toPayoutRow, type OrderDb, type PayoutDb } from "./creators"

/* ── Products ─────────────────────────────────────────────────────────── */

type ProductDb = {
  id: string
  title: string | null
  slug: string | null
  status: string | null
  archived: boolean | null
  type: string | null
  price_cents: number | null
  sales_count: number | null
  created_at: string | null
  creator: { id: string; slug: string | null; display_name: string | null } | null
}

const PRODUCT_COLUMNS = "id, title, slug, status, archived, type, price_cents, sales_count, created_at, creator:creators(id, slug, display_name)"

export const PRODUCT_FILTERS = ["all", "published", "draft", "unpublished", "flagged"] as const

/** How many of the newest products the flagged view scores. */
export const FLAG_SCAN = 600

/**
 * The spam signals from lib/security/spam-signals, applied to a product:
 * its title, and the handle of the creator selling it. A link farm names
 * both the same way, so either one can carry the score.
 */
export function productFlag(title: string | null, handle: string | null): { score: number; reasons: string[] } | null {
  const byTitle = scoreHandle(title)
  const byHandle = scoreHandle(handle)
  const score = Math.max(byTitle.score, byHandle.score)
  if (score < REVIEW_SCORE) return null
  const reasons = [
    ...byTitle.signals.map((s) => `title ${s.detail}`),
    ...byHandle.signals.map((s) => `seller handle ${s.detail}`),
  ]
  return { score, reasons: [...new Set(reasons)].slice(0, 4) }
}

function toProductRow(p: ProductDb): ProductRow {
  const creator = creatorRef(one(p.creator))
  return {
    id: p.id,
    title: p.title || "Untitled",
    slug: p.slug || "",
    status: p.status || "draft",
    archived: !!p.archived,
    type: p.type,
    price: p.price_cents ?? 0,
    created: p.created_at,
    creator,
    sales: p.sales_count ?? 0,
    flag: productFlag(p.title, creator?.handle ?? null),
  }
}

export async function products(r: Reader, params: URLSearchParams, page: number): Promise<Omit<ProductsPayload, "problems" | "notices">> {
  const q = searchText(params.get("q"))
  const filter = (PRODUCT_FILTERS as readonly string[]).includes(params.get("filter") ?? "") ? params.get("filter")! : "all"

  const shape = (b: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    let x = b.order("created_at", { ascending: false })
    if (q) x = UUID_RE.test(q) ? x.or(`id.eq.${q},creator_id.eq.${q}`) : x.or(`title.ilike.%${q}%,slug.ilike.%${q}%`)
    if (filter === "published" || filter === "draft" || filter === "unpublished") x = x.eq("status", filter)
    return x
  }

  if (filter !== "flagged") {
    const list = await r.page<ProductDb>("products", "products", PRODUCT_COLUMNS, shape, page)
    return { list: list ? { ...list, rows: list.rows.map(toProductRow) } : null, q, filter, scanned: null }
  }

  /*
    Flagged is a score computed here, not a column, so it cannot be a
    filter in the query. The newest products are scored instead, a bounded
    number of them, and the view says how many were looked at.
  */
  const recent = await r.rows<ProductDb>("flagged products", "products", PRODUCT_COLUMNS, (b) => shape(b).limit(FLAG_SCAN))
  if (!recent) return { list: null, q, filter, scanned: null }
  const flagged = recent.map(toProductRow).filter((p) => p.flag).sort((a, b) => (b.flag!.score - a.flag!.score))
  const current = Math.max(1, page)
  return {
    list: {
      rows: flagged.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
      total: flagged.length,
      page: current,
      pages: Math.max(1, Math.ceil(flagged.length / PAGE_SIZE)),
    },
    q,
    filter,
    scanned: recent.length,
  }
}

/* ── Orders & payments ────────────────────────────────────────────────── */

export const ORDER_FILTERS = ["all", "completed", "pending", "failed", "refunded", "disputed"] as const

export async function orders(r: Reader, params: URLSearchParams, page: number): Promise<Omit<OrdersPayload, "problems" | "notices">> {
  const raw = (params.get("q") ?? "").trim().slice(0, 120)
  const filter = (ORDER_FILTERS as readonly string[]).includes(params.get("filter") ?? "") ? params.get("filter")! : "all"

  /*
    Search is exact, on purpose. An order is found by its id, by the Stripe
    payment or session it came from, or by the buyer's whole address. A
    partial match on addresses would turn this box into a way to list
    people's emails a letter at a time, and the list shows them masked.
  */
  const list = await r.page<OrderDb>(
    "orders",
    "orders",
    ORDER_COLUMNS,
    (b) => {
      let x = b.order("created_at", { ascending: false })
      if (raw) {
        if (UUID_RE.test(raw)) x = x.eq("id", raw)
        else if (/^pi_[A-Za-z0-9]+$/.test(raw)) x = x.eq("stripe_payment_intent_id", raw)
        else if (/^cs_[A-Za-z0-9_]+$/.test(raw)) x = x.eq("stripe_session_id", raw)
        else if (/^[^\s@,()]+@[^\s@,()]+\.[^\s@,()]+$/.test(raw)) {
          const email = raw.toLowerCase()
          x = x.or(`buyer_email.ilike.${email},customer_email.ilike.${email}`)
        } else x = x.eq("id", "00000000-0000-0000-0000-000000000000")
      }
      if (filter !== "all") x = x.eq("status", filter)
      return x
    },
    page,
  )

  const totals = await orderTotals(r, "orders by status", isoDaysAgo(30))
  return {
    list: list ? { ...list, rows: list.rows.map(toOrderRow) } : null,
    q: raw,
    filter,
    statuses: totals ? totals.totals.map((t) => ({ status: t.status, orders: t.orders, gross: t.gross })).sort((a, b) => b.orders - a.orders) : null,
  }
}

/* ── Payouts & ledger ─────────────────────────────────────────────────── */

export const PAYOUT_FILTERS = ["all", "paid", "pending", "in_transit", "failed", "canceled"] as const

export async function payouts(r: Reader, params: URLSearchParams, page: number): Promise<Omit<PayoutsPayload, "problems" | "notices">> {
  const filter = (PAYOUT_FILTERS as readonly string[]).includes(params.get("filter") ?? "") ? params.get("filter")! : "all"

  const [list, ledgers, holds, overdue, events] = await Promise.all([
    r.page<PayoutDb>("payouts", "payouts", PAYOUT_COLUMNS, (b) => {
      const x = b.order("created_at", { ascending: false })
      return filter === "all" ? x : x.eq("status", filter)
    }, page),
    r.rows<{ creator_id: string; pending_amount: number | null; available_amount: number | null; in_transit_amount: number | null; negative_balance: number | null }>(
      "balances", "seller_ledger", "creator_id, pending_amount, available_amount, in_transit_amount, negative_balance", (q) => q.limit(5000)),
    r.rows<{ net_seller_cents: number | null; amount_cents: number | null }>(
      "holds", "ledger_events", "net_seller_cents, amount_cents", (q) => q.eq("event_type", "sale").is("released_at", null).limit(10000)),
    r.count("overdue holds", "ledger_events", (q) => q.eq("event_type", "sale").is("released_at", null).lt("hold_until", isoDaysAgo(2))),
    r.rows<{ id: string; created_at: string | null; event_type: string; amount_cents: number | null; creator_id: string | null; description: string | null }>(
      "ledger", "ledger_events", "id, created_at, event_type, amount_cents, creator_id, description", (q) => q.order("created_at", { ascending: false }).limit(20)),
  ])

  const negativeRows = (ledgers ?? []).filter((l) => (l.negative_balance ?? 0) > 0).sort((a, b) => (b.negative_balance ?? 0) - (a.negative_balance ?? 0)).slice(0, 10)
  const names = await creatorsById(r, "ledger creators", [...negativeRows.map((l) => l.creator_id), ...(events ?? []).map((e) => e.creator_id)])
  const ref = (id: string | null) => (id && names.get(id) ? { id, handle: names.get(id)!.handle } : id ? { id, handle: "" } : null)

  const sum = (k: "pending_amount" | "available_amount" | "in_transit_amount" | "negative_balance") =>
    (ledgers ?? []).reduce((t, l) => t + (l[k] ?? 0), 0)

  const ledger: LedgerRow[] | null = events
    ? events.map((e) => ({ id: e.id, created: e.created_at, type: e.event_type, amount: e.amount_cents ?? 0, creator: ref(e.creator_id), description: e.description }))
    : null

  return {
    list: list ? { ...list, rows: list.rows.map(toPayoutRow) } : null,
    filter,
    balances: ledgers
      ? { pending: sum("pending_amount"), available: sum("available_amount"), inTransit: sum("in_transit_amount"), negative: sum("negative_balance"), ledgers: ledgers.length, partial: ledgers.length >= 5000 }
      : null,
    holds: holds && overdue !== null
      ? { count: holds.length, cents: holds.reduce((t, h) => t + (h.net_seller_cents ?? h.amount_cents ?? 0), 0), overdue }
      : null,
    negative: ledgers ? negativeRows.map((l) => ({ creator: ref(l.creator_id), cents: l.negative_balance ?? 0 })) : null,
    ledger,
  }
}
