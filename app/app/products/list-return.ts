"use client"

import { moveLayer } from "@/components/app/page-layer"
import { markTraversal, prefetchAppPage } from "@/lib/ui/app-navigation"

/**
 * ===========================================================================
 *  BETWEEN THE PRODUCTS LIST AND A PRODUCT
 * ===========================================================================
 * Both ways are one move of the editor's layer (moveLayer): in from the
 * list, out to it. What else the round trip keeps:
 *
 *   THE LIST IS ALREADY HERE. The editor prefetches /app/products in full
 *   when it opens, and again once a save's refresh has landed (a refresh
 *   drops every page the router kept), so going back finds it ready and the
 *   move never waits on the server.
 *
 *   WHERE YOU WERE. Going back is recorded as a return (markTraversal), so
 *   the stage puts the list's scroll back where it was, as a browser back
 *   would. The list keeps its own view, order and search (products-client).
 *
 *   WHICH ONE YOU OPENED. The product the editor had open is handed to the
 *   list, which tints its row for a moment as it comes back into view.
 */

type Router = { push: (href: string) => void; prefetch: (href: string, options?: never) => void }

export const PRODUCTS_HREF = "/app/products"

let edited: string | null = null

/** Open a product, or a new one, from the list. */
export function openEditor(router: Router, href: string) {
  moveLayer("enter", () => router.push(href))
}

/** Leave the editor for the list. `productId` is the saved product, if there is one. */
export function returnToProducts(router: Router, productId: string | null) {
  edited = productId
  moveLayer("leave", () => {
    markTraversal()
    router.push(PRODUCTS_HREF)
  })
}

/** The list, fetched ahead, so the way back is instant. */
export function warmProducts(router: Router) {
  prefetchAppPage(router, PRODUCTS_HREF)
}

/** The product the editor just had open, once. */
export function takeEdited(): string | null {
  const id = edited
  edited = null
  return id
}
