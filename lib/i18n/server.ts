import "server-only"
import { cookies } from "next/headers"
import { dictionaries, type LocaleCode } from "./dictionaries"

/**
 * Server-side counterpart to useLocale().t(). Server components can't read the
 * client LocaleProvider, so they read the language from the cookie the provider
 * writes (`storelib_language`) and translate against the same dictionaries.
 *
 * Romanian-first: falls back to "ro" when no valid cookie is present.
 *
 * NOTE: calling getServerLocale()/getServerT() opts the calling route into
 * dynamic rendering (it reads a request cookie). Use it in already-dynamic
 * pages; don't add it to a page you need statically cached.
 */

const SUPPORTED: readonly LocaleCode[] = ["ro", "en", "es", "de", "pt-BR", "fr", "it", "nl", "pl"]
const DEFAULT_LOCALE: LocaleCode = "ro"
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
  return (key: string) => dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key
}

/** Convenience: resolve the request locale and return { locale, t }. */
export async function getServerT(): Promise<{ locale: LocaleCode; t: (key: string) => string }> {
  const locale = await getServerLocale()
  return { locale, t: getT(locale) }
}
