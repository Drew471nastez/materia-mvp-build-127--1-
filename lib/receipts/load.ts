import "server-only"

/**
 * ===========================================================================
 *  READING A RECEIPT
 * ===========================================================================
 * One function, used by the receipt page, the receipt email and the resend
 * route, so the three always describe the same payment the same way. The
 * flow it sits in is written out at the top of lib/receipts/rules.ts.
 *
 * BY TOKEN, NEVER BY ID. The row is found by its receipt_token, compared by
 * the database. An order id is not a credential and nothing here accepts one.
 *
 * A BASKET IS ONE RECEIPT. Rows that share the opening row's
 * stripe_session_id AND its buyer email are the same payment and are shown
 * together. Requiring the email as well means a session id that somehow ended
 * up on two buyers' rows still cannot show one buyer the other's items.
 *
 * COLUMNS ARE NAMED, WITH A FALLBACK. Every read names what it needs, so a
 * new sensitive column is never sent anywhere by accident. Some columns were
 * added by later migrations (variant_name, refund_amount_cents, ...); when a
 * database is missing one, the named select fails, and the read is retried
 * as "*" and picked apart here, so an older database still gets its receipt.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import {
  accessStateOf,
  filesForVariant,
  isPlausibleToken,
  lineMoney,
  maskAddress,
  normaliseCurrency,
  orderNumberOf,
  overallState,
  refundPolicyOf,
  sumMoney,
} from "./rules"
import type { ReceiptFile, ReceiptItem, ReceiptView } from "./view"
import { buyerProperties, lineProperties } from "@/lib/physical/cart-link"
import { offersOfSnapshot } from "@/lib/offers/snapshot"

const ORDER_COLUMNS = [
  "id",
  "product_id",
  "variant_id",
  "variant_name",
  "amount_cents",
  "tip_cents",
  "currency",
  "status",
  "created_at",
  "receipt_token",
  "stripe_session_id",
  "buyer_id",
  "buyer_email",
  "buyer_first_name",
  "buyer_notified_at",
  "buyer_email_last_error",
  "refund_amount_cents",
  "refunded_at",
  "payment_method",
  "card_brand",
  "card_last4",
  "stripe_payment_intent_id",
] as const

type OrderRow = Partial<Record<(typeof ORDER_COLUMNS)[number], any>> & { id: string; product_id: string }

function pick(row: Record<string, any>): OrderRow {
  const out: Record<string, any> = {}
  for (const c of ORDER_COLUMNS) out[c] = row[c] ?? null
  return out as OrderRow
}

async function readOrders(
  admin: SupabaseClient,
  apply: (q: any) => any,
): Promise<OrderRow[] | null> {
  const named = await apply(admin.from("orders").select(ORDER_COLUMNS.join(", ")))
  if (!named.error) return ((named.data ?? []) as any[]).map(pick)
  const loose = await apply(admin.from("orders").select("*"))
  if (loose.error) {
    console.error("[receipts] order read failed:", loose.error.message)
    return null
  }
  return ((loose.data ?? []) as any[]).map(pick)
}

/**
 * Settings › Taxes: the tax inside each order (SQL part 110 `tax_cents`) and
 * whether it was part of the price (part 129 `tax_included`). Its own read,
 * so a database without either column shows the receipt as before, with no
 * tax line.
 */
async function readTax(admin: SupabaseClient, ids: string[]): Promise<Map<string, { cents: number; included: boolean; label: string | null }>> {
  const out = new Map<string, { cents: number; included: boolean; label: string | null }>()
  if (ids.length === 0) return out
  try {
    /* With its name ("VAT 19%", part 153) where the column is there; without it, then without part 129's either. */
    let res = await admin.from("orders").select("id, tax_cents, tax_included, tax_label").in("id", ids)
    if (res.error) res = (await admin.from("orders").select("id, tax_cents, tax_included").in("id", ids)) as typeof res
    if (res.error) res = (await admin.from("orders").select("id, tax_cents").in("id", ids)) as typeof res
    if (res.error) return out
    for (const r of (res.data ?? []) as { id: string; tax_cents?: number | null; tax_included?: boolean | null; tax_label?: string | null }[]) {
      const cents = Math.max(0, Math.round(Number(r.tax_cents) || 0))
      if (cents > 0) out.set(r.id, { cents, included: r.tax_included === true, label: typeof r.tax_label === "string" && r.tax_label.trim() ? r.tax_label.trim().slice(0, 80) : null })
    }
  } catch {
    /* No tax line. */
  }
  return out
}

