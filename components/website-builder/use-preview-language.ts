"use client"

/**
 * ===========================================================================
 *  THE BUILDER IN ANOTHER LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * The language picked in the sidebar's language row or the theme's own
 * selector in the canvas, and what the canvas lays over the page in it:
 * the approved translations (GET /api/store/translations?values=1), read
 * with the same functions the live site uses (lib/markets/translate.ts), so
 * /fr in the builder and /fr on the website say the same thing. A language
 * that is not published yet can be looked at here before visitors can.
 *
 * EDITED HERE TOO. In a language other than the website's own, the
 * sidebar's text controls show that language's values (`rows`, Storelib
 * AI's drafts included) and a change writes that one key of that one
 * language (`write`): laid into the rows at once, so the canvas shows it
 * while it is typed, and saved a moment after the typing stops through the
 * same PUT the Translate sheet uses. One row per key, so two people
 * translating different texts never undo each other, and nothing the
 * website's own language holds is touched.
 *
 * Read again when the builder comes back into view: a translation approved
 * in Settings › Markets and languages shows without a reload. A change not
 * saved yet is kept over what comes back. Nothing is remembered between
 * visits: the editor opens in the website's own language.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { translationMap, valueFor, withEdit, type TranslationMap } from "@/lib/markets/translate"
import { UI_WORDS, uiKey, type UiWord } from "@/lib/markets/ui-words"

export type TranslationSaveState = "idle" | "saving" | "saved" | "error"

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
  /** Every value the language has, drafts too, by key: what the sidebar's controls show. Empty in the website's own language. */
  rows: TranslationMap
  /** One key's translation in the language picked; an empty value shows the original again. Nothing happens in the website's own language. */
  write: (key: string, value: string, original: string, rich?: boolean) => void
  save: { state: TranslationSaveState; error: string | null }
  /** Send again what could not be saved. */
  retry: () => void
  /** Products shown in their own words in every language (Products › Translations). */
  originals: ReadonlySet<string>
}

/** `s`: "ai" for Storelib AI's, so the preview hides an outdated one as the live site does (lib/markets/translate.ts valueFor); a person's stays. `d`: a draft, shown in the sidebar, never on the canvas. */
type Values = Record<string, { v: string; h: string; s?: "ai"; d?: 1 }>
type Answer = { locale: string | null; defaultLanguage: string; languages: string[]; published?: string[]; values: Values; originals?: string[] }
type Pending = { key: string; value: string; source: string; approved: true; rich: boolean }

/** How long after the last key a change is saved: one save for a word typed, not one per letter. */
const SAVE_AFTER_MS = 700
const EMPTY: TranslationMap = new Map()
const NO_ORIGINALS: ReadonlySet<string> = new Set()

