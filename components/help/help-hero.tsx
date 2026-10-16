/**
 * ===========================================================================
 *  THE HELP CENTER'S BAND, AND EACH TOPIC'S MARK
 * ===========================================================================
 * Every Help Center page opens on the same band: Storelib's ink with two
 * soft shapes in it, "Help Center" with Storelib's mark, and the search, so
 * somebody can ask from any page. The home page adds "How can we help you?";
 * a topic or an article keeps the band short.
 *
 * Each topic has its own small drawing on a lavender tile, the same on the
 * home page's cards and on the topic's own page.
 */
import Link from "next/link"
import type { ReactNode } from "react"
import { Package, Rocket, Wallet, LayoutTemplate, Mail, CreditCard, ShieldCheck, Truck, LifeBuoy, type LucideIcon } from "lucide-react"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { HelpSearch } from "./help-search"
import { HelpDashboardLink } from "./help-dashboard-link"
import { cn } from "@/lib/utils"

/** The width every Help Center page is laid out in. */
export const HELP_WIDTH = "mx-auto w-full max-w-[1080px] px-4 sm:px-6 lg:px-8"

const TOPIC_ICONS: Record<string, LucideIcon> = {
  "getting-started": Rocket,
  products: Package,
  "orders-and-payouts": Wallet,
  "website-builder": LayoutTemplate,
  email: Mail,
  "account-and-billing": CreditCard,
  policies: ShieldCheck,
  "physical-products": Truck,
  questions: LifeBuoy,
}

export function TopicIcon({ slug, size = 44 }: { slug: string; size?: number }) {
  const Icon = TOPIC_ICONS[slug] ?? LifeBuoy
  return (
    <span aria-hidden style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-xl bg-[#f1ecff] text-[#6d28d9]" data-help-topic-icon={slug}>
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={1.7} />
    </span>
  )
}

/** `query`: the search already asked (the results page), kept in the field. */
export function HelpHero({ home = false, query, children }: { home?: boolean; query?: string; children?: ReactNode }) {
  return (
    <header className="relative isolate overflow-hidden bg-[#1a1a2e] text-white" data-help-hero={home ? "home" : "page"}>
      {/* Two soft shapes, Storelib's violet and a lighter ink, low and to the right: depth without a picture to load. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 1200 360">
        <path d="M760 360 C 820 230 900 150 1040 120 C 1130 100 1200 40 1200 0 L 1200 360 Z" fill="#2a2a46" />
        <path d="M980 360 C 1010 290 1070 250 1130 240 C 1170 232 1200 210 1200 190 L 1200 360 Z" fill="#6d28d9" opacity="0.55" />
        <circle cx="1080" cy="70" r="90" fill="#6d28d9" opacity="0.18" />
      </svg>
      <div className={cn(HELP_WIDTH, home ? "pb-14 pt-8 sm:pb-20 sm:pt-10" : "pb-8 pt-6 sm:pb-10 sm:pt-8")}>
        <div className="flex items-center justify-between gap-4">
          {/* Both 44px tall for a thumb, their padding pulled into the row so the band keeps its height. */}
          <Link href="/help" className="-my-2 inline-flex min-h-11 items-center gap-2 rounded-lg text-[18px] font-semibold tracking-[-0.01em] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/40 sm:text-[20px]">
            Help Center
            <StorelibLogo size={22} alt="" className="rounded-[6px]" />
          </Link>
          <HelpDashboardLink />
        </div>
        {home ? <h1 className="mt-10 text-[30px] font-bold leading-tight tracking-[-0.02em] sm:mt-14 sm:text-[40px]">How can we help you?</h1> : null}
        <div className={cn("max-w-[760px]", home ? "mt-6" : "mt-6 sm:mt-8")}>
          <HelpSearch size={home ? "large" : "compact"} tone="dark" defaultQuery={query} />
        </div>
        {children}
      </div>
    </header>
  )
}