/**
 * What each line's snapshot keeps of the checkout (orders.product_snapshot):
 * the store's offers that saved on it, by the name the checkout showed, and
 * the properties the buyer is shown (a name starting with "_" is the
 * theme's own). Its own read, so a receipt is never stopped by it.
 */
async function readSnapshots(admin: SupabaseClient, ids: string[]): Promise<Map<string, { offers?: { title: string; cents: number }[]; properties?: [string, string][] }>> {
  const out = new Map<string, { offers?: { title: string; cents: number }[]; properties?: [string, string][] }>()
  if (ids.length === 0) return out
  try {
    const { data, error } = await admin.from("orders").select("id, product_snapshot").in("id", ids)
    if (error) return out
    for (const r of (data ?? []) as { id: string; product_snapshot?: { offers?: unknown; properties?: unknown } | null }[]) {
      const offers = (offersOfSnapshot(r.product_snapshot?.offers) ?? []).map((o) => ({ title: o.title, cents: o.savedCents }))
      const properties = buyerProperties(lineProperties(r.product_snapshot?.properties))
      if (offers.length || properties.length) out.set(r.id, { ...(offers.length ? { offers } : {}), ...(properties.length ? { properties } : {}) })
    }
  } catch {
    /* The lines as charged, without their offers' names. */
  }
  return out
}

export interface LoadedReceipt {
  view: ReceiptView
  /** Kept on the server: whose account each line is on. */
  buyerIds: string[]
}

