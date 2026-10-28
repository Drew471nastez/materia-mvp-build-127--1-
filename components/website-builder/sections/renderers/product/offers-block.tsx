"use client"

/**
 * THE PRODUCT SECTION'S "BUNDLES AND UPSELLS" BLOCK (themes/default/
 * sections/product.json, type `offers`): the store's bundles with this
 * product in and the upsells it shows on product pages (lib/offers), drawn
 * by components/offers/bundle-offers.tsx with the block's own colour for
 * each element: heading, text, price, border, the saving and the button.
 *
 * On the live page it reads the offers for the product and draws nothing
 * when there are none. In the builder a real product with none says so in
 * one quiet line; the builder's stand-in product shows a sample bundle and
 * upsell, so the block's colours can be set before any offer exists. Add all
 * to cart and Add put the lines in the website's cart; the checkout prices
 * them again on the server and applies the offer only while the cart
 * qualifies.
 */
import { BundleOffers, useProductOffers, type ProductOffersData } from "@/components/offers/bundle-offers"
import { QuantityBreaks } from "@/components/offers/quantity-breaks"
import { fillWords, tierLabel, tierNameIn } from "@/lib/offers/pricing"
import { useWord } from "@/components/website-builder/theme/storefront-context"
import type { CartLine } from "@/lib/website-builder/cart"
import { schemeTokenName } from "@/lib/storelib-theme/color-schemes"
import type { ProductCtx } from "./product-blocks"

type S = Record<string, unknown>
type Palette = ProductCtx["palette"]

/** A block colour, as ./product-blocks.tsx colorOf reads one (kept here so the two files don't import each other). */
function colorOf(value: unknown, palette: Palette, fallback: string): string {
  const p = palette as unknown as Record<string, string>
  if (typeof value === "string" && value.trim()) {
    const token = schemeTokenName(value)
    if (token) return p[token] ?? p[fallback] ?? ""
    if (!value.trim().startsWith("scheme.")) return value.trim()
  }
  return p[fallback] ?? ""
}
const str = (v: unknown, d = ""): string => (typeof v === "string" && v.trim() ? v : d)
const on = (v: unknown, d: boolean): boolean => (typeof v === "boolean" ? v : d)
/** The store's own label, or undefined while it is the English default (or empty). */
const own = (v: unknown, english: string): string | undefined => {
  const t = str(v).trim()
  return t && t !== english ? t : undefined
}

/** What the builder's stand-in product shows: a bundle of two and an upsell, priced as a store would. */
const SAMPLE: ProductOffersData = {
  bundles: [
    {
      offerId: "sample-bundle",
      title: "Buy it together",
      label: "10% off",
      discountType: "percent",
      discountValue: 10,
      fullCents: 5800,
      priceCents: 5220,
      items: [
        { id: "sample", title: "This product", slug: "", imageUrl: null, type: "digital", priceCents: 2900, variants: [] },
        { id: "sample-2", title: "A product that goes with it", slug: "", imageUrl: null, type: "digital", priceCents: 2900, variants: [] },
      ],
    },
  ],
  upsells: [
    {
      offerId: "sample-upsell",
      title: "Add to your order",
      label: "20% off",
      discountType: "percent",
      discountValue: 20,
      offerPriceCents: 1200,
      product: { id: "sample-3", title: "One more thing", slug: "", imageUrl: null, type: "digital", priceCents: 1500, variants: [] },
    },
  ],
  /* Buy 2 get 1 free and Buy 3 get 2 free, so the tiers' colours can be set before a quantity break exists. */
  quantityBreaks: [
    {
      offerId: "sample-break",
      productId: "sample",
      title: "Buy more, save more",
      tiers: [
        { quantity: 1, freeQuantity: 0, discountType: "none", discountValue: 0, label: tierLabel({ quantity: 1, freeQuantity: 0, discountType: "none", discountValue: 0 }), badge: "" },
        { quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0, label: tierLabel({ quantity: 2, freeQuantity: 1, discountType: "none", discountValue: 0 }), badge: "Most popular" },
        { quantity: 3, freeQuantity: 2, discountType: "none", discountValue: 0, label: tierLabel({ quantity: 3, freeQuantity: 2, discountType: "none", discountValue: 0 }), badge: "" },
      ],
    },
  ],
}

