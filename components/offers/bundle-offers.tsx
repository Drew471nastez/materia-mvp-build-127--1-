"use client"

/**
 * WHAT A PRODUCT PAGE OFFERS WITH THE PRODUCT (lib/offers, /api/offers/bundles):
 * under the buy box on Storelib's product page, and as the website product
 * section's "Bundles and upsells" block (product-blocks.tsx), in the editor
 * and live.
 *
 *   bundles   each item with its picture and price, the set's price with
 *             the saving, and Add all to cart. This product goes in as
 *             chosen in the buy box above; another item with options gets a
 *             small choice of its own.
 *   upsells   the store's checkout offers this product triggers that are
 *             shown on product pages: the product, the price it adds at,
 *             and Add.
 *
 * Every element takes its colour from `palette` (the block's own colour
 * settings, or the buy box's), so it sits in any theme. The prices are for
 * the page: the checkout works the discount out again on the server, from
 * the cart, and only gives it while the cart qualifies.
 */
import { useSitePaint } from "@/lib/appearance/site-paint-context"
import * as React from "react"
import { sharedJson } from "@/lib/net/shared-read"
import { useSellerMoney } from "@/components/platform/price-currency"
import { Package, Plus } from "lucide-react"
import type { CartLine } from "@/lib/website-builder/cart"
import { applyOffers, bundlePrice, offerUnitPrice, type DiscountType } from "@/lib/offers/offers"
import { chargedInMarket, type PageDisplay } from "@/lib/markets/cart-money"
import { useWord } from "@/components/website-builder/theme/storefront-context"
import type { BreakCard } from "./quantity-breaks"

interface Item {
  id: string
  title: string
  slug: string
  imageUrl: string | null
  type: string
  priceCents: number
  variants: { id: string; name: string; priceCents: number }[]
  /** Pay what you want: counted in a set, never discounted (lib/offers bundlePrice). */
  payWhatYouWant?: boolean
  /** It asks a required personalization answer (lib/offers/offers-server offerProducts): only its own page can add it. */
  personalized?: boolean
}
export interface BundleCard {
  offerId: string
  title: string
  label: string | null
  discountType: DiscountType
  discountValue: number
  items: Item[]
  fullCents: number
  priceCents: number
}
export interface UpsellCard {
  offerId: string
  title: string
  label: string | null
  discountType: DiscountType
  discountValue: number
  product: Item
  offerPriceCents: number
}
export interface ProductOffersData {
  bundles: BundleCard[]
  upsells: UpsellCard[]
  /** The product's quantity breaks (components/offers/quantity-breaks.tsx), from GET /api/offers. */
  quantityBreaks?: BreakCard[]
  /** The product itself (lib/offers/offers-public.ts ProductOffers.product): a required answer, and how many options it has. */
  product?: { personalized: boolean; options: number }
}

/** Each element's colour. Unset ones follow `ink`, `muted` and `accent`. */
export interface OfferPalette {
  heading?: string
  text?: string
  price?: string
  border?: string
  badgeBg?: string
  badgeText?: string
  buttonBg?: string
  buttonText?: string
  buttonBorder?: string
}

/** The page's offers for a product, read once per product. */
export function useProductOffers(productId: string | null | undefined, enabled = true): ProductOffersData | null {
  const [data, setData] = React.useState<ProductOffersData | null>(null)
  React.useEffect(() => {
    setData(null)
    if (!productId || !enabled) return
    let gone = false
    /* One read for the three (lib/offers/offers-public.ts): its checkout offers are the upsells this page shows. And one for every part of the page that asks (lib/net/shared-read.ts, round 54): the product page draws its buy box twice. */
    sharedJson<{ bundles?: BundleCard[]; checkoutOffers?: UpsellCard[]; quantityBreaks?: BreakCard[]; product?: { personalized?: unknown; options?: unknown } }>(`/api/offers?product=${encodeURIComponent(productId)}`)
      .then((d: { bundles?: BundleCard[]; checkoutOffers?: UpsellCard[]; quantityBreaks?: BreakCard[]; product?: { personalized?: unknown; options?: unknown } } | null) => {
        const self = d?.product && typeof d.product === "object" ? { personalized: d.product.personalized === true, options: Number(d.product.options) || 0 } : undefined
        if (!gone) setData({ bundles: Array.isArray(d?.bundles) ? d!.bundles : [], upsells: Array.isArray(d?.checkoutOffers) ? d!.checkoutOffers : [], quantityBreaks: Array.isArray(d?.quantityBreaks) ? d!.quantityBreaks : [], ...(self ? { product: self } : {}) })
      })
      .catch(() => undefined)
    return () => {
      gone = true
    }
  }, [productId, enabled])
  return data
}

