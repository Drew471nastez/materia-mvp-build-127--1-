import "server-only"
import { cookies } from "next/headers"
import { dictionaries, type LocaleCode } from "./dictionaries"
import { humanizeKey, loadCatalog, makeTt, type Vars } from "./text"

const DASHBOARD_LANGUAGES = ["en", "es", "fr", "de", "pt-BR", "pt", "it", "pl"]

/**
 * Server-side counterpart to useLocale().t(). Server components can't read the
 * client LocaleProvider, so they read the language from the cookie the provider
 * writes (`storelib_language`) and translate against the same dictionaries.
 *
 * Falls back to English when no valid cookie is present. This MUST match
 * DEFAULT_LANGUAGE in components/locale-provider.tsx and <html lang> in
 * app/layout.tsx -- if the server renders one language and the client hydrates
 * into another, the page visibly swaps languages in front of the reader.
 *
 * NOTE: calling getServerLocale()/getServerT() opts the calling route into
 * dynamic rendering (it reads a request cookie). Use it in already-dynamic
 * pages; don't add it to a page you need statically cached.
 */

const SUPPORTED: readonly LocaleCode[] = ["ro", "en", "es", "de", "pt-BR", "fr", "it", "nl", "pl"]
const DEFAULT_LOCALE: LocaleCode = "en"
const LANGUAGE_COOKIE = "storelib_language"

export async function getServerLocale(): Promise<LocaleCode> {
  try {
    const store = await cookies()
    const value = store.get(LANGUAGE_COOKIE)?.value as LocaleCode | undefined
    if (value && SUPPORTED.includes(value)) return value
  } catch {
    // cookies() throws outside a request scope — fall through to the default.
  }
  return DEFAULT_LOCALE
}

/** Build a t(key) bound to a specific locale (dictionaries → English → key). */
export function getT(locale: LocaleCode): (key: string) => string {
  return (key: string) => dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? humanizeKey(key)
}


/** Convenience: resolve the request locale and return { locale, t }. */
export async function getServerT(): Promise<{ locale: LocaleCode; t: (key: string) => string }> {
  const locale = await getServerLocale()
  return { locale, t: getT(locale) }
}

/**
 * The dashboard's tt() for a server component: the request's language (the
 * cookie LanguageProvider writes) and its words. English when the cookie is
 * missing or names a language the dashboard does not speak.
 */
export async function getServerTt(): Promise<{ language: string; tt: (source: string, vars?: Vars) => string }> {
  let language = "en"
  try {
    const store = await cookies()
    const value = store.get(LANGUAGE_COOKIE)?.value
    if (value && DASHBOARD_LANGUAGES.includes(value)) language = value === "pt" ? "pt-BR" : value
  } catch {
    // Outside a request: English.
  }
  const words = language === "en" ? {} : await loadCatalog(language).catch(() => ({}))
  return { language, tt: makeTt(language, words) }
}
