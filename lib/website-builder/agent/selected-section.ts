/**
 * ===========================================================================
 *  THE SECTION THE CREATOR HAS OPEN, AS THE SERVER UNDERSTANDS IT
 * ===========================================================================
 * "Make this shorter" with the pricing section selected means the pricing
 * section: its settings, its blocks, or its code. It never means a new
 * pricing section under it, which is what came back when the assistant was
 * told only an id.
 *
 * The browser sends WHICH section is open, by id. Everything else about it
 * is worked out here, on the server, from the page the request carries and
 * from this install's own files read through the creator's client:
 *
 *   id, type, name     from the page, and only when the id is on it. An id
 *                      that is not there is dropped, not trusted.
 *   settings, blocks   the section's own, from the same page
 *   file               sections/<type>.storelib when there is code behind
 *                      it, and whose code that is:
 *                        own       the creator's file. The assistant may
 *                                  edit it.
 *                        builtin   Storelib's shipped file. Read only; a
 *                                  change that needs code is made on an
 *                                  editable copy, which the assistant
 *                                  offers first.
 *                        product   drawn by the product itself, no file at
 *                                  all: its settings are the whole of it.
 *                        chrome    the header or footer. Settings only,
 *                                  never a copy: a second header has no
 *                                  cart, search or menus.
 *
 * Pure, so the rules are tested without a database
 * (tests/ask-section-edit.test.ts).
 */
import type { SectionInstance } from "../types"

export type SectionOrigin = "own" | "builtin" | "product" | "chrome"

export interface SelectedSectionContext {
  id: string
  type: string
  /** What the sidebar calls it. */
  name: string
  settings: Record<string, unknown>
  blockCount: number
  /** sections/<type>.storelib when there is code behind it, else null. */
  file: string | null
  origin: SectionOrigin
}

/** A section type is a file name: letters, digits, `_` and `-`, nothing that could climb out of `sections/`. */
export const SECTION_TYPE = /^[a-z0-9][a-z0-9_-]{0,63}$/

/**
 * The open section, or null when nothing is open or the id is not on this
 * page. `origin` answers where a type's code lives; the route answers it from
 * the install's own files and the shipped theme.
 */
export function resolveSelectedSection(
  sections: readonly SectionInstance[],
  selectedId: string | null | undefined,
  origin: (type: string) => SectionOrigin,
): SelectedSectionContext | null {
  if (!selectedId) return null
  const found = sections.find((s) => s.id === selectedId)
  if (!found) return null
  const type = String(found.type ?? "")
  const kind: SectionOrigin = type === "header" || type === "footer" ? "chrome" : SECTION_TYPE.test(type) ? origin(type) : "product"
  return {
    id: found.id,
    type,
    name: (found.name ?? "").trim() || type,
    settings: found.settings ?? {},
    blockCount: Array.isArray(found.blocks) ? found.blocks.length : 0,
    file: kind === "own" || kind === "builtin" ? `sections/${type}.storelib` : null,
    origin: kind,
  }
}

/**
 * What the model is told about the open section's code, under its settings.
 * One short paragraph per case, saying what it may do, so the choice between
 * a setting, an edit and a copy is made against facts rather than guessed.
 */
export function describeSelectedCode(selected: SelectedSectionContext): string {
  switch (selected.origin) {
    case "own":
      return `ITS CODE is ${selected.file}, a file the creator owns. A change no setting covers is made there: read_section_code "${selected.type}", then edit_section_code. Change THIS section; do not add a new one.`
    case "builtin":
      return `ITS CODE is ${selected.file}, Storelib's built in file, which you can read and cannot change. Use its settings and blocks first. If the change truly needs code, call ask_creator once: offer "Make an editable copy" (you then call copy_section_to_code on [${selected.id}] and edit the copy) and "Keep it as it is". Never add a new section instead.`
    case "chrome":
      return `It is the site's ${selected.type}. Change it through its settings and blocks only; it is never copied or rewritten.`
    default:
      return "It is drawn by Storelib itself and has no code file. Its settings and blocks are the whole of it: change those, and never add a new section instead."
  }
}
