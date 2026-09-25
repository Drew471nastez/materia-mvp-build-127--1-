"use client"

/**
 * The moment between paid and the receipt: a check that draws itself in a
 * circle, the words "Payment complete", and then the receipt. Long enough to
 * be seen, short enough not to be waited for. Still, under reduced motion.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { money } from "./ui"

export function PaidOverlay({
  show,
  total,
  free,
  returningTo = null,
}: {
  show: boolean
  total: number
  free: boolean
  /** The creator's website the buyer is going back to, when checkout was started there. */
  returningTo?: string | null
}) {
  const next = returningTo ? `Taking you back to ${returningTo}` : "Opening your receipt"
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  if (!show || !mounted) return null
  return createPortal(
    <div role="status" aria-live="assertive" className="checkout-paid fixed inset-0 z-[200] flex items-center justify-center bg-white/92 backdrop-blur-[2px]">
      <div className="flex flex-col items-center px-6 text-center">
        <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
          <circle cx="32" cy="32" r="29" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          <circle className="checkout-paid-ring" cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 32 32)" />
          <path className="checkout-paid-check" d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="checkout-paid-text mt-5 text-[20px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{free ? "It's yours" : "Payment complete"}</p>
        <p className="checkout-paid-text mt-1 text-[14px] text-[#6b7280]">{free ? next : `${money(total)} paid. ${next}`}</p>
        {returningTo && <p className="checkout-paid-text mt-1 text-[13px] text-[#6b7280]">Your receipt is in your email.</p>}
      </div>
    </div>,
    document.body,
  )
}