export function BundleOffers({
  productId,
  chosen,
  onAdd,
  ink = "#1a1a2e",
  muted = "#6b7280",
  accent = "#1a1a2e",
  radius = 10,
  disabled = false,
  palette = {},
  show = { bundles: true, upsells: true },
  buttonStyle = "outline",
  data: given,
  labels = {},
  money: givenMoney,
  display = null,
  bare = false,
  pageFor,
}: {
  productId: string
  /** This product as the buy box has it: the option chosen, or null while one still has to be. */
  chosen: { variantId: string; variantName: string | null; priceCents: number; imageUrl: string | null; line?: CartLine } | null
  /** Adds the lines, every one or none; false when nothing went in (a required answer missing, a full cart). */
  onAdd: (lines: CartLine[]) => boolean | void
  ink?: string
  muted?: string
  accent?: string
  radius?: number
  disabled?: boolean
  palette?: OfferPalette
  show?: { bundles: boolean; upsells: boolean }
  /** Outline (the buy box's Add to cart) or filled. */
  buttonStyle?: "outline" | "fill"
  /** Offers already read (the editor's sample); otherwise read here. */
  data?: ProductOffersData | null
  labels?: { addAll?: string; add?: string }
  /** A price as the page prints it (the website product section passes its own, in the visitor's currency). */
  money?: (cents: number) => string
  /** The visitor's market, when the page shows its currency: a set's and an upsell's price then say what checkout charges in it (lib/markets/cart-money chargedInMarket). */
  display?: PageDisplay | null
  /** Without a box around each offer, a line between them instead: inside a card that already is one (Storelib's Featured products, ./featured-offers.tsx). */
  bare?: boolean
  /**
   * Where an item has to be chosen instead of added from here (a section
   * with no buy box: ./featured-offers.tsx): its page's address, or null
   * when it can be added. A set or an upsell with such an item opens that
   * page, Choose options, rather than going in without the answer.
   */
  pageFor?: (i: Item) => string | null
}) {
  /* Else in the store's own currency, on its page and in its editor alike (components/platform/price-currency). */
  const sellerMoney = useSellerMoney()
  /* The block's own words in the page's language (Translate › Shop words, lib/markets/ui-words.ts); English off a website. */
  const w = useWord()
  const money = givenMoney ?? sellerMoney
  const fetched = useProductOffers(productId, given === undefined)
  const data = given === undefined ? fetched : given
  /* Round 31: on Storelib's own product page these follow the person's look (lib/appearance/site-paint). */
  const paint = useSitePaint()
  ink = paint(ink, "ink")
  muted = paint(muted, "ink")
  const accentEdge = paint(accent, "line")
  accent = paint(accent, "ink")
  const c = {
    heading: palette.heading || ink,
    text: palette.text || ink,
    muted,
    price: palette.price || ink,
    border: palette.border || paint("rgba(0,0,0,0.1)", "line"),
    line: palette.border || paint("rgba(0,0,0,0.08)", "line"),
    badgeBg: palette.badgeBg || "#dcfce7",
    badgeText: palette.badgeText || "#166534",
    buttonBg: palette.buttonBg || (buttonStyle === "fill" ? accent : "transparent"),
    buttonText: palette.buttonText || (buttonStyle === "fill" ? "#ffffff" : accent),
    buttonBorder: palette.buttonBorder || palette.buttonBg || accentEdge,
  }
  const [picks, setPicks] = React.useState<Record<string, string>>({})
  const [added, setAdded] = React.useState<string | null>(null)
  /* When the last press landed (press, below): a hook, so before the early return. */
  const pressedAt = React.useRef(0)
  const bundles = show.bundles ? (data?.bundles ?? []) : []
  const upsells = show.upsells ? (data?.upsells ?? []) : []
  if (bundles.length === 0 && upsells.length === 0) return null

  const optionOf = (i: Item, key: string) => i.variants.find((x) => x.id === picks[key]) ?? (i.variants.length >= 1 ? i.variants[0] : null)
  const lineFor = (i: Item, key: string): CartLine | null => {
    if (i.id === productId) {
      if (!chosen) return null
      if (chosen.line) return { ...chosen.line, quantity: 1 }
      return { productId: i.id, variantId: chosen.variantId || null, title: i.title, variantName: chosen.variantName, priceCents: chosen.priceCents, thumbnailUrl: chosen.imageUrl ?? i.imageUrl, slug: i.slug, digital: i.type !== "physical", physical: i.type === "physical", quantity: 1 }
    }
    const v = optionOf(i, key)
    if (i.type === "physical" && !v) return null
    return { productId: i.id, variantId: v?.id ?? null, title: i.title, variantName: v && i.variants.length > 1 ? v.name : null, priceCents: v?.priceCents ?? i.priceCents, thumbnailUrl: i.imageUrl, slug: i.slug, digital: i.type !== "physical", physical: i.type === "physical", quantity: 1 }
  }
  /*
    ONE PRESS, ONE SET (round 23, the bundles audit: "rapid taps", "duplicate submissions"). A second press while the
    first is still being said ("Added to cart") adds nothing, nor does a press that lands in the same moment as the one
    before it (a double tap on a phone). And the button says Added only when the cart took every line.
  */
  const press = (key: string, lines: CartLine[]) => {
    const now = Date.now()
    if (added === key || now - pressedAt.current < 600) return
    pressedAt.current = now
    if (onAdd(lines) === false) return
    setAdded(key)
    window.setTimeout(() => setAdded(null), 2400)
  }
  const button = { background: c.buttonBg, color: c.buttonText, borderColor: c.buttonBorder, borderRadius: radius }
  /* Each offer's own box, or in a card only a line above it. */
  const box = (padding: string) => (bare ? { className: "border-t pt-4", style: { borderColor: c.line } } : { className: `rounded-xl border ${padding}`, style: { borderColor: c.border, borderRadius: radius + 4 } })
  const picture = (i: Item, size: number) =>
    i.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={i.imageUrl} alt="" className="shrink-0 rounded-lg border object-cover" style={{ width: size, height: size, borderColor: c.line }} />
    ) : (
      <span className="grid shrink-0 place-items-center rounded-lg border bg-black/[0.03]" style={{ width: size, height: size, borderColor: c.line, color: c.muted }}>
        <Package className="h-4 w-4" />
      </span>
    )
  const badge = (children: React.ReactNode) => (
    <span className="shrink-0 rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: c.badgeBg, color: c.badgeText }} data-bundle-label="">
      {children}
    </span>
  )
  const choice = (i: Item, k: string) =>
    i.variants.length > 1 ? (
      <select value={picks[k] ?? i.variants[0]?.id ?? ""} onChange={(e) => setPicks((p) => ({ ...p, [k]: e.target.value }))} className="mt-1 h-9 max-w-full rounded-md border bg-transparent px-2 text-[13px]" style={{ borderColor: c.border, color: c.text }} aria-label={w("offer_option").replace("{title}", i.title)}>
        {i.variants.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </select>
    ) : null

  return (
    <div className="space-y-4" data-bundle-offers="">
      {bundles.map((b) => {
        const lines = b.items.map((i) => lineFor(i, `${b.offerId}:${i.id}`))
        /* The first item that has to be chosen on its own page, when this section can't. */
        const setPage = b.items.map((i) => pageFor?.(i) ?? null).find(Boolean) ?? null
        const ready = lines.every(Boolean) && !disabled
        /* The set as chosen right now: an option with its own price changes it. */
        const units = b.items.map((i, k) => lines[k]?.priceCents ?? i.priceCents)
        const named = b.items.map((i, k) => i.payWhatYouWant === true || typeof lines[k]?.customPriceCents === "number")
        const { fullCents, priceCents } = bundlePrice(b, units, named)
        /* In a market's currency: the set as checkout charges it there, each item's discount the share of its converted price (applyOffers, then chargedInMarket). */
        const set = applyOffers(b.items.map((i, k) => ({ productId: `${k}:${i.id}`, unitCents: units[k], quantity: 1, payWhatYouWant: named[k] })), [{ id: b.offerId, kind: "bundle", title: b.title, productIds: b.items.map((i, k) => `${k}:${i.id}`), triggerIds: [], discountType: b.discountType, discountValue: b.discountValue, active: true }])
        const inMarket = chargedInMarket(units.map((u, k) => ({ unitCents: u, quantity: 1, discountCents: set.discounts[k] ?? 0 })), display)
        const fullText = inMarket ? inMarket.write(inMarket.fullMinor) : money(fullCents)
        const priceText = inMarket ? inMarket.write(inMarket.totalMinor) : money(priceCents)
        return (
          <section key={b.offerId} {...box("p-4")} data-bundle={b.offerId} aria-label={b.title}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-semibold" style={{ color: c.heading }}>
                {b.title}
              </h3>
              {b.label ? badge(b.label) : null}
            </div>
            <div className="mb-3 flex items-center gap-1.5" aria-hidden>
              {b.items.map((i, k) => (
                <React.Fragment key={i.id}>
                  {k > 0 ? <Plus className="h-3.5 w-3.5 shrink-0" style={{ color: c.muted }} /> : null}
                  {picture(i, 56)}
                </React.Fragment>
              ))}
            </div>
            <ul className="space-y-2">
              {b.items.map((i, k) => (
                <li key={i.id} className="flex items-center justify-between gap-3 text-[14px]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ color: c.text }}>
                      {i.id === productId ? <span className="font-medium">{w("offer_this_item")} </span> : null}
                      {i.title}
                    </span>
                    {i.id !== productId ? choice(i, `${b.offerId}:${i.id}`) : null}
                  </span>
                  <span className="shrink-0 tabular-nums" style={{ color: c.muted }}>
                    {money(lines[k]?.priceCents ?? i.priceCents)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-3" style={{ borderColor: c.line }}>
              <span className="text-[14px] font-medium" style={{ color: c.text }}>
                {w("offer_together")}
              </span>
              <span className="tabular-nums">
                {priceCents < fullCents ? (
                  <span className="mr-2 text-[14px] line-through" style={{ color: c.muted }}>
                    {fullText}
                  </span>
                ) : null}
                <span className="text-[17px] font-bold" style={{ color: c.price }} data-bundle-price="">
                  {priceText}
                </span>
              </span>
            </div>
            {setPage ? (
              <a href={setPage} className="mt-3 block w-full border-2 py-3 text-center text-[14.5px] font-semibold" style={button} data-bundle-choose="">
                {w("offer_choose")}
              </a>
            ) : (
              <button type="button" disabled={!ready} aria-live="polite" onClick={() => press(b.offerId, lines as CartLine[])} className="mt-3 w-full border-2 py-3 text-[14.5px] font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-50" style={button} data-bundle-add="">
                {added === b.offerId ? w("added_to_cart") : chosen ? labels.addAll || w("offer_add_all") : w("offer_choose_options")}
              </button>
            )}
          </section>
        )
      })}
      {upsells.map((u) => {
        const p = u.product
        const line = lineFor(p, u.offerId)
        const upPage = pageFor?.(p) ?? null
        const shownPrice = p.variants.length > 1 ? (optionOf(p, u.offerId)?.priceCents ?? p.priceCents) : p.priceCents
        const offerPrice = shownPrice === p.priceCents ? u.offerPriceCents : offerUnitPrice(u, shownPrice, p.payWhatYouWant === true)
        /* In a market's currency: the unit's converted price less its discount's share of it, as checkout charges it. */
        const upMarket = chargedInMarket([{ unitCents: shownPrice, quantity: 1, discountCents: shownPrice - offerPrice }], display)
        return (
          <section key={u.offerId} {...box("p-3")} data-upsell={u.offerId} aria-label={u.title}>
            <p className="mb-2 flex items-center justify-between gap-2 text-[13px] font-medium" style={{ color: c.heading }}>
              <span className="truncate">{u.title}</span>
              {u.label ? badge(u.label) : null}
            </p>
            <div className="flex items-center gap-3">
              {picture(p, 48)}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium" style={{ color: c.text }}>
                  {p.title}
                </p>
                <p className="text-[13px] tabular-nums">
                  <span className="font-medium" style={{ color: c.price }} data-upsell-price="">
                    {upMarket ? upMarket.write(upMarket.totalMinor) : money(offerPrice)}
                  </span>
                  {offerPrice < shownPrice ? (
                    <span className="ml-1.5 line-through" style={{ color: c.muted }}>
                      {money(shownPrice)}
                    </span>
                  ) : null}
                </p>
                {choice(p, u.offerId)}
              </div>
              {upPage ? (
                <a href={upPage} className="inline-flex h-9 shrink-0 items-center border px-3 text-[13.5px] font-semibold" style={button} data-upsell-choose="">
                  {w("offer_choose")}
                </a>
              ) : (
              <button type="button" disabled={!line || disabled} aria-live="polite" onClick={() => line && press(u.offerId, [line])} className="inline-flex h-9 shrink-0 items-center gap-1 border px-3 text-[13.5px] font-semibold transition-opacity disabled:opacity-50" style={button} data-upsell-add="">
                {added === u.offerId ? (
                  w("offer_added")
                ) : (
                  <>
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    {labels.add || w("offer_add")}
                  </>
                )}
              </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
