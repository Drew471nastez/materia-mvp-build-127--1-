"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type SupportedLanguage = "en" | "es" | "de" | "pt-BR" | "fr" | "it" | "nl" | "pl"
export type SupportedCurrency = "USD" | "EUR" | "GBP" | "RON" | "CAD" | "AUD"

const STORAGE_KEYS = {
  language: "storelib_language",
  currency: "storelib_currency",
}

const DEFAULT_LANGUAGE: SupportedLanguage = "en"
const DEFAULT_CURRENCY: SupportedCurrency = "USD"

const LANGUAGES: Array<{ code: SupportedLanguage; label: string; short: string }> = [
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

// Small shared dictionary (header/UI). As you expand the platform, replace hardcoded
// strings with t("...") and extend this map.
const DICT: Record<SupportedLanguage, Record<string, string>> = {
  en: {
    search_placeholder: "Search fonts, graphics, embroidery, crafts, and more",
    wishlist: "Wishlist",
    library: "Library",
    start_selling: "Start selling",
    language: "Language",
    currency: "Currency",
  },
  es: {
    search_placeholder: "Buscar fuentes, gráficos, bordado, manualidades y más",
    wishlist: "Lista",
    library: "Biblioteca",
    start_selling: "Empezar a vender",
    language: "Idioma",
    currency: "Moneda",
  },
  de: {
    search_placeholder: "Schriftarten, Grafiken, Stickerei, Basteln und mehr suchen",
    wishlist: "Wunschliste",
    library: "Bibliothek",
    start_selling: "Verkaufen",
    language: "Sprache",
    currency: "Währung",
  },
  "pt-BR": {
    search_placeholder: "Buscar fontes, gráficos, bordado, artesanato e mais",
    wishlist: "Lista",
    library: "Biblioteca",
    start_selling: "Começar a vender",
    language: "Idioma",
    currency: "Moeda",
  },
  fr: {
    search_placeholder: "Rechercher des polices, graphiques, broderie, loisirs créatifs…",
    wishlist: "Favoris",
    library: "Bibliothèque",
    start_selling: "Vendre",
    language: "Langue",
    currency: "Devise",
  },
  it: {
    search_placeholder: "Cerca font, grafiche, ricamo, hobby e altro",
    wishlist: "Preferiti",
    library: "Libreria",
    start_selling: "Inizia a vendere",
    language: "Lingua",
    currency: "Valuta",
  },
  nl: {
    search_placeholder: "Zoek lettertypen, graphics, borduurwerk, knutselen en meer",
    wishlist: "Verlanglijst",
    library: "Bibliotheek",
    start_selling: "Begin met verkopen",
    language: "Taal",
    currency: "Valuta",
  },
  pl: {
    search_placeholder: "Szukaj czcionek, grafik, haftu, rękodzieła i więcej",
    wishlist: "Lista",
    library: "Biblioteka",
    start_selling: "Zacznij sprzedawać",
    language: "Język",
    currency: "Waluta",
  },
}

type LocaleContextValue = {
  language: SupportedLanguage
  currency: SupportedCurrency
  languages: typeof LANGUAGES
  currencies: typeof CURRENCIES
  setLanguage: (lang: SupportedLanguage) => void
  setCurrency: (cur: SupportedCurrency) => void
  t: (key: string) => string
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

      if (savedLang && LANGUAGES.some((l) => l.code === savedLang)) setLanguageState(savedLang)
      if (savedCur && CURRENCIES.some((c) => c.code === savedCur)) setCurrencyState(savedCur)
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

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang)
    try {
      window.localStorage.setItem(STORAGE_KEYS.language, lang)
    } catch {
      // ignore
    }
  }, [])

  const setCurrency = useCallback((cur: SupportedCurrency) => {
    setCurrencyState(cur)
    try {
      window.localStorage.setItem(STORAGE_KEYS.currency, cur)
    } catch {
      // ignore
    }
  }, [])

  const t = useCallback(
    (key: string) => {
      return DICT[language]?.[key] ?? DICT.en[key] ?? key
    },
    [language],
  )

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
      currencySymbol,
      languageShort,
    }),
    [language, currency, setLanguage, setCurrency, t, currencySymbol, languageShort],
  )

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider")
  return ctx
}
