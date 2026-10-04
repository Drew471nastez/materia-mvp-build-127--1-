/**
 * ===========================================================================
 *  YOUR OWN PROFILE'S PILLS, AND WHICH ONE AN ADDRESS IS
 * ===========================================================================
 * "/account becomes the profile center: it is MY profile page ... plus
 * owner extras: pill navigation for Activity, Communities, Library (with
 * sub pills: Products, Courses, Memberships, Wishlist, Reviews, Receipts),
 * Edit profile, Settings."
 *
 *   Activity       /account                 what everybody sees first
 *   Communities    /account/communities     the ones you run and are in
 *   Library        /account/library/...     what you bought (sub pills)
 *   Edit profile   /account/settings        photo, cover, name, bio
 *   Settings       /account/settings?section=account
 *
 * Communities only while the communities switch is on. Pure, so the pills,
 * the hub and tests/account-center.test.ts ask the same questions.
 */
import { ACCOUNT_COMMUNITIES, LIBRARY_HOME } from "@/lib/library/paths"

export type OwnerPillKey = "activity" | "communities" | "library" | "edit" | "settings"

export interface OwnerPill {
  key: OwnerPillKey
  label: string
  href: string
}

export function ownerPillLinks(communities: boolean): OwnerPill[] {
  return [
    { key: "activity", label: "Activity", href: "/account" },
    ...(communities ? [{ key: "communities" as const, label: "Communities", href: ACCOUNT_COMMUNITIES }] : []),
    { key: "library", label: "Library", href: LIBRARY_HOME },
    { key: "edit", label: "Edit profile", href: "/account/settings" },
    { key: "settings", label: "Settings", href: "/account/settings?section=account" },
  ]
}

const clean = (p: string | null | undefined) => (p || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"

/** The pill an address belongs to, or null for one that is not the profile's. */
export function ownerPillFor(pathname: string | null | undefined, section?: string | null): OwnerPillKey | null {
  const path = clean(pathname)
  if (path === "/account") return "activity"
  if (path === ACCOUNT_COMMUNITIES || path.startsWith(`${ACCOUNT_COMMUNITIES}/`)) return "communities"
  if (path === LIBRARY_HOME || path.startsWith(`${LIBRARY_HOME}/`)) return "library"
  if (path === "/account/settings" || path.startsWith("/account/settings/")) return section && section !== "profile" ? "settings" : "edit"
  return null
}

/**
 * Whether the profile's own header (cover, photo, name, the pills) is drawn
 * over this address. Over the lists, yes. Not over Settings, which has its
 * own top row and its own photo, and not over one purchase, a course's
 * player or a membership's page opened from the library: each has its own
 * way back and needs the room.
 */
export function showsProfileHeader(pathname: string | null | undefined): boolean {
  const path = clean(pathname)
  const pill = ownerPillFor(path)
  if (pill === null || pill === "edit" || pill === "settings") return false
  if (pill === "library") {
    const rest = path.slice(LIBRARY_HOME.length)
    /* The library's lists are one segment deep at most; a purchase, a course, a membership is two. */
    return rest.split("/").filter(Boolean).length <= 1
  }
  return true
}
