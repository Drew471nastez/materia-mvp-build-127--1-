import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * The Products area's own pages, as a row of tabs under the page's bar:
 * Products and Coupons, the two with a backend behind them. Underlined rather
 * than filled, so it cannot be read as one more set of the list's views
 * (Active, All, Archived), which are filled tabs inside the card below it.
 *
 * No hooks, so the loading skeletons draw the same row at the same size.
 */
const TABS = [
  { key: "products", href: "/app/products", label: "Products" },
  { key: "coupons", href: "/app/coupons", label: "Coupons" },
] as const

export type ProductsArea = (typeof TABS)[number]["key"]

export function ProductsSubnav({ active, className }: { active: ProductsArea; className?: string }) {
  return (
    <nav aria-label="Products area" className={cn("flex gap-6 border-b border-[#e3e5e8]", className)}>
      {TABS.map((tab) => {
        const on = tab.key === active
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "relative -mb-px flex h-11 items-center text-[15px] font-medium transition-colors duration-100 md:h-10 md:text-[14px]",
              on
                ? "text-[#1a1a2e] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[#1a1a2e]"
                : "text-[#6b7280] hover:text-[#1a1a2e]",
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
