"use client"

/**
 * A PRODUCT'S QUANTITY BREAKS ON STORELIB'S OWN PRODUCT SECTION (the
 * "Bundles and upsells" block, components/website-builder/sections/
 * renderers/product/offers-block.tsx): each tier of the store's quantity
 * break for this product (Products, Upsells and bundles), as a choice that
 * sets the buy box's quantity to the tier's units (paid and free), with its
 * total and what it would cost without the offer.
 *
 * The numbers are lib/offers/pricing.ts tierTotals at the option chosen in
 * the buy box: the formula the checkout charges by, so what the tier says is
 * what the cart and the checkout take, to the cent. Nothing here decides a
 * price: the checkout prices the cart again on the server.
 */
import { tierDiscounts, tierTotals, type Tier } from "@/lib/offers/pricing"
import { applyOffers } from "@/lib/offers/offers"
import { chargedInMarket, type PageDisplay } from "@/lib/markets/cart-money"
import type { OfferPalette } from "./bundle-offers"
import { useWord } from "@/components/website-builder/theme/storefront-context"

export interface BreakCard {
  offerId: string
  productId: string
  title: string
  tiers: (Tier & { unitPriceCents?: number; totalCents?: number; compareCents?: number })[]
}

/**
 * A tier's numbers as written on the page: in the store's currency by
 * tierTotals; in a market's by the checkout's own arithmetic and conversion
 * (applyOffers on that many units, then chargedInMarket), so the tier says
 * what the cart and the checkout will in that currency.
 */
export function tierShown(priceCents: number, tiers: Tier[], i: number, compareAtCents: number | null, money: (cents: number) => string, display?: PageDisplay | null): { totalCents: number; total: string; compare: string | null; each: string } {
  const t = tiers[i]
  const units = t.quantity + t.freeQuantity
  const own = tierTotals(priceCents, t, compareAtCents)
  const r = applyOffers([{ productId: "p", unitCents: priceCents, quantity: units }], [{ id: "q", kind: "quantity_break", title: "", productIds: ["p"], triggerIds: [], discountType: "none", discountValue: 0, active: true, tiers }])
  const m = chargedInMarket([{ unitCents: priceCents, quantity: units, discountCents: r.discounts[0] }], display)
  if (!m) return { totalCents: own.totalCents, total: money(own.totalCents), compare: own.compareCents > own.totalCents ? money(own.compareCents) : null, each: money(own.unitPriceCents) }
  const plainCompare = t.freeQuantity === 0 && !tierDiscounts(t) && typeof compareAtCents === "number" && compareAtCents > priceCents
  const compare = plainCompare ? m.unitMinor(compareAtCents as number) * t.quantity : m.fullMinor
  return { totalCents: own.totalCents, total: m.write(m.totalMinor), compare: compare > m.totalMinor ? m.write(compare) : null, each: m.write(Math.round(m.totalMinor / Math.max(1, units))) }
}

export function QuantityBreaks({
  breaks,
  priceCents,
  compareAtCents = null,
  quantity,
  onPick,
  money,
  palette = {},
  ink = "#1a1a2e",
  muted = "#6b7280",
  radius = 10,
  disabled = false,
  display = null,
}: {
  breaks: BreakCard[]
  /** The option chosen in the buy box, at its price: the tiers are priced at it. */
  priceCents: number
  compareAtCents?: number | null
  /** The buy box's quantity: the tier whose units it is reads as chosen. */
  quantity: number
  onPick: (units: number) => void
  money: (cents: number) => string
  palette?: OfferPalette
  ink?: string
  muted?: string
  radius?: number
  disabled?: boolean
  /** The visitor's market, when the page shows its currency: the tiers then say what checkout charges in it. */
  display?: PageDisplay | null
}) {
  const c = { heading: palette.heading || ink, text: palette.text || ink, price: palette.price || ink, border: palette.border || "rgba(0,0,0,0.12)", muted, badgeBg: palette.badgeBg || "#dcfce7", badgeText: palette.badgeText || "#166534" }
  const w = useWord()
  const first = breaks.find((b) => b.tiers.length > 0)
  if (!first) return null
  return (
    <section className="border p-4" style={{ borderColor: c.border, borderRadius: radius + 4 }} data-quantity-breaks={first.offerId} aria-label={first.title}>
      <h3 className="mb-3 text-[15px] font-semibold" style={{ color: c.heading }}>
        {first.title}
      </h3>
      <div role="radiogroup" aria-label={first.title} className="space-y-2">
        {first.tiers.map((t, i) => {
          const units = t.quantity + t.freeQuantity
          const shown = tierShown(priceCents, first.tiers, i, compareAtCents, money, display)
          const picked = quantity === units
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={picked}
              disabled={disabled}
              onClick={() => onPick(units)}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 border px-3 py-2.5 text-left transition-colors disabled:cursor-default"
              style={{ borderColor: picked ? c.heading : c.border, borderWidth: picked ? 2 : 1, borderRadius: radius, padding: picked ? "9px 11px" : undefined }}
              data-tier={i}
              data-tier-total={shown.totalCents}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium" style={{ color: c.text }}>
                    {t.label}
                  </span>
                  {t.badge ? (
                    <span className="rounded-full px-2 py-0.5 text-[12px] font-medium" style={{ background: c.badgeBg, color: c.badgeText }}>
                      {t.badge}
                    </span>
                  ) : null}
                </span>
                {units > 1 ? (
                  <span className="mt-0.5 block text-[12.5px] tabular-nums" style={{ color: c.muted }}>
                    {w("offer_each").replace("{price}", shown.each)}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-[14px] font-semibold" style={{ color: c.price }}>
                  {shown.total}
                </span>
                {shown.compare ? (
                  <s className="block text-[12.5px]" style={{ color: c.muted }}>
                    {shown.compare}
                  </s>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
