/**
 * ===========================================================================
 *  THE LANGUAGE A PAGE IS IN, FOR ITS STRUCTURED DATA (round 45 leftovers)
 * ===========================================================================
 * A product's JSON-LD said `inLanguage: "en"` whatever the page was in. It
 * now says the page's own language, from the same place the page's
 * lang attribute comes from, or nothing when that is not known.
 *
 *   storelib.com      the root layout's <html lang>, STORELIB_PAGE_LANG,
 *                     which app/layout.tsx prints and the product page reads;
 *   a website         the language the page is drawn in (ThemePage's lang):
 *                     with Markets and languages saved, the address's
 *                     language or the store's default; without, the
 *                     language chosen in Website settings; with neither,
 *                     unknown, and left out.
 */
import { siteLanguage } from "@/lib/website-builder/site-language"

/** What app/layout.tsx prints as <html lang>, on every storelib.com page. */
export const STORELIB_PAGE_LANG = "en"

/** A language tag a page may carry: "en", "pt-BR". Anything else is not one. */
export function languageTag(value: unknown): string | undefined {
  return typeof value === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value.trim()) ? value.trim() : undefined
}

/**
 * A website page's language, as ThemePage sets its lang: the Markets and
 * languages choice first (lib/markets/choice.ts languageChoiceOf), then the
 * theme's site_language (lib/website-builder/site-language.ts).
 */
export function websitePageLanguage(
  langs: { saved: boolean; defaultLanguage: string; others: string[] } | null | undefined,
  locale: string | null | undefined,
  theme: Record<string, unknown> | null | undefined,
): string | undefined {
  if (langs?.saved) {
    const all = [langs.defaultLanguage, ...langs.others]
    const chosen = (locale && all.find((l) => l.toLowerCase() === locale.toLowerCase())) || langs.defaultLanguage
    return languageTag(chosen)
  }
  return siteLanguage(theme)
}