export function usePreviewLanguage(installId: string): PreviewLanguage {
  const [info, setInfo] = useState<{ languages: string[]; published: string[]; defaultLanguage: string }>({ languages: [], published: [], defaultLanguage: "en" })
  const [locale, setLocaleState] = useState<string | null>(null)
  const [values, setValues] = useState<{ locale: string; rows: TranslationMap } | null>(null)
  const [originals, setOriginals] = useState<ReadonlySet<string>>(NO_ORIGINALS)
  const [save, setSave] = useState<{ state: TranslationSaveState; error: string | null }>({ state: "idle", error: null })
  const localeRef = useRef(locale)
  localeRef.current = locale
  /* Changes typed and not saved yet, by language and key: laid over every read until they land. */
  const pending = useRef(new Map<string, Map<string, Pending>>())
  const timer = useRef<number | null>(null)

  const read = useCallback(async (code: string | null) => {
    try {
      const r = await fetch(`/api/store/translations?values=1&all=1${code ? `&locale=${encodeURIComponent(code)}` : ""}`, { cache: "no-store" })
      if (!r.ok) return
      const d = (await r.json()) as Answer
      const languages = Array.isArray(d.languages) && d.languages.length > 1 ? d.languages : []
      setInfo((prev) => {
        const next = { languages, published: Array.isArray(d.published) ? d.published : [], defaultLanguage: d.defaultLanguage || "en" }
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
      const lang = d.locale
      let rows = translationMap(Object.entries(d.values ?? {}).map(([key, x]) => ({ key, value: x.v, sourceHash: x.h, status: x.d ? ("draft" as const) : ("approved" as const), source: x.s === "ai" ? ("ai" as const) : ("manual" as const) })))
      /* What is being typed wins over what the server had a moment ago. */
      for (const p of pending.current.get(lang)?.values() ?? []) rows = withEdit(rows, p.key, p.value, p.source)
      setValues((prev) => (prev && prev.locale === lang && sameRows(prev.rows, rows) ? prev : { locale: lang, rows }))
    } catch {
      /* The canvas stays as it is drawn. */
    }
  }, [])

  /** Every change waiting, sent; kept and said when it could not be saved, and sent again with the next change. */
  const flush = useCallback(async (opts: { keepalive?: boolean } = {}) => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    for (const [lang, items] of pending.current) {
      if (items.size === 0) continue
      const sent = [...items.values()]
      setSave({ state: "saving", error: null })
      try {
        const r = await fetch("/api/store/translations", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locale: lang, items: sent }), keepalive: opts.keepalive })
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: unknown }
          setSave({ state: "error", error: typeof body.error === "string" ? body.error : "Could not save. Try again." })
          continue
        }
        /* Only what was sent leaves the queue: a key typed again while it was on its way is sent next time. */
        for (const p of sent) if (items.get(p.key)?.value === p.value) items.delete(p.key)
        setSave({ state: "saved", error: null })
      } catch {
        setSave({ state: "error", error: "Could not save. Check the connection." })
      }
    }
  }, [])

  const write = useCallback(
    (key: string, value: string, original: string, rich = false) => {
      const lang = localeRef.current
      if (!lang) return
      const items = pending.current.get(lang) ?? new Map<string, Pending>()
      pending.current.set(lang, items)
      items.set(key, { key, value, source: original, approved: true, rich })
      setValues((prev) => ({ locale: lang, rows: withEdit(prev && prev.locale === lang ? prev.rows : EMPTY, key, value, original) }))
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flush(), SAVE_AFTER_MS)
    },
    [flush],
  )

  /* The editor opens in the website's own language, as a visitor's first page does; the sidebar's language row or the theme's own selector in the canvas changes it. */
  useEffect(() => {
    localeRef.current = null
    setLocaleState(null)
    void read(null)
  }, [installId, read])

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") void read(localeRef.current)
      /* Leaving the tab: what is typed is sent now, so closing it loses nothing. */ else void flush({ keepalive: true })
    }
    const leaving = () => void flush({ keepalive: true })
    document.addEventListener("visibilitychange", again)
    window.addEventListener("focus", again)
    window.addEventListener("pagehide", leaving)
    return () => {
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener("focus", again)
      window.removeEventListener("pagehide", leaving)
    }
  }, [read, flush])

  const setLocale = useCallback(
    (code: string | null) => {
      const next = code && code !== info.defaultLanguage ? code : null
      /* The language being left keeps what was typed in it: sent before the next one is read. */
      void flush()
      localeRef.current = next
      setLocaleState(next)
      void read(next)
    },
    [info.defaultLanguage, read, flush],
  )

  /* The language drawn: the one picked, else the default, whose translations are laid over too (an English theme on a store whose default is Spanish reads Spanish). */
  const shown = locale ?? info.defaultLanguage
  /* The canvas lays over what the website shows: approved ones, never a draft waiting for review. */
  const map = useMemo(() => {
    if (!values || values.locale !== shown || values.rows.size === 0) return null
    const approved = [...values.rows.values()].filter((r) => r.status === "approved")
    return approved.length ? translationMap(approved) : null
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

  /* What the sidebar edits: only a language other than the website's own. */
  const rows = useMemo(() => (locale && values && values.locale === locale ? values.rows : EMPTY), [locale, values])

  const retry = useCallback(() => void flush(), [flush])

  return { ...info, locale: info.languages.length ? locale : null, setLocale, map, words, rows, write, save, retry, originals }
}

function sameRows(a: TranslationMap, b: TranslationMap): boolean {
  if (a.size !== b.size) return false
  for (const [k, r] of a) {
    const o = b.get(k)
    if (!o || o.value !== r.value || o.sourceHash !== r.sourceHash || o.status !== r.status || o.source !== r.source) return false
  }
  return true
}
