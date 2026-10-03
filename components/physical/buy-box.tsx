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
import { cn } from "@/lib/utils"
import { useSiteCart } from "@/components/website-builder/site-cart"
import { usePhysicalCommerceEnabled } from "@/components/platform/platform-settings-context"
import { addLine, cartStorageKey, parseCart, serializeCart } from "@/lib/website-builder/cart"
import { physicalCheckoutHref } from "@/lib/physical/cart-link"

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
  product: { id: string; creatorId: string; title: string; slug: string; imageUrl: string | null }
  options: { name: string; values: string[] }[]
  variants: Variant[]
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
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
  const [failed, setFailed] = React.useState(false)
  const [chosen, setChosen] = React.useState<(string | null)[]>([null, null, null])
  const [qty, setQty] = React.useState(1)
  const [added, setAdded] = React.useState(false)

  React.useEffect(() => {
    if (!enabled) return
    let gone = false
    fetch(`/api/physical/storefront/product?productId=${encodeURIComponent(productId)}`, { cache: "no-store" })
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

  const ink = textColor ?? "#1a1a2e"
  const muted = mutedColor ?? "#6b7280"
  const btnRadius = { borderRadius: radius }

  if (!enabled || failed || (data && data.variants.length === 0)) {
    return (
      <div className="space-y-2">
        <button type="button" disabled className="w-full cursor-not-allowed py-3.5 text-[15px] font-semibold opacity-50" style={{ background: accent, color: accentText, ...btnRadius }}>
          Not available right now
        </button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-7 w-28 animate-pulse rounded-md bg-black/5" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-black/5" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-black/5" />
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

  const line = () => ({
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
  })

  const addToCart = () => {
    if (!canBuy) return
    if (site.live) {
      site.add(line())
    } else {
      /* No website cart here (the storelib.com product page): this browser's cart for the shop, which the checkout reads. */
      try {
        const key = cartStorageKey(data.product.creatorId)
        window.localStorage.setItem(key, serializeCart(addLine(parseCart(window.localStorage.getItem(key)), line())))
      } catch {
        /* Storage refused: Buy now still works. */
      }
    }
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2400)
  }

  const buyNow = () => {
    if (!canBuy) return
    window.location.href = physicalCheckoutHref(data.product.creatorId, [{ productId: data.product.id, variantId: variant!.id, quantity }], window.location.href)
  }

  return (
    <div className="space-y-4" data-physical-buy-box="">
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
                  onClick={() => setChosen((c) => c.map((x, j) => (j === i ? value : x)))}
                  className={cn("min-h-10 rounded-lg border px-3.5 text-[14px] font-medium transition-colors", !open && "line-through opacity-50")}
                  style={on ? { borderColor: ink, color: ink, boxShadow: `inset 0 0 0 1px ${ink}` } : { borderColor: "rgba(0,0,0,0.14)", color: ink }}
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

      <div className="flex items-center gap-3">
        <span className="text-[14px] font-medium" style={{ color: ink }}>
          Quantity
        </span>
        <div className="inline-flex h-11 items-center rounded-lg border" style={{ borderColor: "rgba(0,0,0,0.14)" }}>
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
        <button type="button" onClick={addToCart} disabled={!canBuy} className="flex w-full items-center justify-center gap-2 border-2 py-3.5 text-[15px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50" style={{ borderColor: accent, color: accent, ...btnRadius }}>
          <ShoppingBag className="h-4 w-4" />
          {added ? "Added to cart" : variant?.soldOut ? "Sold out" : "Add to cart"}
        </button>
        <button type="button" onClick={buyNow} disabled={!canBuy} className="w-full py-3.5 text-[15px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50" style={{ background: accent, color: accentText, ...btnRadius }}>
          {variant?.soldOut ? "Sold out" : callToAction?.trim() || "Buy now"}
        </button>
        {added && !site.live ? (
          <a href={physicalCheckoutHref(data.product.creatorId, [], typeof window !== "undefined" ? window.location.href : null)} className="block text-center text-[14px] font-medium underline underline-offset-4" style={{ color: ink }}>
            Go to checkout
          </a>
        ) : null}
      </div>
    </div>
  )
}
