/**
 * ===========================================================================
 *  STORELIB'S OWN SECTIONS AND APP BLOCKS, REGISTERED FOR IMPORTED THEMES
 * ===========================================================================
 * An imported theme draws a few sections and blocks that no theme ships a
 * file for: Storelib supplies them, the way a Shopify app supplies its
 * blocks. The engine adds the section files when it draws a page
 * (./storelib-reviews.ts withStorelibReviewsSection) and draws the app
 * blocks in place (./theme.ts).
 *
 * So a template that names one of them is valid without a
 * sections/<type>.liquid in the theme: the ZIP import
 * (lib/storelib-theme/shopify/convert.ts) and a GitHub push
 * (lib/github-sync/layout.ts mergePages) keep the section with its settings
 * and blocks. Any other type the theme has no file for is still refused,
 * with the reason.
 *
 * And they are the creator's own work, placed in the builder: a push or a
 * re-import whose template leaves one out keeps it where it was, with its
 * id and its settings (preserveNativeWidgets below).
 *
 * Pure: names and a merge, nothing else.
 */
import { REVIEW_STARS_BLOCK, REVIEWS_LIST_BLOCK } from "./review-app-blocks"
import { ESTIMATED_DELIVERY_BLOCK, STOCK_STATUS_BLOCK } from "./product-app-blocks"
import { SIZE_CHART_APP_BLOCK } from "./size-chart"
import { OFFERS_APP_BLOCK } from "./offers-app-block"

export const REVIEWS_SECTION_TYPE = "storelib-reviews"
export const REVIEW_WIDGET_SECTION_TYPE = "storelib-review-widget"

/** The section types Storelib adds to every imported theme. */
export const STORELIB_APP_SECTION_TYPES: readonly string[] = [REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE]

/** What the builder names each one, as Add section does. */
export const STORELIB_APP_SECTION_NAMES: Readonly<Record<string, string>> = { [REVIEWS_SECTION_TYPE]: "Storelib Reviews", [REVIEW_WIDGET_SECTION_TYPE]: "Reviews widget" }

/** Storelib's own app blocks, by the address a page keeps them under. */
export const STORELIB_APP_BLOCK_TYPES: readonly string[] = [REVIEW_STARS_BLOCK, REVIEWS_LIST_BLOCK, STOCK_STATUS_BLOCK, ESTIMATED_DELIVERY_BLOCK, SIZE_CHART_APP_BLOCK, OFFERS_APP_BLOCK]

/** A section type Storelib draws in an imported theme without a file of the theme's. */
export function isStorelibNativeSection(type: unknown): boolean {
  return typeof type === "string" && STORELIB_APP_SECTION_TYPES.includes(type)
}

/** One of Storelib's own app blocks. */
export function isStorelibAppBlock(type: unknown): boolean {
  return typeof type === "string" && STORELIB_APP_BLOCK_TYPES.includes(type)
}

type Block = { id: string; type: string; settings?: Record<string, unknown>; blocks?: Block[]; [k: string]: unknown }
type Section = { id: string; type: string; settings?: Record<string, unknown>; blocks?: unknown[] }

/** Storelib app blocks the incoming tree has lost, anywhere under `before`, put back at the level they were at. */
function keepAppBlocks(before: Block[] | undefined, after: Block[] | undefined): Block[] | undefined {
  if (!before?.length) return after
  const out = [...(after ?? [])]
  const ids = new Set<string>()
  const walk = (list: Block[]) => {
    for (const b of list) {
      ids.add(b.id)
      if (b.blocks) walk(b.blocks)
    }
  }
  walk(out)
  for (const [i, b] of before.entries()) {
    if (ids.has(b.id)) {
      const at = out.findIndex((x) => x.id === b.id)
      if (at >= 0 && out[at].type === b.type) {
        const inner = keepAppBlocks(b.blocks, out[at].blocks)
        out[at] = { ...out[at], ...(inner?.length ? { blocks: inner } : {}), ...(isStorelibAppBlock(b.type) ? { settings: { ...(out[at].settings ?? {}), ...(b.settings ?? {}) } } : {}) }
      }
      continue
    }
    if (!isStorelibAppBlock(b.type)) continue
    /* Back after the block that came before it, else where it was by count. */
    const prev = before[i - 1]
    const after_ = prev ? out.findIndex((x) => x.id === prev.id) : -1
    out.splice(after_ >= 0 ? after_ + 1 : Math.min(i, out.length), 0, b)
    ids.add(b.id)
  }
  return out
}

/**
 * A page's sections after a push or a re-import, with the creator's own
 * Storelib widgets kept:
 *
 *   a Storelib section the new list leaves out   kept, after the section it
 *                                                followed, else at the end
 *   the same section id in both                  the new one, with the
 *                                                settings it had kept over it
 *   a Storelib app block a section lost          put back in that section
 *
 * `before` and `after` are one part of a page (its template sections); the
 * header and footer groups are merged by their own rule.
 */
export function preserveNativeWidgets<S extends Section>(before: readonly S[], after: readonly S[]): S[] {
  if (!before.length) return [...after]
  const out: S[] = after.map((s) => {
    const was = before.find((b) => b.id === s.id && b.type === s.type)
    if (!was) return s
    const blocks = keepAppBlocks(was.blocks as Block[] | undefined, s.blocks as Block[] | undefined)
    const kept = isStorelibNativeSection(s.type) ? { settings: { ...(s.settings ?? {}), ...(was.settings ?? {}) } } : {}
    return { ...s, ...kept, ...(blocks?.length ? { blocks } : {}) }
  })
  for (const [i, s] of before.entries()) {
    if (!isStorelibNativeSection(s.type) || out.some((x) => x.id === s.id)) continue
    const prev = before.slice(0, i).reverse().find((p) => out.some((x) => x.id === p.id))
    const at = prev ? out.findIndex((x) => x.id === prev.id) + 1 : 0
    out.splice(at, 0, s)
  }
  return out
}
