/**
 * The search behind components/ui/choice-list: case and accents ignored, and
 * every word typed has to be somewhere in the choice, so "new york",
 * "utc-5" and "eastern" all find New York, and "sao" finds São Paulo.
 */

export type Choice = {
  value: string
  /** The name, in its own words ("Deutsch", "Bucharest"). */
  label: string
  /** The quieter line under it ("German", "Europe"). */
  detail?: string
  /** Right aligned, tabular ("UTC+3"). */
  aside?: string
  /** More words search should find it by, never shown. */
  keywords?: string
}

export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u2212/g, "-")
    .toLowerCase()

export function matches(choice: Choice, query: string): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold([choice.label, choice.detail, choice.aside, choice.keywords, choice.value.replace(/[_/]/g, " ")].filter(Boolean).join(" "))
  return words.every((w) => hay.includes(w))
}
