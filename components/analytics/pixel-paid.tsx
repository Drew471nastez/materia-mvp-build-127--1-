"use client"

/**
 * ===========================================================================
 *  PAID ON THE PAGE, TOLD TO EVERY PIXEL (round 41)
 * ===========================================================================
 * The OnePage's checkout window (components/checkout/instant-checkout) and
 * Storelib's checkout (app/checkout/checkout-client) say a payment went
 * through with `storelib:paid`. GaRoute told Google Analytics, and only
 * where Google's tag was on and the page knew its checkout; Meta, TikTok and
 * Pinterest heard nothing from a OnePage purchase. Mounted with the store's
 * tags (components/website-builder/store-tracking), this tells all of them
 * (lib/analytics/pixels pixelPurchase), once per order in this browser, by
 * the same id GaRoute uses, so Google never counts it twice.
 */
import { useEffect } from "react"
import { paidEventId, pixelPurchase } from "@/lib/analytics/pixels"

export function PixelPaid({ currency = null }: { currency?: string | null }) {
  useEffect(() => {
    const onPaid = (e: Event) => {
      const d = (e as CustomEvent<{ ref?: string; totalCents?: number; currency?: string | null; productId?: string | null }>).detail
      if (!d?.ref || typeof d.totalCents !== "number") return
      void paidEventId(d.ref).then((eventId) =>
        pixelPurchase(window, { eventId, valueCents: d.totalCents!, currency: d.currency ?? currency, productIds: d.productId ? [d.productId] : [] }),
      )
    }
    window.addEventListener("storelib:paid", onPaid)
    return () => window.removeEventListener("storelib:paid", onPaid)
  }, [currency])
  return null
}
