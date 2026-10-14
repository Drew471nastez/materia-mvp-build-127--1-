/**
 * ===========================================================================
 *  MARKETS AND LANGUAGES: WHAT A STORE SETS, AND WHICH ONE A VISITOR GETS
 * ===========================================================================
 * For a creator's own website only. The creator page, Explore and their
 * checkout keep what they do today (dollars, Storelib's own language).
 *
 *   languages   the website's default language and the others it is
 *               offered in, each published or not (a draft language is
 *               only seen in the editor)
 *   markets     groups of countries that are sold to the same way: which
 *               currency prices are shown in there, which language a
 *               visitor from there starts in, a price adjustment and how
 *               converted prices are rounded. One is the primary market,
 *               the store's home, in the store's own currency.
 *
 * Country, language, currency and market are separate: a visitor in
 * Switzerland may read French and see francs, one in France French and
 * euros, and either can change both.
 *
 * WHAT WINS, IN THIS ORDER (the same everywhere: settings, website, editor):
 *
 *   1. the store's defaults (its currency, its default language)
 *   2. the market the visitor's country is in, when it is active
 *   3. what the visitor chose themselves (the selector), which always wins
 *      over what was guessed from where they are or what their browser asks
 *
 * A product override (its own price in a market) is a later step and is
 * not read here yet.
 *
 * Pure. Checked whole on every save (validateLocalization), so what is
 * stored is always something the website can use.
 */
import { normalizeLocale } from "./locales"
import { currencyCode, type PriceRounding } from "./money"
import { COUNTRY_CODES } from "@/lib/checkout/countries"
import { tt } from "@/lib/i18n/text"

export interface SiteLanguage {
  code: string
  /** Seen by visitors. A language that is not published is only in the editor's preview. */
  published: boolean
}

export interface Market {
  id: string
  name: string
  /** ISO 3166-1 alpha-2, upper case. A country is in one market at most. */
  countries: string[]
  /** What prices are shown in there; null is the store's own currency. */
  currency: string | null
  /** The language a visitor from there starts in; null is the default language. */
  language: string | null
  active: boolean
  /** The store's home market: in the store's currency, and where a country in no other market falls. */
  primary: boolean
  rounding: PriceRounding
  /** A price adjustment for this market, in hundredths of a percent (250 = +2.5%), -5000 to 10000. */
  adjustBps: number
  /**
   * The store's own exchange rate for this market, instead of the day's
   * European Central Bank one: how much of the market's currency one unit
   * of the store's is (1 RON = 0.2 EUR is 0.2). Never goes stale. Absent,
   * the day's rate (lib/markets/pricing.ts pricingFor).
   */
  rate?: number | null
}

export interface Localization {
  defaultLanguage: string
  languages: SiteLanguage[]
  markets: Market[]
  /**
   * Show visitors their own language (lib/markets/visitor-language.ts): a
   * first visit opens in the published language the browser asks for, or
   * offers the nearest one. Off unless the store turns it on. Kept in
   * store_localization.visitor_language (SQL part 173).
   */
  visitorLanguage?: boolean
  /**
   * Translate changes automatically (lib/markets/auto-translate.ts): each
   * hour, Storelib AI translates the website's text that is new or changed
   * since its translation, into every language the website has, and puts it
   * live. Never a translation the merchant wrote. Off unless the store turns
   * it on. Kept in store_localization.auto_translate (SQL part 175).
   */
  autoTranslate?: boolean
}

export const MAX_LANGUAGES = 20
export const MAX_MARKETS = 50

/** Nothing set yet: one language, one market (the store's home), which is exactly how every website works today. */
export function defaultLocalization(homeCountry?: string | null, defaultLanguage = "en"): Localization {
  const country = typeof homeCountry === "string" && COUNTRY_CODES.has(homeCountry.toUpperCase()) ? homeCountry.toUpperCase() : null
  return {
    defaultLanguage: normalizeLocale(defaultLanguage) ?? "en",
    languages: [],
    markets: [{ id: "primary", name: "Home", countries: country ? [country] : [], currency: null, language: null, active: true, primary: true, rounding: "none", adjustBps: 0 }],
  }
}

const ROUNDINGS: PriceRounding[] = ["none", "whole", "nine_nine"]

