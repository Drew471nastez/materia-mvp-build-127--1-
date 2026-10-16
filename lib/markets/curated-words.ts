/**
 * ===========================================================================
 *  THE SHOP'S AND THE CHECKOUT'S WORDS, WRITTEN BY HAND
 * ===========================================================================
 * The words Storelib draws itself (the cart's and the theme's, `ui:`, and
 * the checkout's, `checkout:`) were machine translated for each store, one
 * short string at a time and with nothing to say what it was. "Pay {shop}"
 * above the checkout's total came back in Romanian as "Salariul {shop}",
 * the noun for a wage. These are the same words written and read through by
 * hand for the languages most stores sell in (./curated/<code>.ts), the
 * same for every store and free.
 *
 * WHERE ONE IS WRITTEN HERE IT IS THE TRANSLATION. Read whenever a
 * language's translations are read (./server.ts translationsOf and
 * cachedTranslations lay them in with withCurated), so:
 *
 *   the live website, the checkout and the Translate sheet show it, in place
 *     of a machine translation saved before (those were never a person's)
 *   the press and the automatic run see it as done (aiMayWrite) and never
 *     send it to a translator
 *   a translation the merchant wrote (source "manual") always wins, here
 *     and in Settings › Checkout › Checkout text: it is theirs
 *
 * A language without its own file here is machine translated as before,
 * with a note on what each word is (./word-notes.ts). An English sentence
 * changed in the code has no entry until its file is updated
 * (tests/checkout-words-curated.test.ts says which), and is machine
 * translated meanwhile, never shown half translated.
 *
 * Pure: the server, the routes and the tests read it the same way.
 */
import { UI_WORDS, uiKey, type UiWord } from "./ui-words"
import { checkoutKey, checkoutSentences } from "./checkout-words"
import { baseLanguage } from "./locales"
import { sourceHash, type TranslationRow } from "./translate"
import ro from "./curated/ro"
import es from "./curated/es"
import fr from "./curated/fr"
import de from "./curated/de"
import it from "./curated/it"
import pt from "./curated/pt"
import ptBR from "./curated/pt-BR"
import pl from "./curated/pl"
import nl from "./curated/nl"

/** One language's words: every shop word by its name, and the checkout's sentences by their English. */
export interface CuratedWords {
  ui: Record<UiWord, string>
  checkout: Record<string, string>
}

export const CURATED: Readonly<Record<string, CuratedWords>> = { ro, es, fr, de, it, pt, "pt-BR": ptBR, pl, nl }

/** The languages with hand written words. */
export const CURATED_LANGUAGES = Object.keys(CURATED)

/**
 * The file a language reads: its own ("pt-BR"), else its base language's
 * ("fr-CA" reads French, "pt-PT" European Portuguese). Brazilian and
 * European Portuguese are kept apart: one never stands in for the other.
 */
export function curatedLanguage(locale: string | null | undefined): string | null {
  if (!locale) return null
  if (CURATED[locale]) return locale
  if (locale.toLowerCase() === "pt-br") return "pt-BR"
  const base = baseLanguage(locale)
  return CURATED[base] ? base : null
}

const rowsByLanguage = new Map<string, TranslationRow[]>()

/** Every hand written word of a language as an approved translation of the English it was written for. Empty for a language with none. */
export function curatedRows(locale: string | null | undefined): TranslationRow[] {
  const code = curatedLanguage(locale)
  if (!code) return []
  const kept = rowsByLanguage.get(code)
  if (kept) return kept
  const words = CURATED[code]
  const rows: TranslationRow[] = []
  for (const w of Object.keys(UI_WORDS) as UiWord[]) {
    const v = words.ui[w]
    if (typeof v === "string" && v.trim()) rows.push({ key: uiKey(w), value: v, sourceHash: sourceHash(UI_WORDS[w]), status: "approved", source: "ai", curated: true })
  }
  for (const s of checkoutSentences()) {
    const v = words.checkout[s]
    if (typeof v === "string" && v.trim()) rows.push({ key: checkoutKey(s), value: v, sourceHash: sourceHash(s), status: "approved", source: "ai", curated: true })
  }
  rowsByLanguage.set(code, rows)
  return rows
}

/** The hand written word for one key in a language, or null. */
export function curatedValue(locale: string | null | undefined, key: string): string | null {
  return curatedRows(locale).find((r) => r.key === key)?.value ?? null
}

/**
 * A language's saved translations with the hand written words laid in: the
 * merchant's own (source "manual") are kept as they are, Storelib AI's of a
 * word written here are replaced by it, and every other row is untouched.
 */
export function withCurated(rows: TranslationRow[], locale: string | null | undefined): TranslationRow[] {
  const curated = curatedRows(locale)
  if (curated.length === 0) return rows
  const theirs = new Set<string>()
  for (const r of rows) if (r.source === "manual" && r.value.trim()) theirs.add(r.key)
  const laid = new Map<string, TranslationRow>()
  for (const r of curated) if (!theirs.has(r.key)) laid.set(r.key, r)
  return [...rows.filter((r) => !laid.has(r.key)), ...laid.values()]
}
