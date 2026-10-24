/**
 * ===========================================================================
 *  "HAS IT CHANGED?", ONE ANSWER FOR EVERY FORM
 * ===========================================================================
 * A form has unsaved changes when what it holds now is not what was last
 * saved. Not "something was pressed": a switch turned off and on again, a
 * price typed as 10 and then 10.00, a list ticked off and back on in another
 * order, are all the saved value, and Save goes grey again.
 *
 * So a form keeps its last saved value, and both are turned into a key here
 * and compared. The key is the value with what a save cannot tell apart taken
 * out: text trimmed, empty text and nothing the same, objects in a fixed key
 * order. What only some fields mean (a number typed as text, a set whose order
 * is not kept, rich text) is said by the form itself with num(), asSet() and
 * richText(), field by field.
 */

/** Empty text, null and undefined are all "nothing". */
const isNothing = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "")

/** The value as a save sees it: text trimmed, nothing as null, object keys sorted, undefined keys dropped. */
export function normalise(value: unknown): unknown {
  if (isNothing(value)) return null
  if (typeof value === "string") return value.trim()
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (Array.isArray(value)) return value.map(normalise)
  if (value instanceof Set) return asSet([...value])
  if (typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k]
      if (v === undefined) continue
      out[k] = normalise(v)
    }
    return out
  }
  return value
}

/** One string for a value, the same for every value a save cannot tell apart. */
export function stableKey(value: unknown): string {
  return JSON.stringify(normalise(value)) ?? "null"
}

/** Is `now` the saved value? */
export function sameValue(now: unknown, saved: unknown): boolean {
  return stableKey(now) === stableKey(saved)
}

/** A number typed as text: "10", "10.00" and " 10 " are 10; text that is not a number stays text. */
export function num(typed: string | number | null | undefined): number | string | null {
  if (typeof typed === "number") return Number.isFinite(typed) ? typed : null
  if (isNothing(typed)) return null
  const t = String(typed).trim().replace(/,(?=\d{1,2}$)/, ".")
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : t
}

/** A list whose order is not kept: sorted by each item's key. */
export function asSet<T>(items: readonly T[] | null | undefined): unknown[] {
  return [...(items ?? [])].map(normalise).sort((a, b) => {
    const x = JSON.stringify(a)
    const y = JSON.stringify(b)
    return x < y ? -1 : x > y ? 1 : 0
  })
}

/**
 * Rich text as a reader sees it: the same words in the same marks are the
 * same text, however the editor wrote the spaces, the line breaks, an empty
 * paragraph or a non breaking space.
 */
export function richText(html: string | null | undefined): string {
  if (!html) return ""
  return html
    .replace(/&nbsp;| /g, " ")
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(/<(p|div)>(\s|<br>)*<\/\1>/gi, "")
    .replace(/(<br>)+(<\/(p|div|li|h[1-6])>)/gi, "$2")
    .trim()
}
