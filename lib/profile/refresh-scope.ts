/**
 * WHO A PULL IS TALKING TO. A pull at the top of a profile asks the server
 * for the page again and tells the parts with data of their own to read it
 * again, by name (components/ui/pull-to-refresh.tsx: the scope goes out as
 * one event, and whoever owns that scope hands the event a promise, so the
 * spinner turns until the new list is on screen).
 *
 * The names live here, away from both sides, so the page that dispatches and
 * the list that answers cannot drift apart, and a server component can read
 * one without importing a client module.
 */

/** /account, the owner's own profile (components/account/account-hub.tsx). */
export const ACCOUNT_REFRESH_SCOPE = "account-profile"

/** /@handle, somebody's profile (components/profile/member-profile-page.tsx). */
export const MEMBER_REFRESH_SCOPE = "member-profile"
