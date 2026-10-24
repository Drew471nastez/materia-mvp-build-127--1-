import "server-only"

import { normalizeLocale, localePrefix } from "@/lib/markets/locales"
import { siteLanguages } from "@/lib/markets/live"

/**
 * ===========================================================================
 *  THE LANGUAGE A SIGN IN OR ACCOUNT FORM WAS SENT FROM
 * ===========================================================================
 * /fr/account/login is the sign in page in French (lib/markets/site-name),
 * but its forms post to /api/site-account/*, which has no language in its
 * address, and every route answered with /account/login: the code step,
 * and everything after it, came back in the website's own language. Each
 * account form now carries the page's language in a hidden `lang` field,
 * and the routes send the visitor back under its prefix.
 *
 * Only one of the website's published languages other than its default is
 * a prefix (the same list the proxy routes /fr/... by); anything else is no
 * prefix at all, so a form can never send a visitor to a made-up address.
 */

/** The prefix for a language a form named: "/fr", or "" for the website's own language or one it does not publish. */
export async function siteLangRoot(creatorId: string | null | undefined, raw: unknown): Promise<string> {
  const code = normalizeLocale(raw)
  if (!code || !creatorId) return ""
  try {
    const langs = await siteLanguages(creatorId)
    const hit = langs.others.find((l) => l.toLowerCase() === code.toLowerCase())
    return hit ? `/${localePrefix(hit)}` : ""
  } catch {
    return ""
  }
}

export { inLang, langOfRoot } from "./lang-path"