/** What a form sent, checked and cleaned. Every problem is said in the creator's words, one at a time. */
export function validateLocalization(input: unknown, opts: { baseCurrency: string }): { ok: true; value: Localization } | { ok: false; error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const defaultLanguage = normalizeLocale(raw.defaultLanguage)
  if (!defaultLanguage) return { ok: false, error: tt("Choose the website's default language.") }

  const languages: SiteLanguage[] = []
  for (const l of Array.isArray(raw.languages) ? raw.languages : []) {
    const code = normalizeLocale((l as Record<string, unknown>)?.code)
    if (!code) return { ok: false, error: tt("One of the languages isn't one we recognise.") }
    if (code === defaultLanguage || languages.some((x) => x.code === code)) continue
    languages.push({ code, published: (l as Record<string, unknown>).published === true })
  }
  if (languages.length > MAX_LANGUAGES) return { ok: false, error: tt("A website can have up to {maxLanguages} more languages.", { maxLanguages: MAX_LANGUAGES }) }
  const allLanguages = new Set([defaultLanguage, ...languages.map((l) => l.code)])

  const markets: Market[] = []
  const seen = new Map<string, string>()
  const list = Array.isArray(raw.markets) ? raw.markets : []
  if (list.length > MAX_MARKETS) return { ok: false, error: tt("A store can have up to {maxMarkets} markets.", { maxMarkets: MAX_MARKETS }) }
  for (const [i, m] of list.entries()) {
    const r = (m && typeof m === "object" ? m : {}) as Record<string, unknown>
    const name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 60) : ""
    if (!name) return { ok: false, error: tt("Give every market a name.") }
    const id = typeof r.id === "string" && /^[a-z0-9-]{1,40}$/.test(r.id) ? r.id : `m${i + 1}`
    const countries: string[] = []
    for (const c of Array.isArray(r.countries) ? r.countries : []) {
      const code = typeof c === "string" ? c.trim().toUpperCase() : ""
      if (!COUNTRY_CODES.has(code)) return { ok: false, error: tt("{name}: one of its countries isn't one we recognise.", { name }) }
      const other = seen.get(code)
      if (other && other !== id) return { ok: false, error: tt("{code} is in two markets. A country can be in one market only.", { code }) }
      seen.set(code, id)
      if (!countries.includes(code)) countries.push(code)
    }
    const currency = r.currency === null || r.currency === undefined || r.currency === "" ? null : currencyCode(r.currency)
    if (r.currency && !currency) return { ok: false, error: tt("{name}: that currency isn't one we recognise.", { name }) }
    const language = r.language === null || r.language === undefined || r.language === "" ? null : normalizeLocale(r.language)
    if (language && !allLanguages.has(language)) return { ok: false, error: tt("{name}: add {language} to the website's languages first.", { name, language }) }
    const rounding = ROUNDINGS.includes(r.rounding as PriceRounding) ? (r.rounding as PriceRounding) : "none"
    const adjust = Math.round(Number(r.adjustBps ?? 0))
    if (!Number.isFinite(adjust) || adjust < -5000 || adjust > 10000) return { ok: false, error: tt("{name}: keep the price adjustment between -50% and +100%.", { name }) }
    /* Its own exchange rate, when the store set one: a positive number, at most six significant digits kept. */
    const rawRate = r.rate === null || r.rate === undefined || r.rate === "" ? null : Number(r.rate)
    if (rawRate !== null && (!Number.isFinite(rawRate) || rawRate <= 0 || rawRate > 1_000_000)) return { ok: false, error: tt("{name}: the exchange rate has to be a number above 0.", { name }) }
    const rate = rawRate === null ? null : Number(rawRate.toPrecision(6))
    markets.push({ id, name, countries, currency: currency === opts.baseCurrency ? null : currency, language, active: r.active !== false, primary: r.primary === true, rounding, adjustBps: adjust, ...(rate !== null && currency && currency !== opts.baseCurrency ? { rate } : {}) })
  }
  if (markets.length === 0) markets.push(defaultLocalization(null, defaultLanguage).markets[0])
  const primaries = markets.filter((m) => m.primary)
  if (primaries.length !== 1) return { ok: false, error: tt("Choose one primary market: your store's home.") }
  const home = primaries[0]
  /* The home market sells in the store's own currency, at its own prices. */
  home.currency = null
  home.adjustBps = 0
  home.rounding = "none"
  home.active = true
  delete home.rate
  return { ok: true, value: { defaultLanguage, languages, markets, visitorLanguage: raw.visitorLanguage === true, autoTranslate: raw.autoTranslate === true } }
}

/** Every language a visitor can open: the default first, then the published ones. */
export function publishedLanguages(loc: Localization): string[] {
  return [loc.defaultLanguage, ...loc.languages.filter((l) => l.published).map((l) => l.code)]
}

/** Every language the editor can preview: published or not. */
export function editorLanguages(loc: Localization): string[] {
  return [loc.defaultLanguage, ...loc.languages.map((l) => l.code)]
}

/** The market a country is sold to through: the active market that lists it, else the primary one. */
export function marketForCountry(loc: Localization, country: string | null | undefined): Market {
  const code = typeof country === "string" ? country.toUpperCase() : ""
  const primary = loc.markets.find((m) => m.primary) ?? loc.markets[0]
  if (!code) return primary
  return loc.markets.find((m) => m.active && m.countries.includes(code)) ?? primary
}

/** Is there anything to localize at all? One language and one market is a website exactly as today. */
export function isLocalized(loc: Localization): boolean {
  return loc.languages.some((l) => l.published) || loc.markets.some((m) => !m.primary && m.active && (m.currency !== null || m.language !== null))
}
