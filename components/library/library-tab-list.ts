/**
 * The library's tabs and the addresses they live at, in a module of their
 * own with no "use client". The pills (library-tabs.tsx) are a client
 * component, and a server file that imports a plain value from a client
 * module is handed a reference, not the list. The skeletons are drawn on
 * the server too (library-skeletons.tsx), so the list lives here.
 *
 * THE LIBRARY IS INSIDE THE PROFILE NOW (lib/library/paths.ts): these are
 * the sub pills under the profile's Library pill, in the order the owner
 * gave them: Products, Courses, Memberships, Wishlist, Reviews, Receipts.
 * Communities is not one of them any more; it is a pill of the profile
 * itself (/account/communities), beside Activity.
 */
import { LIBRARY_COURSES, LIBRARY_HOME, LIBRARY_MEMBERSHIPS, LIBRARY_RECEIPTS, LIBRARY_REVIEWS, LIBRARY_WISHLIST } from "@/lib/library/paths"

export const LIBRARY_TABS = [
  { href: LIBRARY_HOME, label: "Products" },
  { href: LIBRARY_COURSES, label: "Courses" },
  { href: LIBRARY_MEMBERSHIPS, label: "Memberships" },
  { href: LIBRARY_WISHLIST, label: "Wishlist" },
  { href: LIBRARY_REVIEWS, label: "Reviews" },
  { href: LIBRARY_RECEIPTS, label: "Receipts" },
] as const

export type LibraryTab = { readonly href: string; readonly label: string }

/** The tabs to draw. */
export function libraryTabs(): LibraryTab[] {
  return [...LIBRARY_TABS]
}

export function cleanPath(path: string | null | undefined): string {
  return (path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"
}

/** The screens the row is drawn on: exactly the tabs' own addresses. */
export function showsLibraryTabs(pathname: string | null): boolean {
  const path = cleanPath(pathname)
  return LIBRARY_TABS.some((t) => t.href === path)
}

const PRODUCT = new RegExp(`^${LIBRARY_HOME.replace(/\//g, "\\/")}\\/products\\/[^/]+$`)

/** One purchase opened from the list. */
export function isLibraryProduct(pathname: string | null): boolean {
  return PRODUCT.test(cleanPath(pathname))
}
