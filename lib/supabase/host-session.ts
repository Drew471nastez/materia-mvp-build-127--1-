/*
  @supabase/ssr's own chunk test, from its file rather than the package index (the index pulls all of supabase-js into the
  first script of every marketing page; lib/supabase/session-jar.ts has the reason).
*/
import { isChunkLike } from "@supabase/ssr/dist/main/utils/chunker.js"

/**
 * ===========================================================================
 *  A SESSION NO OTHER SITE CAN PLANT (round AX)
 * ===========================================================================
 * Published sites run their own JavaScript on <slug>.storelib.com (imported
 * themes, AI-built sites) and on creators' own domains. Script on a
 * subdomain may set a cookie with `Domain=storelib.com`, and the browser then
 * sends it to storelib.com as well, beside or instead of ours, with nothing
 * that tells the two apart: a request carries names and values only. So a
 * site could hand every visitor ITS OWN session (`sb-<ref>-auth-token`), and
 * the visitor typed card details, messages and content into the site
 * owner's account without knowing. Next keeps the last of two cookies with
 * one name and the browser client the first, so which one won was luck.
 *
 * The answer the large platforms use: a `__Host-` name. A browser refuses a
 * `__Host-` cookie that names a Domain, has a Path other than /, is not
 * Secure, or comes from any host but this one, so no subdomain can set it,
 * replace it or put a second one beside it.
 *
 * Supabase keeps its own names inside (the session and the PKCE verifier):
 * this file only changes what the browser holds. Every reader is shown the
 * `__Host-` cookies under the names Supabase expects, and every writer's
 * names are moved to `__Host-` on the way out:
 *
 *   READ    a `__Host-` copy exists: it is the session, and the old name is
 *           never read again, whoever set it.
 *           only the old name: read as before, so nobody is signed out, and
 *           moved to `__Host-` (proxy.ts on the next page, the browser
 *           client at once). Unless it arrived twice, or in two shapes
 *           (whole and in chunks): that is a planted copy beside the real
 *           one, and neither is used. The planted one is expired where a
 *           site could have set it (Domain=storelib.com), which leaves the
 *           real one to be moved over on the next read.
 *
 *   WRITE   on HTTPS the `__Host-` name, and the old name is expired.
 *           On http://localhost (a `__Host-` cookie needs Secure) the old
 *           name, exactly as before.
 *
 * Pure: the callers pass the cookies and the host's answer in, so tests
 * drive it with real Cookie headers.
 */

export const HOST_PREFIX = "__Host-"

/**
 * THE END OF THE MOVE (round AY). A lone old-name session is still read and
 * moved to `__Host-`, so a browser from before round AX is not signed out.
 * But a visitor with no `__Host-` session yet could be handed one under the
 * old name by a published site (Domain=storelib.com), and it was read like
 * their own. So the move has an end: from this date (45 days after
 * 2026-11-14) an old name is never read on HTTPS, it is expired instead.
 * Anyone who opened Storelib in those 45 days already holds the `__Host-`
 * copy and notices nothing; a browser that stayed away signs in once more.
 * http://localhost keeps the old name (it cannot hold a `__Host-` cookie).
 *
 * Narrowing the window further by the request (Referer, Sec-Fetch-Site) was
 * weighed and left out: a planted cookie waits in the jar and is used on a
 * later visit typed straight into the address bar, which looks exactly like
 * the real owner's own, so such a check would only sign real people out.
 */
export const LEGACY_SESSION_CUTOFF_MS = Date.UTC(2026, 11, 29)

export interface SessionViewOptions {
  /** True where writes go to `__Host-` names (writesHostCookies): only there can the old name be retired. */
  retireLegacy?: boolean
  /** The clock, for tests. */
  now?: number
}

/** Whether a lone old-name session may still be read and moved over. */
export function legacyMigrationOpen(opts: SessionViewOptions = {}): boolean {
  if (!opts.retireLegacy) return true
  return (opts.now ?? Date.now()) < LEGACY_SESSION_CUTOFF_MS
}

export interface CookiePair {
  name: string
  value: string
}

/** Every cookie in a Cookie header, IN ORDER and WITH duplicates (a Map would hide the second copy, which is the thing to see). */
export function cookiePairs(cookieHeader: string | null | undefined): CookiePair[] {
  const out: CookiePair[] = []
  for (const part of (cookieHeader || "").split(";")) {
    const eq = part.indexOf("=")
    if (eq < 0) continue
    const name = part.slice(0, eq).trim()
    if (!name) continue
    let value = part.slice(eq + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      /* a value that is not URI encoded is used as it is */
    }
    out.push({ name, value })
  }
  return out
}

/** The Supabase item a cookie name belongs to (the session, or the PKCE verifier), with or without the prefix. */
function itemOf(name: string, key: string): { item: string; host: boolean; bare: string } | null {
  const host = name.startsWith(HOST_PREFIX)
  const bare = host ? name.slice(HOST_PREFIX.length) : name
  for (const item of [key, `${key}-code-verifier`]) if (isChunkLike(bare, item)) return { item, host, bare }
  return null
}

/** True for a Storelib session cookie under either name (a hint for "may be signed in", never proof). */
export function isSessionCookieName(name: string): boolean {
  const bare = name.startsWith(HOST_PREFIX) ? name.slice(HOST_PREFIX.length) : name
  return /^sb-[^=;]+-auth-token(?:\.\d+)?$/.test(bare)
}

