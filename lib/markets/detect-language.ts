/**
 * ===========================================================================
 *  WHICH LANGUAGE A WEBSITE IS WRITTEN IN
 * ===========================================================================
 * A store can set its default language to French while every heading on its
 * website is in English. Translating "into French" then only reached the
 * shop's built-in words, and the website stayed English (the owner's report).
 * This reads the website's own texts and says which language most of them
 * are in, from the commonest small words of each language, so Settings can
 * say so and offer the fix. No network, no model: a few thousand words are
 * plenty to tell these apart.
 *
 * Pure.
 */
import { BUILT_IN_GROUPS } from "./translate"

const WORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "in", "is", "for", "with", "you", "your", "our", "on", "are", "this", "that", "from", "it", "we", "be", "all", "shop", "now", "new", "more", "by", "at", "or"],
  fr: ["le", "la", "les", "de", "des", "et", "en", "du", "un", "une", "pour", "est", "vous", "votre", "nos", "notre", "sur", "avec", "dans", "au", "aux", "plus", "par", "pas", "qui", "que"],
  es: ["el", "la", "los", "las", "de", "del", "y", "en", "un", "una", "para", "es", "con", "tu", "tus", "nuestro", "nuestra", "por", "que", "más", "su", "sus", "al", "lo"],
  de: ["der", "die", "das", "und", "in", "den", "von", "mit", "für", "ist", "du", "dein", "deine", "unser", "unsere", "auf", "ein", "eine", "zu", "im", "nicht", "mehr", "jetzt", "dem"],
  it: ["il", "la", "le", "di", "e", "in", "un", "una", "per", "con", "del", "della", "che", "è", "nostro", "nostra", "tuo", "tua", "sono", "più", "ai", "dei", "gli", "al"],
  pt: ["o", "a", "os", "as", "de", "do", "da", "e", "em", "um", "uma", "para", "com", "que", "seu", "sua", "nosso", "nossa", "mais", "por", "no", "na", "dos", "das"],
  ro: ["și", "si", "în", "de", "la", "cu", "pentru", "este", "un", "o", "din", "pe", "al", "ale", "noastre", "nostru", "tău", "ta", "mai", "acum", "sunt", "care", "produse", "livrare"],
  pl: ["i", "w", "na", "z", "do", "się", "nie", "jest", "dla", "to", "że", "od", "po", "o", "twój", "nasz", "nasze", "więcej", "teraz", "oraz", "przez", "jak"],
  nl: ["de", "het", "een", "en", "van", "in", "voor", "met", "op", "is", "je", "jouw", "onze", "ons", "naar", "aan", "meer", "nu", "niet", "zijn", "bij", "uit"],
}

const SETS = Object.fromEntries(Object.entries(WORDS).map(([k, v]) => [k, new Set(v)]))

/**
 * The language most of these texts are written in, or null when there are
 * too few words to say (a new website) or no language stands out.
 */
export function detectLanguage(texts: string[]): string | null {
  const counts: Record<string, number> = {}
  let total = 0
  for (const t of texts) {
    const words = String(t ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|\{[^}]*\}/g, " ")
      .toLowerCase()
      .match(/\p{L}+/gu)
    if (!words) continue
    for (const w of words) {
      total++
      for (const [lang, set] of Object.entries(SETS)) if (set.has(w)) counts[lang] = (counts[lang] ?? 0) + 1
    }
  }
  if (total < 40) return null
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  if (!best || best[1] / total < 0.06) return null
  /* Clearly ahead of the next: shared little words ("de", "la", "in") must not decide it. */
  if (second && best[1] < second[1] * 1.6) return null
  return best[0]
}

/**
 * WHAT TRANSLATING INTO THE DEFAULT LANGUAGE COVERS. A website written in
 * the language it shows by default only needs the shop's own built-in words
 * (they are written in English). One written in another language (an
 * English theme on a store whose default is Spanish) needs every text
 * translated, so the default language reads in Spanish everywhere: the owner's
 * "if they set the default language to French, everything should be French".
 * `writtenIn` unknown (too few words): treated as written in the default.
 */
export function defaultLanguageScope(defaultLanguage: string, writtenIn: string | null): "builtIn" | "all" {
  if (!writtenIn) return "builtIn"
  const base = (l: string) => l.split("-")[0].toLowerCase()
  return base(writtenIn) === base(defaultLanguage) ? "builtIn" : "all"
}

/** The language a website's own texts are written in: every group but the shop's built-in words, which are English. */
export function writtenLanguage(groups: { id: string; items: { source: string }[] }[]): string | null {
  return detectLanguage(groups.filter((g) => !BUILT_IN_GROUPS.has(g.id)).flatMap((g) => g.items.map((t) => t.source)))
}
