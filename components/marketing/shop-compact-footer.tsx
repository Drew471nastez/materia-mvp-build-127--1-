"use client"

import Link from "next/link"

/**
 * Thin link row for signed-in Explore. Real routes only — no mailto traps.
 */
const LINKS = [
  { label: "Blog", href: "/blog" },
  { label: "Help", href: "/help" },
  { label: "Terms", href: "/terms" },
  { label: "Privacy", href: "/privacy" },
] as const

export function ShopCompactFooter() {
  return (
    <footer
      className="hidden border-t border-[#e5e7eb] bg-[#f8f9fa] md:block"
      data-shop-compact-footer=""
      aria-label="Site links"
    >
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-5 gap-y-1.5 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
        {LINKS.map((l) => (
          <Link
            key={l.label}
            href={l.href}
            className="text-[12px] font-normal text-[#6b7280] transition-colors hover:text-[#374151]"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
