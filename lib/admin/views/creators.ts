import "server-only"

import { maskEmail } from "@/lib/privacy/mask-email"

import type { AuditRow, CreatorDetailPayload, CreatorRow, CreatorsPayload, OrderRow, PayoutRow } from "../types"
import { Reader, UUID_RE, searchText } from "../platform-metrics"
import { creatorSales } from "../sales"
import { creatorRef, one, refundableCents, stripeState } from "./common"

type CreatorDb = {
  id: string
  user_id: string | null
  slug: string | null
  username: string | null
  display_name: string | null
  created_at: string | null
  store_published: boolean | null
  stripe_account_id: string | null
  charges_enabled: boolean | null
  payouts_enabled: boolean | null
  details_submitted: boolean | null
  stripe_onboarding_status: string | null
  subscription_status: string | null
  banned_at?: string | null
  banned_reason?: string | null
}

const CREATOR_COLUMNS =
  "id, user_id, slug, username, display_name, created_at, store_published, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, stripe_onboarding_status, subscription_status, banned_at, banned_reason"
/* Arrive with supabase/sql/RUN_ADMIN_CONSOLE.sql; the list works without them. */
const BAN_COLUMNS = ["banned_at", "banned_reason"]

export const CREATOR_FILTERS = ["all", "ready", "restricted", "none", "banned"] as const

export async function creators(r: Reader, params: URLSearchParams, page: number): Promise<Omit<CreatorsPayload, "problems" | "notices">> {
  const q = searchText(params.get("q"))
  const filter = (CREATOR_FILTERS as readonly string[]).includes(params.get("filter") ?? "") ? params.get("filter")! : "all"

  const list = await r.page<CreatorDb>(
    "creators",
    "creators",
    CREATOR_COLUMNS,
    (b) => {
      let x = b.order("created_at", { ascending: false })
      if (q) {
        x = UUID_RE.test(q) ? x.or(`id.eq.${q},user_id.eq.${q}`) : x.or(`slug.ilike.%${q}%,username.ilike.%${q}%,display_name.ilike.%${q}%`)
      }
      if (filter === "banned") x = x.not("banned_at", "is", null)
      if (filter === "ready") x = x.eq("charges_enabled", true).eq("payouts_enabled", true)
      /* Connected, but buyers cannot pay them yet. One `not`, not a second
         `or`, so it combines with a search. */
      if (filter === "restricted") x = x.not("stripe_account_id", "is", null).not("charges_enabled", "is", true)
      if (filter === "none") x = x.is("stripe_account_id", null)
      return x
    },
    page,
    { optional: filter === "banned" ? [] : BAN_COLUMNS },
  )

  const ids = (list?.rows ?? []).map((c) => c.id)
  const [sales, products] = await Promise.all([
    ids.length ? creatorSales(r, "sales per creator", { ids }) : Promise.resolve([]),
    ids.length
      ? r.rows<{ creator_id: string }>("published products per creator", "products", "creator_id", (q) => q.in("creator_id", ids).eq("status", "published").limit(10000))
      : Promise.resolve([]),
  ])

  const published = new Map<string, number>()
  for (const p of products ?? []) published.set(p.creator_id, (published.get(p.creator_id) ?? 0) + 1)
  const sold = new Map((sales ?? []).map((s) => [s.creatorId, s]))
  const bansReadable = (list?.rows ?? []).some((c) => "banned_at" in c) || (list?.rows.length ?? 0) === 0

  const rows: CreatorRow[] = (list?.rows ?? []).map((c) => {
    const ref = creatorRef(c)!
    return {
      id: c.id,
      handle: ref.handle,
      name: ref.name,
      joined: c.created_at,
      storePublished: !!c.store_published,
      stripe: stripeState(c),
      plan: c.subscription_status,
      banned: bansReadable ? !!c.banned_at : null,
      published: products ? published.get(c.id) ?? 0 : null,
      orders: sales ? sold.get(c.id)?.orders ?? 0 : null,
      gross: sales ? sold.get(c.id)?.gross ?? 0 : null,
    }
  })

  return { list: list ? { ...list, rows } : null, q, filter }
}