export function OffersBlock({ s, ctx }: { s: S; ctx: ProductCtx }) {
  const productId = ctx.sample ? null : ctx.product.id || null
  const live = useProductOffers(productId, !ctx.sample)
  /* The block's words in the page's language (Translate › Shop words): a tier with no name of its own, and "each". */
  const w = useWord()
  const tierWords = { free: w("offer_tier_free"), percent: w("offer_tier_percent"), amount: w("offer_tier_amount"), plain: w("offer_tier_plain") }
  const data = ctx.sample ? SAMPLE : live
  const show = { bundles: on(s.show_bundles, true), upsells: on(s.show_upsells, true) }
  const showBreaks = on(s.show_breaks, true)
  if (!data) return null
  const breaks = showBreaks ? (data.quantityBreaks ?? []).filter((b) => b.tiers.length > 0) : []
  const count = (show.bundles ? data.bundles.length : 0) + (show.upsells ? data.upsells.length : 0) + breaks.length
  if (count === 0) {
    if (!ctx.inEditor) return null
    return (
      <p className="flex items-center gap-1.5 text-[12px] italic leading-5" style={{ color: ctx.palette.text_muted ?? ctx.palette.paragraph, opacity: 0.55 }} data-editor-note="">
        <span aria-hidden className="h-1 w-1 shrink-0 rounded-full" style={{ background: "currentColor" }} />
        No bundle, quantity break or upsell shows this product yet. Create one in Products, Upsells and bundles.
      </p>
    )
  }
  const palette = {
    heading: colorOf(s.heading_color, ctx.palette, "heading"),
    text: colorOf(s.text_color, ctx.palette, "text"),
    price: colorOf(s.price_color, ctx.palette, "heading"),
    border: colorOf(s.border_color, ctx.palette, "border"),
    badgeBg: colorOf(s.badge_background, ctx.palette, "background_secondary") || "#dcfce7",
    badgeText: colorOf(s.badge_text, ctx.palette, "text") || "#166534",
    ...(str(s.button_style, "outline") === "fill"
      ? { buttonBg: colorOf(s.button_background, ctx.palette, "primary_button_background"), buttonText: colorOf(s.button_text, ctx.palette, "primary_button_text") }
      : { buttonBorder: colorOf(s.button_background, ctx.palette, "heading"), buttonText: colorOf(s.button_background, ctx.palette, "heading") }),
  }
  const radiusPx = Number.parseFloat(String(ctx.buttonRadius.borderRadius ?? "10")) || 10
  const chosen = ctx.offers?.chosen ?? null
  /* The tiers at the option chosen in the buy box (its price, or the product's while none is chosen), by the checkout's own formula. */
  const tierPrice = ctx.sample ? 2900 : (chosen?.priceCents ?? ctx.variant?.price_cents ?? ctx.product.price_cents ?? 0)
  const tierCompare = ctx.sample ? null : (ctx.variant ? ctx.variant.compare_at_cents : ctx.product.compare_at_cents) ?? null
  return (
    <div data-offers-block="" className="space-y-4" style={{ color: palette.text }}>
      {breaks.length ? (
        <QuantityBreaks
          breaks={breaks}
          priceCents={tierPrice}
          compareAtCents={tierCompare}
          quantity={ctx.quantity}
          onPick={(units) => ctx.setQuantity(Math.min(Math.max(1, ctx.maxQuantity || units), units))}
          money={ctx.money}
          palette={palette}
          ink={palette.text}
          muted={ctx.palette.text_muted ?? ctx.palette.paragraph ?? palette.text}
          radius={Math.min(24, radiusPx)}
          disabled={ctx.inert}
          display={ctx.sample || ctx.product.pay_what_you_want ? null : (ctx.product.display ?? null)}
          name={(t) => tierNameIn(t.label, (kind, vars) => fillWords(tierWords[kind], vars), t, ctx.money)}
          each={(price) => fillWords(w("offer_each"), { price })}
        />
      ) : null}
      <BundleOffers
        productId={ctx.sample ? "sample" : ctx.product.id}
        chosen={ctx.sample ? { variantId: "", variantName: null, priceCents: 2900, imageUrl: null } : chosen}
        onAdd={(lines: CartLine[]) => ctx.offers?.addLines(lines) ?? false}
        data={data}
        palette={palette}
        show={show}
        buttonStyle={str(s.button_style, "outline") === "fill" ? "fill" : "outline"}
        radius={Math.min(24, radiusPx)}
        ink={palette.text}
        muted={ctx.palette.text_muted ?? ctx.palette.paragraph ?? palette.text}
        accent={palette.heading}
        disabled={ctx.inert || ctx.sample || !ctx.offers}
        /* A label left as the English default is the shop's own word, drawn in the page's language (lib/markets/ui-words.ts); one the store wrote is translated with its section. */
        labels={{ addAll: own(s.add_all_label, "Add all to cart"), add: own(s.add_label, "Add") }}
        money={ctx.money}
        display={ctx.sample || ctx.product.pay_what_you_want ? null : (ctx.product.display ?? null)}
      />
    </div>
  )
}
