/**
 * ===========================================================================
 *  A CHANGE FROM OUTSIDE LANDS AS WHAT CHANGED, NOT AS A NEW PAGE
 * ===========================================================================
 * A GitHub push that rewrote a page, or a settings file written in the code
 * editor, is read back from the draft whole: every section and every theme
 * value arrives as a new object. Handed to the editor as they are, every
 * section on the canvas draws again, though one changed (measured in
 * scripts/check-editor-perf.mjs, "github push rewrote the page": 16 of 16
 * sections redrawn for one replaced).
 *
 * So what arrived is laid over what is on screen: a section, block or value
 * with the same contents keeps the object it had, and only the ones that
 * differ are new. The section renderers compare by reference, so the
 * unchanged ones are skipped and keep their DOM, their scroll and their
 * focus.
 */

/** Same contents: plain JSON values, compared all the way down. Key order does not matter. */
export function sameContent(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    if (a.length !== bb.length) return false
    for (let i = 0; i < a.length; i++) if (!sameContent(a[i], bb[i])) return false
    return true
  }
  const ao = a as Record<string, unknown>
  const bo = b as Record<string, unknown>
  const ak = Object.keys(ao)
  if (ak.length !== Object.keys(bo).length) return false
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false
    if (!sameContent(ao[k], bo[k])) return false
  }
  return true
}

/**
 * `next`, with every item whose contents equal the one of the same id in
 * `prev` replaced by that one. The very `prev` array when nothing differs.
 */
export function shareUnchanged<T extends { id: string }>(prev: readonly T[], next: readonly T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of prev) byId.set(item.id, item)
  let changed = prev.length !== next.length
  const out = next.map((item, i) => {
    const was = byId.get(item.id)
    if (was && sameContent(was, item)) {
      if (prev[i] !== was) changed = true
      return was
    }
    changed = true
    return item
  })
  return changed ? out : (prev as T[])
}

/** `next`, keeping `prev` itself when every value is the same, so nothing that reads the settings draws again. */
export function shareSettings<T>(prev: T, next: T): T {
  return sameContent(prev, next) ? prev : next
}
