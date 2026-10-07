/**
 * ===========================================================================
 *  YOUR OWN PROFILE'S PILLS, AND WHICH ONE AN ADDRESS IS
 * ===========================================================================
 * "/account becomes the profile center: it is MY profile page ... plus
 * owner extras: pill navigation for Activity, Communities, Library (with
 * its own sub pills), Edit profile, Settings."
 *
 *   Activity       /account                 what everybody sees first
 *   Communities    /account/communities     the ones you run and are in
 *   Library        /account/library/...     what you bought, its own page
 *   Settings       /account/settings?section=profile (same tab as Edit profile)
 *
 * EDIT PROFILE IS NOT A PILL ANY MORE. The owner asked for it as a real
 * button on the cover, beside the cover's own camera button
 * (components/profile/profile-hero.tsx), so it sits where the thing it
 * edits is. It still opens /account/settings, at the profile's fields.
 *
 * Communities only while the communities switch is on. Pure, so the pills,
 * the hub, the site header and tests/account-center.test.ts ask the same
 * questions.
 *
 * A CREATOR HAS NO ACTIVITY PILL. The owner: "In creator pages or creator
 * profiles there should be no activity." Somebody with a live store keeps
 * Communities, Library and Settings, and /account itself opens on their
 * Communities (app/account/page.tsx), so the Communities pill is /account
 * for them and lights there.
 */
import { ACCOUNT_COMMUNITIES, LIBRARY_HOME } from "@/lib/library/paths"

export type OwnerPillKey = "activity" | "communities" | "library" | "settings"

/** Where the cover's Edit profile button goes: Settings, opened on the profile's own fields. */
export const EDIT_PROFILE_HREF = "/account/settings"

export interface OwnerPill {
  key: OwnerPillKey
  label: string
  href: string
}

export function ownerPillLinks(communities: boolean, creator = false): OwnerPill[] {
  return [
    ...(creator ? [] : [{ key: "activity" as const, label: "Activity", href: "/account" }]),
    ...(communities ? [{ key: "communities" as const, label: "Communities", href: creator ? "/account" : ACCOUNT_COMMUNITIES }] : []),
    { key: "library", label: "Library", href: LIBRARY_HOME },
    { key: "settings", label: "Settings", href: "/account/settings?section=profile" },
  ]
}

const clean = (p: string | null | undefined) => (p || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"

/** The pill an address belongs to, or null for one that is not the profile's. For a creator /account is their Communities. */
export function ownerPillFor(pathname: string | null | undefined, creator = false): OwnerPillKey | null {
  const path = clean(pathname)
  if (path === "/account") return creator ? "communities" : "activity"
  if (path === ACCOUNT_COMMUNITIES || path.startsWith(`${ACCOUNT_COMMUNITIES}/`)) return "communities"
  if (path === LIBRARY_HOME || path.startsWith(`${LIBRARY_HOME}/`)) return "library"
  if (path === "/account/settings" || path.startsWith("/account/settings/")) return "settings"
  return null
}

/**
 * Whether the profile's own header (cover, photo, name, the pills) is drawn
 * over this address: your Activity and your Communities, which are your
 * profile. Not over Settings, which has its own top row and its own photo,
 * and not over the library at all: "Library opens as its own page", with
 * its own title and its sub pills (components/library/library-tabs.tsx),
 * the way Settings is its own page. The pill on the profile still leads
 * there.
 *
 * The site header reads the same answer: on a phone, over exactly these
 * pages, it is the profile's simple bar (components/platform/
 * platform-header-client.tsx).
 */
export function showsProfileHeader(pathname: string | null | undefined): boolean {
  const pill = ownerPillFor(clean(pathname))
  return pill === "activity" || pill === "communities"
}
