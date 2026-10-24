/**
 * ===========================================================================
 *  WHAT IS NEVER TRANSLATED, AND WORDS THAT ALWAYS TRANSLATE ONE WAY
 * ===========================================================================
 * A store's own rules for automatic translation (Settings › Markets and
 * languages › Glossary), kept in store_localization.translation_rules
 * (SQL part 213):
 *
 *   glossary     terms, each either kept as written in every language
 *                (a brand, "Storelib Pro") or with a fixed translation per
 *                language ("Gift card" is always "Card cadou" in Romanian)
 *   noTranslate  texts that are never translated automatically, by key
 *                (a heading that is a product line's name): the original
 *                shows in every language unless the merchant writes one
 *   keepProductNames   every product title is left as written. A store
 *                that never chose has it on (keepProductNamesDefault), so
 *                a brand or product name is not machine translated; one
 *                whose product titles Storelib AI already translated keeps
 *                working as it did. A value the store saved always wins.
 *
 * HOW A GLOSSARY TERM IS APPLIED. Before a text goes to the translator its
 * terms are marked as fixed (lib/markets/translate-segments.ts cut, the
 * same way the store's name is kept), so the translator never sees them;
 * after it comes back, a term with a translation for that language is put
 * in its place (applyGlossary). The same result from the open models and
 * the chat model, and no call is spent on a word whose answer is known.
 *
 * Rules only steer Storelib AI. A translation the merchant wrote is theirs
 * and is never changed by a rule.
 *
 * Pure: the server, the editor and the tests read the same functions.
 */
import { normalizeLocale } from "./locales"

export interface GlossaryTerm {
  /** The words as they are written in the website's own language. */
  term: string
  /** Kept exactly as written in every language. */
  keep?: boolean
  /** Its translation, by language, when it is not kept. */
  to?: Record<string, string>
}

export interface TranslationRules {
  glossary: GlossaryTerm[]
  /** Keys (lib/markets/translate.ts) never translated automatically. */
  noTranslate: string[]
  /**
   * Every product's title is left as written. Read through rulesFrom it is
   * always a boolean; in what is saved, missing means the store never chose.
   */
  keepProductNames?: boolean
}

export const MAX_GLOSSARY = 200
export const MAX_NO_TRANSLATE = 2000
/** A term's own words, and one language's translation of it. */
export const MAX_TERM = 80
export const MIN_TERM = 2
export const MAX_TERM_TRANSLATION = MAX_TERM * 2

export const emptyRules = (): TranslationRules => ({ glossary: [], noTranslate: [], keepProductNames: false })

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")

/** What a form or the database holds, checked: terms deduped (case aside), keys sane. Never throws. */
export function validateRules(input: unknown): { ok: true; value: TranslationRules } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const glossary: GlossaryTerm[] = []
  const seen = new Set<string>()
  const list = Array.isArray(raw.glossary) ? raw.glossary : []
  if (list.length > MAX_GLOSSARY) return { ok: false, error: `A glossary can have up to ${MAX_GLOSSARY} terms.` }
  for (const g of list) {
    const r = (g && typeof g === "object" ? g : {}) as Record<string, unknown>
    const term = clean(r.term, MAX_TERM)
    if (term.length < MIN_TERM) continue
    const id = term.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    const to: Record<string, string> = {}
    if (r.to && typeof r.to === "object") {
      for (const [code, value] of Object.entries(r.to as Record<string, unknown>)) {
        const locale = normalizeLocale(code)
        const v = clean(value, MAX_TERM_TRANSLATION)
        if (locale && v) to[locale] = v
      }
    }
    const keep = r.keep === true || Object.keys(to).length === 0
    glossary.push(keep ? { term, keep: true } : { term, to })
  }
  const keys = new Set<string>()
  for (const k of Array.isArray(raw.noTranslate) ? raw.noTranslate : []) {
    if (typeof k === "string" && k.length >= 3 && k.length <= 300 && /^[a-z]+:\S+$/i.test(k)) keys.add(k)
  }
  if (keys.size > MAX_NO_TRANSLATE) return { ok: false, error: `Up to ${MAX_NO_TRANSLATE} texts can be left untranslated.` }
  /* Only a choice that was made is kept: missing stays missing, so the default can still apply (rulesFrom). */
  return { ok: true, value: { glossary, noTranslate: [...keys], ...(typeof raw.keepProductNames === "boolean" ? { keepProductNames: raw.keepProductNames } : {}) } }
}

