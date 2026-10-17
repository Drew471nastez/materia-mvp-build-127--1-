import "server-only"

/**
 * ===========================================================================
 *  THE CREATOR PAGE IN THE VISITOR'S LANGUAGE
 * ===========================================================================
 * storelib.com/<name> has one address, so a language is not a prefix there
 * as it is on the website: the page is drawn with the products' approved
 * translations (Translate in Settings › Markets and languages, the same
 * ones the website uses) in the language this request is for:
 *
 *   ?lang=fr        the visitor chose it (the language row at the foot of
 *                   the page, or the offer card): remembered in sl_lang
 *   sl_lang         what they chose before, on any creator page
 *   their browser   with Show visitors their own language on: the first
 *                   language the browser asks for that the store published,
 *                   exactly or nearly ("pt-PT" reads the store's "pt-BR"),
 *                   chosen silently (lib/markets/visitor-language.ts)
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
import { cookies, headers } from "next/headers"
import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { languageName } from "./locales"
import { siteLanguages, siteLocalizer } from "./live"
import { localizationTag, readLocalizationRow } from "./server"
import { LANGUAGE_CRAWLER, visitorLanguageFor } from "./visitor-language"

export interface CreatorPageLanguage {
  /** The language the page is drawn in. */
  code: string
  defaultLanguage: string
  /** Every published language, the store's own first, each in its own words. */
  languages: { code: string; name: string }[]
  /** A product with its translated title and description laid over. */
  product<T extends Record<string, unknown>>(p: T): T
}

/** Show visitors their own language, on or off (part 173; off where it has not run). */
function visitorLanguageOn(creatorId: string): Promise<boolean> {
  return unstable_cache(
    async () => {
      const { data } = await readLocalizationRow(createAdminClient(), creatorId)
      return data?.visitor_language === true
    },
    ["visitor-language", creatorId],
    { tags: [localizationTag(creatorId)], revalidate: 300 },
  )().catch(() => false)
}

export async function creatorPageLanguage(creatorId: string, asked: string | null | undefined): Promise<CreatorPageLanguage | null> {
  const langs = await siteLanguages(creatorId)
  if (!langs.saved || langs.others.length === 0) return null
  const all = [langs.defaultLanguage, ...langs.others]
  const find = (c: string | null | undefined) => (c ? (all.find((l) => l.toLowerCase() === c.toLowerCase()) ?? null) : null)
  const [h, jar] = await Promise.all([headers(), cookies()])
  const crawler = LANGUAGE_CRAWLER.test(h.get("user-agent") ?? "")
  let code = find(asked) ?? (crawler ? null : find(jar.get("sl_lang")?.value))
  if (!code && !crawler && !jar.get("sl_lang")?.value && (await visitorLanguageOn(creatorId))) {
    /* The browser's languages only: no country, so `closest` is a near match of one of them. */
    const pick = visitorLanguageFor({ acceptLanguage: h.get("accept-language"), country: null, languages: all })
    code = pick.exact ?? pick.closest
  }
  code = code ?? langs.defaultLanguage
  /* The default language's translations too, as the website draws them. */
  const localizer = await siteLocalizer(creatorId, code === langs.defaultLanguage ? null : code)
  return {
    code,
    defaultLanguage: langs.defaultLanguage,
    languages: all.map((c) => ({ code: c, name: languageName(c) })),
    product: (p) => (localizer ? (localizer.product(p as never) as typeof p) : p),
  }
}
