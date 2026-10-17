"use client"

/**
 * The creator page's languages (lib/markets/creator-page-language.ts).
 *
 * ROUND AG, THE OWNER: no language selector on creator pages. The page still opens in the visitor's language when the
 * creator translated it (?lang=, or the sl_lang choice), and the offer card at the top still appears when Show visitors
 * their own language found a near match; the dropdown at the foot of the page is gone.
 */
import { LanguageSuggest } from "@/components/website-builder/theme/language-suggest"

export function CreatorLanguage({ code, defaultLanguage, languages, suggest }: { code: string; defaultLanguage: string; languages: { code: string; name: string }[]; suggest: string | null }) {
  if (languages.length < 2 || !suggest) return null
  return (
    <div data-creator-language="" className="contents">
      <LanguageSuggest conf={{ current: code, defaultLanguage, languages: languages.map((l) => l.code), address: "query", suggest }} />
    </div>
  )
}
