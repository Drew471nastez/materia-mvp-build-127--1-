"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

/**
 * ===========================================================================
 *  WHAT IS LEFT OF THE SIDEBAR
 * ===========================================================================
 * The library had a 256px sidebar of its own, and on a phone that sidebar was
 * also the page's header. Which meant /library carried a completely different
 * shell from the rest of the platform: its own bar, its own logo, its own
 * scroll container, no platform header and no footer.
 *
 * Most of what that sidebar held is already in the platform header two
 * centimetres above it: Discover, Dashboard, Settings, Log out, the wishlist
 * and the library itself. A second copy of a navigation is not navigation, it
 * is a choice about which of two identical things to press.
 *
 * What is NOT in the header is the library's own four places. They are a row
 * of pills, which is the shape this product already uses for "pick one of
 * these" on Explore, rather than a second sidebar wearing a different hat.
 */
const TABS = [
  { href: "/library", label: "Overview" },
  { href: "/library/my-downloads", label: "Downloads" },
  { href: "/library/wishlist", label: "Wishlist" },
  { href: "/library/settings", label: "Settings" },
] as const

export function LibraryTabs() {
  const pathname = usePathname()

  return (
    /*
      One row at every width, scrolling sideways when it does not fit, the
      same as the category pills. `w-max` with auto margins centres nothing
      here because the row is left-aligned with the page, but it does stop the
      row stretching its items.
    */
    <nav
      aria-label="Library"
      className="mb-6 -mx-1 overflow-x-auto px-1 py-0.5 scrollbar-hide [mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-16px),transparent_100%)] sm:[mask-image:none]"
    >
      <div className="flex w-max items-center gap-2">
        {TABS.map((tab) => {
          /* Overview is the only one that is a prefix of the others. */
          const isActive =
            tab.href === "/library" ? pathname === "/library" : pathname.startsWith(tab.href)

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3.5 py-2 text-sm font-medium transition-colors duration-150 ${
                isActive
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-500 hover:border-neutral-300 hover:text-neutral-800"
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
