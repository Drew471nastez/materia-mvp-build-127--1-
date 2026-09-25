/**
 * ===========================================================================
 *  WHAT A SIGNED-IN VISITOR SEES ON A CREATOR'S ACCOUNT PAGE
 * ===========================================================================
 * Their name and email, what they bought from THIS creator, and their saved
 * items on this website. Nothing about any other creator, ever: a website is
 * one shop, and the Library on storelib.com is where everything is together.
 *
 * WHAT COUNTS AS BOUGHT is what the Library counts (lib/library/
 * get-library-downloads.ts): an entitlement to a product, or a completed
 * order for one, found by the buyer's account id. Kept to this creator by
 * the product's own `creator_id`, which is where that fact lives (the same
 * reasoning as lib/commerce/has-bought-from-creator.ts).
 *
 * The files themselves stay on storelib.com, behind the session that is
 * there: each purchase links to its page in the Library (a download) or to
 * its receipt (anything else). The website shows that they have it; the
 * platform hands it over.
 *
 * Shaped for the template engine, which is how the account section reads it
 * as `customer`: plain strings and lists, dates already written out, money
 * already formatted, links already absolute. A template has no arithmetic
 * and no dates.
 */

import { formatPrice } from "@/lib/website-builder/shop-products"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CustomerOrder {
  id: string
  title: string
  image: string
  /** The product on this website, or "" when it is no longer for sale. */
  url: string
  /** "Sep 21, 2026". */
  date: string
  /** "Download" for something to download, "Receipt" for anything else. */
  action_label: string
  /** Where that goes, on storelib.com. */
  action_url: string
  price: string
}

export interface CustomerObject {
  name: string
  first_name: string
  email: string
  orders: CustomerOrder[]
  orders_count: number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function day(iso: unknown): string {
  if (typeof iso !== "string") return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ""
}

interface Bought {
  productId: string
  at: string
  orderId: string | null
  receiptToken: string | null
  cents: number | null
}

/**
 * The customer object for one person on one creator's website. `platform`
 * is "https://storelib.com", where the Library and receipts are.
 */
export async function siteCustomer(
  db: Db,
  scope: { userId: string; creatorId: string },
  platform: string,
): Promise<CustomerObject | null> {
  if (!UUID.test(scope.userId) || !UUID.test(scope.creatorId)) return null

  const [profileRes, entRes, orderRes] = await Promise.all([
    db.from("profiles").select("display_name, email, username").eq("id", scope.userId).maybeSingle(),
    db.from("entitlements").select("product_id, created_at").eq("buyer_id", scope.userId).order("created_at", { ascending: false }).limit(200),
    db
      .from("orders")
      .select("id, product_id, created_at, receipt_token, amount_cents")
      .eq("buyer_id", scope.userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(200),
  ]).catch(() => [{ data: null }, { data: null }, { data: null }] as const)

  const profile = (profileRes?.data ?? null) as { display_name?: string | null; email?: string | null; username?: string | null } | null
  const name = (profile?.display_name || profile?.username || "").trim()
  const email = (profile?.email || "").trim().toLowerCase()

  /* One line per product: an order carries its receipt, an entitlement only its date. */
  const byProduct = new Map<string, Bought>()
  for (const o of ((orderRes?.data ?? []) as { id: string; product_id: string; created_at: string; receipt_token?: string | null; amount_cents?: number | null }[])) {
    if (!o?.product_id || byProduct.has(o.product_id)) continue
    byProduct.set(o.product_id, { productId: o.product_id, at: o.created_at, orderId: o.id, receiptToken: o.receipt_token ?? null, cents: typeof o.amount_cents === "number" ? o.amount_cents : null })
  }
  for (const e of ((entRes?.data ?? []) as { product_id: string; created_at: string }[])) {
    if (!e?.product_id || byProduct.has(e.product_id)) continue
    byProduct.set(e.product_id, { productId: e.product_id, at: e.created_at, orderId: null, receiptToken: null, cents: null })
  }

  const ids = [...byProduct.keys()].filter((id) => UUID.test(id))
  let products: { id: string; title: string | null; slug: string | null; thumbnail_url: string | null; type: string | null; status: string | null }[] = []
  if (ids.length > 0) {
    try {
      const { data } = await db
        .from("products")
        .select("id, title, slug, thumbnail_url, type, status")
        .in("id", ids)
        .eq("creator_id", scope.creatorId)
      products = (data ?? []) as typeof products
    } catch {
      products = []
    }
  }

  const orders: CustomerOrder[] = products
    .map((p) => {
      const b = byProduct.get(p.id)!
      const digital = p.type === "digital" || p.type === null
      const action_url = digital
        ? `${platform}/library/products/${encodeURIComponent(p.id)}`
        : b.receiptToken
          ? `${platform}/receipt/${encodeURIComponent(b.receiptToken)}`
          : `${platform}/library`
      return {
        id: p.id,
        title: p.title ?? "",
        image: p.thumbnail_url ?? "",
        url: p.status === "published" && p.slug ? `/products/${p.slug}` : "",
        date: day(b.at),
        action_label: digital ? "Download" : "Receipt",
        action_url,
        price: b.cents === null ? "" : b.cents === 0 ? "Free" : formatPrice(b.cents),
        at: b.at,
      }
    })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map(({ at: _at, ...rest }) => rest)

  return { name, first_name: firstName(name), email, orders, orders_count: orders.length }
}
