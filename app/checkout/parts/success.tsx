"use client"

/**
 * The moment between paid and the receipt: a check that draws itself in a
 * circle, the words "Payment complete", and then the receipt. Long enough to
 * be seen, short enough not to be waited for. Still, under reduced motion.
 *
 * Drawn in the page rather than in a portal, beside the checkout (whose
 * root turns inert once paid), so that on the way back from a bank's page
 * the server's own first frame is already "Finishing your order" and the
 * form with Pay on it is never seen, not even for a frame.
 */

import { money } from "./ui"

export type PaidState = "finishing" | "paid" | null

export function PaidOverlay({
  state,
  total,
  free,
  cash = false,
  returningTo = null,
}: {
  /** "finishing": back from a bank with the payment made, the order still being saved. "paid": the order is made. */
  state: PaidState
  total: number
  free: boolean
  /** Placed to be paid in cash on delivery: nothing was paid yet. */
  cash?: boolean
  /** The creator's website the buyer is going back to, when checkout was started there. */
  returningTo?: string | null
}) {
  if (!state) return null
  const finishing = state === "finishing"
  const next = returningTo ? `Taking you back to ${returningTo}` : "Opening your receipt"
  return (
    <div
      data-paid-overlay=""
      data-paid-state={state}
      role="status"
      aria-live="assertive"
      /* Arriving already finishing, it is there from the first frame: a fade in would show the form under it first. */
      className={`${finishing ? "" : "checkout-paid "}fixed inset-0 z-[200] flex items-center justify-center bg-white/92 backdrop-blur-[2px]`}
    >
      <div className="flex flex-col items-center px-6 text-center">
        <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden>
          <circle cx="32" cy="32" r="29" fill="none" stroke="#e5e7eb" strokeWidth="3" />
          {finishing ? (
            <g className="checkout-paid-wait">
              <circle cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" strokeDasharray="46 183" />
            </g>
          ) : (
            <>
              <circle className="checkout-paid-ring" cx="32" cy="32" r="29" fill="none" stroke="#1a1a2e" strokeWidth="3" strokeLinecap="round" transform="rotate(-90 32 32)" />
              <path className="checkout-paid-check" d="M20 33.5l8 8 16-17" fill="none" stroke="#1a1a2e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </svg>
        {finishing ? (
          <>
            <p className="mt-5 text-[20px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">Finishing your order</p>
            <p className="mt-1 text-[14px] text-[#6b7280]">Your payment went through.</p>
          </>
        ) : (
          <>
            <p className="checkout-paid-text mt-5 text-[20px] font-semibold tracking-[-0.01em] text-[#1a1a2e]">{free ? "It's yours" : cash ? "Order placed" : "Payment complete"}</p>
            <p className="checkout-paid-text mt-1 text-[14px] text-[#6b7280]">{free ? next : cash ? `${money(total)} to pay in cash. ${next}` : `${money(total)} paid. ${next}`}</p>
            {returningTo && <p className="checkout-paid-text mt-1 text-[13px] text-[#6b7280]">Your receipt is in your email.</p>}
          </>
        )}
      </div>
    </div>
  )
}

/** The longest the paid screen is held waiting for the receipt: past it, whatever is there is shown. */
const HOLD_LIMIT_MS = 12_000

/**
 * ===========================================================================
 *  THE PAID SCREEN, HELD UNTIL THE RECEIPT IS UNDER IT
 * ===========================================================================
 * Opening the receipt takes the checkout down, and the overlay with it. If
 * the receipt was not drawn by then, what showed was its loading page: a
 * bare grey page for 200ms (its skeleton waits that long on purpose), then
 * the skeleton, then the receipt. Three screens after "Payment complete".
 *
 * So, just before the receipt is opened, the paid screen as it stands (the
 * check drawn, the words in) is copied onto the page outside React, where
 * a change of page cannot take it down. It stays until the receipt, or its
 * not-found page, is in the document, then fades off it over 260ms. Nothing
 * that happens under it in between is seen. Past HOLD_LIMIT_MS it goes
 * anyway, so it can never be left over a page.
 */
export function holdPaidScreen() {
  const live = document.querySelector<HTMLElement>("[data-paid-overlay]")
  if (!live) return
  const held = live.cloneNode(true) as HTMLElement
  held.removeAttribute("data-paid-overlay")
  held.removeAttribute("role")
  held.removeAttribute("aria-live")
  held.setAttribute("aria-hidden", "true")
  held.setAttribute("data-paid-held", "")
  /* A copy would play its animations again from the start: it is held as it was. */
  held.classList.add("checkout-paid-held")
  document.body.appendChild(held)

  const drawn = () =>
    !!document.querySelector("[data-receipt]") ||
    (window.location.pathname.startsWith("/receipt/") && !document.querySelector('[data-page="checkout"], [data-receipt-loading]'))
  let cap = 0
  let released = false
  const release = () => {
    if (released) return
    released = true
    watch.disconnect()
    window.clearTimeout(cap)
    /* Two frames: the receipt has been painted once before the screen over it starts to go. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        held.classList.add("checkout-paid-release")
        window.setTimeout(() => held.remove(), 320)
      }),
    )
  }
  const watch = new MutationObserver(() => {
    if (drawn()) release()
  })
  watch.observe(document.body, { childList: true, subtree: true })
  cap = window.setTimeout(release, HOLD_LIMIT_MS)
}
