"use client"

/**
 * A FEATURED PRODUCT'S OFFERS, ON STORELIB'S OWN SECTIONS: Featured products
 * (themes/default/sections/product_featured.storelib, a card per product)
 * and Product spotlight (product_spotlight.storelib, one product with a
 * button straight to checkout). Drawn into the section's mark by
 * components/website-builder/sections/offer-islands.tsx, on the live page and
 * on the builder's canvas.
 *
 * The same pieces and the same figures as the product page's Bundles and
 * upsells block (components/website-builder/sections/renderers/product/
 * offers-block.tsx): GET /api/offers for the product, the tiers by
 * QuantityBreaks and the set and the upsell by BundleOffers, converted into
 * the visitor's market by the checkout's own arithmetic (chargedInMarket).
 * Neither section has a buy box, so:
 *
 *   quantity break   the tiers are priced at the product's default option
 *                    (lib/offers/offers-public.ts PublicBreak.priceCents, what
 *                    the server priced them at); picking one sets how many
 *                    Add to cart under them puts in the website's cart
 *   bundle           Add all to cart puts the set in, this product at that
 *                    same option
 *   upsell           Add puts it in
 *
 * The cart and the checkout then price the lines again on the server and say
 * the same saving. Its colours are the section's scheme (the `--s-*`
 * variables every Storelib section sets on its root), so it sits in the
 * section as the section's own.
 */
import { useMemo, useState } from "react"
import { BundleOffers, useProductOffers, type BundleCard } from "./bundle-offers"
import { QuantityBreaks, type BreakCard } from "./quantity-breaks"
import { fillWords, tierNameIn } from "@/lib/offers/pricing"
import { useMoney, useStorefront, useWord } from "@/components/website-builder/theme/storefront-context"
import { useSiteCart } from "@/components/website-builder/site-cart"
import type { CartLine } from "@/lib/website-builder/cart"

/** The section's scheme, as every Storelib section's root sets it. */
const SCHEME = {
  heading: "var(--s-heading)",
  text: "var(--s-text)",
  price: "var(--s-heading)",
  border: "var(--s-border)",
  buttonBorder: "var(--s-heading)",
  buttonText: "var(--s-heading)",
}
const MUTED = "var(--s-para)"

/** A break the section can show: tiers, and the price the server priced them at. */
type PricedBreak = BreakCard & { priceCents: number; compareAtCents?: number | null; variantId?: string | null; variantName?: string | null }
const priced = (b: BreakCard): b is PricedBreak => b.tiers.length > 0 && typeof (b as PricedBreak).priceCents === "number"

export interface FeaturedOffersProps {
  productId: string
  title: string
  slug: string
  /** "physical", "digital" and so on (the card's `kind`). */
  kind: string
  image: string | null
  payWhatYouWant: boolean
  /** "card": inside a product card (no box of its own); "open": on the section itself. */
  layout: "card" | "open"
  /** The builder's canvas with the inspector on: shown, never pressed. */
  inert: boolean
  /** The section's corner radius in px (theme.radius.medium). */
  radius?: number
}