/**
 * KEEP PRODUCT NAMES, NEVER CHOSEN. On: product and brand names are proper
 * names, and a machine translation of them reads badly. Except for a store
 * whose product titles Storelib AI has already translated: it has worked
 * that way, so it goes on that way until the store chooses.
 */
export function keepProductNamesDefault(aiTitlesExist: boolean): boolean {
  return !aiTitlesExist
}

/** Whether the store has made its own choice about product names (what is saved has the field). */
export function productNamesChosen(input: unknown): boolean {
  return !!input && typeof input === "object" && typeof (input as { keepProductNames?: unknown }).keepProductNames === "boolean"
}

/**
 * Rules as read from the database: anything unreadable is no rules at all.
 * `aiTitles`: Storelib AI has translated this store's product titles, for
 * the default when the store never chose (keepProductNamesDefault).
 */
export function rulesFrom(input: unknown, opts: { aiTitles?: boolean } = {}): TranslationRules {
  const checked = validateRules(input)
  if (checked.ok === false) return emptyRules()
  const v = checked.value
  return { ...v, keepProductNames: typeof v.keepProductNames === "boolean" ? v.keepProductNames : keepProductNamesDefault(opts.aiTitles === true) }
}

/* ── One term, as the glossary's form checks it ─────────────────────────── */

export type TermProblem = "short" | "long" | "duplicate" | "noTranslation" | "translationLong"

/**
 * A term typed into the glossary, checked the way validateRules keeps it:
 * spaces tidied, 2 to 80 characters, not already there (case aside), and
 * either kept as written or with at least one translation of 160 characters
 * or fewer. `others`: the rest of the glossary, without the one being
 * edited. Translations for a language the store no longer has are carried
 * over from `was`, never dropped.
 */
export function checkTerm(
  draft: { term: string; keep: boolean; to: Record<string, string> },
  others: GlossaryTerm[],
  languages: string[],
  was?: GlossaryTerm | null,
): { ok: true; value: GlossaryTerm } | { ok: false; problem: TermProblem; field: string } {
  const term = clean(draft.term, 10_000)
  if (term.length < MIN_TERM) return { ok: false, problem: "short", field: "term" }
  if (term.length > MAX_TERM) return { ok: false, problem: "long", field: "term" }
  if (others.some((o) => o.term.toLowerCase() === term.toLowerCase())) return { ok: false, problem: "duplicate", field: "term" }
  if (draft.keep) return { ok: true, value: { term, keep: true } }
  const to: Record<string, string> = {}
  for (const [code, value] of Object.entries(was?.to ?? {})) if (!languages.includes(code) && value) to[code] = value
  for (const code of languages) {
    const v = clean(draft.to[code], 10_000)
    if (v.length > MAX_TERM_TRANSLATION) return { ok: false, problem: "translationLong", field: code }
    if (v) to[code] = v
  }
  if (!languages.some((code) => to[code])) return { ok: false, problem: "noTranslation", field: languages[0] ?? "term" }
  return { ok: true, value: { term, to } }
}

/* ── A glossary changed: what Storelib AI should write again ────────────── */

/** What a term asks for in one language: kept, a translation, or nothing (another language's term). */
function ruleFor(g: GlossaryTerm, locale: string): string | null {
  if (g.keep) return "keep"
  const to = g.to?.[locale]
  return to ? `to:${to}` : null
}

/**
 * The terms whose rule for `locale` is not what it was: added, removed,
 * switched between kept and translated, or translated another way. Each by
 * the words a text has (the new spelling when both exist).
 */
export function changedTerms(before: GlossaryTerm[], after: GlossaryTerm[], locale: string): string[] {
  const was = new Map(before.map((g) => [g.term.toLowerCase(), g]))
  const now = new Map(after.map((g) => [g.term.toLowerCase(), g]))
  const out: string[] = []
  for (const id of new Set([...was.keys(), ...now.keys()])) {
    const a = was.get(id)
    const b = now.get(id)
    const ra = a ? ruleFor(a, locale) : null
    const rb = b ? ruleFor(b, locale) : null
    if (ra === rb) continue
    if (b) out.push(b.term)
    if (a && (!b || a.term !== b.term)) out.push(a.term)
  }
  return out
}

