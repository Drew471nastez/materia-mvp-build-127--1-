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

export function cleanPath(path: string | null | undefined): string {
  return (path || "").split(/[?#]/)[0].replace(/\/+$/, "") || "/"
}

/** The screens the row is drawn on: exactly the tabs' own addresses. */
export function showsLibraryTabs(pathname: string | null): boolean {
  const path = cleanPath(pathname)
  return LIBRARY_TABS.some((t) => t.href === path)
}

/** One purchase opened from the list. */
export function isLibraryProduct(pathname: string | null): boolean {
  return /^\/library\/products\/[^/]+$/.test(cleanPath(pathname))
}