export default function FeaturedOffers({ productId, title, slug, kind, image, payWhatYouWant, layout, inert, radius = 10 }: FeaturedOffersProps) {
  const storefront = useStorefront()
  const w = useWord()
  const money = useMoney()
  const cart = useSiteCart()
  const data = useProductOffers(productId)
  /* The visitor's market, as the product page's block hands it on: none for pay what you want, which is typed in the store's currency. */
  const display = payWhatYouWant ? null : (storefront.display ?? null)
  const tierWords = { free: w("offer_tier_free"), percent: w("offer_tier_percent"), amount: w("offer_tier_amount"), plain: w("offer_tier_plain") }
  const brk = useMemo(() => (data?.quantityBreaks ?? []).find(priced) ?? null, [data])
  const [quantity, setQuantity] = useState<number | null>(null)
  const [added, setAdded] = useState(false)
  const physical = kind === "physical"
  const r = Math.min(24, Math.max(0, radius))
  const canAdd = !inert && cart.live

  /* This product as the set takes it: the option the tiers are priced at, else its first. */
  const own = useMemo(() => (data?.bundles ?? []).flatMap((b: BundleCard) => b.items).find((i) => i.id === productId) ?? null, [data, productId])
  const option = (brk?.variantId ? own?.variants.find((v) => v.id === brk.variantId) : null) ?? own?.variants[0] ?? null
  const lineOf = (units: number, priceCents: number, variantId: string | null, variantName: string | null): CartLine => ({
    productId,
    variantId,
    title: title || own?.title || "",
    variantName,
    priceCents,
    thumbnailUrl: image ?? own?.imageUrl ?? null,
    slug: slug || own?.slug || "",
    digital: kind === "digital",
    ...(physical ? { physical: true } : {}),
    /* Only something that ships is bought more than once in one go (lib/products/product-page-model cartLineFor). */
    quantity: physical ? Math.max(1, units) : 1,
  })

  if (!data) return null
  const breaks = brk ? [brk] : []
  const count = breaks.length + data.bundles.length + data.upsells.length
  if (count === 0) {
    if (!storefront.inEditor || layout === "card") return null
    return (
      <p className="mt-5 flex items-center gap-1.5 text-[12px] italic leading-5" style={{ color: MUTED, opacity: 0.55 }} data-editor-note="">
        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full" style={{ background: "currentColor" }} />
        No bundle, quantity break or upsell shows this product yet. Create one in Products, Upsells and bundles.
      </p>
    )
  }

  const units = quantity ?? (brk ? brk.tiers[0].quantity + brk.tiers[0].freeQuantity : 1)
  const chosenPrice = option?.priceCents ?? brk?.priceCents ?? own?.priceCents ?? 0
  const chosenVariant = option?.id ?? brk?.variantId ?? null
  const chosenName = option && (own?.variants.length ?? 0) > 1 ? option.name : (brk?.variantName ?? null)
  const chosen = { variantId: chosenVariant ?? "", variantName: chosenName, priceCents: chosenPrice, imageUrl: image ?? own?.imageUrl ?? null, line: lineOf(1, chosenPrice, chosenVariant, chosenName) }
  const addLines = (lines: CartLine[]): boolean => (canAdd ? cart.addAll(lines) : false)
  const addTier = () => {
    if (!brk || !addLines([lineOf(units, brk.priceCents, brk.variantId ?? null, brk.variantName ?? null)])) return
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2400)
  }
  const card = layout === "card"

  return (
    <div data-featured-offers={productId} className={card ? "mt-4 space-y-4" : "mt-6 space-y-4"} style={{ color: SCHEME.text, maxWidth: card ? undefined : 480 }}>
      {brk ? (
        <div className={card ? "border-t pt-4" : undefined} style={card ? { borderColor: SCHEME.border } : undefined}>
          <QuantityBreaks
            breaks={breaks}
            priceCents={brk.priceCents}
            compareAtCents={brk.compareAtCents ?? null}
            quantity={units}
            onPick={setQuantity}
            money={money}
            palette={SCHEME}
            ink={SCHEME.text}
            muted={MUTED}
            radius={r}
            disabled={inert}
            display={display}
            name={(t) => tierNameIn(t.label, (k, vars) => fillWords(tierWords[k], vars), t, money)}
            each={(price) => fillWords(w("offer_each"), { price })}
            bare={card}
          />
          <button
            type="button"
            disabled={!canAdd}
            aria-live="polite"
            onClick={addTier}
            className="mt-3 w-full border py-3 text-[14.5px] font-semibold transition-opacity disabled:cursor-default disabled:opacity-60"
            style={{ background: "var(--s-btn)", color: "var(--s-btn-text)", borderColor: "var(--s-btn)", borderRadius: r }}
            data-tier-add={units}
          >
            {added ? w("added_to_cart") : w("add_to_cart")}
          </button>
        </div>
      ) : null}
      <BundleOffers
        productId={productId}
        chosen={chosen}
        onAdd={addLines}
        data={data}
        palette={SCHEME}
        ink={SCHEME.text}
        muted={MUTED}
        accent={SCHEME.heading}
        radius={r}
        disabled={!canAdd}
        money={money}
        display={display}
        bare={card}
      />
    </div>
  )
}
