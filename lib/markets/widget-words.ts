import "server-only"

/**
 * ===========================================================================
 *  A WIDGET'S OWN WORDS IN THE PAGE'S LANGUAGE (for apps and widgets)
 * ===========================================================================
 * The small, stable API other parts of Storelib use for words they draw on
 * a creator's website that no section setting holds (a reviews widget's
 * "Write a review", a badge): add the English word to UI_WORDS
 * (lib/markets/ui-words.ts), and it is listed under Translate › Shop words,
 * translated with the rest (automatically, by the glossary's rules, and by
 * hand), and read here. A word with no approved translation is the English.
 *
 *   storeLanguages(creatorId)                 the default and the published ones
 *   translateUiString(creatorId, locale, w)   one word
 *   translateUiStrings(creatorId, locale, ws) several, one read
 *
 * Reads the same cached rows as the live website (lib/markets/server.ts
 * cachedTranslations), so a widget and its page never disagree.
 */
import { siteLanguages } from "./live"
import { cachedTranslations } from "./server"
import { translationMap, valueFor } from "./translate"
import { UI_WORDS, uiKey, type UiWord } from "./ui-words"

/** The website's default language and every published one, the default first. */
export async function storeLanguages(creatorId: string): Promise<{ defaultLanguage: string; published: string[] }> {
  const l = await siteLanguages(creatorId)
  return { defaultLanguage: l.defaultLanguage, published: [l.defaultLanguage, ...l.others] }
}

/** Several of the shop's words in `locale` (a published language, else the website's own), each the English when untranslated. */
export async function translateUiStrings<W extends UiWord>(creatorId: string, locale: string | null | undefined, words: readonly W[]): Promise<Record<W, string>> {
  const out = Object.fromEntries(words.map((w) => [w, UI_WORDS[w] as string])) as unknown as Record<W, string>
  const { defaultLanguage, published } = await storeLanguages(creatorId)
  const code = (locale && published.find((p) => p.toLowerCase() === locale.toLowerCase())) || defaultLanguage
  const rows = await cachedTranslations(creatorId, code).catch(() => [])
  if (rows.length === 0) return out
  const map = translationMap(rows.filter((r) => r.status === "approved"))
  for (const w of words) out[w] = valueFor(map, uiKey(w), { approvedOnly: true }) ?? UI_WORDS[w]
  return out
}

/** One of the shop's words in `locale`. */
export async function translateUiString(creatorId: string, locale: string | null | undefined, word: UiWord): Promise<string> {
  return (await translateUiStrings(creatorId, locale, [word]))[word]
}
