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

/*
  WHERE AN EXACT FIND MISSES BY WHITESPACE ONLY. Most refused edits were not
  wrong about the code: the model re-typed the lines it read with two spaces
  where the file had four, a tab, a line wrapped differently, or "a{" for
  "a {". Each of those was "Edit failed" and a turn spent re-reading the file.
  So a find that is not in the file as typed is looked for again with its
  whitespace loosened: the same words and symbols in the same order, any run
  of spaces, tabs and line breaks between them. It still has to name exactly
  one place, so loosening can never make an edit land somewhere it was not
  aimed.
*/
const TOKEN = /[A-Za-z0-9_$-]+|\S/g

function loosePattern(find: string): RegExp | null {
  const tokens = find.trim().match(TOKEN)
  if (!tokens || tokens.length === 0 || tokens.length > 6000) return null
  let pattern = ""
  let prevWord = false
  let at = 0
  const trimmed = find.trim()
  for (const token of tokens) {
    const start = trimmed.indexOf(token, at)
    const gap = start > at
    at = start + token.length
    const word = /^[A-Za-z0-9_$-]/.test(token)
    /* Two words need some space between them ("a b" never matches "ab"); anything next to a symbol may have none. */
    if (pattern) pattern += prevWord && word ? (gap ? "\\s+" : "") : "\\s*"
    pattern += token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    prevWord = word
  }
  return new RegExp(pattern, "g")
}

/** The one place a find names with its whitespace loosened, or why it names none or several. */
export function looseLocate(source: string, find: string): { at: number; length: number } | "none" | "many" {
  const re = loosePattern(find)
  if (!re) return "none"
  const first = re.exec(source)
  if (!first) return "none"
  if (re.exec(source)) return "many"
  return { at: first.index, length: first[0].length }
}

/**
 * WHERE THE FILE IS CLOSEST TO WHAT WAS LOOKED FOR, numbered, so a refused
 * edit can be sent again against the lines that are really there without
 * another read. Picked by the find's longest line that has a likeness in the
 * file; the file's first lines when nothing does.
 */
export function nearestLines(source: string, find: string, around = 6): string {
  const lines = source.split("\n")
  const wanted = find
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length >= 3)
    .sort((a, b) => b.length - a.length)
  const words = (l: string) => new Set(l.match(TOKEN) ?? [])
  let best = -1
  let bestScore = 0
  for (const target of wanted.slice(0, 3)) {
    const want = words(target)
    if (want.size === 0) continue
    for (let i = 0; i < lines.length; i++) {
      const have = words(lines[i])
      let shared = 0
      for (const w of want) if (have.has(w)) shared++
      const score = shared / Math.max(want.size, have.size)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (bestScore >= 0.5) break
  }
  const centre = best >= 0 && bestScore >= 0.25 ? best : 0
  const from = Math.max(0, centre - around)
  const to = Math.min(lines.length, centre + around + 1)
  return lines
    .slice(from, to)
    .map((l, i) => `${String(from + i + 1).padStart(4)}| ${l}`)
    .join("\n")
}

/** The edits, applied in order, or the first reason one cannot be. */
export function applySourceEdits(
  source: string,
  edits: unknown,
): { ok: true; source: string; applied: number; notes?: string[] } | { ok: false; error: string; near?: string } {
  if (!Array.isArray(edits) || edits.length === 0) {
    return { ok: false, error: "Send edits as a list of { find, replace }, at least one." }
  }
  if (edits.length > MAX_EDITS) {
    return { ok: false, error: `At most ${MAX_EDITS} edits at once. For a change that big, send the whole file with write_section_code.` }
  }
  let next = source
  const notes: string[] = []
  /* A file kept with Windows line ends is matched and written in them, so an edit typed with plain ones still lands. */
  const crlf = source.includes("\r\n")
  const ends = (text: string) => (crlf ? text.replace(/\r?\n/g, "\r\n") : text.replace(/\r\n/g, "\n"))
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
    const find = ends(edit.find)
    const replace = ends(edit.replace)
    const count = occurrences(next, find)
    if (count > 1) {
      return { ok: false, error: `Edit ${n}: that text is in the file more than once. Include a line before or after it so it names one place.` }
    }
    if (count === 1) {
      const at = next.indexOf(find)
      next = next.slice(0, at) + replace + next.slice(at + find.length)
      continue
    }
    const loose = looseLocate(next, find)
    if (loose === "many") {
      return { ok: false, error: `Edit ${n}: that text is in the file more than once. Include a line before or after it so it names one place.`, near: nearestLines(next, find) }
    }
    if (loose !== "none") {
      next = next.slice(0, loose.at) + replace.trim() + next.slice(loose.at + loose.length)
      notes.push(`Edit ${n} matched with different spacing and was applied.`)
      continue
    }
    /* Sent twice: the replacement is there and what it replaced is not. The change stands. Long enough to be that change, not a word the file happens to hold. */
    if (replace.trim().length >= 16 && (next.includes(replace) || looseLocate(next, replace) !== "none")) {
      notes.push(`Edit ${n} was already in the file.`)
      continue
    }
    return {
      ok: false,
      error: `Edit ${n}: the text to find is not in the file${i > 0 ? " after the edits before it" : ""}. Copy it exactly from the lines below (or read_section_code), spaces and line breaks included.`,
      near: nearestLines(next, find),
    }
  }
  if (next === source) {
    return notes.some((note) => /already in the file/.test(note))
      ? { ok: false, error: "Those edits are already in the file, so there is nothing more to change. Carry on with the next part of the request." }
      : { ok: false, error: "The edits change nothing. Nothing was saved." }
  }
  return { ok: true, source: next, applied: edits.length, ...(notes.length ? { notes } : {}) }
}
