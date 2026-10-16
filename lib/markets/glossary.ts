/**
 * ===========================================================================
 *  WORDS NOT TO TRANSLATE
 * ===========================================================================
 * Settings › Languages & Currency: the brand names, product names and any
 * other words the owner lists stay exactly as written in every language
 * (store_localization.translation_glossary, SQL part 188). A word may also
 * have a fixed translation in one language ("Gift card" is always "Carte
 * cadeau" in French).
 *
 * HOW A TEXT IS PROTECTED. Before a text goes to a translator, each listed
 * word in it is found (any capitals, whole words only, never inside a tag,
 * a placeholder or a link: the same cut as ./translate-segments.ts), its
 * fixed translation for that language put in its place, and every one of
 * them handed over as a name to keep (the translators keep the store's name
 * the same way: a chat model is told, DeepL gets it in an ignored tag, an
 * open model never sees it). What comes back is checked to still have each
 * of them as many times as the text sent (keepsTerms); one that lost or
 * translated one is not kept, and is tried again on the next run.
 *
 * WHEN THE LIST CHANGES, Storelib AI's translations of the texts that have
 * a word whose rule changed are marked to write again (STALE_HASH); the
 * owner's own are never touched.
 *
 * Pure: the server, the browser and the tests agree.
 */
import { cut } from "./translate-segments"
import { keepsTerms } from "./draft-check"
import { normalizeLocale } from "./locales"

export interface GlossaryTerm {
  /** The word or name, as the owner wrote it. Matched whatever its capitals, a whole word at a time. */
  term: string
  /** A fixed translation per language code; a language without one keeps the word as written. */
  as?: Record<string, string>
}

export type Glossary = GlossaryTerm[]

export const MAX_TERMS = 200
export const MAX_TERM_LENGTH = 80
const MAX_AS_LENGTH = 120

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "")

/**
 * The list as saved: each word once (whatever its capitals), 2 to 80
 * characters, at most 200, fixed translations only for real language codes
 * and only when they say something. Lenient: anything else is dropped.
 */
export function readGlossary(raw: unknown): Glossary {
  if (!Array.isArray(raw)) return []
  const out: Glossary = []
  const seen = new Set<string>()
  for (const item of raw) {
    const term = clean(typeof item === "string" ? item : (item as GlossaryTerm | null)?.term)
    if (term.length < 2 || term.length > MAX_TERM_LENGTH || /[<>{}]/.test(term)) continue
    const k = term.toLocaleLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    const as: Record<string, string> = {}
    const given = (item as GlossaryTerm | null)?.as
    if (given && typeof given === "object") {
      for (const [code, v] of Object.entries(given)) {
        const locale = normalizeLocale(code)
        const word = clean(v)
        if (locale && word && word.length <= MAX_AS_LENGTH && !/[<>{}]/.test(word)) as[locale] = word
      }
    }
    out.push(Object.keys(as).length ? { term, as } : { term })
    if (out.length >= MAX_TERMS) break
  }
  return out
}

/** The list from the Settings page, checked: what readGlossary keeps, or why it was refused. */
export function validateGlossary(input: unknown): { ok: true; value: Glossary } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Send the list of words." }
  if (input.length > MAX_TERMS) return { ok: false, error: `Up to ${MAX_TERMS} words.` }
  for (const item of input) {
    const term = clean(typeof item === "string" ? item : (item as GlossaryTerm | null)?.term)
    if (term.length < 2) return { ok: false, error: "A word needs at least 2 characters." }
    if (term.length > MAX_TERM_LENGTH) return { ok: false, error: `A word can be up to ${MAX_TERM_LENGTH} characters.` }
    if (/[<>{}]/.test(term)) return { ok: false, error: "A word can't have < > { or }." }
  }
  return { ok: true, value: readGlossary(input) }
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const escapeHtml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** A word's spellings to look for: as written, and as rich text holds it ("Salt &amp; Pepper"). */
const forms = (term: string) => [...new Set([term, escapeHtml(term)])]

/**
 * Each listed word found in a text, as the text spells it, with the term it
 * is: whole words only, any capitals. Inside a tag, a placeholder or a link
 * is not words, and is left to the cut below.
 */
function spellings(text: string, glossary: Glossary): Map<string, GlossaryTerm> {
  const out = new Map<string, GlossaryTerm>()
  if (!text || glossary.length === 0) return out
  for (const t of glossary) {
    for (const f of forms(t.term)) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(f)}(?![\\p{L}\\p{N}])`, "giu")
      for (const m of text.matchAll(re)) if (!out.has(m[0])) out.set(m[0], t)
    }
  }
  return out
}

/** Whether a text has any of the listed words in its words. */
export function hasTerms(text: string, glossary: Glossary): boolean {
  if (glossary.length === 0) return false
  const found = spellings(text, glossary)
  if (found.size === 0) return false
  return cut(text, [...found.keys()]).some((p) => "fixed" in p && found.has(p.fixed))
}

/**
 * The text as it goes to a translator into `locale`: each listed word in its
 * words replaced by its fixed translation there, if it has one, and every
 * one of them named in `keep`, so the translator leaves them as they are.
 * A text with none of the words comes back unchanged, with nothing to keep.
 */
export function prepareText(text: string, glossary: Glossary, locale: string): { text: string; keep: string[] } {
  const found = spellings(text, glossary)
  if (found.size === 0) return { text, keep: [] }
  const keep = new Set<string>()
  let changed = false
  const out = cut(text, [...found.keys()])
    .map((p) => {
      if ("words" in p) return p.lead + p.words + p.trail
      const term = found.get(p.fixed)
      if (!term) return p.fixed
      const fixed = term.as?.[locale]
      if (fixed && fixed !== p.fixed) {
        changed = true
        keep.add(fixed)
        return fixed
      }
      keep.add(p.fixed)
      return p.fixed
    })
    .join("")
  return { text: changed ? out : text, keep: [...keep] }
}

/** True when a translation into `locale` kept every listed word of its original as the glossary says (prepareText, then keepsTerms). */
export function keepsGlossary(source: string, translated: string, glossary: Glossary, locale: string): boolean {
  if (glossary.length === 0) return true
  const p = prepareText(source, glossary, locale)
  return keepsTerms(p.text, translated, p.keep)
}

/**
 * The words whose rule changed between two lists: added, taken away, or
 * with a fixed translation added, changed or taken away. Storelib AI's
 * translations of texts with one of these are written again.
 */
export function changedTerms(before: Glossary, after: Glossary): Glossary {
  const key = (t: GlossaryTerm) => t.term.toLocaleLowerCase()
  const rule = (t: GlossaryTerm | undefined) => (t ? JSON.stringify(Object.entries(t.as ?? {}).sort(([a], [b]) => a.localeCompare(b))) : null)
  const was = new Map(before.map((t) => [key(t), t]))
  const now = new Map(after.map((t) => [key(t), t]))
  const out: Glossary = []
  for (const [k, t] of now) if (rule(was.get(k)) !== rule(t) || was.get(k)?.term !== t.term) out.push(t)
  for (const [k, t] of was) if (!now.has(k)) out.push(t)
  return out
}

/** The keys of the texts that have one of these words: the ones whose Storelib AI translation is written again. */
export function keysWithTerms(texts: readonly { key: string; source: string }[], terms: Glossary): string[] {
  if (terms.length === 0) return []
  return [...new Set(texts.filter((t) => hasTerms(t.source, terms)).map((t) => t.key))]
}
