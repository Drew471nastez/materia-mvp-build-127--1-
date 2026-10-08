/**
 * The tab's community, as a session cookie, so the server can draw the
 * community's own bar on pages outside it (app/account/layout.tsx). Written
 * by lib/nav/community-context.ts beside its session storage; read here.
 * Pure, for the server and the browser alike.
 */
export const COMMUNITY_CONTEXT_COOKIE = "storelib_community"

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/

/** The slug a cookie value names, or null. */
export function communityFromCookie(value: string | null | undefined): string | null {
  return value && SLUG.test(value) ? value : null
}
