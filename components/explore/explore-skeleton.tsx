"use client"

/**
 * ===========================================================================
 *  EXPLORE WHILE IT LOADS IS EXPLORE
 * ===========================================================================
 * "A weird skeleton loading structure that doesn't match the actual page."
 * It drew a banner the page lost months ago, a heading and a search box in a
 * section header that is not there, a row of four grey pills, nine cards, a
 * pager, and a second "Browse by Category" board that is also gone, on a
 * white ground where the page is #f8f9fa. Every one of those blocks moved or
 * vanished when the real page arrived.
 *
 * Now it is the page, drawn from the same parts, with only the products
 * missing:
 *
 *   the hero is the real ExploreHero, so the heading and the search field
 *   are where they will be, to the pixel
 *
 *   the category pills are the real labels in the real classes (All, not
 *   pressed-looking grey bars), with More and Filters beside them
 *
 *   the cards are ProductCardSkeleton, which is a ProductCard with the words
 *   taken out: the same border, the same 16:9 picture, the same rows
 *
 * The chrome paints at once, because it is not a placeholder for anything.
 * Only the card grid is held back (`gridClassName`, which the route's
 * loading.tsx sets to `skeleton-deferred`), so a page that arrives within
 * 200ms never shows a grey card at all.
 *
 * scripts/check-explore-loading.mjs renders this and the real page side by
 * side and measures that the hero, the pill row and the first cards sit in
 * the same places.
 */

import { SlidersHorizontal } from "lucide-react"
import { ExploreHero } from "./explore-hero"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { CATEGORY_PILLS, PILL_EMOJI } from "./explore-page-client"
import { Chevron } from "./category-browser"

const noop = () => {}

/* The classes the page's own pills, More and Filters wear at rest. */
const PILL =
  "inline-flex items-center gap-1.5 shrink-0 px-3.5 py-2 rounded-full text-sm font-medium select-none whitespace-nowrap border"
const PILL_ON = "bg-[#e2e4e8] text-neutral-900 border-[#d7dadf] shadow-[inset_0_1px_1.5px_rgba(15,23,42,0.07),inset_0_-1px_0_rgba(255,255,255,0.45)]"
const PILL_OFF = "bg-white text-neutral-500 border-neutral-200"

export function ExploreSkeleton({ cards = 6, gridClassName = "" }: { cards?: number; gridClassName?: string }) {
  return (
    <div className="space-y-8" data-explore-skeleton="" aria-busy="true">
      {/* Inert: a word typed here would be lost when the page replaces it. */}
      <div inert>
        <ExploreHero query="" onQueryChange={noop} />
      </div>

      <section className="mt-2 scroll-mt-28">
        <div className="flex flex-col gap-4 mb-6 relative">
          <div className="flex items-center gap-2 sm:gap-3" inert>
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide -mx-1 pl-1 pr-5 py-0.5 [mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-20px),transparent_100%)]">
              <div data-skeleton-pills-row="" className="flex w-max mx-auto items-center gap-2">
                {CATEGORY_PILLS.map((cat, i) => (
                  <span key={cat.id} className={`${PILL} ${i === 0 ? PILL_ON : PILL_OFF}`}>
                    <span aria-hidden className="text-[15px] leading-none">{PILL_EMOJI[cat.id]}</span>
                    {cat.label}
                  </span>
                ))}
                <span className={`inline-flex items-center gap-1 shrink-0 pl-3.5 pr-2.5 py-2 rounded-full text-sm font-medium select-none whitespace-nowrap border ${PILL_OFF}`}>
                  More
                  <Chevron dir="down" className="h-3.5 w-3.5 opacity-70" />
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 relative">
              <span data-skeleton-filters="" className="inline-flex items-center justify-center gap-2 h-[38px] px-3.5 sm:px-4 rounded-[10px] text-sm font-medium border select-none bg-white text-neutral-500 border-neutral-200 shadow-[0_1px_2px_rgba(15,23,42,0.06),0_1px_1px_rgba(15,23,42,0.04)]">
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Filters</span>
              </span>
            </div>
          </div>
        </div>

        <div data-skeleton-grid="" className={`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${gridClassName}`}>
          {Array.from({ length: cards }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </section>
    </div>
  )
}
