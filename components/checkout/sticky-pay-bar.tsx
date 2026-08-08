"use client"

import { Loader2, Lock } from "lucide-react"

/**
 * The total and the pay button, pinned to the bottom of the screen.
 *
 * ---------------------------------------------------------------------------
 * Why pinned rather than at the end of the page
 * ---------------------------------------------------------------------------
 * A checkout is a list of decisions — address, delivery, card — and each one
 * changes the total. If the total lives at the bottom of a long scroll, the
 * consequence of every choice is off-screen at the moment it is made. Keeping
 * both in view means picking a delivery option and watching the number move,
 * which is the difference between a form and a transaction someone understands.
 *
 * It also removes the hunt for the button, which on a phone is the single most
 * common reason a checkout is abandoned halfway.
 *
 * ---------------------------------------------------------------------------
 * The details that make a pinned bar work rather than annoy
 * ---------------------------------------------------------------------------
 * - The safe-area inset is added to the padding, not just respected — on a
 *   phone with a home indicator, a button flush to the bottom is a button
 *   people miss and a gesture they trigger by accident.
 * - It is `sticky`, not `fixed`: a fixed element inside a transformed ancestor
 *   is positioned against that ancestor instead of the viewport, and this app
 *   transforms page containers during navigation.
 */

/**
 * Formerly a 132px block of nothing at the end of the page.
 *
 * It existed to stop a FIXED bar covering the last section. The bar is sticky
 * and sits in the flow as the last child of a full-height flex column, so it
 * has never covered anything — the spacer was only ever a hand's width of empty
 * white under the final section. Kept as an empty string so no caller breaks.
 */
export const PAY_BAR_SPACER = ""

export function StickyPayBar({
  totalLabel = "Total de plată",
  total,
  actionLabel = "Plătește",
  onAction,
  disabled = false,
  busy = false,
  /** Shown above the button — a blocking reason, in the buyer's words. */
  hint,
}: {
  totalLabel?: string
  total: string
  actionLabel?: string
  onAction: () => void
  /** No longer greys the button — see the note on the button itself. Kept so
   *  callers can still express "not ready", which drives the hint. */
  disabled?: boolean
  busy?: boolean
  hint?: string | null
}) {
  void disabled
  return (
    <div
      className="sticky bottom-0 z-30 border-t border-neutral-200 bg-white"
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto w-full max-w-2xl px-4 pt-3">
        {hint && (
          <p id="pay-bar-hint" className="mb-2 text-center text-[12.5px] text-amber-700">
            {hint}
          </p>
        )}

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-bold text-neutral-900">{totalLabel}</span>
          <span className="text-[19px] font-bold tabular-nums text-neutral-900">{total}</span>
        </div>

        {/* ── ALWAYS FILLED, NEVER GREYED ────────────────────────────────────
            A washed-out pay button is a dead end: it tells you that you cannot
            buy, and nothing about what to do instead. So it stays solid, stays
            pressable, and when something is still missing the press TAKES YOU
            THERE — the hint above says what, and the tap opens it.

            The only state that genuinely refuses the press is `busy`, because
            the money is already moving and a second press would be a second
            attempt at it. */}
        <button
          type="button"
          onClick={onAction}
          disabled={busy}
          aria-describedby={hint ? "pay-bar-hint" : undefined}
          className="mt-2.5 inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-full bg-[#7c3aed] px-6 text-[16px] font-semibold text-white transition-transform active:scale-[0.985] disabled:active:scale-100"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {busy ? "Se procesează…" : actionLabel}
        </button>

        <p className="mt-2 flex items-center justify-center gap-1.5 text-[12px] text-neutral-500">
          <Lock className="h-3 w-3" />
          Detaliile tale de plată sunt criptate și securizate
        </p>
      </div>
    </div>
  )
}
