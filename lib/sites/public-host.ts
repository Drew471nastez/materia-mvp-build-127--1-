/**
 * Where published sites answer, for code that runs in a browser.
 *
 * ---------------------------------------------------------------------------
 *  A SUBDOMAIN OF THE MAIN DOMAIN — <slug>.storelib.com
 * ---------------------------------------------------------------------------
 * Creator pages are paths (storelib.com/andrewrullz) and AI-built sites are
 * subdomains (andrewrullz.storelib.com). That split is what keeps two
 * different things from claiming one address.
 *
 * A SUBDOMAIN IS NOT A SECURITY BOUNDARY BY ITSELF. Cookies scoped to
 * `.storelib.com` are sent to every host under it, so this arrangement is
 * only safe because the session cookie is host-only — see the note in
 * lib/supabase/server.ts. If anything ever re-widens that cookie, every
 * published site can read its visitors' login tokens.
 *
 * Duplicated from lib/sites/publish.ts rather than imported, because that
 * module is `server-only` — importing it from a client component fails the
 * build, which is exactly what that guard is for. Both read the same
 * `NEXT_PUBLIC_` variable, so they cannot disagree at runtime.
 */
export const SITES_HOST = process.env.NEXT_PUBLIC_SITES_HOST || "storelib.com"

export function publishedHost(slug: string): string {
  return `${slug}.${SITES_HOST}`
}

export function publishedUrl(slug: string): string {
  return `https://${publishedHost(slug)}`
}
