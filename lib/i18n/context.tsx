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

export function LanguageProvider({
  children,
  fallback = null,
}: {
  children: ReactNode
  /**
   * What stands where the children will be until the language is known:
   * on the server, and on the first client render. Nothing by default. The
   * /app shell passes its own frame with the spinner (app/app/cold-start),
   * so a page that arrives as a document (a reload, a cold start, a link
   * the router could not follow) is never a white screen until the script
   * has run: "that loading freezes, makes the entire page white, blank,
   * empty, and then takes me to the website builder page."
   */
  fallback?: ReactNode
}) {
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
    /* In a fragment: a component has to return an element, and the fallback may be any node. */
    return <>{fallback}</>
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
