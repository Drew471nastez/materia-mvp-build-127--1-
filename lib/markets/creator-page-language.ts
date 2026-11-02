import "server-only"

/**
 * ===========================================================================
 *  THE CREATOR PAGE IN THE VISITOR'S LANGUAGE
 * ===========================================================================
 * storelib.com/<name> has one address per language: the page is drawn with
 * the products' approved translations (Translate in Settings › Markets and
 * languages, the same ones the website uses) in the language the ADDRESS
 * names, ?lang=fr, and in the store's own without one. Round 49: never from
 * a cookie or a request header, so every address is one HTML for everybody
 * and a CDN may hold it. Who gets sent to which address is the proxy's
 * (proxy.ts creatorPageLanguageStep, lib/markets/creator-page-language-step):
 *
 *   ?lang=fr        the visitor chose it (the language row at the foot of
 *                   the page): remembered in sl_lang
 *   sl_lang         what they chose before, on any creator page: sent to
 *                   ?lang=<it> when the store publishes it
 *   their browser   with Show visitors their own language on: the first
 *                   language the browser asks for that the store published,
 *                   exactly or nearly ("pt-PT" reads the store's "pt-BR"),
 *                   chosen silently (lib/markets/visitor-language.ts), sent
 *                   to ?lang=<it>
 *
 * NEVER A CARD HERE. The creator page has no "View this site in ...?" offer
 * (the owner, round 27): the language is chosen as above or left as the
 * store's own, and the language row at the foot of the page is the way to
 * change it. The country alone (where someone happens to be) is too weak a
 * sign to change the page without asking, so it changes nothing here.
 *
 * A crawler always gets the page in the store's own language, which is the
 * one address search engines know. Only published languages, only approved
 * translations; what is not translated stays as written.
 */
import { languageName } from "./locales"
import { siteLanguages, siteLocalizer } from "./live"

export interface CreatorPageLanguage {
  /** The language the page is drawn in. */
  code: string
  defaultLanguage: string
  /** Every published language, the store's own first, each in its own words. */
  languages: { code: string; name: string }[]
  /** A product with its translated title and description laid over. */
  product<T extends Record<string, unknown>>(p: T): T
}

export async function creatorPageLanguage(creatorId: string, asked: string | null | undefined): Promise<CreatorPageLanguage | null> {
  const langs = await siteLanguages(creatorId)
  if (!langs.saved || langs.others.length === 0) return null
  const all = [langs.defaultLanguage, ...langs.others]
  const find = (c: string | null | undefined) => (c ? (all.find((l) => l.toLowerCase() === c.toLowerCase()) ?? null) : null)
  /* The address alone (round 49): ?lang= or the store's own. Never a cookie or a request header, so one address is one HTML. */
  const code = find(asked) ?? langs.defaultLanguage
  /* The default language's translations too, as the website draws them. */
  const localizer = await siteLocalizer(creatorId, code === langs.defaultLanguage ? null : code)
  return {
    code,
    defaultLanguage: langs.defaultLanguage,
    languages: all.map((c) => ({ code: c, name: languageName(c) })),
    product: (p) => (localizer ? (localizer.product(p as never) as typeof p) : p),
  }
}
