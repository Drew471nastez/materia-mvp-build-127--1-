/**
 * The library's tabs and the addresses they live at, in a module of their
 * own with no "use client". The pills (library-tabs.tsx) are a client
 * component, and a server file that imports a plain value from a client
 * module is handed a reference, not the list. The skeletons are drawn on
 * the server too (library-skeletons.tsx), so the list lives here.
 */
export const LIBRARY_TABS = [
  { href: "/library", label: "Products" },
  { href: "/library/courses", label: "Courses" },
  { href: "/library/memberships", label: "Memberships" },
  { href: "/library/reviews", label: "Reviews" },
  { href: "/library/receipts", label: "Receipts" },
  { href: "/library/wishlist", label: "Wishlist" },
] as const

/**
 * COMMUNITIES IS A TAB ONLY WHILE COMMUNITIES ARE SWITCHED ON. The layout
 * reads the switch on the server and hands it to the pills, so the row is
 * right in the first paint; the list above stays the one every other screen
 * reads, and this one tab is put after Memberships when it belongs.
 */
export const COMMUNITIES_TAB = { href: "/library/communities", label: "Communities" } as const

export type LibraryTab = { readonly href: string; readonly label: string }

/** The tabs to draw: the list, with Communities after Memberships when the switch is on. */
export function libraryTabs(communities: boolean): LibraryTab[] {
  const tabs: LibraryTab[] = [...LIBRARY_TABS]
  if (!communities) return tabs
  const at = tabs.findIndex((t) => t.href === "/library/memberships")
  tabs.splice(at < 0 ? tabs.length : at + 1, 0, COMMUNITIES_TAB)
  return tabs
}

export function cleanPath(path: string | null | undefined): string {
  return (path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"
}

/** The screens the row is drawn on: exactly the tabs' own addresses. */
export function showsLibraryTabs(pathname: string | null): boolean {
  const path = cleanPath(pathname)
  return LIBRARY_TABS.some((t) => t.href === path) || path === COMMUNITIES_TAB.href
}

/** One purchase opened from the list. */
export function isLibraryProduct(pathname: string | null): boolean {
  return /^\/library\/products\/[^/]+$/.test(cleanPath(pathname))
}