/** Creators by id, for rows whose table has no link PostgREST can embed. */
export async function creatorsById(r: Reader, metric: string, ids: (string | null | undefined)[]): Promise<Map<string, { id: string; handle: string; name: string }>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))]
  const out = new Map<string, { id: string; handle: string; name: string }>()
  if (!unique.length) return out
  const rows = await r.rows<{ id: string; slug: string | null; display_name: string | null }>(metric, "creators", "id, slug, display_name", (q) => q.in("id", unique.slice(0, 200)))
  for (const c of rows ?? []) out.set(c.id, creatorRef(c)!)
  return out
}

export async function creatorDetail(r: Reader, id: string): Promise<Omit<CreatorDetailPayload, "problems" | "notices">> {
  const empty = { creator: null, sales: null, balance: null, products: null, orders: null, payouts: null, sites: null, history: null }
  if (!UUID_RE.test(id)) return empty

  const found = await r.rows<CreatorDb>("creator", "creators", CREATOR_COLUMNS, (q) => q.eq("id", id).limit(1), { optional: BAN_COLUMNS })
  const c = found?.[0]
  if (!c) return empty

  const [profile, sales, ledger, products, payouts, sites, history] = await Promise.all([
    c.user_id
      ? r.rows<{ email: string | null; spam_state: string | null }>("creator account", "profiles", "email, spam_state", (q) => q.eq("id", c.user_id).limit(1))
      : Promise.resolve([]),
    creatorSales(r, "creator sales", { ids: [id] }),
    r.rows<{ pending_amount: number; available_amount: number; in_transit_amount: number; negative_balance: number; lifetime_paid_out: number }>(
      "creator balance", "seller_ledger", "pending_amount, available_amount, in_transit_amount, negative_balance, lifetime_paid_out", (q) => q.eq("creator_id", id).limit(1)),
    r.rows<{ id: string; title: string | null; status: string | null; price_cents: number | null; sales_count: number | null; created_at: string | null }>(
      "creator products", "products", "id, title, status, price_cents, sales_count, created_at", (q) => q.eq("creator_id", id).order("created_at", { ascending: false }).limit(50)),
    r.rows<PayoutDb>("creator payouts", "payouts", PAYOUT_COLUMNS, (q) => q.eq("creator_id", id).order("created_at", { ascending: false }).limit(10)),
    r.rows<{ id: string; name: string | null; slug: string | null; status: string | null; published_at: string | null }>(
      "creator websites", "sites", "id, name, slug, status, published_at", (q) => q.eq("creator_id", id).order("updated_at", { ascending: false }).limit(10)),
    r.rows<AuditDb>("creator history", "admin_actions", AUDIT_COLUMNS, (q) => q.eq("target_type", "creator").eq("target_id", id).order("created_at", { ascending: false }).limit(20)),
  ])

  /* Their orders go through their products: orders has no creator column. */
  const productIds = (products ?? []).map((p) => p.id)
  const orders = productIds.length
    ? await r.rows<OrderDb>("creator orders", "orders", ORDER_COLUMNS, (q) => q.in("product_id", productIds.slice(0, 150)).order("created_at", { ascending: false }).limit(20))
    : []

  const s = sales?.[0]
  const l = ledger?.[0]
  const p = profile?.[0]
  const ref = creatorRef(c)!

  return {
    creator: {
      id: c.id,
      userId: c.user_id,
      handle: ref.handle,
      name: ref.name,
      email: p?.email ? maskEmail(p.email) : null,
      joined: c.created_at,
      storePublished: !!c.store_published,
      stripe: stripeState(c),
      stripeAccount: c.stripe_account_id,
      chargesEnabled: !!c.charges_enabled,
      payoutsEnabled: !!c.payouts_enabled,
      detailsSubmitted: !!c.details_submitted,
      onboarding: c.stripe_onboarding_status,
      plan: c.subscription_status,
      bannedAt: c.banned_at ?? null,
      bannedReason: c.banned_reason ?? null,
      bansReadable: "banned_at" in c,
      spamState: p?.spam_state ?? null,
    },
    sales: sales ? { orders: s?.orders ?? 0, gross: s?.gross ?? 0, fees: s?.fees ?? 0 } : null,
    balance: ledger
      ? {
          pending: l?.pending_amount ?? 0,
          available: l?.available_amount ?? 0,
          inTransit: l?.in_transit_amount ?? 0,
          negative: l?.negative_balance ?? 0,
          paidOut: l?.lifetime_paid_out ?? 0,
        }
      : null,
    products: products
      ? products.map((x) => ({ id: x.id, title: x.title || "Untitled", status: x.status || "draft", price: x.price_cents ?? 0, sales: x.sales_count ?? 0, created: x.created_at }))
      : null,
    orders: orders ? orders.map(toOrderRow) : null,
    payouts: payouts ? payouts.map(toPayoutRow) : null,
    sites: sites ? sites.map((x) => ({ id: x.id, name: x.name || x.slug || "Website", slug: x.slug || "", status: x.status || "draft", publishedAt: x.published_at })) : null,
    history: history ? history.map(toAuditRow) : null,
  }
}

