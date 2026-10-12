"use client"

import { createContext, useContext, useState, useEffect, useCallback, Fragment, type ReactNode } from "react"
import { translations, getTranslation, LANGUAGES, type LanguageCode, type TranslationKey } from "./translations"
import { loadCatalog, setCatalog } from "./text"

/**
 * The languages /app speaks: the ones lib/i18n/translations has words for.
 * A stored or detected choice outside them reads in English rather than in
 * a language that is only half there.
 */
function offered(code: string | null | undefined): LanguageCode | null {
  if (!code) return null
  if (code in translations) return code as LanguageCode
  if (code === "pt" && "pt-BR" in translations) return "pt-BR" as LanguageCode
  return null
}

/** The browser's own language, when /app speaks it: "pt-PT" reads Brazilian Portuguese, "de-AT" German. */
function detected(): LanguageCode | null {
  try {
    const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
    for (const raw of prefs) {
      if (!raw) continue
      const exact = offered(raw)
      if (exact) return exact
      const base = raw.split("-")[0].toLowerCase()
      const loose = offered(base) ?? (Object.keys(translations).find((c) => c.split("-")[0] === base) as LanguageCode | undefined) ?? null
      if (loose) return loose
    }
  } catch {
    /* No navigator. */
  }
  return null
}

/** The server reads this cookie (lib/i18n/server), so its own pages agree with the client's. */
function writeCookie(lang: string) {
  try {
    document.cookie = `${LANGUAGE_STORAGE_KEY}=${lang}; path=/; max-age=31536000; samesite=lax`
  } catch {
    /* A refused cookie: the server's pages read in English. */
  }
}

/** The language's words, fetched and handed to tt() (lib/i18n/text). A failed fetch reads in English. */
async function bringWords(lang: string): Promise<void> {
  let words: Record<string, string> = {}
  try {
    words = await loadCatalog(lang)
  } catch {
    words = {}
  }
  setCatalog(lang, words)
}

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

  // The stored choice (or the browser's), and its words, before /app is drawn.
  useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    } catch {
      stored = null
    }
    const lang = offered(stored) ?? detected() ?? "en"
    let live = true
    void bringWords(lang).then(() => {
      if (!live) return
      setLanguageState(lang)
      document.documentElement.lang = lang === "pt-BR" ? "pt" : lang.split("-")[0]
      writeCookie(lang)
      setIsHydrated(true)
    })
    return () => {
      live = false
    }
  }, [])

  const setLanguage = useCallback((lang: LanguageCode) => {
    const next = offered(lang) ?? "en"
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    } catch {
      /* Private window: this visit only. */
    }
    writeCookie(next)
    document.documentElement.lang = next === "pt-BR" ? "pt" : next.split("-")[0]
    /* The words first, then the switch: never a frame of keys or of half one language. */
    void bringWords(next).then(() => setLanguageState(next))
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
      {/* Keyed by the language: a new choice draws /app again, so every tt() reads the new words. */}
      <Fragment key={language}>{children}</Fragment>
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
