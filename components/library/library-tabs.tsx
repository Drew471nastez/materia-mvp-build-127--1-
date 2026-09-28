"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { OpenInApp } from "./open-in-app"

/**
 * ===========================================================================
 *  THE LIBRARY'S OWN PLACES
 * ===========================================================================
 * The library was a sidebar once, then a row of pills: Overview, Downloads,
 * Wishlist, Settings. What a buyer comes here for is the things they bought,
 * and those come in three kinds that live on three screens: products (files
 * to download), courses (/library/courses) and memberships
 * (/library/memberships). Then what they did about them: reviews and
 * receipts. Then what they have not bought yet: the wishlist.
 *
 * So the heading is "Library" and under it one row of tabs, underlined like
 * sections of one place rather than pills, because pills on this product are
 * filters (Explore's categories, the creator chips below). Settings is not a
 * tab: it is the account (/account), which the avatar in the header opens.
 *
 * The row is on the library's list screens only. A product, a course player
 * or a membership opened from it has its own back link and needs the room.
 */
export const LIBRARY_TABS = [
  { href: "/library", label: "Products" },
  { href: "/library/courses", label: "Courses" },
  { href: "/library/memberships", label: "Memberships" },
  { href: "/library/reviews", label: "Reviews" },
  { href: "/library/receipts", label: "Receipts" },
  { href: "/library/wishlist", label: "Wishlist" },
] as const

/** The screens the row is drawn on: exactly the tabs' own addresses. */
export function showsLibraryTabs(pathname: string | null): boolean {
  const path = (pathname || "").replace(/\/+$/, "") || "/"
  return LIBRARY_TABS.some((t) => t.href === path)
}

export function LibraryTabs() {
  const pathname = usePathname()
  if (!showsLibraryTabs(pathname)) {
    /* Still offered on a product opened from the library: that is where a phone most wants the app. */
    return <OpenInApp className="mb-4" />
  }
  const path = (pathname || "").replace(/\/+$/, "")

  return (
    <header data-library-header="" className="mb-5 sm:mb-6">
      <h1 className="text-[24px] font-bold tracking-[-0.01em] text-[#1a1a2e] sm:text-[28px]">Library</h1>
      <nav aria-label="Library" className="relative -mx-4 mt-3 sm:mx-0 sm:mt-4">
        <div className="overflow-x-auto px-4 scrollbar-hide sm:px-0">
          <div className="flex w-max min-w-full items-stretch gap-5 border-b border-[#e4e7ec] sm:gap-7">
            {LIBRARY_TABS.map((tab) => {
              const active = tab.href === path
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  data-library-tab={tab.label}
                  className={`relative -mb-px inline-flex h-11 shrink-0 items-center whitespace-nowrap border-b-2 text-[14px] font-medium transition-colors duration-150 ${
                    active ? "border-[#1a1a2e] text-[#1a1a2e]" : "border-transparent text-[#6b7280] hover:text-[#1a1a2e]"
                  }`}
                >
                  {tab.label}
                </Link>
              )
            })}
          </div>
        </div>
      </nav>
      <OpenInApp className="mt-4" />
    </header>
  )
}
