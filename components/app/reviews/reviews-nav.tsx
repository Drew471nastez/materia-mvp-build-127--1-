"use client"

/**
 * ===========================================================================
 *  REVIEWS: THE AREA'S TABS
 * ===========================================================================
 * Everything about reviews lives under /app/reviews, one tab each:
 *
 *   Overview    /app/reviews             the numbers and what happened lately
 *   Reviews     /app/reviews/list        every review: approve, reply, hide
 *   Requests    /app/reviews/requests    the emails that ask for one
 *   Widgets     /app/reviews/widgets     what the website shows
 *   Analytics   /app/reviews/analytics   how reviews come in over time
 *   Settings    /app/reviews/settings    on or off, moderation, spam, display
 *
 * Import (/app/reviews/import) is a page of the Reviews tab, opened from it.
 *
 * FOR A PAGE IN THIS AREA (the Widgets tab's gallery among them): the layout
 * (app/app/reviews/layout.tsx) draws the scrolling pane, the title and these
 * tabs, so a page draws only its own content, inside REVIEWS_BODY, and
 * reads the tab list from REVIEWS_NAV rather than repeating it. A new tab is
 * one line here. Old addresses keep working: /app/reviews?review=<id> and
 * ?status=pending (the bell, the new review email, the digest) open the
 * Reviews tab on that review or that list.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import * as React from "react"
import { cn } from "@/lib/utils"
import { msg, tt } from "@/lib/i18n/text"

export type ReviewsTabId = "overview" | "reviews" | "requests" | "widgets" | "analytics" | "settings"

export interface ReviewsNavItem {
  id: ReviewsTabId
  href: string
  /** Marked with msg(), translated where it is drawn. */
  label: string
  /** Pages under this tab that are not tabs of their own (Import under Reviews). */
  also?: string[]
}

export const REVIEWS_BASE = "/app/reviews"

export const REVIEWS_NAV: readonly ReviewsNavItem[] = [
  { id: "overview", href: REVIEWS_BASE, label: msg("Overview") },
  { id: "reviews", href: `${REVIEWS_BASE}/list`, label: msg("Reviews"), also: [`${REVIEWS_BASE}/import`] },
  { id: "requests", href: `${REVIEWS_BASE}/requests`, label: msg("Requests") },
  { id: "widgets", href: `${REVIEWS_BASE}/widgets`, label: msg("Widgets") },
  { id: "analytics", href: `${REVIEWS_BASE}/analytics`, label: msg("Analytics") },
  { id: "settings", href: `${REVIEWS_BASE}/settings`, label: msg("Settings") },
]

/** Where each tab lives, by id, for a link from another page: reviewsHref("settings"). */
export function reviewsHref(id: ReviewsTabId): string {
  return REVIEWS_NAV.find((t) => t.id === id)?.href ?? REVIEWS_BASE
}

/** The tab a path belongs to. Overview only for /app/reviews itself. */
export function reviewsTabFor(pathname: string): ReviewsTabId {
  const path = pathname.replace(/\/+$/, "") || "/"
  for (const t of REVIEWS_NAV) {
    if (t.id === "overview") continue
    if ([t.href, ...(t.also ?? [])].some((h) => path === h || path.startsWith(`${h}/`))) return t.id
  }
  return "overview"
}

/** The column every page in the area draws in: the list's width, the /app gutter, room under the last row on a phone. */
export const REVIEWS_BODY = "mx-auto max-w-[1200px] app-gutter pb-24 pt-1 md:pb-10"

const TAB =
  "relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3 text-[14px] font-medium outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 md:h-9 md:rounded-lg md:text-[13.5px] [-webkit-tap-highlight-color:transparent]"

/**
 * The tabs, under the title. A row that scrolls sideways on a phone, the
 * open tab kept in view; the number beside Reviews is what waits for the
 * store, in the quiet accent the Emails tabs use for new messages.
 */
export function ReviewsNav({ pending = 0, className }: { pending?: number; className?: string }) {
  const pathname = usePathname() ?? REVIEWS_BASE
  const active = reviewsTabFor(pathname)
  const stripRef = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    const strip = stripRef.current
    const el = strip?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!strip || !el) return
    const left = el.offsetLeft - strip.offsetLeft
    if (left < strip.scrollLeft) strip.scrollLeft = left - 8
    else if (left + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = left + el.offsetWidth - strip.clientWidth + 8
  }, [active])
  return (
    <nav ref={stripRef} aria-label={tt("Reviews")} className={cn("orders-strip -mx-1 flex items-center gap-0.5 overflow-x-auto px-1", className)} data-reviews-nav="">
      {REVIEWS_NAV.map((t) => {
        const on = t.id === active
        return (
          <Link
            key={t.id}
            href={t.href}
            prefetch
            aria-current={on ? "page" : undefined}
            className={cn(TAB, on ? "bg-[#e8e9ec] text-[#1a1a2e]" : "text-[#4b5563] hover:bg-[#eef0f2] active:bg-[#e8e9ec]")}
            data-reviews-tab={t.id}
          >
            {tt(t.label)}
            {t.id === "reviews" && pending > 0 ? (
              <span className="tabular-nums text-[#8b5cf6]" data-reviews-pending={pending}>
                {pending > 99 ? "99+" : pending}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
