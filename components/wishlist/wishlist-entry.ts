import { listPrice, usd, type PriceInterval } from "@/lib/pricing/list-price"

/**
 * ===========================================================================
 *  ONE SAVED PRODUCT, AS THE WISHLIST DRAWS IT
 * ===========================================================================
 * The wishlist is read in two places: on the server for the library's tab
 * (app/library/wishlist/load-wishlist.ts), and by /api/wishlist in the
 * browser for a guest's /wishlist and for a refresh. Both rows come here and
 * leave as one shape, so the card never has to know which it was given.
 *
 * Pure, no "use client": the server and the tests call it directly.
 */

export interface WishlistEntry {
  /** The wishlist row. */
  id: string
  productId: string
  title: string
  slug: string | null
  type: string
  priceCents: number
  compareAtCents: number | null
  payWhatYouWant: boolean
  pwywMinCents: number | null
  /** A membership's billing period: "/month" or "/year" after its price. */
  interval: PriceInterval | null
  /** The product has options (product_variants): one is chosen on its page, not here. */
  hasOptions: boolean
  /** Already theirs: the card opens it in the library instead of selling it again. */
  owned: boolean
  thumbnailUrl: string | null
  creator: { name: string; username: string | null; avatarUrl: string | null }
  savedAt: string
}

type Row = {
  id?: string | null
  product_id?: string | null
  created_at?: string | null
  products?: Record<string, unknown> | null
}

export type Plan = { monthly_price_cents?: number | null; yearly_price_cents?: number | null }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)

/** A wishlist row (the server's read or /api/wishlist's), or null for one with no product left. */
export function entryOf(row: Row, extra: { plan?: Plan | null; hasOptions?: boolean; owned?: boolean } = {}): WishlistEntry | null {
  const p = row.products
  if (!p || !str(p.id)) return null
  const type = str(p.type) ?? "digital"
  const profile = (p.creator_profile ?? null) as { display_name?: string | null; username?: string | null; avatar_url?: string | null } | null
  const creators = (p.creators ?? null) as { slug?: string | null } | null
  let priceCents = Math.max(0, num(p.price_cents) ?? 0)
  let interval: WishlistEntry["interval"] = null
  if (type === "membership") {
    const monthly = num(extra.plan?.monthly_price_cents)
    const yearly = num(extra.plan?.yearly_price_cents)
    if (monthly) {
      priceCents = monthly
      interval = "month"
    } else if (yearly) {
      priceCents = yearly
      interval = "year"
    } else {
      /* No plan read: a membership's price is its monthly one (lib/memberships/creator.ts). */
      interval = "month"
    }
  }
  return {
    id: str(row.id) ?? String(p.id),
    productId: String(p.id),
    title: str(p.title) ?? "Untitled product",
    slug: str(p.slug),
    type,
    priceCents,
    compareAtCents: type === "membership" ? null : num(p.compare_at_cents),
    payWhatYouWant: p.pay_what_you_want === true,
    pwywMinCents: num(p.pwyw_min_price_cents),
    interval,
    hasOptions: !!extra.hasOptions,
    owned: !!extra.owned,
    thumbnailUrl: str(p.thumbnail_url),
    creator: {
      name: str(profile?.display_name) ?? str(profile?.username) ?? str(creators?.slug) ?? "Creator",
      username: str(profile?.username) ?? str(creators?.slug),
      avatarUrl: str(profile?.avatar_url),
    },
    savedAt: str(row.created_at) ?? "",
  }
}

export interface EntryPrice {
  main: string
  /** "/month" or "/year" for a membership. */
  per: string | null
  was: string | null
  /** "25% off", only when the compare-at price is higher. */
  sale: string | null
}

/**
 * What the card says its price is: the list price rule every product card
 * uses (lib/pricing/list-price), membership period included, so "$9/month"
 * is written the one way it is written everywhere. The period is only split
 * off so the card can set it smaller than the number.
 */
export function priceOf(e: WishlistEntry): EntryPrice {
  const label = listPrice(
    {
      price_cents: e.priceCents,
      compare_at_cents: e.compareAtCents,
      pay_what_you_want: e.payWhatYouWant,
      pwyw_min_price_cents: e.pwywMinCents,
      type: e.type,
      price_interval: e.interval,
    },
    usd,
  )
  const m = /^(.*)(\/(?:month|year))$/.exec(label.main)
  return { main: m ? m[1] : label.main, per: m ? m[2] : null, was: label.was, sale: label.off ? `${label.off}% off` : null }
}

export type EntryAction = { label: string; kind: "checkout" | "page" | "library"; href: string | null }

/** Where the card's one button goes. */
export function actionOf(e: WishlistEntry): EntryAction {
  if (e.owned) {
    const href = e.type === "course" ? "/library/courses" : e.type === "membership" ? "/library/memberships" : `/library/products/${encodeURIComponent(e.productId)}`
    return { label: "In your library", kind: "library", href }
  }
  const checkout = `/checkout?productId=${encodeURIComponent(e.productId)}`
  if (e.type === "membership") return { label: "Join", kind: "checkout", href: `${checkout}${e.interval ? `&interval=${e.interval}` : ""}` }
  /* A price to choose, or an option to choose: that happens on the product's page. */
  if (e.payWhatYouWant || e.hasOptions) return { label: "View", kind: "page", href: null }
  if (e.priceCents === 0) return { label: "Get it free", kind: "checkout", href: checkout }
  return { label: "Buy", kind: "checkout", href: checkout }
}
