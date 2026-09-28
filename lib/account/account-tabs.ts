/**
 * ===========================================================================
 *  THE PROFILE'S OWN PAGES
 * ===========================================================================
 * /account is the buyer's profile: who they are on Storelib and what they
 * have there, with the account's settings one tab over. "It needs to be the
 * account with multiple subpages there, such as settings, overview. Like a
 * profile, not directly changing the name or profile photo."
 *
 *   Overview   /account           the profile, the library in numbers, the
 *                                 newest purchases, and selling
 *   Settings   /account/settings  photo and name, email, password,
 *                                 preferences, log out, delete
 *
 * Two, because those are the two with something in them today. A
 * Notifications or Privacy page would hold one switch each (the newsletter,
 * recommendations), and both already sit under Preferences in Settings.
 *
 * Pure, so tests/account-hub.test.ts asks it about every address.
 */

export const ACCOUNT_TABS = [
  { key: "overview", label: "Overview", href: "/account" },
  { key: "settings", label: "Settings", href: "/account/settings" },
] as const

export type AccountTabKey = (typeof ACCOUNT_TABS)[number]["key"]

/** Where signing in sends somebody who opened one of these pages signed out. */
export function accountLoginPath(href: string): string {
  return `/login?next=${encodeURIComponent(href)}`
}

/** The tab an address is, as an index into ACCOUNT_TABS: a page under Settings is Settings, anything else under /account is Overview. */
export function accountTabFor(pathname: string | null | undefined): number {
  const path = (pathname || "").replace(/\/+$/, "") || "/"
  for (let i = ACCOUNT_TABS.length - 1; i > 0; i--) {
    const href = ACCOUNT_TABS[i].href
    if (path === href || path.startsWith(`${href}/`)) return i
  }
  return 0
}

/**
 * THE PROFILE COLUMN'S SIDE PADDING (app/account/layout.tsx), which the
 * phone's own bar (components/account/account-hub.tsx) steps out of to run
 * edge to edge. Written once here, read by both, so the two never disagree.
 */
export const ACCOUNT_GUTTER_LEFT = "max(1rem, env(safe-area-inset-left, 0px))"
export const ACCOUNT_GUTTER_RIGHT = "max(1rem, env(safe-area-inset-right, 0px))"
