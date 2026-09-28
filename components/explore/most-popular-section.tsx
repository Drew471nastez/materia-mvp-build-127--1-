"use client"

import { useMemo } from "react"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { ProductCard } from "./product-card"

interface MostPopularSectionProps {
  products: any[]
}

export function MostPopularSection({ products }: MostPopularSectionProps) {
  // Get most popular products — prioritize recent activity (last 48 hours) with engagement scoring
  const popularProducts = useMemo(() => {
    const now = Date.now()
    const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000

    const scored = [...products]
      .filter(p => p.thumbnail_url)
      .map(p => {
        const createdAt = new Date(p.created_at).getTime()
        const isRecent48h = createdAt > fortyEightHoursAgo
        const isRecentWeek = createdAt > sevenDaysAgo

        // Engagement score: purchases/downloads weighted heaviest, then reviews, then views
        const salesScore = (p.sales_count || 0) * 5
        const reviewScore = (p.reviews_count || 0) * 3
        const ratingBonus = (p.reviews_average || 0) >= 4 ? (p.reviews_average || 0) * 2 : 0
        const viewScore = (p.view_count || 0) * 0.1
        const baseScore = salesScore + reviewScore + ratingBonus + viewScore

        // Recency boost: 3x for last 48h, 1.5x for last week
        const recencyMultiplier = isRecent48h ? 3 : isRecentWeek ? 1.5 : 1

        return { ...p, _score: baseScore * recencyMultiplier }
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 12)

    return scored
  }, [products])

  // Mobile: show max 6 products for cleaner navigation
  /*
    THE CAROUSEL'S MACHINERY WENT WITH THE CAROUSEL: an autoplay interval, a
    pause timer, a scroll listener that worked out which slide was centred,
    touch handlers to stop the autoplay fighting a finger, and the index the
    dots read. None of it has a reader now that the phone gets a grid.
  */

  if (popularProducts.length === 0) {
    return null
  }

  return (
    <section className="mt-8 md:mt-12 pt-[24px] pb-[24px] border-t border-neutral-100">
      {/* Section header */}
      <div className="flex items-center justify-between mb-5 md:mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-2xl font-bold text-neutral-900">
            Most popular
          </h2>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 md:gap-1.5 md:px-3.5 md:py-2 rounded-full text-xs md:text-sm font-semibold bg-neutral-900 text-white">
            <span>🔥</span>
            <span>Hot</span>
          </span>
        </div>

        {/* Twelve is what this section shows; the rest of them are a sort
            away on the list above, which is where "view all" goes. */}
        <Link
          href="/explore?sort=popular"
          /* 36px to press on a phone; the negative margin keeps the heading row the height it was. */
          className="-my-2 inline-flex items-center gap-1 py-2 text-sm font-semibold text-neutral-600 hover:text-neutral-900 transition-colors whitespace-nowrap"
        >
          View all
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/*
        ONE CARD PER ROW ON A PHONE, which is what the list above it does.

        This was two across on a phone, so the same product was a full-width
        card in the listing and a half-width one here, forty pixels apart. The
        owner asked for one, and one is right: the cards are identical, so
        they should be the same size on the same screen.

        Twelve render and the last four are hidden below `lg`, which is what
        keeps it four rows on a desktop. The hidden ones cost nothing, because
        a card that is `display: none` never fetches its picture.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {popularProducts.slice(0, 12).map((product, index) => (
          <div key={product.id} className={index >= 8 ? "hidden lg:block" : undefined}>
            <ProductCard
              product={product}
              srcParam="?src=platform"
              priority={index < 3}
              clientNav
            />
          </div>
        ))}
      </div>

      {/*
        THE PHONE'S CAROUSEL IS GONE. It showed six products one at a time,
        85% of the screen wide, behind a swipe and a row of dots — so a phone
        saw six of the twelve and only one of them at once, on a section whose
        whole point is that it is a shortlist you can scan.

        The grid above is two across on a phone, which shows eight of them in
        four rows with no gesture to discover and nothing to swipe past.
      */}
    </section>
  )
}
