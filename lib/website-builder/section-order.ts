import type { SectionInstance } from "./types"
import { groupOf } from "@/lib/storelib-theme/section-groups"

/**
 * Where a section dropped into the Nth CANVAS GAP lands in the section list.
 *
 * The canvas counts gaps in body sections — 0 is above the first body
 * section, `body.length` is below the last — because that is all it can see:
 * the header and the footer are chrome and are drawn by the page, not by the
 * list. The list has them in it. This is the translation between the two, and
 * it lives here rather than inline in the editor so it can be tested without
 * rendering an editor.
 *
 * Returns null when there is no body at all, which means "there is no gap to
 * speak of" and the caller should fall back to appending.
 */
export function bodyGapToListIndex(sections: SectionInstance[], gap: number): number | null {
  const bodyIndexes: number[] = []
  sections.forEach((s, i) => {
    if (groupOf(s) === "template") bodyIndexes.push(i)
  })
  if (bodyIndexes.length === 0) return null
  // A gap above a body section is that section's own index; the gap below the
  // last one is one past it.
  if (gap < bodyIndexes.length) return bodyIndexes[gap]
  return bodyIndexes[bodyIndexes.length - 1] + 1
}

/**
 * Where the place between two sections an imported theme's canvas pointed
 * at (canvas-bridge.ts, ADD A SECTION HERE) is in the section list: the
 * group it is in, and the place counted inside that group, so a section
 * added there lands between the two it was pressed between. The page's
 * own content counts as the canvas gaps above do (`gap`, for
 * bodyGapToListIndex); a header or footer group counts its own sections.
 * Null when neither section is in the list, or the place is in a group
 * nothing is added to from the canvas.
 */
export function insertPlaceBetween(
  sections: SectionInstance[],
  place: { before: string | null; after: string | null },
): { group: "template" | "header" | "footer"; at: number } | null {
  const ref = sections.find((s) => s.id === (place.before ?? place.after))
  if (!ref) return null
  const group = groupOf(ref)
  if (group !== "template" && group !== "header" && group !== "footer") return null
  const inGroup = sections.filter((s) => groupOf(s) === group)
  const i = inGroup.findIndex((s) => s.id === ref.id)
  return { group, at: place.before ? i : i + 1 }
}
