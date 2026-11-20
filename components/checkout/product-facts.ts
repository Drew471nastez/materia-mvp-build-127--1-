/**
 * A PRODUCT'S FACTS FOR THE SHEET AND THE CHECKOUT (round 63), on their own: one read per page view, shared.
 * Split out of ./instant-checkout so a OnePage's product sheet can read them without downloading the
 * checkout window and its words; ./instant-checkout re-exports both names.
 */
import type { CheckoutTax } from "@/lib/tax/rules"
import type { PersonalizationField } from "@/lib/products/personalization"
import type { SizeChart } from "@/lib/size-charts/model"
import type { SheetReviews } from "@/lib/onepage/product-rating"

export interface ProductFacts {
  product: {
    id: string
    title: string
    slug: string | null
    type: string | null
    descriptionHtml: string
    priceCents: number
    compareAtCents: number | null
    pwyw: boolean
    pwywMinCents: number
    currency: string
    images: string[]
    variants: {
      id: string
      name: string
      description: string | null
      priceCents: number
      pwyw: boolean
      /* Round 43, a product that ships (app/api/onepage/product): its option values, picture, sale price and stock. */
      options?: (string | null)[]
      imageUrl?: string | null
      compareAtCents?: number | null
      available?: boolean
      left?: number | null
      maxQuantity?: number
    }[]
    soldOut: boolean
    left: number | null
    pageUrl: string
    ships: boolean
    /** Round 41: the shop a product that ships is checked out from, and the most one order may hold (null: no limit). */
    shopId?: string
    /** Round 49: the store's website, whose checkout a product that ships is paid on (lib/onepage/shipped-checkout); null when it has none. */
    siteOrigin?: string | null
    maxQuantity?: number | null
    /** Round 13: the product's own questions, plain text (lib/products/product-faqs.ts). */
    faqs?: { question: string; answer: string }[]
    /** Round 13: the size chart it shows (lib/size-charts/storefront.ts), or null. */
    sizeChart?: SizeChart | null
    /** Round 43: Size, Colour and the rest, with the seller's own swatches (lib/products/option-swatches). Empty when the product has none. */
    options?: { name: string; values: string[]; swatches?: Record<string, string> }[]
    /** Round 43: what the buyer is asked to write or upload (lib/products/personalization). */
    personalization?: PersonalizationField[]
    /** Storelib Reviews: the rating, the newest few and where all of them are (lib/onepage/product-rating). Null with the app off or no review. */
    reviews?: SheetReviews | null
  }
  seller: { name: string; avatarUrl: string | null }
  checkout: { instant: boolean; reason: string | null; url: string; tax: CheckoutTax | null; marketingOptIn: boolean; lastNameRequired: boolean }
  buyer: { email: string; name: string; owned: boolean; ownedVariants: string[]; library: string } | null
}

/**
 * How old a read of the facts may be and still count as the checkout window's own fresh one: the read the block starts
 * on the finger going down (components/onepage/product-block) is a few hundred milliseconds old when the window asks.
 */
export const FACTS_FRESH_MS = 4000

/** One read of a product's facts per page view, shared by the sheet and the window. */
const factsCache = new Map<string, { read: Promise<ProductFacts>; at: number }>()
/** The last answer each product's read gave, kept so a window can draw it on its first frame. */
const settled = new Map<string, ProductFacts>()

/**
 * A READ THE TAP ALREADY STARTED IS FRESH ENOUGH (the owner, on a phone: "smoother, not laggy"). The checkout window
 * asks for the facts again when it opens (who is buying, what they own), and that second read was a whole round trip
 * of skeleton after every tap, even when the block had read them a moment earlier. `fresh` is now either `true`
 * (always a new read) or a number of milliseconds: a read started within that long ago, answered or on its way, is
 * the fresh one. The block starts it on the finger going down (components/onepage/product-block), so the window
 * opening a moment later shares it.
 */
export function loadProductFacts(productId: string, fresh: boolean | number = false): Promise<ProductFacts> {
  const had = factsCache.get(productId)
  if (had && (fresh === false || (typeof fresh === "number" && Date.now() - had.at <= fresh))) return had.read
  const read = fetch(`/api/onepage/product?id=${encodeURIComponent(productId)}`, { cache: "no-store" }).then(async (r) => {
    const data = (await r.json().catch(() => ({}))) as ProductFacts & { error?: string }
    if (!r.ok || !data.product) throw new Error(data.error || "This product is not for sale right now.")
    settled.set(productId, data)
    return data
  })
  read.catch(() => {
    if (factsCache.get(productId)?.read === read) factsCache.delete(productId)
  })
  factsCache.set(productId, { read, at: Date.now() })
  return read
}

/**
 * The facts the last read answered, at once, or null. The checkout window draws its fields from these on its first
 * frame while its own fresh read is on the way, so a tap never opens onto a skeleton when the page already knows the
 * product; the fresh answer then replaces them (it only differs when the price or the buyer changed meanwhile).
 */
export function peekProductFacts(productId: string): ProductFacts | null {
  return settled.get(productId) ?? null
}
