"use client"

/**
 * The creator page's languages (lib/markets/creator-page-language.ts).
 *
 * The owner asked for both of these to go: no floating "View this site in ...?" card (round 27) and no language
 * selector at the foot of the page (round AG). The page still opens in the visitor's language when the creator
 * translated it: ?lang=, the sl_lang choice, or Show visitors their own language picking silently on the server.
 * Nothing is drawn here; the component stays so the page's call sites keep one place to bring a control back.
 */
export function CreatorLanguage(_props: { code: string; defaultLanguage: string; languages: { code: string; name: string }[] }) {
  return null
}
