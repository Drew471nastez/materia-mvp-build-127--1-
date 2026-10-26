"use client"

/**
 * ===========================================================================
 *  BUYING A PHYSICAL PRODUCT: OPTIONS, STOCK, QUANTITY, CART, BUY NOW
 * ===========================================================================
 * On the product page (components/checkout/purchase-status-wrapper.tsx) and
 * a website's product section, for products that ship. The options are
 * chips; a combination that is sold out is shown and can't be picked. Add to
 * cart puts the line in the shop's cart (the website's own drawer when there
 * is one, else this browser's cart for the shop); Buy now goes straight to
 * the physical checkout with this one line. The price and the stock shown
 * are for the page: the server prices and holds stock again at checkout.
 *
 * With physical commerce off in /admin the product can't be bought, and
 * says so, rather than offering a button that fails.
 */

import * as React from "react"
import { Minus, Plus, ShoppingBag } from "lucide-react"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { useSellerCurrency } from "@/components/platform/price-currency"
import { cn } from "@/lib/utils"
import { useSiteCart } from "@/components/website-builder/site-cart"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { addAllLines, cartStorageKey, parseCart, serializeCart } from "@/lib/website-builder/cart"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"
import { trackFunnelStep } from "@/lib/analytics-utils"
import { BundleOffers } from "@/components/offers/bundle-offers"
import type { CartLine } from "@/lib/website-builder/cart"
import { announceVariantPhoto, galleryFollowsVariants } from "@/lib/physical/variant-photo"
import { useSitePaint } from "@/lib/appearance/site-paint-context"
import { PersonalizationFields, usePersonalization } from "@/components/personalization/personalization-fields"
import type { PersonalizationField } from "@/lib/products/personalization"

interface Variant {
  id: string
  name: string
  options: (string | null)[]
  priceCents: number
  compareAtCents: number | null
  imageUrl: string | null
  soldOut: boolean
  left: number | null
  maxQuantity: number
}
interface Data {
  /** The store's selling currency: every amount below is in it. */
  currency?: string | null
  product: { id: string; creatorId: string; title: string; slug: string; imageUrl: string | null }
  /** What delivery costs and takes to the buyer's country, in lines (lib/physical/delivery-promise.ts). */
  delivery?: { lines: string[] } | null
  options: { name: string; values: string[] }[]
  variants: Variant[]
  /** What the buyer is asked when buying it (lib/products/personalization.ts). */
  personalization?: PersonalizationField[]
}

/** In what the product's store sells in (the route says), else the page's, else the platform's. */
function useBoxMoney(currency: string | null | undefined): (cents: number) => string {
  const page = useSellerCurrency()
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : page
  return React.useCallback((cents: number) => shopMoneyIn(cents, code), [code])
}

/** The buyer's country as their browser names it, for the delivery line; empty when it can't tell. */
function browserCountry(): string {
  try {
    return new Intl.Locale(navigator.language).maximize().region ?? ""
  } catch {
    return ""
  }
}

