/**
 * The marketplace's words for useLocale().t, imported by the components that
 * translate with it (round 12): English here, the others fetched the first
 * time somebody reads them. See lib/i18n/words-registry.ts for why the
 * provider does not import them itself.
 */
import { coreDictionaries, LAZY_LOCALES, loadLazyDictionary, type LazyLocale } from "./dictionaries-core"
import { setLocaleWords, wordsChanged } from "./words-registry"

const isLazy = (code: string): code is LazyLocale => (LAZY_LOCALES as readonly string[]).includes(code)
const loaded: Partial<Record<LazyLocale, Record<string, string>>> = {}
const asked = new Set<string>()

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

setLocaleWords({
  word(lang, key) {
    const own = isLazy(lang) ? loaded[lang] : (coreDictionaries as Record<string, Record<string, string>>)[lang]
    if (!own && isLazy(lang)) prepare(lang)
    return own?.[key] ?? coreDictionaries.en[key]
  },
  prepare,
})
