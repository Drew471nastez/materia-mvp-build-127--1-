/**
 * A PRODUCT'S FACTS FOR THE SHEET AND THE CHECKOUT (round 63), on their own: one read per page view, shared.
 * Split out of ./instant-checkout so a OnePage's product sheet can read them without downloading the
 * checkout window and its words; ./instant-checkout re-exports both names.
 */
import type { CheckoutTax } from "@/lib/tax/rules"
import type { PersonalizationField } from "@/lib/products/personalization"
import type { SizeChart } from "@/lib/size-charts/model"

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
  }
  seller: { name: string; avatarUrl: string | null }
  checkout: { instant: boolean; reason: string | null; url: string; tax: CheckoutTax | null; marketingOptIn: boolean; lastNameRequired: boolean }
  buyer: { email: string; name: string; owned: boolean; ownedVariants: string[]; library: string } | null
}

/** One read of a product's facts per page view, shared by the sheet and the window. */
const factsCache = new Map<string, Promise<ProductFacts>>()
export function loadProductFacts(productId: string, fresh = false): Promise<ProductFacts> {
  const had = factsCache.get(productId)
  if (had && !fresh) return had
  const read = fetch(`/api/onepage/product?id=${encodeURIComponent(productId)}`, { cache: "no-store" }).then(async (r) => {
    const data = (await r.json().catch(() => ({}))) as ProductFacts & { error?: string }
    if (!r.ok || !data.product) throw new Error(data.error || "This product is not for sale right now.")
    return data
  })
  read.catch(() => factsCache.delete(productId))
  factsCache.set(productId, read)
  return read
}
