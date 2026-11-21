/**
 * ===========================================================================
 *  A PRODUCT DELETED WHILE THE ONEPAGE EDITOR WAS OPEN
 * ===========================================================================
 * Deleting a product takes its blocks off the creator's page
 * (lib/products/forget-product.ts). That rewrites `draft_blocks`, so the
 * page's edit version (lib/onepage/edit-version) moved, and the editor that
 * was open meanwhile was told on its next Save that "This page was saved
 * somewhere else". Its second Save then sent the whole page with no base,
 * and the deleted product's block came back.
 *
 * Nobody else edited the page, so it is not a conflict. Each removal is
 * noted in the page's own settings: the version it moved the page FROM, the
 * version it moved it TO, and the product. A save whose base is an older
 * version is let through when nothing but these removals lies between that
 * base and the row, and the removed products are taken out of what it sends.
 * Anything else in between (another editor's save) is still a conflict.
 *
 * Settings are left out of the edit version on purpose, so noting a removal
 * there does not move the version again. The editor never writes this key
 * (app/api/onepage drops it from a save), so a stale copy cannot erase it.
 *
 * Pure and isomorphic.
 */
import { withoutProduct } from "@/lib/onepage/live-products"

export const PRODUCT_REMOVALS_KEY = "product_removals"

/** The last few are enough: an editor left open longer than this many deletes is asked, as before. */
const KEPT = 20

export type ProductRemoval = { from: string; to: string; product_id: string; at: string }

const VERSION = /^[0-9a-f]{16}$/

function removalsOf(settings: unknown): ProductRemoval[] {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return []
  const list = (settings as Record<string, unknown>)[PRODUCT_REMOVALS_KEY]
  if (!Array.isArray(list)) return []
  return list.filter(
    (r): r is ProductRemoval =>
      !!r && typeof r === "object" && VERSION.test(String((r as ProductRemoval).from)) && VERSION.test(String((r as ProductRemoval).to)) && typeof (r as ProductRemoval).product_id === "string" && (r as ProductRemoval).product_id !== "",
  )
}

/** The page's settings with one more removal noted, the oldest dropped past the limit. */
export function withRemovalNoted(settings: unknown, removal: ProductRemoval): Record<string, unknown> {
  const base = settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {}
  const list = [...removalsOf(base), removal].slice(-KEPT)
  return { ...base, [PRODUCT_REMOVALS_KEY]: list }
}

/**
 * The products removed by the server between the version an editor started
 * from and the row's version now, or null when something else changed the
 * page in between (a real conflict). The same version is an empty list.
 */
export function removedSince(settings: unknown, base: string, current: string | null): string[] | null {
  if (!current) return null
  if (base === current) return []
  const removals = removalsOf(settings)
  const ids: string[] = []
  let at = base
  const seen = new Set<string>()
  while (at !== current) {
    if (seen.has(at)) return null
    seen.add(at)
    /* The latest removal from this version: a page put back to the same blocks later is followed forward, not back. */
    const step = [...removals].reverse().find((r) => r.from === at)
    if (!step) return null
    ids.push(step.product_id)
    at = step.to
  }
  return ids
}

/** Blocks with every mention of these products taken out (a product block, a course, an email capture's download). */
export function withoutProducts<T>(blocks: T, productIds: readonly string[]): T {
  let out = blocks
  for (const id of productIds) out = withoutProduct(out, id)
  return out
}

/** Settings the editor sent, without the key only the server writes. */
export function withoutRemovalsKey<T>(settings: T): T {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings
  if (!(PRODUCT_REMOVALS_KEY in (settings as Record<string, unknown>))) return settings
  const { [PRODUCT_REMOVALS_KEY]: _dropped, ...rest } = settings as Record<string, unknown>
  return rest as T
}