export interface SessionView {
  /** What Supabase is shown: every other cookie as it came, the guarded ones under the names Supabase uses. */
  cookies: CookiePair[]
  /** Old-name cookies trusted on this request (no `__Host-` copy, one of each): to move to `__Host-`. */
  migrate: CookiePair[]
  /** Old names ignored because a `__Host-` copy exists, or the move has ended (LEGACY_SESSION_CUTOFF_MS): safe to expire on this host. */
  shadowed: string[]
  /** Old names ignored because they arrived twice or in two shapes: a planted copy is among them. */
  tossed: string[]
}

/**
 * The cookies as Supabase may read them. `pairs` in the order the browser
 * sent them; `alsoDuplicated` names a caller knows arrived more than once
 * when `pairs` came through a jar that keeps one of each (Next's cookies()).
 */
export function sessionView(pairs: readonly CookiePair[], key: string | null, alsoDuplicated: Iterable<string> = [], opts: SessionViewOptions = {}): SessionView {
  const migrationOpen = legacyMigrationOpen(opts)
  const view: SessionView = { cookies: [], migrate: [], shadowed: [], tossed: [] }
  const seen = new Set<string>()
  const count = new Map<string, number>()
  for (const p of pairs) count.set(p.name, (count.get(p.name) ?? 0) + 1)
  for (const name of alsoDuplicated) count.set(name, Math.max(2, count.get(name) ?? 0))

  const groups = new Map<string, { host: CookiePair[]; legacy: CookiePair[] }>()
  for (const p of pairs) {
    const at = key ? itemOf(p.name, key) : null
    if (!at) {
      if (!seen.has(p.name)) {
        seen.add(p.name)
        view.cookies.push({ name: p.name, value: p.value })
      }
      continue
    }
    const g = groups.get(at.item) ?? { host: [], legacy: [] }
    groups.set(at.item, g)
    ;(at.host ? g.host : g.legacy).push({ name: at.bare, value: p.value })
  }

  for (const [item, g] of groups) {
    const legacyNames = [...new Set(g.legacy.map((p) => p.name))]
    if (g.host.length > 0) {
      /* A `__Host-` copy only this host can have written: the old name is never trusted beside it. */
      const shown = new Set<string>()
      for (const p of g.host) {
        if (shown.has(p.name)) continue
        shown.add(p.name)
        view.cookies.push(p)
      }
      view.shadowed.push(...legacyNames)
      continue
    }
    const twice = legacyNames.some((n) => (count.get(n) ?? 0) > 1)
    const bothShapes = legacyNames.includes(item) && legacyNames.some((n) => n !== item)
    if (twice || bothShapes) {
      view.tossed.push(...legacyNames)
      continue
    }
    if (!migrationOpen) {
      /* After the cutoff an old name is never read: expired like one beside a `__Host-` copy (round AY). */
      view.shadowed.push(...legacyNames)
      continue
    }
    for (const p of g.legacy) {
      view.cookies.push(p)
      view.migrate.push(p)
    }
  }
  return view
}

/** Whether this browser already holds a `__Host-` copy of a guarded item (which proves the host can hold one). */
export function holdsHostSession(pairs: readonly CookiePair[], key: string | null): boolean {
  if (!key) return false
  return pairs.some((p) => p.name.startsWith(HOST_PREFIX) && itemOf(p.name, key) !== null)
}

/**
 * Whether writes go to `__Host-` names: on HTTPS (never on localhost, whose
 * http cannot hold a Secure cookie), or wherever a `__Host-` copy already is,
 * so a renewal is never written under the old name beside a newer prefix.
 */
export function writesHostCookies(opts: { https: boolean; localhost: boolean; pairs: readonly CookiePair[]; key: string | null }): boolean {
  if (holdsHostSession(opts.pairs, opts.key)) return true
  return opts.https && !opts.localhost
}

/** The name a write for Supabase's `name` goes out under. Cookies that are not the session's are untouched. */
export function outgoingName(name: string, key: string | null, host: boolean): string {
  if (!host || !key || name.startsWith(HOST_PREFIX)) return name
  return itemOf(name, key) ? HOST_PREFIX + name : name
}

/** True for a name that is one of the guarded session cookies (under either name). */
export function isGuardedName(name: string, key: string | null): boolean {
  return !!key && itemOf(name, key) !== null
}

/**
 * The paths a planted cookie for this request could carry: a site may set
 * one at `/` or at any parent of the page, and a cookie is only removed by an
 * expiry with its own path. Bounded: a deep path is unusual and the list
 * stops at eight segments.
 */
export function plantedPaths(pathname: string): string[] {
  const out = ["/"]
  const parts = (pathname || "/").split("/").filter(Boolean).slice(0, 8)
  let at = ""
  for (const part of parts) {
    at += `/${part}`
    out.push(at, `${at}/`)
  }
  return [...new Set(out)]
}

/**
 * Raw Set-Cookie lines that expire a planted copy of each name where a
 * subdomain could have put it (Domain=<main domain>, every path the request
 * could have been sent it on). A host-only cookie, which only this host can
 * write, is never touched by these.
 */
export function plantedExpiries(names: readonly string[], mainDomain: string, pathname: string): string[] {
  const out: string[] = []
  for (const name of new Set(names)) {
    for (const path of plantedPaths(pathname)) out.push(`${name}=; Domain=.${mainDomain}; Path=${path}; Max-Age=0; Secure; SameSite=Lax`)
  }
  return out
}
