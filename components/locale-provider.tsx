"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { dictionaries, type LocaleCode } from "@/lib/i18n/dictionaries"
import { formatMoney, type CurrencyCode } from "@/lib/i18n/currency"

export type SupportedLanguage = LocaleCode
export type SupportedCurrency = CurrencyCode

const STORAGE_KEYS = {
  language: "storelib_language",
  currency: "storelib_currency",
}

// Romanian-first marketplace: default to RO + RON. The choice persists in
// localStorage, so returning users keep whatever they last selected.
const DEFAULT_LANGUAGE: SupportedLanguage = "ro"
const DEFAULT_CURRENCY: SupportedCurrency = "RON"

const LANGUAGES: Array<{ code: SupportedLanguage; label: string; short: string }> = [
  { code: "ro", label: "Română", short: "RO" },
  { code: "en", label: "English", short: "EN" },
  { code: "es", label: "Español", short: "ES" },
  { code: "de", label: "Deutsch", short: "DE" },
  { code: "pt-BR", label: "Português (BR)", short: "PT" },
  { code: "fr", label: "Français", short: "FR" },
  { code: "it", label: "Italiano", short: "IT" },
  { code: "nl", label: "Nederlands", short: "NL" },
  { code: "pl", label: "Polski", short: "PL" },
]

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
      return dictionaries[language]?.[key] ?? dictionaries.en[key] ?? key
    },
    [language],
  )

  const formatPrice = useCallback((usdCents: number) => formatMoney(usdCents, currency), [currency])

  const currencySymbol = useMemo(() => CURRENCIES.find((c) => c.code === currency)?.symbol ?? "$", [currency])
  const languageShort = useMemo(() => LANGUAGES.find((l) => l.code === language)?.short ?? "EN", [language])

  const value = useMemo<LocaleContextValue>(
    () => ({
      language,
      currency,
      languages: LANGUAGES,
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
