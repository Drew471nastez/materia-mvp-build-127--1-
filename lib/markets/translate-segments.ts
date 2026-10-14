/**
 * ===========================================================================
 *  ONLY THE WORDS GO TO THE TRANSLATOR
 * ===========================================================================
 * An open translation model (./open-translate.ts) is not told rules the way
 * a chat model is: given "<p>Hi {{ name }}</p>" it may translate the tag,
 * the placeholder and the link along with the words. So a text is cut into
 * what must stay exactly as it is (HTML tags, Liquid, {placeholders}, links,
 * e-mail addresses, the store's own name, and runs with no letters at all)
 * and the runs of words between them. Only the words are translated, and the
 * text is put back together in the same order, so a translation always
 * passes ./draft-check.ts keepsFixedParts.
 *
 * Pure.
 */

export type Part = { fixed: string } | { lead: string; words: string; trail: string }

const FIXED = [
  /\{\{[\s\S]*?\}\}/.source,
  /\{%[\s\S]*?%\}/.source,
  /\{[A-Za-z_][\w.]*\}/.source,
  /<!--[\s\S]*?-->/.source,
  /<\s*\/?\s*[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/.source,
  /&(?:[a-zA-Z]+|#\d+|#x[0-9a-fA-F]+);/.source,
  /\bhttps?:\/\/[^\s"'<>]+/.source,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.source,
  /[[\]]/.source,
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** A run with something to translate: at least one letter in any script. */
const hasLetters = (s: string) => /\p{L}/u.test(s)

/** The text cut into fixed parts and runs of words, in order. `keep`: names that stay as written (the store's). */
export function cut(text: string, keep: string[] = []): Part[] {
  const names = keep.map((k) => k.trim()).filter((k) => k.length >= 2).sort((a, b) => b.length - a.length).map(escape)
  const re = new RegExp([...FIXED, ...names.map((n) => `(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`)].join("|"), "gu")
  const parts: Part[] = []
  const words = (run: string) => {
    if (!run) return
    if (!hasLetters(run)) return void parts.push({ fixed: run })
    const lead = run.match(/^\s*/)![0]
    const trail = run.slice(lead.length).match(/\s*$/)![0]
    parts.push({ lead, words: run.slice(lead.length, run.length - trail.length), trail })
  }
  let at = 0
  for (const m of String(text ?? "").matchAll(re)) {
    words(text.slice(at, m.index))
    parts.push({ fixed: m[0] })
    at = m.index! + m[0].length
  }
  words(text.slice(at))
  return parts
}

/** The runs of words that need translating, in order (repeats included). */
export const wordsOf = (parts: Part[]): string[] => parts.flatMap((p) => ("words" in p ? [p.words] : []))

/** The text put back together, each run of words replaced by its translation; null when one is missing. */
export function join(parts: Part[], translated: (words: string) => string | undefined): string | null {
  let out = ""
  for (const p of parts) {
    if ("fixed" in p) {
      out += p.fixed
      continue
    }
    const t = translated(p.words)
    if (t === undefined || !t.trim()) return null
    out += p.lead + t.trim() + p.trail
  }
  return out
}
