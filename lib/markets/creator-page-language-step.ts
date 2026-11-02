/**
 * ===========================================================================
 *  WHICH ADDRESS A VISITOR'S CREATOR PAGE IS IN (round 49)
 * ===========================================================================
 * storelib.com/<handle> is one HTML for everybody, which a CDN holds
 * (tests/cdnpages-r49), so the page can no longer read the visitor's cookie
 * or their browser's languages. Each language is its own address instead,
 * /<handle>?lang=fr (lib/markets/creator-page-language), and the proxy sends
 * the visitor who would have been drawn another language there, once, with
 * a 307 nobody stores. The same choice the page used to make:
 *
 *   sl_lang         what they chose before, when the store publishes it;
 *   their browser   with Show visitors their own language on and nothing
 *                   chosen: the first language the browser asks for that the
 *                   store published, exactly or nearly
 *                   (lib/markets/visitor-language.ts);
 *   anything else   the store's own language, at the plain address.
 *
 * Never a crawler (search engines know the one address, in the store's own
 * language), never a request that is not a person opening a page, and never
 * an address that already names a language: the address always wins.
 * Pure, so every case is a test (tests/cdnpages-r49).
 */
import { LANGUAGE_CRAWLER, visitorLanguageFor } from "./visitor-language"

export function creatorPageLanguageStep(r: {
  method: string
  /** Sec-Fetch-Dest, when the browser sent it. */
  dest: string | null
  accept: string | null
  userAgent: string | null
  /** The address already says ?lang=. */
  asked: boolean
  /** sl_lang. */
  chosen: string | null
  /** Show visitors their own language (SQL part 173). */
  visitorLanguage: boolean
  defaultLanguage: string
  /** The published languages other than the store's own. */
  others: readonly string[]
  acceptLanguage: string | null
}): string | null {
  if (r.others.length === 0 || r.asked || (r.method !== "GET" && r.method !== "HEAD")) return null
  if ((r.dest && r.dest !== "document") || !(r.accept ?? "").includes("text/html")) return null
  if (LANGUAGE_CRAWLER.test(r.userAgent ?? "")) return null
  const def = r.defaultLanguage || "en"
  const all = [def, ...r.others]
  const find = (c: string | null | undefined) => (c ? (all.find((l) => l.toLowerCase() === c.toLowerCase()) ?? null) : null)
  let code: string | null = null
  if (r.chosen) code = find(r.chosen)
  else if (r.visitorLanguage) {
    /* The browser's languages only: no country, so `closest` is a near match of one of them. */
    const pick = visitorLanguageFor({ acceptLanguage: r.acceptLanguage, country: null, languages: all })
    code = pick.exact ?? pick.closest
  }
  return code && code.toLowerCase() !== def.toLowerCase() ? code : null
}
