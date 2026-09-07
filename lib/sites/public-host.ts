/**
 * Where published sites answer, for code that runs in a browser.
 *
 * Duplicated from lib/sites/publish.ts rather than imported, because that
 * module is `server-only` — importing it from a client component fails the
 * build, which is exactly what that guard is for. Both read the same
 * `NEXT_PUBLIC_` variable, so they cannot disagree at runtime.
 */
export const SITES_HOST = process.env.NEXT_PUBLIC_SITES_HOST || "storelib.site"

export function publishedUrl(slug: string): string {
  return `https://${SITES_HOST}/${slug}`
}
