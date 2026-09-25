/**
 * The dashboard's languages, as the pickers show them
 * (components/app/language-picker): only the ones lib/i18n has words for,
 * each by its own name with the English name under it ("Deutsch", German).
 *
 * Settings listed fourteen, and ten of them (日本語, 한국어, Português, ...)
 * had no translations: choosing one changed nothing, which reads as broken.
 * The day one is translated it appears on its own.
 */
import { LANGUAGES, translations } from "./translations"
import type { Choice } from "@/lib/ui/choice-match"

function englishName(code: string): string | undefined {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? undefined
  } catch {
    return undefined
  }
}

export function appLanguageChoices(): Choice[] {
  return LANGUAGES.filter((l) => l.code in translations).map((l) => {
    const english = englishName(l.code)
    return {
      value: l.code,
      label: l.name,
      /* "English (US)" needs no "American English" under it. */
      detail: english && !l.name.toLowerCase().startsWith(english.split(" ").pop()!.toLowerCase()) ? english : undefined,
      keywords: `${english ?? ""} ${l.code}`,
    }
  })
}

export function appLanguageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? "English (US)"
}
