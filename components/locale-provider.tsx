"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { dictionaries, type LocaleCode } from "@/lib/i18n/dictionaries"
import { formatPlatformMoney, type CurrencyCode } from "@/lib/i18n/currency"
import { humanizeKey } from "@/lib/i18n/text"

export type SupportedLanguage = LocaleCode
export type SupportedCurrency = CurrencyCode

const STORAGE_KEYS = {
  language: "storelib_language",
  currency: "storelib_currency",
}

/**
 * ===========================================================================
 *  ENGLISH IS THE DEFAULT
 * ===========================================================================
 *
 * This read "ro" and the platform came up in Romanian for everybody on their
 * first visit, including visitors who had never seen the site and had no way to
 * know a language control existed. Romanian remains fully translated and one
 * click away; it is simply no longer imposed on a first-time visitor.
 *
 * Three places have to agree on this or the page flickers from one language to
 * the other on hydration:
 *
 *   1. here, for the client
 *   2. DEFAULT_LOCALE in lib/i18n/server.ts, for server components
 *   3. <html lang> in app/layout.tsx, for crawlers and screen readers
 *
 * The currency is a separate question and deliberately untouched. Storelib
 * quotes, charges and pays out in lei; that is what the platform does, not a
 * display preference, and formatPrice below ignores the selection entirely.
 */
const DEFAULT_LANGUAGE: SupportedLanguage = "en"
const DEFAULT_CURRENCY: SupportedCurrency = "RON"

/**
 * ---------------------------------------------------------------------------
 * WHY THE PICKER IS NOT JUST THIS ARRAY
 * ---------------------------------------------------------------------------
 * All nine locales are declared, but only two are TRANSLATED. At the time of
 * writing `ro` and `en` carry 1389 keys each and the other seven carry seven
 * keys each -- 0.5%. Listing them anyway means somebody picks "Español",
 * watches the page not change, and concludes the site is broken. It is a worse
 * experience than not offering Spanish, and it is the reason no serious
 * platform lists a language it has not actually shipped.
 *
 * So the picker is driven by measured coverage rather than by this list, and it
 * is measured rather than hand-maintained on purpose: the day somebody
 * translates Spanish, Spanish appears in the picker on its own. Nobody has to
 * remember to come back here and delete a flag from a hardcoded array, which is
 * exactly the kind of edit that never happens.
 *
 * `flag` is here because the reference implementations all use one and because
 * a flag is what people scan for -- they find their language by shape long
 * before they read the word.
 */
const LANGUAGES: Array<{ code: SupportedLanguage; label: string; short: string; flag: string }> = [
  { code: "en", label: "English", short: "EN", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "ro", label: "Română", short: "RO", flag: "\u{1F1F7}\u{1F1F4}" },
  { code: "es", label: "Español", short: "ES", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "de", label: "Deutsch", short: "DE", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "pt-BR", label: "Português (BR)", short: "PT", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "fr", label: "Français", short: "FR", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "it", label: "Italiano", short: "IT", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "nl", label: "Nederlands", short: "NL", flag: "\u{1F1F3}\u{1F1F1}" },
  { code: "pl", label: "Polski", short: "PL", flag: "\u{1F1F5}\u{1F1F1}" },
]

/**
 * A locale is offered once it can actually render the app.
 *
 * 70% of the English key count: high enough that the chrome, the nav, the
 * checkout and the settings pages are all covered, low enough that a
 * translation still in progress is not held back over a handful of strings that
 * fall through to English anyway.
 *
 * English is always offered -- it is the fallback every other locale reads
 * through, so it cannot be incomplete by definition.
 */
export const LOCALE_READY_THRESHOLD = 0.7

function translatedLocales(): Set<SupportedLanguage> {
  const baseline = Object.keys(dictionaries.en ?? {}).length || 1
  const ready = new Set<SupportedLanguage>(["en"])
  for (const l of LANGUAGES) {
    const size = Object.keys(dictionaries[l.code] ?? {}).length
    if (size / baseline >= LOCALE_READY_THRESHOLD) ready.add(l.code)
  }
  return ready
}

/** The languages the picker shows: declared, and actually translated. */
const AVAILABLE_LANGUAGES = (() => {
  const ready = translatedLocales()
  return LANGUAGES.filter((l) => ready.has(l.code))
})()

const CURRENCIES: Array<{ code: SupportedCurrency; label: string; symbol: string }> = [
  { code: "USD", label: "USD ($)", symbol: "$" },
  { code: "EUR", label: "EUR (€)", symbol: "€" },
  { code: "GBP", label: "GBP (£)", symbol: "£" },
  { code: "RON", label: "RON (lei)", symbol: "lei" },
  { code: "CAD", label: "CAD ($)", symbol: "$" },
  { code: "AUD", label: "AUD ($)", symbol: "$" },
]

// Translatable strings live in lib/i18n/dictionaries.ts (ro + en maintained).

type LocaleContextValue = {
  language: SupportedLanguage
  currency: SupportedCurrency
  /** Only locales that are actually translated. See AVAILABLE_LANGUAGES. */
  languages: typeof LANGUAGES
  currencies: typeof CURRENCIES
  setLanguage: (lang: SupportedLanguage) => void
  setCurrency: (cur: SupportedCurrency) => void
  t: (key: string) => string
  /** Format a USD-cents price in the currently selected currency. */
  formatPrice: (usdCents: number) => string
  currencySymbol: string
  languageShort: string
}