export async function loadReceiptByToken(admin: SupabaseClient, token: string): Promise<LoadedReceipt | null> {
  if (!isPlausibleToken(token)) return null

  const opened = await readOrders(admin, (q) => q.eq("receipt_token", token).limit(1))
  const first = opened?.[0]
  if (!first) return null

  /* The rest of the same payment. */
  let rows: OrderRow[] = [first]
  const session = typeof first.stripe_session_id === "string" ? first.stripe_session_id : ""
  if (session) {
    const siblings = await readOrders(admin, (q) => q.eq("stripe_session_id", session).limit(50))
    const email = (first.buyer_email ?? "").toString().trim().toLowerCase()
    const same = (siblings ?? []).filter(
      (r) => (r.buyer_email ?? "").toString().trim().toLowerCase() === email && isPlausibleToken(r.receipt_token),
    )
    if (same.some((r) => r.id === first.id)) rows = same
  }
  rows.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))

  const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))]
  const variantIds = [...new Set(rows.map((r) => r.variant_id).filter(Boolean) as string[])]

  const [productsRes, assetsRes, mappingRes, variantsRes, policiesRes, taxOf] = await Promise.all([
    admin.from("products").select("id, title, slug, thumbnail_url, type, creator_id").in("id", productIds),
    admin
      .from("digital_assets")
      /* Whole rows: upload_status arrived in a later migration. */
      .select("*")
      .in("product_id", productIds)
      .order("created_at", { ascending: true }),
    variantIds.length > 0
      ? admin.from("product_variant_files").select("variant_id, digital_asset_id").in("variant_id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length > 0
      ? admin.from("product_variants").select("id, name").in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    /* Its own read: the refund policy columns came later, and a database
       without them must still show the receipt, only without the policy. */
    admin
      .from("products")
      .select("id, refund_policy_enabled, refund_policy_type, refund_policy_fine_print")
      .in("id", productIds),
    readTax(admin, rows.map((r) => r.id)),
  ])
  const [snapshots, opensCommunities] = await Promise.all([readSnapshots(admin, rows.map((r) => r.id)), communitiesOpenedBy(admin, rows.filter((r) => accessStateOf(r) === "open").map((r) => r.product_id))])

  const products = new Map<string, any>(((productsRes as any).data ?? []).map((p: any) => [p.id, p]))
  const filesByProduct = new Map<string, Array<ReceiptFile & { productId: string }>>()
  for (const a of ((assetsRes as any).data ?? []) as any[]) {
    /* A file still uploading, or whose upload failed, has nothing to download yet. */
    if (typeof a.upload_status === "string" && a.upload_status !== "completed") continue
    const list = filesByProduct.get(a.product_id) ?? []
    list.push({ id: a.id, name: a.file_name || "File", sizeBytes: typeof a.file_size === "number" ? a.file_size : null, productId: a.product_id })
    filesByProduct.set(a.product_id, list)
  }
  const mapped = new Map<string, string[]>()
  for (const m of ((mappingRes as any).data ?? []) as any[]) {
    const list = mapped.get(m.variant_id) ?? []
    if (m.digital_asset_id) list.push(m.digital_asset_id)
    mapped.set(m.variant_id, list)
  }
  const policies = new Map<string, any>(((policiesRes as any)?.error ? [] : ((policiesRes as any)?.data ?? [])).map((p: any) => [p.id, p]))
  const variantNames = new Map<string, string>(((variantsRes as any).data ?? []).map((v: any) => [v.id, v.name]))
  /* The download route refuses a variant's files when this map cannot be
     read (lib/receipts/download-access fails closed), so the receipt does
     not list them either: a Download button that can only say no is worse
     than none. A missing table (42P01) means no variant restricts anything. */
  const mappingError = (mappingRes as any).error as { code?: string } | null
  const mappingUnknown = !!mappingError && mappingError.code !== "42P01"

  /*
    A MEMBERSHIP'S LINE SAYS WHAT IT IS PER. The charge is one period of a
    membership, so the receipt writes "$9.00/month", never a bare "$9.00"
    that reads as a one-off. The interval is the membership's own (the plan
    it was joined on), found through the invoice that made the order; where
    that cannot be read the line says "/month", as the product row's price is.
  */
  const intervals = new Map<string, "month" | "year">()
  const membershipOrders = rows.filter((r) => products.get(r.product_id)?.type === "membership").map((r) => r.id)
  if (membershipOrders.length > 0) {
    try {
      const { data: invoices } = await admin.from("membership_invoices").select("order_id, membership_id").in("order_id", membershipOrders)
      const byMembership = new Map<string, string>(((invoices as { order_id: string; membership_id: string }[] | null) ?? []).map((i) => [i.membership_id, i.order_id]))
      if (byMembership.size > 0) {
        const { data: members } = await admin.from("memberships").select("id, billing_interval").in("id", [...byMembership.keys()])
        for (const m of (members as { id: string; billing_interval: string }[] | null) ?? []) {
          const orderId = byMembership.get(m.id)
          if (orderId) intervals.set(orderId, m.billing_interval === "year" ? "year" : "month")
        }
      }
    } catch {
      /* "/month" stands. */
    }
  }

  const items: ReceiptItem[] = rows.map((r) => {
    const product = products.get(r.product_id)
    const state = accessStateOf(r)
    const money = lineMoney(r)
    /* Tax added on top is in the amount: the line shows its price, the tax has its own row below. */
    const lineTax = taxOf.get(r.id)
    if (lineTax && !lineTax.included) money.subtotalCents = Math.max(0, money.subtotalCents - lineTax.cents)
    const all = filesByProduct.get(r.product_id) ?? []
    const files =
      state === "open" && !(mappingUnknown && r.variant_id)
        ? filesForVariant(all, r.variant_id ? mapped.get(r.variant_id) : null).map(({ id, name, sizeBytes }) => ({ id, name, sizeBytes }))
        : []
    const type = product?.type ?? null
    return {
      orderId: r.id,
      token: r.receipt_token as string,
      productId: r.product_id,
      title: product?.title || "Your purchase",
      slug: product?.slug ?? null,
      thumbnailUrl: product?.thumbnail_url ?? null,
      type,
      variantName: (r.variant_name as string) || (r.variant_id ? variantNames.get(r.variant_id) ?? null : null),
      state,
      subtotalCents: money.subtotalCents,
      tipCents: money.tipCents,
      totalCents: money.totalCents,
      refundedCents: money.refundedCents,
      refundedAt: (r.refunded_at as string) ?? null,
      files,
      courseHref: state === "open" && type === "course" ? `/account/library/courses/${r.product_id}` : null,
      ...(state === "open" && opensCommunities.get(r.product_id)?.length ? { communities: opensCommunities.get(r.product_id) } : {}),
      priceInterval: type === "membership" ? intervals.get(r.id) ?? "month" : null,
      refundPolicy: refundPolicyOf(policies.get(r.product_id)),
      ...(snapshots.get(r.id) ?? {}),
    }
  })

  /* The seller, from the first product. A basket is always one seller. */
  let seller: ReceiptView["seller"] = { name: "the seller", username: null, avatarUrl: null, supportEmail: null }
  const creatorId = products.get(rows[0].product_id)?.creator_id
  if (creatorId) {
    const { data: creator } = await admin.from("creators").select("id, slug, user_id").eq("id", creatorId).maybeSingle()
    if (creator?.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", creator.user_id)
        .maybeSingle()
      seller = {
        name: (profile?.display_name || profile?.username || creator.slug || "the seller").toString().trim(),
        username: profile?.username || creator.slug || null,
        avatarUrl: profile?.avatar_url || null,
        supportEmail: null,
      }
    }
    /* The store as Settings › Store details names it: its name over the person's, its logo (else the website's, else the photo), and the business behind it for the legal lines. */
    try {
      const { storeIdentity } = await import("@/lib/store/identity-server")
      const store = await storeIdentity(admin, creatorId, { logoOnly: true })
      seller = { ...seller, name: store.name || seller.name, avatarUrl: store.logoUrl ?? seller.avatarUrl, avatarKind: store.logoUrl && store.logoFrom !== "profile" ? "logo" : "photo", legal: store.legal }
    } catch {
      /* The person's own name and photo, as before. */
    }
    /* The address the seller set for buyers to write to, and only that one:
       never the email they sign in with. A separate read, because a
       database without the column must still show the receipt. */
    const { data: support, error: supportError } = await admin
      .from("creators")
      .select("support_email")
      .eq("id", creatorId)
      .maybeSingle()
    const address = !supportError ? String(support?.support_email ?? "").trim() : ""
    if (/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/.test(address) && address.length <= 254) seller.supportEmail = address
  }

  const totals = sumMoney(rows)
  const taxCents = [...taxOf.values()].reduce((n, t) => n + t.cents, 0)
  const taxIncluded = taxCents > 0 && [...taxOf.values()].every((t) => t.included)
  const labels = [...new Set([...taxOf.values()].map((t) => t.label).filter(Boolean))]
  if (taxCents > 0 && !taxIncluded) totals.subtotalCents = Math.max(0, totals.subtotalCents - taxCents)
  const sent = rows.some((r) => !!r.buyer_notified_at)
  const failed = !sent && rows.some((r) => (r.buyer_email_last_error ?? "").toString().trim() !== "")

  const view: ReceiptView = {
    number: orderNumberOf(rows[0].id),
    createdAt: String(rows[0].created_at ?? new Date(0).toISOString()),
    currency: normaliseCurrency(rows[0].currency),
    currencyKnown: /^[a-z]{3}$/i.test(String(rows[0].currency ?? "").trim()),
    state: overallState(items.map((i) => i.state)),
    items,
    ...totals,
    taxCents,
    taxIncluded,
    taxLabel: taxCents > 0 ? (labels.length === 1 ? labels[0] : "Tax") : null,
    payment: {
      method: (first.payment_method as string) ?? null,
      brand: (first.card_brand as string) ?? null,
      last4: (first.card_last4 as string) ?? null,
    },
    seller,
    buyer: {
      firstName: ((first.buyer_first_name as string) || "").trim() || null,
      maskedEmail: maskAddress(first.buyer_email as string),
      email: sent ? "sent" : failed ? "failed" : "unknown",
      unclaimed: rows.some((r) => !r.buyer_id),
    },
    primary: { orderId: first.id, token },
    /* A card payment has an invoice to download (/api/checkout/invoice),
       a basket's included: the invoice lists every row of the payment. */
    invoice: totals.totalCents > 0 && !!rows[0].stripe_payment_intent_id,
  }

  return { view, buyerIds: [...new Set(rows.map((r) => r.buyer_id).filter(Boolean) as string[])] }
}

