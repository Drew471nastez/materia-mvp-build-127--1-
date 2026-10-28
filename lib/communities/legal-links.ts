/**
 * ===========================================================================
 *  A COMMUNITY'S OWN PRIVACY AND TERMS PAGES (round 27)
 * ===========================================================================
 * The owner: "creators can set their own Privacy Policy and Terms links for
 * their community". The About page links to Storelib's legal pages under the
 * sheet (components/community/public/sales-page.tsx); a creator who has their
 * own puts the address in the Page editor, and that link is drawn instead of
 * Storelib's. Each one on its own: a creator with only their own terms keeps
 * Storelib's privacy page.
 *
 * Kept in communities.onboarding.legal, beside the page's look
 * (lib/communities/page-look.ts) and the welcome steps, so no column is
 * added and no SQL is needed. Missing, or an address that does not pass the
 * check below, reads as none, and Storelib's link stands.
 *
 * THE ADDRESS. A web page anyone can open: https (or http) only, a real host
 * name with a dot in it, no user name or password in it, no space, at most
 * LEGAL_URL_MAX characters. "mysite.com/privacy" is read as https. Anything
 * else (javascript:, data:, mailto:, a path on Storelib, localhost, an IP of
 * a private network) is refused, by the editor before Save and by the server
 * on save, with the same rule.
 *
 * Pure and browser safe: the server, the About page, the editor and the
 * tests read it.
 */

export const LEGAL_URL_MAX = 500

/* The canonical addresses (app/privacy, app/terms). /legal/* only redirects there now. */
export const STORELIB_PRIVACY_URL = "https://storelib.com/privacy"
export const STORELIB_TERMS_URL = "https://storelib.com/terms"

export const LEGAL_KINDS = ["privacy", "terms"] as const
export type LegalKind = (typeof LEGAL_KINDS)[number]

/** The creator's own addresses, null where they have none. */
export interface LegalLinks {
  privacy: string | null
  terms: string | null
}

export const NO_LEGAL_LINKS: LegalLinks = { privacy: null, terms: null }

export type LegalUrlProblem = "address" | "long"

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|0\.0\.0\.0|\[.*\])$/i

/**
 * One address checked: `{ ok: true, url }` with the address as it is stored (null for an empty field), or the problem.
 * The same answer in the editor, on the server and when a stored value is read back.
 */
export function legalUrl(raw: unknown): { ok: true; url: string | null } | { ok: false; problem: LegalUrlProblem } {
  if (raw === null || raw === undefined) return { ok: true, url: null }
  if (typeof raw !== "string") return { ok: false, problem: "address" }
  const text = raw.trim()
  if (!text) return { ok: true, url: null }
  if (text.length > LEGAL_URL_MAX) return { ok: false, problem: "long" }
  if (/\s/.test(text)) return { ok: false, problem: "address" }
  /* "mysite.com/privacy": a web address without its scheme is read as https. Any other scheme is refused below. */
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : /^\/\//.test(text) ? `https:${text}` : `https://${text}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return { ok: false, problem: "address" }
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, problem: "address" }
  if (u.username || u.password) return { ok: false, problem: "address" }
  const host = u.hostname.toLowerCase()
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".") || PRIVATE_HOST.test(host)) return { ok: false, problem: "address" }
  const url = u.href
  if (url.length > LEGAL_URL_MAX) return { ok: false, problem: "long" }
  return { ok: true, url }
}

/** The links from anything (a settings body, a stored row): each checked on its own, null where it does not pass. */
export function cleanLegalLinks(raw: unknown): LegalLinks {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const one = (v: unknown) => {
    const c = legalUrl(v)
    return c.ok ? c.url : null
  }
  return { privacy: one(r.privacy), terms: one(r.terms) }
}

/** The links a community's stored settings hold (communities.onboarding.legal). */
export function legalLinksOf(onboarding: unknown): LegalLinks {
  const legal = onboarding && typeof onboarding === "object" ? (onboarding as Record<string, unknown>).legal : undefined
  return cleanLegalLinks(legal)
}

/** The same settings with these links, everything else in them kept. No links are stored as nothing. */
export function withLegalLinks(onboarding: unknown, links: LegalLinks): Record<string, unknown> {
  const base = onboarding && typeof onboarding === "object" ? { ...(onboarding as Record<string, unknown>) } : {}
  const clean = cleanLegalLinks(links)
  if (!clean.privacy && !clean.terms) delete base.legal
  else base.legal = clean
  return base
}

/** The part of the settings the links own, so saving the welcome steps never drops them. */
export function keptLegal(onboarding: unknown): { legal?: LegalLinks } {
  const links = legalLinksOf(onboarding)
  return links.privacy || links.terms ? { legal: links } : {}
}

export function sameLegalLinks(a: LegalLinks, b: LegalLinks): boolean {
  return a.privacy === b.privacy && a.terms === b.terms
}

/** What the About page links to, in order: the creator's own page where they set one, else Storelib's. */
export function legalLinksShown(links: LegalLinks | null | undefined): { kind: LegalKind; href: string; own: boolean }[] {
  const own = cleanLegalLinks(links ?? NO_LEGAL_LINKS)
  return [
    { kind: "privacy", href: own.privacy ?? STORELIB_PRIVACY_URL, own: !!own.privacy },
    { kind: "terms", href: own.terms ?? STORELIB_TERMS_URL, own: !!own.terms },
  ]
}
