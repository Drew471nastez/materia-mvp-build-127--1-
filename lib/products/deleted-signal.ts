"use client"

/**
 * A PRODUCT DELETED, SAID TO EVERY OTHER SCREEN OF THIS BROWSER.
 * Deleting a product takes its blocks off the creator's OnePage on the
 * server (lib/products/forget-product). An editor open on that page, in
 * another tab or under the Products screen, still drew the block until its
 * next save. Deleting says so here; the editor drops the block from its own
 * copy at once, keeping every other edit (lib/onepage/context.tsx).
 */
const CHANNEL = "storelib:product-deleted"

export function announceProductDeleted(productId: string): void {
  if (typeof window === "undefined" || !productId) return
  try {
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage({ productId })
    ch.close()
  } catch {
    /* A browser without it: the editor's next save takes the block out instead (app/api/onepage removed_products). */
  }
}

export function onProductDeleted(run: (productId: string) => void): () => void {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return () => {}
  const ch = new BroadcastChannel(CHANNEL)
  ch.onmessage = (e: MessageEvent<{ productId?: unknown }>) => {
    const id = e.data?.productId
    if (typeof id === "string" && id) run(id)
  }
  return () => ch.close()
}
