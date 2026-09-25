/**
 * ===========================================================================
 *  CHANGING THE LINES THAT CHANGE, NOT RESENDING THE FILE
 * ===========================================================================
 * A built-in section is 300 lines. Asked to slow an accordion down, the
 * agent used to send all 300 back to change one: a few thousand output
 * tokens, which are the dearest tokens there are, and 299 chances to change
 * something nobody asked about. Measured on the FAQ fixture in
 * scripts/measure-agent-tokens.ts: a whole-file write is about 2,400 output
 * tokens, the same change as an edit about 40.
 *
 * So the builder agent (edit_section_code) and agents over MCP
 * (storelib_patch_section) can send exact find-and-replace edits instead.
 * Each `find` must appear exactly once in the file as it stands after the
 * edits before it, which is what makes an edit mean one place and only one.
 * The result is then held to everything a whole-file write is: it compiles,
 * it passes the quality checks, it is saved as a draft.
 *
 * Pure, so the rule is tested rather than trusted.
 */

export interface SourceEdit {
  find: string
  replace: string
}

export const MAX_EDITS = 20
const MAX_FIND = 20_000
const MAX_REPLACE = 60_000

function occurrences(haystack: string, needle: string): number {
  let count = 0
  let at = haystack.indexOf(needle)
  while (at !== -1) {
    count++
    if (count > 1) return count
    at = haystack.indexOf(needle, at + needle.length)
  }
  return count
}

/** The edits, applied in order, or the first reason one cannot be. */
export function applySourceEdits(
  source: string,
  edits: unknown,
): { ok: true; source: string; applied: number } | { ok: false; error: string } {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, error: "Send edits as a list of { find, replace }, at least one." }
  }
  if (edits.length > MAX_EDITS) {
    return { ok: false, error: `At most ${MAX_EDITS} edits at once. For a change that big, send the whole file with write_section_code.` }
  }
  let next = source
  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i] as Partial<SourceEdit> | null
    const n = i + 1
    if (!edit || typeof edit.find !== "string" || typeof edit.replace !== "string") {
      return { ok: false, error: `Edit ${n} needs find and replace, both text.` }
    }
    if (edit.find === "") return { ok: false, error: `Edit ${n} has nothing to find.` }
    if (edit.find.length > MAX_FIND || edit.replace.length > MAX_REPLACE) {
      return { ok: false, error: `Edit ${n} is too large for an edit; send the whole file with write_section_code.` }
    }
    const count = occurrences(next, edit.find)
    if (count === 0) {
      return {
        ok: false,
        error: `Edit ${n}: the text to find is not in the file${i > 0 ? " after the edits before it" : ""}. Copy it exactly from read_section_code, spaces and line breaks included.`,
      }
    }
    if (count > 1) {
      return { ok: false, error: `Edit ${n}: that text is in the file more than once. Include a line before or after it so it names one place.` }
    }
    const at = next.indexOf(edit.find)
    next = next.slice(0, at) + edit.replace + next.slice(at + edit.find.length)
  }
  if (next === source) return { ok: false, error: "The edits change nothing. Nothing was saved." }
  return { ok: true, source: next, applied: edits.length }
}
