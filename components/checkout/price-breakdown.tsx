"use client"

import { useState } from "react"
import { BadgeCheck, Info, MessageSquare, RotateCcw, ShieldCheck } from "lucide-react"

import { CHECKOUT_HEADING } from "@/components/checkout/delivery-options"
import { BottomSheet } from "@/components/ui/bottom-sheet"
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
                    onClick={() => setOpenInfo(line.label)}
                    // It opens a sheet, so it announces a dialog. `aria-expanded`
                    // would promise a region unfolding in place, which is what
                    // this used to do and no longer does.
                    aria-haspopup="dialog"
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
          </div>
        ))}
      </dl>

      {/* A sheet rather than a line that unfolds in place.
          "What is this fee" deserves a real answer — what it covers, when it
          pays out, how to use it — and four sentences shoved between two price
          rows pushes the total off the screen at the exact moment somebody is
          deciding. The sheet follows the finger, throws away on a flick, and
          leaves the page behind it untouched. */}
      <BottomSheet
        open={openInfo !== null}
        onClose={() => setOpenInfo(null)}
        label="Taxă de protecție pentru cumpărători"
        header={
          <div className="px-4 pb-1">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-6 w-6 shrink-0 text-[#7c3aed]" />
              <h3 className="text-[19px] font-bold leading-tight text-neutral-900">
                Taxă de protecție pentru cumpărători
              </h3>
            </div>
          </div>
        }
      >
        <div className="px-4 pb-2">
          <p className="text-[15px] leading-relaxed text-neutral-600">
            Se adaugă la fiecare comandă și acoperă costul verificării plății și al rezolvării problemelor. Fără
            ea, un articol care nu ajunge ar fi pierderea ta.
          </p>

          <ul className="mt-4 space-y-3.5">
            {[
              {
                icon: RotateCcw,
                title: "Primești banii înapoi",
                body: "Dacă articolul nu ajunge, ajunge deteriorat sau nu corespunde descrierii din anunț.",
              },
              {
                icon: BadgeCheck,
                title: "Plată securizată",
                body: "Banii ajung la vânzător după ce comanda este confirmată, nu în momentul plății.",
              },
              {
                icon: MessageSquare,
                title: "Ajutor de la o persoană",
                body: "Ai la dispoziție 48 de ore de la livrare ca să semnalezi o problemă din secțiunea Comenzi.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-neutral-400" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-neutral-900">{title}</p>
                  <p className="mt-0.5 text-[14px] leading-snug text-neutral-500">{body}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-5 rounded-xl bg-neutral-50 px-3.5 py-3 text-[13px] leading-snug text-neutral-500">
            Taxa este de 5% din prețul articolului plus o sumă fixă de 4 lei. Suma fixă este ceea ce face
            viabile comenzile mici — un procent singur ar însemna 50 de bani la o vânzare de 10 lei.
          </p>
        </div>
      </BottomSheet>
    </section>
  )
}