/**
 * The browser's preferred language, if Storelib actually speaks it.
 *
 * navigator.languages is in the user's own priority order, so the first entry
 * that matches a translated locale is the right answer. Region is matched
 * loosely: "ro-MD" (Moldova) and "ro-RO" both mean Romanian, and "pt-PT" is
 * close enough to pt-BR to be better than English for that reader.
 */
function detectBrowserLanguage(): SupportedLanguage | null {
  try {
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const raw of prefs) {
      if (!raw) continue
      const tag = raw.toLowerCase()
      const exact = AVAILABLE_LANGUAGES.find((l) => l.code.toLowerCase() === tag)
      if (exact) return exact.code
      const base = tag.split("-")[0]
      const loose = AVAILABLE_LANGUAGES.find((l) => l.code.toLowerCase().split("-")[0] === base)
      if (loose) return loose.code
    }
  } catch {
    // No navigator (SSR, odd embed) — the default is the answer.
  }
  return null
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(DEFAULT_LANGUAGE)
  const [currency, setCurrencyState] = useState<SupportedCurrency>(DEFAULT_CURRENCY)

  // Hydrate from localStorage.
  useEffect(() => {
    try {
      const savedLang = window.localStorage.getItem(STORAGE_KEYS.language) as SupportedLanguage | null
      const savedCur = window.localStorage.getItem(STORAGE_KEYS.currency) as SupportedCurrency | null

      if (savedLang && LANGUAGES.some((l) => l.code === savedLang)) {
        setLanguageState(savedLang)
        // Sync the cookie so the next server render matches the stored choice.
        document.cookie = `${STORAGE_KEYS.language}=${savedLang}; path=/; max-age=31536000; samesite=lax`
      } else {
        /**
         * No stored choice: read the browser's own language before falling back
         * to English. This is what keeps flipping the default from being a
         * downgrade for the people already here -- a browser set to Romanian
         * still lands on a Romanian site, automatically, exactly as before.
         * What changes is that a browser set to anything else is no longer
         * shown Romanian.
         *
         * Only ever resolves to a locale that is actually translated, so this
         * cannot strand somebody in a 0.5% dictionary.
         */
        const detected = detectBrowserLanguage()
        if (detected && detected !== DEFAULT_LANGUAGE) {
          setLanguageState(detected)
          document.cookie = `${STORAGE_KEYS.language}=${detected}; path=/; max-age=31536000; samesite=lax`
        }
      }
      if (savedCur && CURRENCIES.some((c) => c.code === savedCur)) {
        setCurrencyState(savedCur)
        document.cookie = `${STORAGE_KEYS.currency}=${savedCur}; path=/; max-age=31536000; samesite=lax`
      }
    } catch {
      // ignore
    }
  }, [])

  // Keep <html lang> in sync.
  useEffect(() => {
    try {
      document.documentElement.lang = language === "pt-BR" ? "pt" : language
      document.documentElement.dataset.currency = currency
    } catch {
      // ignore
    }
  }, [language, currency])

  // Mirror the choice into a cookie so server components can render in the
  // same language (localStorage is client-only and invisible to the server).
  const writeCookie = (name: string, value: string) => {
    try {
      document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`
    } catch {
      // ignore
    }
  }

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang)
    try {
      window.localStorage.setItem(STORAGE_KEYS.language, lang)
    } catch {
      // ignore
    }
    writeCookie(STORAGE_KEYS.language, lang)
  }, [])

  const setCurrency = useCallback((cur: SupportedCurrency) => {
    setCurrencyState(cur)
    try {
      window.localStorage.setItem(STORAGE_KEYS.currency, cur)
    } catch {
      // ignore
    }
    writeCookie(STORAGE_KEYS.currency, cur)
  }, [])

  const t = useCallback(
    (key: string) => {
      return dictionaries[language]?.[key] ?? dictionaries.en[key] ?? humanizeKey(key)
    },
    [language],
  )

  /**
   * ALWAYS LEI, whatever `currency` says.
   *
   * The selected currency used to relabel the number against a static rate
   * table while the card was charged in one currency regardless — so a shopper
   * who chose GBP read pounds on every page and got a lei charge. A control
   * that changes the label and not the transaction is worse than no control.
   *
   * `currency` survives as state because the modal still reads it, and because
   * ripping it out of the context would touch every consumer for no gain; what
   * it no longer does is decide what anybody is quoted.
   */
  const formatPrice = useCallback((cents: number) => formatPlatformMoney(cents), [])

  const currencySymbol = useMemo(() => CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$", [currency])
  const languageShort = useMemo(() => LANGUAGES.find((l) => l.code === language)?.short ?? "EN", [language])

  const value = useMemo<LocaleContextValue>(
    () => ({
      language,
      currency,
      languages: AVAILABLE_LANGUAGES,
      currencies: CURRENCIES,
      setLanguage,
      setCurrency,
      t,
      formatPrice,
      currencySymbol,
      languageShort,
    }),
    [language, currency, setLanguage, setCurrency, t, formatPrice, currencySymbol, languageShort],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider")
  return ctx
}