/**
 * THE COMMUNITIES A PURCHASE OPENS (community_access_products), by product:
 * a course or a download the creator named in a community's access lets its
 * buyer in when it is paid (lib/communities/server/payment-hooks), and the
 * receipt is where the buyer learns it. Published communities only, by name
 * and address. Never throws: a database without communities has none.
 */
async function communitiesOpenedBy(admin: SupabaseClient, productIds: string[]): Promise<Map<string, { name: string; slug: string }[]>> {
  const out = new Map<string, { name: string; slug: string }[]>()
  const ids = [...new Set(productIds.filter(Boolean))]
  if (ids.length === 0) return out
  try {
    const { data: links, error } = await admin.from("community_access_products").select("community_id, product_id").in("product_id", ids)
    const rows = (error ? [] : (links ?? [])) as { community_id: string; product_id: string }[]
    if (rows.length === 0) return out
    const { data: communities, error: cError } = await admin.from("communities").select("id, name, slug, status").in("id", [...new Set(rows.map((l) => l.community_id))])
    if (cError) return out
    const byId = new Map<string, { name: string; slug: string }>()
    for (const c of (communities ?? []) as { id: string; name?: string | null; slug?: unknown; status?: unknown }[]) {
      if (c.status === "published" && typeof c.slug === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(c.slug)) byId.set(c.id, { name: String(c.name || c.slug).slice(0, 120), slug: c.slug })
    }
    for (const l of rows) {
      const c = byId.get(l.community_id)
      if (!c) continue
      const list = out.get(l.product_id) ?? []
      if (!list.some((x) => x.slug === c.slug)) list.push(c)
      out.set(l.product_id, list)
    }
  } catch {
    /* None shown. */
  }
  return out
}
