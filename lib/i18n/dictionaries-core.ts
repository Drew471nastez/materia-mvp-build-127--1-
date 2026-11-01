/**
 * Marketplace UI dictionaries, the part a page that translates carries:
 * English (and the header keys of the partly translated locales). Romanian,
 * Spanish, French and German are complete and large, so they are loaded only
 * for a person who chose one (loadLazyDictionary); the server reads all of
 * them from lib/i18n/dictionaries.ts. Only the pages that call useLocale().t
 * load this file at all (lib/i18n/locale-words.ts, round 12).
 */
// Per-surface translations authored by the RO/EN sweep. Merged below; the
// curated base keys (lib/i18n/dict/shell.ts) win on any key collision.
import { authEn } from "./dict/auth"
import { checkoutEn } from "./dict/checkout"
import { dashboardEn } from "./dict/dashboard"
import { settingsEn } from "./dict/settings"
import { builderEn } from "./dict/builder"
// The base keys, which the platform header carries alone (lib/i18n/locale-words-shell.ts, round 46).
import { shellDictionaries } from "./dict/shell"
import { LAZY_LOCALES, LOCALE_SIZES, type LazyLocale } from "./locale-sizes"
import { loadLazyDictionary } from "./lazy-dictionaries"

export type LocaleCode = "ro" | "en" | "es" | "de" | "pt-BR" | "fr" | "it" | "nl" | "pl"

export { LAZY_LOCALES, type LazyLocale }
export type CoreLocale = Exclude<LocaleCode, LazyLocale>

/** How many keys each lazy locale has (lib/i18n/locale-sizes.ts). */
export const LAZY_LOCALE_SIZES: Record<LazyLocale, number> = { es: LOCALE_SIZES.es, fr: LOCALE_SIZES.fr, de: LOCALE_SIZES.de, ro: LOCALE_SIZES.ro }

/** The lazy locale's dictionary, fetched once (lib/i18n/lazy-dictionaries.ts, shared with the header's words). */
export { loadLazyDictionary }

export const coreDictionaries: Record<CoreLocale, Record<string, string>> = {
  en: {
    // Merged per-surface keys (the base keys, lib/i18n/dict/shell.ts, override on collision)
    ...authEn,
    ...checkoutEn,
    ...dashboardEn,
    ...settingsEn,
    ...builderEn,
    ...shellDictionaries.en,
  },
  // Other locales keep their original header keys; everything else falls back to English.
  "pt-BR": shellDictionaries["pt-BR"],
  it: shellDictionaries.it,
  nl: shellDictionaries.nl,
  pl: shellDictionaries.pl,
}
