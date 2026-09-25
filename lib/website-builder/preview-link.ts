/**
 * ===========================================================================
 *  SHOWING SOMEBODY THE VERSION THAT IS NOT LIVE YET
 * ===========================================================================
 * A published site serves what was published. That is the whole point of
 * Publish, and it was not quite true: where a page had nothing published —
 * a page added since the last publish — the storefront fell back to the
 * draft and served it. So a page could be live before anybody put it live.
 *
 * Closing that removes the only way a creator had to show work in progress
 * to somebody else, so this is the deliberate replacement: a long random
 * token on the install. With it, `?preview=<token>` renders the drafts and
 * asks search engines not to index the page. Without it, the published site,
 * exactly as before.
 *
 * WHAT MAKES IT SAFE TO HAND OUT: it is unguessable, it is per install, it
 * is checked against the database rather than decoded, and rotating it
 * revokes every link already shared. It grants reading one theme's drafts
 * and nothing else — no account, no products, no other install.
 */
import { randomBytes } from "node:crypto"

/**
 * 32 bytes, base64url. Long enough that guessing is not a strategy, short
 * enough to paste into a message.
 */
export function newPreviewToken(): string {
  return randomBytes(32).toString("base64url")
}

/**
 * ===========================================================================
 *  WHERE A PREVIEW LINK MAY POINT
 * ===========================================================================
 * The publish panel sends the site's own address and the route adds the
 * token to it. That address arrives in the request as written, so the server
 * could be asked to hand back a link with a real token in it pointing
 * anywhere at all. It is kept only when it is one of ours: storelib.com or a
 * name under it, the main domain this deployment serves or a name under it,
 * or the address the request itself came to. Anything else becomes the
 * canonical origin.
 *
 * https, except for the request's own address or the canonical one, which is
 * how a local build (http://localhost) keeps working.
 */
export function previewBase(
  base: string,
  allowed: { requestOrigin: string; mainDomain: string; canonical: string },
): string {
  const fallback = originOf(allowed.canonical) ?? "https://storelib.com"
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return fallback
  }
  if (url.username || url.password) return fallback
  if (url.protocol !== "https:" && url.protocol !== "http:") return fallback
  const own = url.origin === allowed.requestOrigin || url.origin === fallback
  if (!own && url.protocol !== "https:") return fallback
  const host = url.hostname.toLowerCase()
  const main = allowed.mainDomain.toLowerCase().replace(/:\d+$/, "")
  const ours = host === "storelib.com" || host.endsWith(".storelib.com") || (main !== "" && (host === main || host.endsWith(`.${main}`)))
  if (!own && !ours) return fallback
  return `${url.origin}${url.pathname}${url.search}`
}

function originOf(address: string): string | null {
  try {
    return new URL(address).origin
  } catch {
    return null
  }
}

/**
 * Recognising a token lives in `preview-token.ts`, which the proxy can import
 * without dragging `node:crypto` into the edge bundle. Re-exported here so
 * every caller that already reads this file keeps working.
 */
export { previewTokenFrom, isPreviewTokenShaped } from "./preview-token"

/**
 * Whether this request may see the drafts of this install. Compared against
 * the install's own token, so a token for one theme does nothing for another.
 * `undefined` and `null` never match: an install with no preview link cannot
 * be previewed, whatever is in the URL.
 */
export function mayPreview(installToken: string | null | undefined, requested: string | null): boolean {
  if (!installToken || !requested) return false
  if (installToken.length !== requested.length) return false
  /**
   * Constant time. The token is a secret handed out in a URL, and a
   * comparison that returns early on the first wrong character is a
   * comparison that can be measured. It costs nothing to not do that.
   */
  let diff = 0
  for (let i = 0; i < installToken.length; i++) diff |= installToken.charCodeAt(i) ^ requested.charCodeAt(i)
  return diff === 0
}

/**
 * WHAT THE PAGE SHOULD SHOW. One place, so the three public routes cannot
 * drift: published unless this is a preview, and never the other way round
 * by accident.
 */
export function pageSections<T>(
  row: { sections?: T | null; draft_sections?: T | null } | null | undefined,
  preview: boolean,
): T | null {
  if (!row) return null
  if (preview) return (row.draft_sections ?? row.sections) ?? null
  /**
   * Published only. The fallback to `draft_sections` that used to be here is
   * the bug: a page added since the last publish had only a draft, and this
   * served it to everybody.
   */
  return row.sections ?? null
}

export function themeSettings<T>(
  row: { settings?: T | null; draft_settings?: T | null } | null | undefined,
  preview: boolean,
): T | null {
  if (!row) return null
  if (preview) return (row.draft_settings ?? row.settings) ?? null
  return row.settings ?? null
}
