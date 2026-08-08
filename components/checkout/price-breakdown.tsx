"use client"

import { useState } from "react"
import { Info } from "lucide-react"

import { CHECKOUT_HEADING } from "@/components/checkout/delivery-options"
import { breakdownLines, type PricingBreakdown } from "@/lib/checkout/pricing"

/**
 * The lines that explain a total.
 *
 * A marketplace charges more than the sticker price — protection, postage — and
 * the only version of that which does not feel like a trick is one where every
 * addition is named on the page BEFORE the pay button, adding visibly to the
 * number underneath it.
 *
 * The protection fee carries a tap target explaining what it buys, because "why
 * am I paying this" is the question it raises and an unanswered one is the
 * reason people abandon a basket.
 *
 * ---------------------------------------------------------------------------
 * THE TOTAL IS NOT HERE
 * ---------------------------------------------------------------------------
 * It lives in the pay bar, which is on screen at all times. Repeating it at the
 * end of this list would put the same number twice within a couple of
 * centimetres, and the moment they ever disagreed — a rounding change, a stale
 * render — the page would be arguing with itself in front of the buyer.
 *
 * Presentational only: it renders a breakdown, it never computes one. The
 * arithmetic lives in lib/checkout/pricing.ts and is shared with the code that
 * charges the card, so the page cannot show a total the card does not match.
 */

export function PriceBreakdown({
  breakdown,
  formatPrice,
  className = "",
}: {
  breakdown: PricingBreakdown
  /** The app's own money formatter, so this obeys the locale everything else does. */
  formatPrice: (cents: number) => string
  className?: string
}) {
  const [openInfo, setOpenInfo] = useState<string | null>(null)
  const lines = breakdownLines(breakdown)

  return (
    <section className={className} aria-label="Detalii preț">
      <h2 className={CHECKOUT_HEADING}>Detalii preț</h2>

      <dl className="mt-3 space-y-2.5">
        {lines.map((line) => (
          <div key={line.label}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-1.5 text-[15px] text-neutral-600">
                <span className="truncate">{line.label}</span>
                {line.info && (
                  <button
                    type="button"
                    onClick={() => setOpenInfo((k) => (k === line.label ? null : line.label))}
                    aria-expanded={openInfo === line.label}
                    aria-label={`Ce este ${line.label}?`}
                    className="shrink-0 text-neutral-400 transition-colors active:text-neutral-700 md:hover:text-neutral-700"
                  >
                    <Info className="h-4 w-4" />
                  </button>
                )}
              </dt>
              <dd className="shrink-0 text-[15px] font-medium tabular-nums text-neutral-900">
                {formatPrice(line.cents)}
              </dd>
            </div>
            {/* Expands in place rather than opening a dialog — the answer is one
                sentence and a modal for one sentence loses the buyer's place. */}
            {line.info && openInfo === line.label && (
              <p className="mt-1.5 rounded-lg bg-neutral-50 px-3 py-2 text-[13px] leading-snug text-neutral-600">
                {line.info}
              </p>
            )}
          </div>
        ))}
      </dl>
    </section>
  )
}
