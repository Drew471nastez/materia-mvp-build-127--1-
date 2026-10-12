"use client"

/**
 * The notice Add to cart shows when Theme settings › Cart › Cart type is
 * Notification: what was added, a way to the cart, and a way to close it.
 * The visitor stays where they were, which is the point of choosing it.
 *
 * Drawn inside the page root, so it takes the page's own font and colours
 * and the Dropdowns and pop-ups settings (`data-popup`). It is fixed to the
 * top right of the window, and across the top on a phone; in the builder
 * the canvas contains anything fixed, so it sits on the page being edited.
 */
import { useEffect } from "react"
import { X } from "lucide-react"

import { formatPrice } from "@/lib/website-builder/shop-products"
import { useSiteCart } from "../site-cart"
import { useMoney, useWord } from "./storefront-context"

/** Long enough to read two lines and reach View cart; it closes itself after that. */
const NOTICE_MS = 6000

export function CartNotice() {
  const { notice, dismissNotice, live } = useSiteCart()
  const w = useWord()
  const money = useMoney()

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(dismissNotice, NOTICE_MS)
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissNotice() }
    window.addEventListener("keydown", onKey)
    return () => { window.clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [notice, dismissNotice])

  if (!notice) return null
  const price = notice.priceCents > 0 ? money(notice.priceCents) : formatPrice(notice.priceCents)
  return (
    <div
      role="status"
      aria-live="polite"
      data-popup=""
      data-cart-notice=""
      className="fixed z-[80] top-4 right-4 left-4 sm:left-auto sm:w-[340px] p-4 flex gap-3 items-start"
      style={{
        background: "var(--theme-bg, #ffffff)",
        color: "var(--theme-text, #1a1a2e)",
        borderRadius: "var(--theme-popup-radius, 12px)",
        border: "var(--theme-popup-border, 1px) solid color-mix(in srgb, currentColor 14%, transparent)",
        boxShadow: "var(--theme-popup-shadow, 0 12px 32px -12px rgba(15, 23, 42, 0.28))",
      }}
    >
      {notice.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={notice.thumbnailUrl} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-md object-cover" />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[13px] opacity-70">{w("added_to_cart")}</p>
        <p className="m-0 mt-0.5 text-[15px] font-semibold truncate">{notice.title}{notice.variantName ? `, ${notice.variantName}` : ""}</p>
        {price ? <p className="m-0 mt-0.5 text-[14px] tabular-nums opacity-80">{price}</p> : null}
        {live ? (
          <a href="/cart" className="mt-3 inline-flex h-10 items-center rounded-[var(--theme-button-radius,8px)] px-4 text-[14px] font-semibold no-underline" style={{ background: "var(--theme-primary, #1a1a2e)", color: "#ffffff" }}>
            {w("view_cart")}
          </a>
        ) : null}
      </div>
      <button type="button" aria-label="Close" onClick={dismissNotice} className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}
