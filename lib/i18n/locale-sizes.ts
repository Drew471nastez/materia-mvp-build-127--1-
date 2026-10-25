/**
 * How many keys each marketplace locale has (lib/i18n/dictionaries.ts), for
 * the language picker's coverage rule (components/locale-provider.tsx)
 * without loading a dictionary: the provider is in the root layout, on every
 * page, and most pages translate nothing with it. tests/i18n-lazy.test.ts
 * checks these against the files, so a new translation cannot leave them
 * stale.
 */
import type { LocaleCode } from "./dictionaries-core"

/** The fully translated locales that are not in every page's bundle: loaded when chosen. Romanian joined them in round 12. */
export type LazyLocale = "es" | "fr" | "de" | "ro"
export const LAZY_LOCALES: readonly LazyLocale[] = ["es", "fr", "de", "ro"]

export const LOCALE_SIZES: Record<LocaleCode, number> = { en: 1234, ro: 1234, es: 1234, fr: 1234, de: 1234, "pt-BR": 7, it: 7, nl: 7, pl: 7 }
