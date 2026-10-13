/**
 * ===========================================================================
 *  THE LANGUAGE A WEBSITE IS WRITTEN IN
 * ===========================================================================
 * Chosen in Website Settings › General, per website, and stored with the
 * website's other settings as `site_language`.
 *
 * It does two things a visitor never sees and both of which matter: the
 * page's root carries `lang`, so a screen reader reads the text in the right
 * voice and the browser hyphenates and translates it properly; and the share
 * card carries the matching `og:locale`.
 *
 * A fixed list, not free text. The value ends up in an attribute on every
 * page of the site, and a list is the simplest way to know it is a language.
 */
import { isRtl } from "@/lib/markets/locales"

export const SITE_LANGUAGES = [
  { code: "en", label: "English", locale: "en_US" },
  { code: "ro", label: "Română", locale: "ro_RO" },
  { code: "es", label: "Español", locale: "es_ES" },
  { code: "fr", label: "Français", locale: "fr_FR" },
  { code: "de", label: "Deutsch", locale: "de_DE" },
  { code: "it", label: "Italiano", locale: "it_IT" },
  { code: "pt", label: "Português", locale: "pt_PT" },
  { code: "nl", label: "Nederlands", locale: "nl_NL" },
  { code: "pl", label: "Polski", locale: "pl_PL" },
  { code: "ru", label: "Русский", locale: "ru_RU" },
  { code: "uk", label: "Українська", locale: "uk_UA" },
  { code: "tr", label: "Türkçe", locale: "tr_TR" },
  { code: "ja", label: "日本語", locale: "ja_JP" },
  { code: "ko", label: "한국어", locale: "ko_KR" },
  { code: "zh", label: "中文", locale: "zh_CN" },
  { code: "ar", label: "العربية", locale: "ar_AR" },
  { code: "hi", label: "हिन्दी", locale: "hi_IN" },
] as const

export type SiteLanguageCode = (typeof SITE_LANGUAGES)[number]["code"]

const BY_CODE = new Map<string, (typeof SITE_LANGUAGES)[number]>(SITE_LANGUAGES.map((l) => [l.code, l]))

/** The website's language code, or undefined when none was chosen. */
export function siteLanguage(theme: Record<string, unknown> | null | undefined): SiteLanguageCode | undefined {
  const v = theme?.site_language
  return typeof v === "string" && BY_CODE.has(v) ? (v as SiteLanguageCode) : undefined
}

/** The Open Graph locale for it, e.g. "ro_RO". */
export function siteLocale(theme: Record<string, unknown> | null | undefined): string | undefined {
  const code = siteLanguage(theme)
  return code ? BY_CODE.get(code)?.locale : undefined
}

/** Arabic, Hebrew, Persian and Urdu are written right to left; the page should be too (lib/markets/locales isRtl, the one list). */
export function siteDirection(theme: Record<string, unknown> | null | undefined): "rtl" | undefined {
  const code = siteLanguage(theme)
  return code && isRtl(code) ? "rtl" : undefined
}
