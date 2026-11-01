/**
 * ===========================================================================
 *  THE HEADER'S WORDS, WITHOUT EVERY SCREEN'S (round 46)
 * ===========================================================================
 * lib/i18n/locale-words.ts registers the whole marketplace dictionary: the
 * base keys and the sign in, checkout, dashboard, settings and builder
 * surfaces, about 60 KB of English. The platform header imported it, so
 * every marketing page carried all of it to say "Search for anything" and
 * "Language".
 *
 * The header imports this instead: the base keys only (lib/i18n/dict/shell.ts),
 * the same values the full module gives for them, and the four complete
 * locales fetched on demand exactly as there (lib/i18n/lazy-dictionaries.ts).
 *
 *   A KEY THAT IS NOT HERE fetches the full module, which registers itself
 *   over this one and redraws the provider (lib/i18n/words-registry.ts), so
 *   a word asked for is still found, a moment later rather than never.
 *
 *   THE FULL MODULE ALWAYS WINS. Registered first (a screen imported it),
 *   this does not replace it; registered later, it replaces this.
 */
import { shellDictionaries } from "./dict/shell"
import { LAZY_LOCALES, type LazyLocale } from "./locale-sizes"
import { loadLazyDictionary } from "./lazy-dictionaries"
import { localeWords, setLocaleWords, wordsChanged, type LocaleWords } from "./words-registry"

const isLazy = (code: string): code is LazyLocale => (LAZY_LOCALES as readonly string[]).includes(code)
const loaded: Partial<Record<LazyLocale, Record<string, string>>> = {}
const asked = new Set<string>()
let full: Promise<unknown> | null = null

function prepare(lang: string) {
  if (!isLazy(lang) || loaded[lang] || asked.has(lang)) return
  asked.add(lang)
  loadLazyDictionary(lang).then(
    (d) => {
      loaded[lang] = d
      wordsChanged()
    },
    /* A chunk that failed is asked again next time; until then English. */
    () => asked.delete(lang),
  )
}

/** Every word, for a key the base does not have: the full module registers itself when it arrives. */
function askForAll() {
  if (full) return
  full = import("./locale-words")
  full.catch(() => {
    full = null
  })
}

const shellWords: LocaleWords = {
  word(lang, key) {
    const own = isLazy(lang) ? loaded[lang] : (shellDictionaries as Record<string, Record<string, string>>)[lang]
    if (!own && isLazy(lang)) prepare(lang)
    const word = own?.[key] ?? shellDictionaries.en[key]
    if (word === undefined) askForAll()
    return word
  },
  prepare,
}

if (!localeWords()) setLocaleWords(shellWords)
