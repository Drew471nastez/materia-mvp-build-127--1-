"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import { translations, getTranslation, LANGUAGES, type LanguageCode, type TranslationKey } from "./translations"

interface LanguageContextType {
  language: LanguageCode
  setLanguage: (lang: LanguageCode) => void
  t: (key: TranslationKey) => string
  languages: typeof LANGUAGES
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

const LANGUAGE_STORAGE_KEY = "storelib_language"

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>("en")
  const [isHydrated, setIsHydrated] = useState(false)

  // Load language from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (stored && LANGUAGES.some(l => l.code === stored)) {
      setLanguageState(stored as LanguageCode)
    } else {
      // Try to detect browser language
      const browserLang = navigator.language.split("-")[0]
      if (LANGUAGES.some(l => l.code === browserLang || l.code.startsWith(browserLang))) {
        const matched = LANGUAGES.find(l => l.code === browserLang || l.code.startsWith(browserLang))
        if (matched) {
          setLanguageState(matched.code)
        }
      }
    }
    setIsHydrated(true)
  }, [])

  const setLanguage = useCallback((lang: LanguageCode) => {
    setLanguageState(lang)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    // Update document lang attribute
    document.documentElement.lang = lang.split("-")[0]
  }, [])

  const t = useCallback((key: TranslationKey): string => {
    return getTranslation(language, key)
  }, [language])

  // Prevent hydration mismatch by rendering children only after hydration
  if (!isHydrated) {
    return null
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languages: LANGUAGES }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}

// Hook for using translations without context (for server components or outside provider)
export function useTranslation(lang: LanguageCode = "en") {
  return {
    t: (key: TranslationKey) => getTranslation(lang, key),
    language: lang,
  }
}
