/**
 * ===========================================================================
 *  A WEBSITE'S LANGUAGES: WHICH ONES, HOW THEY ARE NAMED, WHERE THEY LIVE
 * ===========================================================================
 * Languages are BCP 47 tags ("en", "fr", "pt-BR", "zh-Hant"), never a
 * country: French is the same language in Switzerland and in France, and a
 * country can have several (lib/markets/model.ts keeps them apart). A tag is
 * kept in its canonical spelling (Intl.getCanonicalLocales), named in its
 * own words for a visitor ("Français", "Deutsch", "Română") and in the
 * creator's for the settings, and given an address prefix (/fr, /pt-br).
 *
 * Pure: the settings, the live website, the editor and the tests all read
 * it the same way.
 */

/** The languages a website can be offered in, as the settings list them. Any valid tag is accepted; these are the ones offered first. */
export const SITE_LANGUAGE_CODES = [
  "en", "es", "fr", "de", "it", "pt", "pt-BR", "nl", "ro", "pl", "cs", "sk", "hu", "bg", "el", "hr", "sl", "sr",
  "sv", "da", "nb", "fi", "et", "lv", "lt", "uk", "ru", "tr", "ar", "he", "fa", "hi", "bn", "ur", "th", "vi", "id",
  "ms", "fil", "ja", "ko", "zh-Hans", "zh-Hant",
] as const

/** Written right to left: the page gets dir="rtl". */
const RTL = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb"])

/** The tag in its canonical spelling ("pt-br" → "pt-BR", "EN" → "en"), or null for one that is not a language tag. */
export function normalizeLocale(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const t = raw.trim().replace(/_/g, "-")
  if (!t || t.length > 35 || !/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(t)) return null
  try {
    /* Intl.getCanonicalLocales, which this TypeScript lib does not declare: present in every runtime the app runs in. */
    const canonical = (Intl as unknown as { getCanonicalLocales(t: string): string[] }).getCanonicalLocales(t)
    return canonical[0] ?? null
  } catch {
    return null
  }
}

/** The language part alone: "pt-BR" → "pt". */
export function baseLanguage(locale: string): string {
  return locale.split("-")[0].toLowerCase()
}

export function isRtl(locale: string): boolean {
  return RTL.has(baseLanguage(locale))
}

export function dirOf(locale: string): "ltr" | "rtl" {
  return isRtl(locale) ? "rtl" : "ltr"
}

/**
 * The language's name. `inLocale` omitted, in its own language with a
 * capital ("Français", "Deutsch", "Português (Brasil)"), which is how a
 * language selector names it so a visitor finds their own. Given, in that
 * language ("French" for "en").
 */
export function languageName(locale: string, inLocale?: string): string {
  const shown = inLocale ?? locale
  try {
    const name = new Intl.DisplayNames([shown], { type: "language" }).of(locale)
    if (!name) return locale
    return name.charAt(0).toLocaleUpperCase(shown) + name.slice(1)
  } catch {
    return locale
  }
}

/** The address prefix for a language: lower case, as Shopify writes them ("/fr", "/pt-br"). The default language has none. */
export function localePrefix(locale: string): string {
  return locale.toLowerCase()
}

/**
 * The language an address starts with, among the website's published ones:
 * "/fr/products/mug" → { locale: "fr", rest: "/products/mug" }. Matched case
 * blind, and only against `published`, so "/about" is never read as a
 * language and a language that is not published is just a path.
 */
export function localeFromPath(pathname: string, published: readonly string[]): { locale: string; rest: string } | null {
  const m = pathname.match(/^\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)(\/.*)?$/)
  if (!m) return null
  const hit = published.find((l) => localePrefix(l) === m[1].toLowerCase())
  return hit ? { locale: hit, rest: m[2] || "/" } : null
}

/** A path on the website in a language: "/products/mug" in "fr" → "/fr/products/mug"; the default language keeps it as it is. */
export function localizedPath(path: string, locale: string, defaultLocale: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`
  if (locale === defaultLocale) return clean
  return clean === "/" ? `/${localePrefix(locale)}` : `/${localePrefix(locale)}${clean}`
}

/**
 * The language a visitor's browser asks for first, among the website's
 * published ones (Accept-Language). Only a suggestion: a visitor's own
 * choice is always kept over it, and nobody is redirected by it.
 */
export function preferredLocale(acceptLanguage: string | null | undefined, published: readonly string[]): string | null {
  if (!acceptLanguage || published.length === 0) return null
  const asked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";")
      const q = Number(params.find((p) => p.trim().startsWith("q="))?.trim().slice(2) ?? "1")
      return { tag: normalizeLocale(tag), q: Number.isFinite(q) ? q : 0 }
    })
    .filter((a): a is { tag: string; q: number } => !!a.tag && a.q > 0)
    .sort((a, b) => b.q - a.q)
  for (const a of asked) {
    const exact = published.find((l) => l.toLowerCase() === a.tag.toLowerCase())
    if (exact) return exact
    const base = published.find((l) => baseLanguage(l) === baseLanguage(a.tag))
    if (base) return base
  }
  return null
}

/**
 * The country whose flag stands for a language in the settings. A flag is
 * not a language (lib/markets/model keeps them apart), so this is only a
 * picture to find a row by: the region the tag names when it names one
 * ("pt-BR" → BR), else the country most people mean by it. Null for a
 * language with no obvious one, which then shows the plain grey tile.
 */
const LANGUAGE_COUNTRY: Record<string, string> = {
  en: "US", es: "ES", fr: "FR", de: "DE", it: "IT", pt: "PT", nl: "NL", ro: "RO", pl: "PL", cs: "CZ", sk: "SK",
  hu: "HU", bg: "BG", el: "GR", hr: "HR", sl: "SI", sr: "RS", sv: "SE", da: "DK", nb: "NO", no: "NO", nn: "NO",
  fi: "FI", et: "EE", lv: "LV", lt: "LT", uk: "UA", ru: "RU", tr: "TR", ar: "SA", he: "IL", fa: "IR", hi: "IN",
  bn: "BD", ur: "PK", th: "TH", vi: "VN", id: "ID", ms: "MY", fil: "PH", tl: "PH", ja: "JP", ko: "KR", ga: "IE",
  is: "IS", mt: "MT", sq: "AL", mk: "MK", bs: "BA", ka: "GE", hy: "AM", az: "AZ", kk: "KZ", sw: "KE", af: "ZA",
}

export function languageCountry(locale: string): string | null {
  const parts = locale.split("-")
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$/.test(p))
  if (region) return region.toUpperCase()
  const base = baseLanguage(locale)
  if (base === "zh") return /Hant/i.test(locale) ? "TW" : "CN"
  return LANGUAGE_COUNTRY[base] ?? null
}
