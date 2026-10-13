/**
 * The dashboard's languages, as the pickers show them
 * (components/app/language-picker): only the ones lib/i18n has words for,
 * each by its own name with its name in the dashboard's language under it
 * ("Deutsch", German; "Deutsch", alemán).
 *
 * Settings listed fourteen, and ten of them (日本語, 한국어, Português, ...)
 * had no translations: choosing one changed nothing, which reads as broken.
 * The day one is translated it appears on its own.
 */
import { LANGUAGES, translations } from "./translations"
import { activeLocale } from "./text"
import type { Choice } from "@/lib/ui/choice-match"

function nameIn(locale: string, code: string): string | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Each language by its own name, with its name in the dashboard's current
 * language under it ("Deutsch", German; "Deutsch", alemán), found by either
 * and by its English name.
 */
export function appLanguageChoices(): Choice[] {
  const here = activeLocale()
  return LANGUAGES.filter((l) => l.code in translations).map((l) => {
    const english = nameIn("en", l.code)
    const local = nameIn(here, l.code) ?? english
    const own = l.name.toLowerCase()
    /* "English (US)" needs no "American English" under it, nor "Polski" a "polski". */
    const same = !local || own.startsWith(local.toLowerCase().split(" ")[0]) || own.startsWith((english ?? "").toLowerCase().split(" ").pop() ?? "")
    return {
      value: l.code,
      label: l.name,
      detail: !local || same ? undefined : local[0].toUpperCase() + local.slice(1),
      keywords: `${english ?? ""} ${local ?? ""} ${l.code}`,
    }
  })
}

export function appLanguageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? "English (US)"
}
