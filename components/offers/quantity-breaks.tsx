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
import { tierTotals, type Tier } from "@/lib/offers/pricing"
import type { OfferPalette } from "./bundle-offers"

export interface BreakCard {
  offerId: string
  productId: string
  title: string
  tiers: (Tier & { unitPriceCents?: number; totalCents?: number; compareCents?: number })[]
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
}) {
  const c = { heading: palette.heading || ink, text: palette.text || ink, price: palette.price || ink, border: palette.border || "rgba(0,0,0,0.12)", muted, badgeBg: palette.badgeBg || "#dcfce7", badgeText: palette.badgeText || "#166534" }
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
          const shown = tierTotals(priceCents, t, compareAtCents)
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
                    {money(shown.unitPriceCents)} each
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 text-right tabular-nums">
                <span className="block text-[14px] font-semibold" style={{ color: c.price }}>
                  {money(shown.totalCents)}
                </span>
                {shown.compareCents > shown.totalCents ? (
                  <s className="block text-[12.5px]" style={{ color: c.muted }}>
                    {money(shown.compareCents)}
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