export function PhysicalBuyBox({
  productId,
  accent = "#1a1a2e",
  accentText = "#ffffff",
  textColor,
  mutedColor,
  callToAction,
  inEditor = false,
  radius = 10,
}: {
  productId: string
  accent?: string
  accentText?: string
  textColor?: string
  mutedColor?: string
  callToAction?: string | null
  inEditor?: boolean
  radius?: number
}) {
  const enabled = usePhysicalCommerceEnabled()
  const site = useSiteCart()
  const [data, setData] = React.useState<Data | null>(null)
  const money = useBoxMoney(data?.currency)
  const [failed, setFailed] = React.useState(false)
  const [chosen, setChosen] = React.useState<(string | null)[]>([null, null, null])
  const [qty, setQty] = React.useState(1)
  const [added, setAdded] = React.useState(false)
  /* The product's personalization fields and the buyer's answers (components/personalization). */
  const personalization = usePersonalization(data?.personalization)
  /*
    The chosen variant's photo goes to the page's gallery once the buyer
    picks (lib/physical/variant-photo.ts); not on load, so the page opens on
    the product's own first photo. With no gallery listening, the photo is
    drawn small above the price instead.
  */
  const picked = React.useRef(false)
  const [galleryFollows, setGalleryFollows] = React.useState(false)
  const chosenImage = data?.variants.find((v) => data.options.every((_, i) => (v.options[i] ?? null) === (chosen[i] ?? null)))?.imageUrl ?? null
  React.useEffect(() => {
    if (data) setGalleryFollows(galleryFollowsVariants(data.product.id))
  }, [data])
  React.useEffect(() => {
    if (data && chosenImage && picked.current) announceVariantPhoto(data.product.id, chosenImage)
  }, [data, chosenImage])

  React.useEffect(() => {
    if (!enabled) return
    let gone = false
    const country = browserCountry()
    fetch(`/api/physical/storefront/product?productId=${encodeURIComponent(productId)}${country ? `&country=${encodeURIComponent(country)}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Data) => {
        if (gone) return
        setData(d)
        /* The first combination that can be bought, chosen for the buyer. */
        const first = d.variants.find((v) => !v.soldOut) ?? d.variants[0]
        if (first) setChosen([first.options[0] ?? null, first.options[1] ?? null, first.options[2] ?? null])
      })
      .catch(() => !gone && setFailed(true))
    return () => {
      gone = true
    }
  }, [enabled, productId])

  /*
    Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). The accent is
    two things here: the fill of Buy now (a near black fill is a graphite step in the dark, its white words stay) and
    the ink of the outlined Add to cart (light in the dark). A coloured accent is the same colour in both looks.
  */
  const paint = useSitePaint()
  const ink = paint(textColor ?? "#1a1a2e", "ink")
  const muted = paint(mutedColor ?? "#6b7280", "ink")
  const fill = paint(accent, "bg")
  const outline = paint(accent, "ink")
  /* Its edge: a near black one is the dark look's strong hairline, as a class border of that colour is (never a white ring). */
  const outlineEdge = paint(accent, "line")
  const hairline = paint("rgba(0,0,0,0.14)", "line")
  /* A chosen option: its ring in the ink in the light look; a graphite chip with a strong hairline in the dark one, not a white ring. */
  const chosenRing = paint(textColor ?? "#1a1a2e", "line")
  const chosenFill = paint(textColor ?? "#1a1a2e", "bg") !== (textColor ?? "#1a1a2e") ? "var(--sl-pp-selected, transparent)" : undefined
  const wash = paint("rgba(0,0,0,0.05)", "bg")
  const btnRadius = { borderRadius: radius }

  if (!enabled || failed || (data && data.variants.length === 0)) {
    return (
      <div className="space-y-2">
        <button type="button" disabled className="w-full cursor-not-allowed py-3.5 text-[15px] font-semibold opacity-50" style={{ background: fill, color: accentText, ...btnRadius }}>
          Not available right now
        </button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-7 w-28 animate-pulse rounded-md bg-black/5" style={{ backgroundColor: wash }} />
        <div className="h-12 w-full animate-pulse rounded-lg bg-black/5" style={{ backgroundColor: wash }} />
        <div className="h-12 w-full animate-pulse rounded-lg bg-black/5" style={{ backgroundColor: wash }} />
      </div>
    )
  }

  const variant = data.variants.find((v) => data.options.every((_, i) => (v.options[i] ?? null) === (chosen[i] ?? null))) ?? (data.options.length === 0 ? data.variants[0] : null)
  const canBuy = !!variant && !variant.soldOut && !inEditor
  const max = variant ? Math.max(1, Math.min(999, variant.maxQuantity)) : 1
  const quantity = Math.min(qty, max)

  /* A value is crossed out when every combination with it (and the other choices) is sold out. */
  const valueOpen = (i: number, value: string) =>
    data.variants.some((v) => v.options[i] === value && !v.soldOut && data.options.every((_, j) => j === i || chosen[j] === null || v.options[j] === chosen[j]))

  const line = (properties?: Record<string, string>) => ({
    productId: data.product.id,
    variantId: variant!.id,
    title: data.product.title,
    variantName: data.options.length ? variant!.name : null,
    priceCents: variant!.priceCents,
    thumbnailUrl: variant!.imageUrl ?? data.product.imageUrl,
    slug: data.product.slug,
    digital: false,
    physical: true,
    quantity,
    ...(properties ? { properties } : {}),
  })

  /* Into the website's own cart when there is one, else this browser's cart for the shop, which the checkout reads (the storelib.com product page). */
  /* Every line or none (round 23, addAllLines): a set chosen together is never half in the cart. False when nothing went in. */
  const putInCart = (lines: CartLine[]): boolean => {
    if (site.live) return site.addAll(lines)
    try {
      const key = cartStorageKey(data.product.creatorId)
      const next = addAllLines(parseCart(window.localStorage.getItem(key)), lines)
      if (!next) return false
      window.localStorage.setItem(key, serializeCart(next))
      return true
    } catch {
      /* Storage refused: Buy now still works. */
      return false
    }
  }

  const addToCart = () => {
    if (!canBuy) return
    /* Every required answer there and no photo still uploading, or the fields say what is missing. */
    const answers = personalization.check()
    if (answers === null) return
    /* Added to cart, for Analytics (once per page here, once per visit on the server). */
    void trackFunnelStep("buy_click", data.product.creatorId, data.product.id)
    putInCart([line(answers)])
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2400)
  }

  const buyNow = () => {
    if (!canBuy) return
    const answers = personalization.check()
    if (answers === null) return
    void trackFunnelStep("buy_click", data.product.creatorId, data.product.id)
    window.location.href = physicalCheckoutHref(data.product.creatorId, [{ productId: data.product.id, variantId: variant!.id, quantity, ...(answers ? { properties: answers } : {}) }], window.location.href)
  }

  return (
    <div className="space-y-4" data-physical-buy-box="">
      {variant?.imageUrl && data.variants.length > 1 && !galleryFollows ? (
        /* The chosen variant's own photo, so the buyer sees the color they picked. */
        // eslint-disable-next-line @next/next/no-img-element
        <img src={variant.imageUrl} alt={variant.name} className="h-20 w-20 rounded-xl border object-cover" style={{ borderColor: paint("rgba(0,0,0,0.1)", "line") }} data-variant-photo="" />
      ) : null}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-2xl font-bold tracking-tight" style={{ color: ink }}>
          {variant ? money(variant.priceCents) : money(Math.min(...data.variants.map((v) => v.priceCents)))}
        </span>
        {variant?.compareAtCents ? (
          <span className="text-base line-through" style={{ color: muted }}>
            {money(variant.compareAtCents)}
          </span>
        ) : null}
      </div>

      {data.options.map((o, i) => (
        <fieldset key={o.name} className="space-y-2">
          <legend className="text-[14px] font-medium" style={{ color: ink }}>
            {o.name}
            {chosen[i] ? <span style={{ color: muted }}>: {chosen[i]}</span> : null}
          </legend>
          <div className="flex flex-wrap gap-2">
            {o.values.map((value) => {
              const on = chosen[i] === value
              const open = valueOpen(i, value)
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    picked.current = true
                    setChosen((c) => c.map((x, j) => (j === i ? value : x)))
                  }}
                  className={cn("min-h-10 rounded-lg border px-3.5 text-[14px] font-medium transition-colors", !open && "line-through opacity-50")}
                  style={on ? { borderColor: chosenRing, color: ink, boxShadow: `inset 0 0 0 1px ${chosenRing}`, backgroundColor: chosenFill } : { borderColor: hairline, color: ink }}
                >
                  {value}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}

      {variant?.left ? (
        <p className="text-[13.5px] font-medium text-[#b45309]">Only {variant.left} left</p>
      ) : variant?.soldOut ? (
        <p className="text-[13.5px] font-medium" style={{ color: muted }}>
          Sold out
        </p>
      ) : null}

      {data.delivery?.lines.length ? (
        <ul className="space-y-0.5 text-[13.5px] leading-5" style={{ color: muted }} data-delivery-promise="">
          {data.delivery.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}

      {/* What the product asks the buyer for (Products › Personalization), above the quantity and the buttons. */}
      <PersonalizationFields state={personalization} productId={data.product.id} look={{ ink, muted, line: hairline, radius }} inert={inEditor} />

      <div className="flex items-center gap-3">
        <span className="text-[14px] font-medium" style={{ color: ink }}>
          Quantity
        </span>
        <div className="inline-flex h-11 items-center rounded-lg border" style={{ borderColor: hairline }}>
          <button type="button" aria-label="Fewer" disabled={quantity <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))} className="grid h-11 w-11 place-items-center disabled:opacity-40" style={{ color: ink }}>
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-[15px] tabular-nums" style={{ color: ink }} aria-live="polite">
            {quantity}
          </span>
          <button type="button" aria-label="More" disabled={!canBuy || quantity >= max} onClick={() => setQty((q) => Math.min(max, q + 1))} className="grid h-11 w-11 place-items-center disabled:opacity-40" style={{ color: ink }}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        <button type="button" onClick={addToCart} disabled={!canBuy} className="flex w-full items-center justify-center gap-2 border-2 py-3.5 text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: outlineEdge, color: outline, ...btnRadius }}>
          <ShoppingBag className="h-4 w-4" />
          {added ? "Added to cart" : variant?.soldOut ? "Sold out" : "Add to cart"}
        </button>
        <button type="button" onClick={buyNow} disabled={!canBuy} className="w-full py-3.5 text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: fill, color: accentText, ...btnRadius }}>
          {variant?.soldOut ? "Sold out" : callToAction?.trim() || "Buy now"}
        </button>
        {added && !site.live ? (
          <a href={physicalCheckoutHref(data.product.creatorId, [], typeof window !== "undefined" ? window.location.href : null)} className="block text-center text-[14px] font-medium underline underline-offset-4" style={{ color: ink }}>
            Go to checkout
          </a>
        ) : null}
      </div>

      {/* The store's bundles with this product in (lib/offers): the option chosen above goes in with the rest. */}
      <BundleOffers
        productId={data.product.id}
        chosen={canBuy && variant ? { variantId: variant.id, variantName: data.options.length ? variant.name : null, priceCents: variant.priceCents, imageUrl: variant.imageUrl ?? data.product.imageUrl } : null}
        onAdd={(lines) => {
          /* This product goes in with the buyer's answers, checked as Add to cart checks them (round 23). */
          const answers = personalization.check()
          if (answers === null) return false
          const withAnswers = answers ? lines.map((l) => (l.productId === data.product.id ? { ...l, properties: { ...(l.properties ?? {}), ...answers } } : l)) : lines
          if (!putInCart(withAnswers)) return false
          setAdded(true)
          window.setTimeout(() => setAdded(false), 2400)
          return true
        }}
        ink={ink}
        muted={muted}
        accent={accent}
        radius={radius}
        disabled={inEditor}
        money={money}
      />
    </div>
  )
}
