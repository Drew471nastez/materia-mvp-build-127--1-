/**
 * Moving one item of a list to another position, and working out which position
 * a pointer is over.
 *
 * Pulled out of the component because these two are the whole of "did the
 * reorder do the right thing", and they are the part that can be checked
 * without a browser. Everything left in new-listing-form.tsx is pointer
 * plumbing and style writes.
 */

/** Move `from` to `to`, returning a new array. Out-of-range or no-op moves
 *  return the SAME array, so a caller can use identity to skip a re-render. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to) return list
  if (from < 0 || from >= list.length) return list
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export type Box = { left: number; top: number; right: number; bottom: number }

/**
 * Which tile a pointer is over.
 *
 * Nearest CENTRE rather than "inside a rectangle", and the difference matters
 * on a grid with gaps in it: a finger in the 10px gutter between two tiles is
 * inside neither, and a hit test that answers "none" there makes the drag stall
 * every time you cross a boundary — precisely where you are trying to drop. A
 * centre is defined everywhere on the screen, so the answer is always a tile
 * and the reorder happens exactly as you pass the halfway line.
 *
 * Returns -1 only for an empty list.
 */
export function indexAtPoint(boxes: Box[], x: number, y: number): number {
  let best = -1
  let bestDist = Infinity
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i]
    const cx = (b.left + b.right) / 2
    const cy = (b.top + b.bottom) / 2
    const dx = x - cx
    const dy = y - cy
    const d = dx * dx + dy * dy
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}