/* ── Rows shared with the orders, payouts and audit views ───────────────── */

export type OrderDb = {
  id: string
  created_at: string | null
  status: string | null
  amount_cents: number | null
  fee_cents: number | null
  currency: string | null
  buyer_email: string | null
  customer_email: string | null
  product_id: string | null
  refund_amount_cents: number | null
  stripe_payment_intent_id: string | null
  payment_method: string | null
  buyer_country: string | null
  product: { id: string; title: string | null; creator: { id: string; slug: string | null; display_name: string | null } | null } | null
}

export const ORDER_COLUMNS =
  "id, created_at, status, amount_cents, fee_cents, currency, buyer_email, customer_email, product_id, refund_amount_cents, stripe_payment_intent_id, payment_method, buyer_country, product:products(id, title, creator:creators(id, slug, display_name))"

export function toOrderRow(o: OrderDb): OrderRow {
  const product = one(o.product)
  const creator = one(product?.creator ?? null)
  const email = o.buyer_email || o.customer_email
  return {
    id: o.id,
    created: o.created_at,
    status: o.status || "pending",
    amount: o.amount_cents ?? 0,
    fee: o.fee_cents ?? 0,
    currency: (o.currency || "usd").toUpperCase(),
    buyer: email ? maskEmail(email) : "No address",
    product: product ? { id: product.id, title: product.title || "Untitled" } : null,
    creator: creator ? { id: creator.id, handle: creator.slug || "" } : null,
    refunded: o.status === "refunded" ? o.refund_amount_cents ?? o.amount_cents ?? 0 : 0,
    refundable: refundableCents(o),
    method: o.payment_method,
    country: o.buyer_country,
  }
}

export type PayoutDb = {
  id: string
  created_at: string | null
  arrival_date: string | null
  status: string | null
  amount_cents: number | null
  currency: string | null
  method: string | null
  failure_message: string | null
  failure_code: string | null
  creator: { id: string; slug: string | null } | { id: string; slug: string | null }[] | null
}

export const PAYOUT_COLUMNS =
  "id, created_at, arrival_date, status, amount_cents, currency, method, failure_message, failure_code, creator:creators(id, slug)"

export function toPayoutRow(p: PayoutDb): PayoutRow {
  const creator = one(p.creator)
  return {
    id: p.id,
    created: p.created_at,
    arrival: p.arrival_date,
    status: p.status || "pending",
    amount: p.amount_cents ?? 0,
    currency: (p.currency || "usd").toUpperCase(),
    method: p.method,
    failure: p.failure_message || p.failure_code || null,
    creator: creator ? { id: creator.id, handle: creator.slug || "" } : null,
  }
}

export type AuditDb = {
  id: string
  created_at: string | null
  action: string
  target_type: string
  target_id: string
  target_label: string | null
  reason: string | null
}

export const AUDIT_COLUMNS = "id, created_at, action, target_type, target_id, target_label, reason"

export function toAuditRow(a: AuditDb): AuditRow {
  return { id: a.id, at: a.created_at, action: a.action, targetType: a.target_type, targetId: a.target_id, label: a.target_label, reason: a.reason }
}
