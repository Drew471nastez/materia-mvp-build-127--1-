"use client"

/**
 * ===========================================================================
 *  A CATEGORY PAGE WHILE IT LOADS IS THE CATEGORY PAGE
 * ===========================================================================
 * The loading screen drew a left-aligned grey heading, five grey pills, nine
 * cards of its own shape and a pager, in a 1400px container on #f8f9fa, over
 * a page that was centred, 1270px wide and white. Nothing was where it would
 * be.
 *
 * Now it is the page with the products missing, drawn from the page's own
 * parts (./category-frame): the back link, the heading (the subcategory's
 * name when the address has one), the line under it, the search field, the
 * real pills with the one from the address pressed, the category's own pill
 * and Filters. They paint at once, because they are not placeholders for
 * anything. Only the cards are ProductCardSkeleton, and the route's
 * loading.tsx holds them back for 200ms (`skeleton-deferred`), so a quick
 * page never shows a grey card.
 *
 * scripts/check-explore-browse.mjs lays this over the real page at 390px and
 * 1280px and measures that every part sits in the same place.
 */

import { useParams, useSearchParams } from "next/navigation"
import { SlidersHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProductCardSkeleton } from "./product-card-skeleton"
import {
  CategoryControls,
  CategoryHero,
  FILTERS_BUTTON,
  FILTERS_REST,
  PICKER_PILL,
  PILL_OFF,
  PickerPillFace,
  categoryInfo,
  validSub,
} from "./category-frame"

const noop = () => {}

export function CategorySkeleton({
  category,
  sub,
  cards = 6,
  gridClassName = "",
}: {
  category: string
  sub: string | null
  cards?: number
  gridClassName?: string
}) {
  const info = categoryInfo(category)
  const on = validSub(info, sub)
  const title = (on && info.subcategories.find((s) => s.id === on)?.label) || info.label
  return (
    <div className="space-y-8" data-category-skeleton="" aria-busy="true">
      {/* Inert: a word typed here would be lost when the page replaces it. */}
      <div inert>
        <CategoryHero title={title} description={info.description} query="" onQueryChange={noop} />
      </div>
      <section className="mt-2">
        <div inert>
          <CategoryControls
            info={info}
            sub={on}
            picker={<span className={cn(PICKER_PILL, PILL_OFF)}><PickerPillFace label={info.label} /></span>}
            filters={
              <span data-skeleton-filters="" className={cn(FILTERS_BUTTON, FILTERS_REST)}>
                <SlidersHorizontal className="h-4 w-4" />
                <span className="hidden sm:inline">Filters</span>
              </span>
            }
          />
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

/** The route's loading screen: the category and subcategory come from the address it is loading. */
export function CategoryLoading() {
  const params = useParams<{ category?: string }>()
  const search = useSearchParams()
  return <CategorySkeleton category={params?.category ?? ""} sub={search?.get("sub") ?? null} gridClassName="skeleton-deferred" />
}
