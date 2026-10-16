"use client"

/**
 * ===========================================================================
 *  THE PAGE IN ANOTHER LANGUAGE, THE FIELDS IN THE WEBSITE'S OWN
 * ===========================================================================
 * With the canvas showing another language of the website, a section's
 * fields still hold the text written in its own (what is edited and saved
 * is always that one). Said once at the top of the panel, quietly, so a
 * Spanish page beside English fields is not taken for a lost translation,
 * with the way to the translation itself: Settings › Languages & Currency,
 * its sheet open on that language (markets-panel.tsx, ?translate=).
 */
import { languageName } from "@/lib/markets/locales"
import { activeLocale, tt } from "@/lib/i18n/text"

/** Where a language's translations are edited. Pure, tested as words. */
export function translationHref(code: string): string {
  return `/app/settings?tab=markets&translate=${encodeURIComponent(code)}`
}

export function PreviewLanguageNote({ locale, onEdit }: { locale: string | null; onEdit: (href: string) => void }) {
  if (!locale) return null
  return (
    <p data-preview-language-note={locale} className="border-b border-border px-3.5 py-2 text-[12px] leading-snug text-muted-foreground">
      {tt("Showing {language}. Fields show your original text.", { language: languageName(locale, activeLocale()) })}{" "}
      <button type="button" onClick={() => onEdit(translationHref(locale))} className="font-medium text-foreground underline underline-offset-2">
        {tt("Edit translation")}
      </button>
    </p>
  )
}
