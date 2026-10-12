"use client"

/**
 * ===========================================================================
 *  THE STORE'S GOOGLE ANALYTICS ON A PAGE THAT CHANGES WITHOUT A FULL LOAD
 * ===========================================================================
 * The creator page, its products, the OnePage and checkout are pages of
 * storelib.com: a visitor can go from one to the next, and on to Explore,
 * without the browser loading a page. gtag's config counts the first page;
 * this counts each later one while the store's pages are on screen
 * (window.__slGaPage, lib/store/ga.ts, which leaves it to Google when its
 * own "page changes" listener already counted it), and switches the
 * store's IDs off (Google's own ga-disable-<ID>) the moment the visitor
 * leaves the store's pages, so Storelib's other pages never reach the
 * store's property. Back on the store's page, they are on again.
 *
 * `product`: the product this page is about, registered before any effect
 * runs, so view_item, add_to_cart and begin_checkout carry its name and
 * price (lib/analytics/pixels.ts reads window.__slGaItems).
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { usePathname } from "next/navigation"
import type { GaItem } from "@/lib/store/ga"
import { gaBeginCheckout, gaPurchase } from "@/lib/analytics/pixels"

type GaWindow = Window & {
  __slGaPage?: (ids: string[]) => void
  __slGaSent?: Record<string, string>
  __slGaItems?: Record<string, { item: GaItem; currency: string | null }>
  __slGaWait?: boolean
} & Record<string, unknown>

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

export interface GaCheckout {
  items: GaItem[]
  valueCents: number
  currency: string | null
}

export function GaRoute({ ids, product, checkout }: { ids: string[]; product?: { item: GaItem; currency: string | null } | null; checkout?: GaCheckout | null }) {
  const pathname = usePathname()
  const first = useRef(true)
  const key = ids.join(",")

  /* The product, before TrackView's view_item effect asks for it. */
  useIsoLayoutEffect(() => {
    if (!product) return
    const w = window as unknown as GaWindow
    w.__slGaItems = w.__slGaItems || {}
    w.__slGaItems[product.item.item_id] = product
  }, [product?.item.item_id, product?.item.price, product?.currency])

  /* On while the store's page is on screen, off the moment it is not. A step asked before the tag loads waits for it (lib/analytics/pixels gaStep). */
  useIsoLayoutEffect(() => {
    const w = window as unknown as GaWindow
    w.__slGaWait = true
    for (const id of ids) w[`ga-disable-${id}`] = false
    return () => {
      for (const id of ids) w[`ga-disable-${id}`] = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    const w = window as unknown as GaWindow
    w.__slGaSent = w.__slGaSent || {}
    const fresh = ids.filter((id) => w.__slGaSent![id] === undefined)
    /* The first page this document shows for an ID is gtag config's own page view. */
    for (const id of fresh) w.__slGaSent![id] = window.location.href
    const later = first.current ? ids.filter((id) => !fresh.includes(id)) : ids
    first.current = false
    if (later.length && typeof w.__slGaPage === "function") w.__slGaPage(later)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, key])

  /* Checkout opened: begin_checkout with what is in it, once (lib/analytics/pixels gaBeginCheckout). */
  const begun = checkout ? `${checkout.currency}:${checkout.valueCents}:${checkout.items.map((i) => i.item_id).join(",")}` : ""
  useEffect(() => {
    if (!checkout || checkout.items.length === 0) return
    gaBeginCheckout(window, { currency: checkout.currency, valueCents: checkout.valueCents, items: checkout.items as unknown as Record<string, unknown>[] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begun])

  /*
    Paid, on Storelib's own checkout (app/checkout/checkout-client showPaid
    says so with storelib:paid): purchase, once per order in this browser,
    by a fingerprint of the receipt's address (a credential, never sent).
  */
  useEffect(() => {
    if (!checkout || checkout.items.length === 0) return
    const onPaid = (e: Event) => {
      const d = (e as CustomEvent<{ ref?: string; totalCents?: number }>).detail
      if (!d?.ref) return
      void fingerprint(d.ref).then((id) => gaPurchase(window, { transactionId: id, valueCents: typeof d.totalCents === "number" ? d.totalCents : checkout.valueCents, currency: checkout.currency, items: checkout.items }))
    }
    window.addEventListener("storelib:paid", onPaid)
    return () => window.removeEventListener("storelib:paid", onPaid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [begun])

  return null
}

/** "sl-" and sixteen hex characters of the reference's SHA-256: the same order is the same id, and the reference cannot be read back from it. */
async function fingerprint(ref: string): Promise<string> {
  try {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ref)))
    return `sl-${Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("")}`
  } catch {
    let h = 2166136261
    for (let i = 0; i < ref.length; i++) h = Math.imul(h ^ ref.charCodeAt(i), 16777619) >>> 0
    return `sl-${h.toString(16)}`
  }
}
