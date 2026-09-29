"use client"

import Link from "next/link"

/**
 * Light row of links for signed-in shop surfaces on a computer. The black
 * marketing footer stays off /explore when you are logged in; this is the
 * small strip that still sits at the bottom like the old explore footer.
 */
const LINKS = [
  { label: "Community", href: "mailto:team@storelib.com?subject=Community" },
  { label: "Affiliates", href: "mailto:team@storelib.com?subject=Affiliate%20Program" },
  { label: "Support", href: "/help" },
  { label: "Careers", href: "mailto:team@storelib.com?subject=Careers" },
] as const

export function ShopCompactFooter() {
  return (
    <footer
      className="hidden border-t border-[#e5e7eb] bg-[#f8f9fa] md:block"
      data-shop-compact-footer=""
      aria-label="Site links"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-5 sm:px-6 lg:px-8">
        {LINKS.map((l) =>
          l.href.startsWith("mailto:") ? (
            <a
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#374151]"
            >
              {l.label}
            </a>
          ) : (
            <Link
              key={l.label}
              href={l.href}
              className="text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#374151]"
            >
              {l.label}
            </Link>
          ),
        )}
      </div>
    </footer>
  )
}
