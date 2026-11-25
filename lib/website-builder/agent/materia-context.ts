/**
 * ===========================================================================
 *  ASK AI ON A MATERIA SITE: THE CATALOGUE AND THE PAGE, SAID ONCE (round 26)
 * ===========================================================================
 * A website made from one of Storelib's templates runs on Materia: every
 * section on it is a Materia section, and Add section offers the rest of the
 * theme's. Ask AI used to see those as a long list of names with no purpose,
 * so "add a section about how coaching works" meant guessing a type or
 * writing a new one. The run is now grounded in the same catalogue the
 * website agent builds with (lib/storelib-ai/materia):
 *
 *   materiaEditContext   for a Materia site only: the short rules, the page's
 *                        own sections by what they do, and, when the request
 *                        may add or rebuild (`broad`), the sections it can
 *                        add by purpose, the most used by the templates
 *                        first. A site that is not Materia gets nothing, and
 *                        its turn stays the size it was.
 *   repairAddableType    add_section with a type written another way
 *                        ("hero_image1", "Hero Image 1") is the type the
 *                        site has; anything else is refused with the closest.
 *
 * Pure. Server only in practice (the catalogue is large).
 */
import { catalogueOverview, closestTypes, isMateriaInstall, MATERIA_EDIT_RULES, materiaInstallTypes, purposeOfType, resolveSectionType } from "@/lib/storelib-ai/materia"
import type { SectionInstance } from "../types"

/** The most the block takes of the first turn: rules and page always, the catalogue only for a broad request. */
export const MATERIA_EDIT_CHARS = 3_600

/** The page's own sections by what they do: "[hero-1] hero-image1 [hero]". */
function pageLines(sections: readonly SectionInstance[]): string {
  return sections
    .filter((s) => !(s as { group?: string }).group && s.type !== "header" && s.type !== "footer")
    .slice(0, 30)
    .map((s) => `[${s.id}] ${s.type}${purposeOfType(s.type) ? ` [${purposeOfType(s.type)}]` : ""}${s.hidden ? " hidden" : ""}`)
    .join("\n")
}

export function materiaEditContext(input: { sources: Record<string, string> | undefined; sections: readonly SectionInstance[]; addable: readonly string[]; broad: boolean }): string {
  if (!isMateriaInstall(input.sources)) return ""
  const own = new Set(materiaInstallTypes(input.sources))
  const addable = new Set(input.addable.filter((t) => own.has(t)))
  const page = pageLines(input.sections)
  const catalogue = input.broad && addable.size ? catalogueOverview({ only: addable, budget: MATERIA_EDIT_CHARS - MATERIA_EDIT_RULES.length - page.length - 120, perPurpose: 8 }) : ""
  return [
    MATERIA_EDIT_RULES,
    page ? `THIS PAGE, BY WHAT EACH SECTION DOES:\n${page}` : "",
    catalogue ? `MATERIA SECTIONS YOU CAN ADD, BY WHAT THEY DO (xN = used by N of Storelib's templates; read_section_type before adding):\n${catalogue}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MATERIA_EDIT_CHARS)
}

/** The addable type `wanted` means, written another way, or the closest ones to name in a refusal. */
export function repairAddableType(wanted: string, addable: readonly string[]): { type: string } | { closest: string[] } {
  const r = resolveSectionType(wanted, addable)
  return r ? { type: r.type } : { closest: closestTypes(wanted, addable) }
}
