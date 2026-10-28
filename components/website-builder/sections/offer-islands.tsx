"use client"

/**
 * A PRODUCT'S OFFERS INSIDE A .storelib SECTION. The section's markup is one
 * string (StorelibSection), so it cannot hold React. A section that features
 * a product marks where its offers go:
 *
 *   <div data-storelib-island data-storelib-offers="{{ product id }}"
 *        data-title=… data-slug=… data-kind=… data-image=… data-pwyw=…
 *        data-layout="card" | "open"></div>
 *
 * and this draws components/offers/featured-offers.tsx into each mark, on the
 * published page and on the builder's canvas alike. The marks are read again
 * whenever the section's markup changes (`html`, what is on the page now), and
 * lib/website-builder/morph-html.ts leaves a mark's children alone, so an edit
 * in the sidebar never pulls React's nodes out from under it.
 *
 * The offers' code loads only on a page that has a mark.
 */
import { lazy, Suspense, useLayoutEffect, useState } from "react"
import { createPortal } from "react-dom"

const FeaturedOffers = lazy(() => import("@/components/offers/featured-offers"))

export interface OfferIsland {
  el: HTMLElement
  productId: string
  title: string
  slug: string
  kind: string
  image: string | null
  payWhatYouWant: boolean
  layout: "card" | "open"
  radius: number
}

/** Every offers mark under `root`, read off its attributes. */
export function offerIslandsIn(root: ParentNode): OfferIsland[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-storelib-offers]")).flatMap((el) => {
    const productId = (el.getAttribute("data-storelib-offers") ?? "").trim()
    if (!productId) return []
    const a = (n: string) => (el.getAttribute(n) ?? "").trim()
    /* The section's corner radius, as its root sets it (--s-radius, theme.radius.medium). */
    const radius = Number.parseFloat(a("data-radius") || (typeof getComputedStyle === "function" ? getComputedStyle(el).getPropertyValue("--s-radius") : ""))
    return [{ el, productId, title: a("data-title"), slug: a("data-slug"), kind: a("data-kind"), image: a("data-image") || null, payWhatYouWant: a("data-pwyw") === "true", layout: a("data-layout") === "card" ? "card" : "open", radius: Number.isFinite(radius) ? radius : 10 }]
  })
}

export function OfferIslands({ root, html, inert }: { root: HTMLElement | null; html: string; inert: boolean }) {
  const [islands, setIslands] = useState<OfferIsland[]>([])
  useLayoutEffect(() => {
    if (!root || !html.includes("data-storelib-offers")) {
      setIslands((was) => (was.length ? [] : was))
      return
    }
    setIslands(offerIslandsIn(root))
  }, [root, html])
  if (islands.length === 0) return null
  return (
    <>
      {islands.map((i, n) =>
        createPortal(
          <Suspense fallback={null}>
            <FeaturedOffers productId={i.productId} title={i.title} slug={i.slug} kind={i.kind} image={i.image} payWhatYouWant={i.payWhatYouWant} layout={i.layout} inert={inert} radius={i.radius} />
          </Suspense>,
          i.el,
          `${n}:${i.productId}`,
        ),
      )}
    </>
  )
}
