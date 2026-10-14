"use client"

/**
 * ===========================================================================
 *  THE BUILDER'S CANVAS IN ANOTHER LANGUAGE OF THE WEBSITE
 * ===========================================================================
 * The language picked over the canvas (preview-language-switch.tsx), and
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
import { pricingFor, type MarketPrice, type StorefrontDisplay } from "@/lib/markets/pricing"
import type { FxRates } from "@/lib/markets/money"

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

const remembered = (installId: string) => `wb-preview-lang:${installId}`

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

  /* The language picked earlier in this tab, then the website's languages. */
  useEffect(() => {
    let code: string | null = null
    try {
      code = sessionStorage.getItem(remembered(installId)) || null
    } catch {
      code = null
    }
    localeRef.current = code
    setLocaleState(code)
    void read(code)
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
      try {
        if (next) sessionStorage.setItem(remembered(installId), next)
        else sessionStorage.removeItem(remembered(installId))
      } catch {
        /* Remembered for this visit only. */
      }
      if (next) void read(next)
    },
    [info.defaultLanguage, installId, read],
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

/* ── The canvas's prices in a market's currency ─────────────────────── */

export interface PreviewMarketChoice {
  id: string
  name: string
  currency: string
}

export interface PreviewMarket {
  /** The markets that show their own currency; empty when none does or the day's rates are not in. */
  markets: PreviewMarketChoice[]
  /** The store's own currency, what "Your prices" shows. */
  base: string
  /** The market the canvas shows prices for; null, the store's own. */
  market: string | null
  setMarket: (id: string | null) => void
  /** The conversion, as the live site hands it to the page (lib/markets/pricing.ts StorefrontDisplay). */
  display: StorefrontDisplay | null
}

type MarketsAnswer = { localization?: { markets?: (MarketPrice & { countries?: string[]; active?: boolean; primary?: boolean })[] }; baseCurrency?: string; fx?: { asOf: string; rates?: Record<string, number> } | null }

const rememberedMarket = (installId: string) => `wb-preview-market:${installId}`

/**
 * THE CANVAS IN A MARKET'S CURRENCY (Settings › Markets and languages): the
 * prices a visitor from one of its countries sees, converted at the day's
 * rate with its rounding and adjustment, by the same functions the live site
 * uses (lib/markets/pricing.ts). Remembered for the tab, per install.
 */
export function usePreviewMarket(installId: string, locale: string): PreviewMarket {
  const [data, setData] = useState<{ markets: MarketPrice[]; base: string; fx: FxRates | null }>({ markets: [], base: "USD", fx: null })
  const [market, setMarketState] = useState<string | null>(null)
  useEffect(() => {
    try {
      setMarketState(sessionStorage.getItem(rememberedMarket(installId)) || null)
    } catch {
      setMarketState(null)
    }
    let live = true
    void fetch("/api/store/markets", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<MarketsAnswer>) : null))
      .then((d) => {
        if (!live || !d) return
        const markets = (d.localization?.markets ?? []).filter((m) => m && !m.primary && m.active !== false && typeof m.currency === "string" && m.currency)
        setData({ markets, base: d.baseCurrency || "USD", fx: d.fx?.rates ? { asOf: d.fx.asOf, rates: d.fx.rates } : null })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [installId])
  /* Only a market the day's rates can convert to: as the website, which shows the store's prices otherwise. */
  const usable = useMemo(() => data.markets.filter((m) => pricingFor(m, data.base, data.fx)), [data])
  const setMarket = useCallback(
    (id: string | null) => {
      setMarketState(id)
      try {
        if (id) sessionStorage.setItem(rememberedMarket(installId), id)
        else sessionStorage.removeItem(rememberedMarket(installId))
      } catch {
        /* Remembered for this visit only. */
      }
    },
    [installId],
  )
  const chosen = usable.find((m) => m.id === market) ?? null
  const display = useMemo<StorefrontDisplay | null>(() => (chosen && data.fx ? { market: chosen, base: data.base, fx: data.fx, locale, note: null } : null), [chosen, data, locale])
  return { markets: usable.map((m) => ({ id: m.id, name: m.name, currency: m.currency })), base: data.base, market: chosen?.id ?? null, setMarket, display }
}
