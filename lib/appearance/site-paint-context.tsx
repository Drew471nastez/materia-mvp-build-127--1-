"use client"

/**
 * Whether the parts below paint their inline colours to follow the person's look (./site-paint). On only inside
 * Storelib's own product page (app/(marketing)/p/[slug]/page.tsx, data-product-look="site"); everywhere else, a
 * creator's own page, a website, the builder, each part paints exactly what it always did.
 */
import { createContext, useContext, type ReactNode } from "react"
import { noPaint, sitePaint, type Paint } from "./site-paint"

const SitePaintContext = createContext<Paint>(noPaint)

export function SitePaintProvider({ on, children }: { on: boolean; children: ReactNode }) {
  return <SitePaintContext.Provider value={on ? sitePaint : noPaint}>{children}</SitePaintContext.Provider>
}

/** paint(colour, role): the colour made to follow the look on Storelib's own product page, unchanged anywhere else. */
export function useSitePaint(): Paint {
  return useContext(SitePaintContext)
}

/** Whether this part is on Storelib's own product page, where its colours follow the person's look. */
export function useSitePaintOn(): boolean {
  return useContext(SitePaintContext) === sitePaint
}
