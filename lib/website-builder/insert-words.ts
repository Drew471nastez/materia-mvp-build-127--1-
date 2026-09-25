/**
 * ===========================================================================
 *  WHERE A NEW SECTION WILL GO, IN WORDS
 * ===========================================================================
 * On a phone the section library covers the page, so the gap that was
 * tapped is out of sight by the time anything is chosen. The library says it
 * under its title instead: "Between Centered Hero and Feature Grid".
 *
 * The index is clamped exactly as the editor's addSection clamps it (never
 * above the header, never below the footer), so what this says is where the
 * section lands.
 */

interface SectionLike {
  type: string
}

export function whereItGoes<T extends SectionLike>(sections: T[], listIndex: number | null, nameOf: (s: T) => string): string {
  const body = sections.filter((s) => s.type !== "header" && s.type !== "footer")
  if (listIndex === null) {
    return body.length ? `At the end, after ${nameOf(body[body.length - 1])}` : "On the empty page"
  }
  const headerIdx = sections.findIndex((s) => s.type === "header")
  const footerIdx = sections.findIndex((s) => s.type === "footer")
  const min = headerIdx !== -1 ? headerIdx + 1 : 0
  const max = footerIdx !== -1 ? footerIdx : sections.length
  const at = Math.max(min, Math.min(max, listIndex))
  const before = sections[at - 1]
  const after = sections[at]
  const beforeBody = before && before.type !== "header" && before.type !== "footer"
  const afterBody = after && after.type !== "header" && after.type !== "footer"
  if (beforeBody && afterBody) return `Between ${nameOf(before)} and ${nameOf(after)}`
  if (afterBody) return `At the top, above ${nameOf(after)}`
  if (beforeBody) return `At the end, after ${nameOf(before)}`
  return "On the empty page"
}
