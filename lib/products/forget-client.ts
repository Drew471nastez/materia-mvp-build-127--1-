"use client"

import { announceProductDeleted } from "@/lib/products/deleted-signal"

/**
 * After a product has been DELETED, archived, unpublished or published, tell
 * the server so it can drop what is cached of it and take a deleted one off
 * the creator's OnePage (app/api/products/forget).
 *
 * Awaited, unlike the IndexNow announce next door: the screens that call it
 * navigate or re-render straight afterwards, and a purge that lost the race
 * with the reload it was meant to fix is a purge that did nothing. A failure
 * is swallowed either way, because the delete itself has already happened.
 */
export async function forgetProduct(productId: string | null | undefined, productSlug?: string | null): Promise<void> {
  if (!productId && !productSlug) return
  try {
    const res = await fetch("/api/products/forget", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: productId ?? undefined, productSlug: productSlug ?? undefined }),
      keepalive: true,
    })
    /* Gone, not only archived: an open OnePage editor drops its block now (lib/products/deleted-signal). */
    const body = (await res.json().catch(() => null)) as { deleted?: unknown } | null
    if (productId && body?.deleted === true) announceProductDeleted(productId)
  } catch {
    /* Nothing to do: the change to the product is what mattered. */
  }
}
