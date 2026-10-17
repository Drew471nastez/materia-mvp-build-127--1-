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
 * the tab, per install (sessionStorage), so a reload or the next page opens
 * in the language last picked. Nothing here is saved to the website.
 *
 * THE SAME LANGUAGE IS THE ONE BEING EDITED. In another language than the
 * website's own, the sidebar's text settings show and write that
 * language's translations (components/website-builder/editor/
 * translation-editing.tsx); `patch` lays a translation just typed or
 * just written by Storelib AI over the canvas at once, before the save
 * lands. `raw` is every value with who wrote it and for which original.
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
  /** The language's values as read, with the original's hash and who wrote them (`s: "ai"`, else the merchant). */
  raw: Values
  /** Lays one value over (or takes it away, null) at once, for the language shown. */
  patch: (key: string, value: Values[string] | null) => void
  /** Texts kept untranslated (Settings › Glossary), and whether product names are. */
  noTranslate: string[]
  keepProductNames: boolean
  /** Products shown in their own words in every language (Products › Translations, SQL part 211). */
  originals: ReadonlySet<string>
}

const NO_ORIGINALS: ReadonlySet<string> = new Set()

const remembered = (installId: string) => `wb-preview-lang:${installId}`

/** `s`: "ai" for Storelib AI's, so the preview hides an outdated one as the live site does (lib/markets/translate.ts valueFor); a person's stays. */
export type Values = Record<string, { v: string; h: string; s?: "ai" }>
type Answer = { locale: string | null; defaultLanguage: string; languages: string[]; published?: string[]; values: Values; noTranslate?: string[]; keepProductNames?: boolean; originals?: string[] }

export function usePreviewLanguage(installId: string): PreviewLanguage {
  const [info, setInfo] = useState<{ languages: string[]; published: string[]; defaultLanguage: string }>({ languages: [], published: [], defaultLanguage: "en" })
  const [locale, setLocaleState] = useState<string | null>(null)
  const [values, setValues] = useState<{ locale: string; values: Values } | null>(null)
  const [rules, setRules] = useState<{ noTranslate: string[]; keepProductNames: boolean }>({ noTranslate: [], keepProductNames: false })
  const [originals, setOriginals] = useState<ReadonlySet<string>>(NO_ORIGINALS)
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
      setRules((prev) => {
        const next = { noTranslate: Array.isArray(d.noTranslate) ? d.noTranslate : [], keepProductNames: d.keepProductNames === true }
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      })
      if (Array.isArray(d.originals)) setOriginals((prev) => (prev.size === d.originals!.length && d.originals!.every((id) => prev.has(id)) ? prev : new Set(d.originals)))
      /* An answer for a language no longer picked is not drawn. */
      /* The default language's answer comes back named (the canvas opens in it): it belongs to "no language picked". */
      if (localeRef.current !== code && !(code === null && localeRef.current === null)) return
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

  /*
    The editor opens in the language last picked in this tab for this
    website, else in its own, as a visitor's first page does. A remembered
    language the website no longer has falls back to its own (the answer
    comes back without a locale).
  */
  useEffect(() => {
    let start: string | null = null
    try {
      start = window.sessionStorage.getItem(remembered(installId)) || null
    } catch {
      /* Storage off: the website's own language. */
    }
    localeRef.current = start
    setLocaleState(start)
    void read(null)
    if (start) void read(start)
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
      try {
        if (next) window.sessionStorage.setItem(remembered(installId), next)
        else window.sessionStorage.removeItem(remembered(installId))
      } catch {
        /* Not remembered: the choice still holds for this page. */
      }
      void read(next)
    },
    [info.defaultLanguage, read, installId],
  )

  const patch = useCallback((key: string, value: Values[string] | null) => {
    setValues((prev) => {
      const shownNow = localeRef.current
      if (!prev || (shownNow && prev.locale !== shownNow)) {
        if (!shownNow || !value) return prev
        return { locale: shownNow, values: { [key]: value } }
      }
      const next = { ...prev.values }
      if (value) next[key] = value
      else delete next[key]
      return { locale: prev.locale, values: next }
    })
  }, [])

  /* The language drawn: the one picked, else the default, whose translations are laid over too (an English theme on a store whose default is Spanish reads Spanish). */
  const shown = locale ?? info.defaultLanguage
  const map = useMemo(() => {
    if (!values || values.locale !== shown || Object.keys(values.values).length === 0) return null
    return translationMap(Object.entries(values.values).map(([key, x]) => ({ key, value: x.v, sourceHash: x.h, status: "approved" as const, source: x.s === "ai" ? ("ai" as const) : ("manual" as const) })))
  }, [shown, values])

  const words = useMemo(() => {
    const out: Record<string, string> = {}
    if (!map) return out
    for (const w of Object.keys(UI_WORDS) as UiWord[]) {
      const v = valueFor(map, uiKey(w), { approvedOnly: true })
      if (v) out[w] = v
    }
    return out
  }, [map])

  const raw = useMemo(() => (values && values.locale === shown ? values.values : {}), [values, shown])
  return { ...info, locale: info.languages.length ? locale : null, setLocale, map, words, raw, patch, noTranslate: rules.noTranslate, keepProductNames: rules.keepProductNames, originals }
}
