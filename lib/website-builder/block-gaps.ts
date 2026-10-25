/**
 * ===========================================================================
 *  ADD A BLOCK HERE, BETWEEN TWO BLOCKS (round 12)
 * ===========================================================================
 * The owner: "in the places where there are blocks, when I hover in between,
 * there should also be the + icon appearing like it does in between
 * sections, that when I click it opens the library with the blocks of that
 * section".
 *
 * The canvas already has a strip between two sections. Between two blocks
 * of a section it is drawn the same way (a grey line grows out from the
 * middle, a round button turns into place), over the page rather than in
 * its flow, so a section lays out exactly as it does on the website. Where
 * the places are is measured from the page as drawn: every element marked
 * `data-block-id` (a Storelib section's blocks, an imported theme's
 * `{{ block.shopify_attributes }}`), grouped by the block it sits in.
 *
 * Only between two blocks of one level that are stacked one under the other:
 * a row of blocks side by side has no line across it to point at. The place
 * is the middle of the space between them, the band the width of both.
 *
 * Pure, so tests can hand it boxes. The imported theme's frame runs the same
 * rules, written for the page (lib/storelib-theme/compat/canvas-bridge.ts).
 */

export interface BlockBox {
  id: string
  /** The ids of the blocks it sits in, outermost first; [] for the section's own. */
  parent: string[]
  top: number
  bottom: number
  left: number
  right: number
}

export interface BlockGap {
  /** The line, in the same coordinates as the boxes. */
  y: number
  left: number
  width: number
  parent: string[]
  /** The block below the place: a new block goes in before it. */
  before: string
  /** The block above it. */
  after: string
}

/** How far into the block below a block above may reach and still be "above" it (a negative margin, a rounding). */
const OVERLAP = 4

/**
 * Every place between two blocks of one level, in document order. `boxes`
 * are in document order too, as `querySelectorAll` returns them. A box with
 * no size (a block that draws nothing here) is not a neighbour: the place
 * is between the two blocks that can be seen.
 */
export function blockGaps(boxes: readonly BlockBox[]): BlockGap[] {
  const levels = new Map<string, BlockBox[]>()
  for (const b of boxes) {
    if (!(b.bottom - b.top >= 1 && b.right - b.left >= 1)) continue
    const key = b.parent.join("/")
    const list = levels.get(key)
    if (list) list.push(b)
    else levels.set(key, [b])
  }
  const out: BlockGap[] = []
  for (const list of levels.values()) {
    for (let i = 1; i < list.length; i++) {
      const above = list[i - 1]
      const below = list[i]
      /* Side by side, or the second drawn above the first (a reversed row): no line between them. */
      if (below.top < above.bottom - OVERLAP) continue
      const left = Math.min(above.left, below.left)
      const right = Math.max(above.right, below.right)
      out.push({ y: (above.bottom + below.top) / 2, left, width: right - left, parent: above.parent, before: below.id, after: above.id })
    }
  }
  return out
}

/**
 * The place under the pointer: the nearest line within `reach` pixels, the
 * pointer across its band. `keep` is the place already shown, which holds a
 * little further (`reach + 4`), so a pointer resting on the line never makes
 * the button blink between two places a pixel apart.
 */
export function gapAt(gaps: readonly BlockGap[], x: number, y: number, reach = 8, keep: BlockGap | null = null): BlockGap | null {
  let best: BlockGap | null = null
  let bestD = Infinity
  for (const g of gaps) {
    if (x < g.left || x > g.left + g.width) continue
    const same = !!keep && g.before === keep.before && g.after === keep.after
    const d = Math.abs(y - g.y)
    if (d > (same ? reach + 4 : reach)) continue
    if (d < bestD || (d === bestD && same)) {
      best = g
      bestD = d
    }
  }
  return best
}

/** Two places are the same place: the same two neighbours. */
export function sameGap(a: BlockGap | null, b: BlockGap | null): boolean {
  if (!a || !b) return a === b
  return a.before === b.before && a.after === b.after && a.parent.join("/") === b.parent.join("/")
}

/**
 * Where a block added at this place goes among its level's blocks, as the
 * stored list holds them (static blocks included): just before the block
 * below the line, or just after the one above it when the one below is not
 * stored (a static block the template draws and nobody has edited yet).
 * Null when neither is in the list.
 */
export function insertIndexFor(siblings: readonly { id: string }[], gap: Pick<BlockGap, "before" | "after">): number | null {
  const below = siblings.findIndex((b) => b.id === gap.before)
  if (below >= 0) return below
  const above = siblings.findIndex((b) => b.id === gap.after)
  return above >= 0 ? above + 1 : null
}
