"use client"

/**
 * ===========================================================================
 *  THE BUILDER'S CANVAS IN ANOTHER LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * The language picked in the theme's own selector in the canvas, and
 * what the canvas lays over the page in it: the approved translations
 * (GET /api/store/translations?values=1), read with the same functions the
 * live site uses (lib/markets/translate.ts), so /fr in the builder and /fr
 * on the website say the same thing. A language that is not published yet
 * can be looked at here before visitors can.
 *
 * Read again when the builder comes back into view: a translation approved
 * in Settings › Markets and languages shows without a reload. Remembered for
 * the tab, per install. Nothing here is saved anywhere.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translationMap, valueFor, type TranslationMap } from "@/lib/markets/translate"
import { UI_WORDS, uiKey, type UiWord } from "@/lib/markets/ui-words"

export interface PreviewLanguage {
  /** Every language of the website, its own first; empty for a website in one language. */
  languages: string[]
  published: string[]
  defaultLanguage: string
  /** The language the canvas is drawn in; null, the website's own. */
  locale: string | null
  setLocale: (code: string | null) => void
  /** What is laid over the page; null in the website's own language. */
  map: TranslationMap | null
  /** The shop's own words (cart, buttons) in it (lib/markets/ui-words.ts). */
  words: Record<string, string>
}

type Values = Record<string, { v: string; h: string }>
type Answer = { locale: string | null; defaultLanguage: string; languages: string[]; published?: string[]; values: Values }

export function usePreviewLanguage(installId: string): PreviewLanguage {
  const [info, setInfo] = useState<{ languages: string[]; published: string[]; defaultLanguage: string }>({ languages: [], published: [], defaultLanguage: "en" })
  const [locale, setLocaleState] = useState<string | null>(null)
  const [values, setValues] = useState<{ locale: string; values: Values } | null>(null)
  const localeRef = useRef(locale)
  localeRef.current = locale

  const read = useCallback(async (code: string | null) => {
    try {
      const r = await fetch(`/api/store/translations?values=1${code ? `&locale=${encodeURIComponent(code)}` : ""}`, { cache: "no-store" })
      if (!r.ok) return
      const d = (await r.json()) as Answer
      const languages = Array.isArray(d.languages) && d.languages.length > 1 ? d.languages : []
      setInfo((prev) => {
        const next = { languages, published: Array.isArray(d.published) ? d.published : [], defaultLanguage: d.defaultLanguage || "en" }
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
      /* An answer for a language no longer picked is not drawn. */
      if (localeRef.current !== code) return
      if (!d.locale) {
        setValues(null)
        if (code) setLocaleState(null)
        return
      }
      setValues((prev) => (prev && prev.locale === d.locale && JSON.stringify(prev.values) === JSON.stringify(d.values) ? prev : { locale: d.locale!, values: d.values ?? {} }))
    } catch {
      /* The canvas stays as it is drawn. */
    }
  }, [])

  /* The editor opens in the website's own language, as a visitor's first page does; the theme's own selector in the canvas changes it. */
  useEffect(() => {
    localeRef.current = null
    setLocaleState(null)
    void read(null)
  }, [installId, read])

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") void read(localeRef.current)
    }
    document.addEventListener("visibilitychange", again)
    window.addEventListener("focus", again)
    return () => {
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener("focus", again)
    }
  }, [read])

  const setLocale = useCallback(
    (code: string | null) => {
      const next = code && code !== info.defaultLanguage ? code : null
      localeRef.current = next
      setLocaleState(next)
      if (!next) setValues(null)
      if (next) void read(next)
    },
    [info.defaultLanguage, read],
  )

  const map = useMemo(() => {
    if (!locale || !values || values.locale !== locale) return null
    return translationMap(Object.entries(values.values).map(([key, x]) => ({ key, value: x.v, sourceHash: x.h, status: "approved" as const, source: "manual" as const })))
  }, [locale, values])

  const words = useMemo(() => {
    const out: Record<string, string> = {}
    if (!map) return out
    for (const w of Object.keys(UI_WORDS) as UiWord[]) {
      const v = valueFor(map, uiKey(w), { approvedOnly: true })
      if (v) out[w] = v
    }
    return out
  }, [map])

  return { ...info, locale: info.languages.length ? locale : null, setLocale, map: info.languages.length ? map : null, words }
}
