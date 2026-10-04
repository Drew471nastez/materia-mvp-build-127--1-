/**
 * The library's tabs and the addresses they live at, in a module of their
 * own with no "use client". The pills (library-tabs.tsx) are a client
 * component, and a server file that imports a plain value from a client
 * module is handed a reference, not the list. The skeletons are drawn on
 * the server too (library-skeletons.tsx), so the list lives here.
 *
 * THE LIBRARY IS INSIDE THE PROFILE NOW (lib/library/paths.ts): these are
 * the sub pills under the profile's Library pill, in the order the owner
 * gave them: Products, Courses, Wishlist, Reviews, Receipts.
 *
 * COMMUNITIES, WHILE THEY ARE ON. "Add a Communities pill when the
 * communities switch is on": the communities you run and are in, after
 * Courses, the other thing you bought into rather than downloaded. It draws
 * the same list as the profile's own Communities pill (components/account/
 * account-communities-body.tsx). The switch is read on the server by the
 * library's layout and handed to the pills, so the list here is always the
 * five and the sixth is added by `libraryTabs(true)`.
 *
 * NO MEMBERSHIPS PILL. The owner: memberships are communities. A paid
 * community's members find it under Communities; a membership bought on its
 * own is a row of Products, labelled Membership (components/library/
 * library-memberships.tsx), and its page still opens at
 * /account/library/memberships/<id>.
 */
import { LIBRARY_COMMUNITIES, LIBRARY_COURSES, LIBRARY_HOME, LIBRARY_RECEIPTS, LIBRARY_REVIEWS, LIBRARY_WISHLIST } from "@/lib/library/paths"

export const LIBRARY_TABS = [
  { href: LIBRARY_HOME, label: "Products" },
  { href: LIBRARY_COURSES, label: "Courses" },
  { href: LIBRARY_WISHLIST, label: "Wishlist" },
  { href: LIBRARY_REVIEWS, label: "Reviews" },
  { href: LIBRARY_RECEIPTS, label: "Receipts" },
] as const

export type LibraryTab = { readonly href: string; readonly label: string }

export const COMMUNITIES_TAB: LibraryTab = { href: LIBRARY_COMMUNITIES, label: "Communities" }

/** The tabs to draw: Communities after Courses only while the switch is on. */
export function libraryTabs(communities = false): LibraryTab[] {
  if (!communities) return [...LIBRARY_TABS]
  return [LIBRARY_TABS[0], LIBRARY_TABS[1], COMMUNITIES_TAB, ...LIBRARY_TABS.slice(2)]
}

export function cleanPath(path: string | null | undefined): string {
  return (path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"
}

/**
 * The screens the row is drawn on: exactly the tabs' own addresses, the
 * Communities one included (with communities off its page is a 404 and no
 * pill leads there).
 */
export function showsLibraryTabs(pathname: string | null): boolean {
  const path = cleanPath(pathname)
  return path === LIBRARY_COMMUNITIES || LIBRARY_TABS.some((t) => t.href === path)
}

const PRODUCT = new RegExp(`^${LIBRARY_HOME.replace(/\//g, "\\/")}\\/products\\/[^/]+$`)

/** One purchase opened from the list. */
export function isLibraryProduct(pathname: string | null): boolean {
  return PRODUCT.test(cleanPath(pathname))
}
