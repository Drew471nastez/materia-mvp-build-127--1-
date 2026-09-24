/**
 * Whether a setting would be set to what it already holds: the same value,
 * or an object or list with the same contents (a link, a list of choices).
 * The editor drops such a write, because a new section object with the same
 * values in it still draws the canvas again and marks the page unsaved.
 */
export function sameSettingValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}
