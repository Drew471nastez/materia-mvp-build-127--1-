/**
 * WHERE useLocale().t FINDS ITS WORDS (round 12).
 *
 * LocaleProvider is in the root layout, so whatever it imports is in every
 * page, published websites and the dashboard included, where nothing calls
 * t(). The dictionaries are therefore not its import: lib/i18n/locale-words.ts
 * holds them and registers here, and only the components that translate with
 * t() import it. A page without one never loads a dictionary.
 */
export interface LocaleWords {
  /** The word for `key` in `lang`, or English while `lang` is still on its way (asking starts the fetch). */
  word(lang: string, key: string): string | undefined
  /** Starts fetching `lang` if it is not here yet. */
  prepare(lang: string): void
}

let words: LocaleWords | null = null
const listeners = new Set<() => void>()

export function setLocaleWords(w: LocaleWords): void {
  words = w
  for (const l of listeners) l()
}

export function localeWords(): LocaleWords | null {
  return words
}

/** Something arrived (the words themselves, or a language fetched): a provider draws again. */
export function wordsChanged(): void {
  for (const l of listeners) l()
}

export function onWordsChange(l: () => void): () => void {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
