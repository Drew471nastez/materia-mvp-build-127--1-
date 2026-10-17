"use client"

/**
 * ===========================================================================
 *  THE BUILDER'S CANVAS WITH PRICES IN A MARKET'S CURRENCY
 * ===========================================================================
 * The market picked in the theme's own selector in the canvas, and the
 * conversion the canvas draws its prices with: the live site's own
 * (lib/markets/pricing pricingFor, from the markets as the website reads
 * them and the day's rates, GET /api/store/markets?preview=1), so RON in
 * the builder and a visitor in Romania see the same amounts, rounded and
 * written the same way.
 *
 * Read again when the builder comes back into view: a market changed in
 * Settings › Languages shows without a reload. Opens on the currency last
 * picked in this tab (sessionStorage), else the store's own. Display only:
 * nothing here is saved or charged.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import type { FxRates, PriceRounding } from "@/lib/markets/money"
import { pricingFor, type Pricing } from "@/lib/markets/pricing"

/** A market as the live site reads it (lib/markets/live.ts LiveMarket). */
export interface PreviewMarketOption {
  id: string
  name: string
  currency: string
  countries: string[]
  rounding: PriceRounding
  adjustBps: number
  /** The store's own rate for it (Settings › Languages), used instead of the day's. */
  rate?: number | null
}

export interface PreviewMarket {
  /** The store saved Markets and languages (the theme's country list follows its markets; not saved, every country sees the store's prices). */
  saved: boolean
  /** The store's own currency: what every price is typed in. */
  base: string
  /** What the card is charged in, whatever the prices are shown in. */
  chargeCurrency: string
  /** The home market's name and first country. */
  home: { name: string | null; country: string | null }
  /** Every active market with a currency of its own, as the live site reads them (the theme's country list counts them all). */
  markets: PreviewMarketOption[]
  /** The ones a visitor can be shown prices in today: they have countries, and the day's rates convert to them. Empty: no currency to preview. */
  options: PreviewMarketOption[]
  fx: FxRates | null
  /** The market the canvas shows prices in; null, the store's own. */
  marketId: string | null
  setMarket: (id: string | null) => void
  /** The conversion for it, the live site's; null, the store's own prices. */
  pricing: Pricing | null
}

type Answer = { saved?: boolean; base?: string; chargeCurrency?: string; home?: { name?: string | null; country?: string | null }; markets?: PreviewMarketOption[]; fx?: FxRates | null }
type Info = { saved: boolean; base: string; chargeCurrency: string; home: { name: string | null; country: string | null }; markets: PreviewMarketOption[]; fx: FxRates | null }

const NONE: Info = { saved: false, base: "", chargeCurrency: "", home: { name: null, country: null }, markets: [], fx: null }

export function usePreviewMarket(installId: string): PreviewMarket {
  const [info, setInfo] = useState<Info>(NONE)
  const [marketId, setMarketState] = useState<string | null>(null)

  const read = useCallback(async () => {
    try {
      const r = await fetch("/api/store/markets?preview=1", { cache: "no-store" })
      if (!r.ok) return
      const d = (await r.json()) as Answer
      const next: Info = {
        saved: d.saved === true,
        base: d.base || "",
        chargeCurrency: d.chargeCurrency || d.base || "",
        home: { name: d.home?.name ?? null, country: d.home?.country ?? null },
        markets: Array.isArray(d.markets) ? d.markets : [],
        fx: d.fx && typeof d.fx.asOf === "string" && d.fx.rates ? d.fx : null,
      }
      setInfo((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    } catch {
      /* The canvas keeps the prices it shows. */
    }
  }, [])

  /* The editor opens on the currency last picked in this tab for this website, else the store's own, as the website does for a visitor in its home country. */
  useEffect(() => {
    let start: string | null = null
    try {
      start = window.sessionStorage.getItem(`wb-preview-market:${installId}`) || null
    } catch {
      /* Storage off: the store's own currency. */
    }
    setMarketState(start)
    void read()
  }, [installId, read])

  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") void read()
    }
    document.addEventListener("visibilitychange", again)
    window.addEventListener("focus", again)
    return () => {
      document.removeEventListener("visibilitychange", again)
      window.removeEventListener("focus", again)
    }
  }, [read])

  const setMarket = useCallback(
    (id: string | null) => {
      setMarketState(id)
      try {
        if (id) window.sessionStorage.setItem(`wb-preview-market:${installId}`, id)
        else window.sessionStorage.removeItem(`wb-preview-market:${installId}`)
      } catch {
        /* Not remembered: the choice still holds for this page. */
      }
    },
    [installId],
  )

  /* What a visitor can be shown: a market someone can be in, whose prices the day's rates convert (pricingFor, as the live site's own switch offers them). */
  const options = useMemo(() => info.markets.filter((m) => m.countries.length > 0 && pricingFor(m, info.base, info.fx) !== null), [info])
  /* A market removed, switched off or without rates since it was picked: the store's own prices. */
  const shown = marketId && options.some((m) => m.id === marketId) ? marketId : null
  const pricing = useMemo(() => {
    const market = shown ? options.find((m) => m.id === shown) : undefined
    return market ? pricingFor(market, info.base, info.fx) : null
  }, [shown, options, info.base, info.fx])

  return { ...info, options, marketId: shown, setMarket, pricing }
}
