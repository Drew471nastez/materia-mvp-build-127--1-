/**
 * ===========================================================================
 *  THE HELP CENTER'S BAND, AND EACH TOPIC'S MARK
 * ===========================================================================
 * Every Help Center page opens on the same band: Storelib's ink with two
 * soft shapes in it, "Help Center" with Storelib's mark, and the search, so
 * somebody can ask from any page. The home page adds "How can we help you?";
 * a topic or an article keeps the band short.
 *
 * Each topic has its own plain line icon on a small white tile, in ink, the
 * same on the home page's cards and on the topic's own page.
 */
import type { ReactNode } from "react"
import { Package, Flag, Receipt, PanelsTopLeft, Mail, CreditCard, FileText, Truck, MessageCircleQuestion, type LucideIcon } from "lucide-react"
import { HelpSearch } from "./help-search"
import { cn } from "@/lib/utils"

/** The width every Help Center page is laid out in. */
export const HELP_WIDTH = "mx-auto w-full max-w-[1080px] px-4 sm:px-6 lg:px-8"

const TOPIC_ICONS: Record<string, LucideIcon> = {
  "getting-started": Flag,
  products: Package,
  "orders-and-payouts": Receipt,
  "website-builder": PanelsTopLeft,
  email: Mail,
  "account-and-billing": CreditCard,
  policies: FileText,
  "physical-products": Truck,
  questions: MessageCircleQuestion,
}

export function TopicIcon({ slug, size = 44 }: { slug: string; size?: number }) {
  const Icon = TOPIC_ICONS[slug] ?? MessageCircleQuestion
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-[10px] border border-[#e8eaed] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.05)]"
      data-help-topic-icon={slug}
    >
      <Icon style={{ width: size * 0.44, height: size * 0.44 }} strokeWidth={1.6} />
    </span>
  )
}

/** `query`: the search already asked (the results page), kept in the field. */
export function HelpHero({ home = false, query, children }: { home?: boolean; query?: string; children?: ReactNode }) {
  return (
    /*
      Not overflow-hidden: the search's results open below the band and over the page. The shapes are clipped by their
      own box instead, and z-20 keeps the results above the cards that follow.
    */
    <header className="relative isolate z-20 bg-[#1a1a2e] text-white" data-help-hero={home ? "home" : "page"}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Two soft shapes, a lighter ink and a quiet slate, low and to the right: depth without a picture to load. */}
        <svg className="h-full w-full" preserveAspectRatio="xMaxYMid slice" viewBox="0 0 1200 360">
          <path d="M760 360 C 820 230 900 150 1040 120 C 1130 100 1200 40 1200 0 L 1200 360 Z" fill="#24243c" />
          <path d="M980 360 C 1010 290 1070 250 1130 240 C 1170 232 1200 210 1200 190 L 1200 360 Z" fill="#2f2f4a" />
        </svg>
      </div>
      <div className={cn(HELP_WIDTH, home ? "pb-14 pt-8 sm:pb-20 sm:pt-10" : "pb-7 pt-1 sm:pb-9 sm:pt-2")}>
        {home ? <h1 className="mt-4 text-[30px] font-bold leading-tight tracking-[-0.02em] sm:mt-8 sm:text-[40px]">How can we help you?</h1> : null}
        <div className={cn("max-w-[760px]", home ? "mt-6" : "mt-6")}>
          <HelpSearch size={home ? "large" : "compact"} tone="dark" defaultQuery={query} />
        </div>
        {children}
      </div>
    </header>
  )
}
