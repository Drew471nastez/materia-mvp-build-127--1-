/**
 * ===========================================================================
 *  THE PROFILE'S OWN PAGES
 * ===========================================================================
 * /account is the buyer's profile: who they are on Storelib and what they
 * have there, with the account's settings one screen away. "It needs to be
 * the account with multiple subpages there, such as settings, overview.
 * Like a profile, not directly changing the name or profile photo."
 *
 *   Overview   /account           the person, the library in numbers, the
 *                                 newest purchases, and selling
 *   Settings   /account/settings  photo, name and bio; email and password;
 *                                 preferences; log out; delete
 *
 * NO ROW OF PILLS BETWEEN THE TWO any more. They were two pills under an
 * Edit profile button that went to the same place, and Settings has its own
 * section pills now (components/account/account-settings.tsx). This list is
 * what tells a path which of the two pages it is, which is all the hub and
 * the skeleton need from it.
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

/** Which page an address is, as an index into ACCOUNT_TABS: anything under /account/settings is Settings, anything else under /account is Overview. */
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
 * skeleton reserves too (components/account/account-skeleton.tsx). Written
 * once here, read by both, so the two never disagree.
 */
export const ACCOUNT_GUTTER_LEFT = "max(1rem, env(safe-area-inset-left, 0px))"
export const ACCOUNT_GUTTER_RIGHT = "max(1rem, env(safe-area-inset-right, 0px))"