/** The texts whose original has one of `terms` as a whole word or phrase, the same match the translator's cut uses. */
export function textsWithTerms<T extends { source: string }>(texts: T[], terms: string[]): T[] {
  if (terms.length === 0) return []
  return texts.filter((t) => terms.some((term) => termAt(t.source, term).test(t.source)))
}

/** A text Storelib AI leaves alone: listed by key, or a product's title when product names are kept. */
export function isExcluded(rules: TranslationRules | null | undefined, key: string): boolean {
  if (!rules) return false
  if (rules.keepProductNames && /^product:[^:]+:title$/.test(key)) return true
  return rules.noTranslate.includes(key)
}

/**
 * The terms the translator must not touch in a text going to `locale`:
 * every glossary term, kept ones and ones with a translation alike (the
 * second are put in afterwards by applyGlossary). Only terms the text has.
 */
export function protectedTerms(rules: TranslationRules | null | undefined, locale: string, text?: string): string[] {
  if (!rules) return []
  const out: string[] = []
  for (const g of rules.glossary) {
    if (!g.keep && !g.to?.[locale]) continue
    if (text !== undefined && !termAt(text, g.term).test(text)) continue
    out.push(g.term)
  }
  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
/** A term as a whole word or phrase, never inside another word ("Pro" not in "Products"). */
const termAt = (_text: string, term: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(term)}(?![\\p{L}\\p{N}])`, "gu")

/**
 * A machine translation with the glossary put in: each term with a
 * translation for `locale` that came back as written is replaced by it.
 * Kept terms are left as they are. Text inside HTML tags is never touched.
 */
export function applyGlossary(text: string, rules: TranslationRules | null | undefined, locale: string): string {
  if (!rules || !text) return text
  const swaps = rules.glossary.filter((g) => !g.keep && g.to?.[locale]).sort((a, b) => b.term.length - a.term.length)
  if (swaps.length === 0) return text
  /*
    ONE PASS, LONGEST TERM FIRST. Put in one term after another, a term inside
    an earlier one's translation was translated again ("Pro Plan" became
    "Formule Pro", then its "Pro" became "Professionnel"). Each term is
    replaced by a function, so its translation goes in exactly as written,
    a "$&" in it included.
  */
  const to = new Map(swaps.map((g) => [g.term, g.to![locale]]))
  const any = new RegExp(`(?<![\\p{L}\\p{N}])(?:${swaps.map((g) => escape(g.term)).join("|")})(?![\\p{L}\\p{N}])`, "gu")
  /* Split on tags so an attribute or a tag name is never rewritten. */
  return text
    .split(/(<[^>]*>)/g)
    .map((part) => (part.startsWith("<") ? part : part.replace(any, (m) => to.get(m) ?? m)))
    .join("")
}

/* ── One field in the editor: what its translation is ───────────────────── */

/**
 * Where one text stands in a language, as the editor's sidebar badges it:
 *
 *   auto       Storelib AI's, written for the original as it is now
 *   updating   Storelib AI's, but the original changed since: the new
 *              original shows until the next automatic run rewrites it
 *   edited     the merchant's own, for the original as it is now
 *   outdated   the merchant's own, and the original changed since: still
 *              shown as they wrote it, never rewritten, theirs to review
 *   missing    nothing yet: the original shows
 *   excluded   left untranslated on purpose (Don't translate), nothing written
 */
export type FieldTranslationState = "auto" | "updating" | "edited" | "outdated" | "missing" | "excluded"

export function fieldTranslationState(row: { value: string; sourceHash: string; source: "ai" | "manual" } | null | undefined, currentHash: string, excluded = false): FieldTranslationState {
  if (!row || !row.value.trim()) return excluded ? "excluded" : "missing"
  const fresh = !row.sourceHash || row.sourceHash === currentHash
  if (row.source === "manual") return fresh ? "edited" : "outdated"
  /* An automatic one on a text marked Don't translate is not shown by anything that writes again: treated as not translated. */
  if (excluded) return "excluded"
  return fresh ? "auto" : "updating"
}
