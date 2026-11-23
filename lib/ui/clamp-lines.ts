/**
 * ===========================================================================
 *  WHERE A "READ MORE" BOX ENDS (round 58)
 * ===========================================================================
 * A folded text was cut at a fixed number of line heights (six of them), with
 * no regard for where its lines actually fall. Paragraph gaps and headings
 * move the lines, so the box ended through the middle of a line: the top half
 * of its letters showed under the fade, read as a slice rather than a fade,
 * and on a phone the folded box often ended in a paragraph gap, leaving 40px
 * of nothing between the last words and Read more.
 *
 * Now the box ends at the bottom of a real line, the one nearest the target, so no letter is sliced and the fade always falls across
 * whole lines of text, never across a gap.
 */

/**
 * The folded height. `bottoms` are the bottoms of the text's lines, measured
 * from the top of the text; `target` the height the fold aims for and `line`
 * one line height. The line bottom nearest the target, at most one line past
 * it (a fold that ended in a paragraph gap would otherwise give up most of a
 * line's room); the earlier of two equally near. The target when no line is
 * near enough.
 */
export function snapClamp(bottoms: readonly number[], target: number, line = 0): number {
  let best = -1
  for (const b of bottoms) {
    if (b <= 0 || b > target + line + 0.5) continue
    const d = Math.abs(b - target)
    const bd = Math.abs(best - target)
    if (best < 0 || d < bd - 0.5 || (Math.abs(d - bd) <= 0.5 && b < best)) best = b
  }
  return best > 0 ? Math.ceil(best) : Math.round(target)
}

/** How tall the fade is over a folded box: two and a half lines, never more than half the box. */
export function fadeFor(collapsed: number, line: number): number {
  return Math.max(0, Math.round(Math.min(line * 2.5, collapsed * 0.5)))
}

/** The bottoms of every line of text in `el`, from its top (Range rects: one per line box). */
export function lineBottoms(el: HTMLElement): number[] {
  const top = el.getBoundingClientRect().top
  const out: number[] = []
  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n.textContent ?? "").trim()) continue
    range.selectNodeContents(n)
    for (const r of Array.from(range.getClientRects())) if (r.height > 0) out.push(r.bottom - top)
  }
  range.detach?.()
  return out
}
