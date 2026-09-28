"use client"

import { cn } from "@/lib/utils"
import { percentOf } from "@/lib/reviews/rules"
import { Stars } from "./stars"

/**
 * The product's rating in one block: the average, its stars, how many
 * reviews it comes from, and a bar for each number of stars with how many
 * gave it. The bars are the star colour of the page's theme (or near black),
 * never a gradient. Counts beside the bars, not percentages: "3" says more
 * than "25%" when there are twelve reviews.
 */
interface ReviewsRatingBreakdownProps {
  reviewsCount: number
  reviewsAverage: number
  starBreakdown: { 5: number; 4: number; 3: number; 2: number; 1: number }
  className?: string
  isMobile?: boolean
  accentColor?: string
  textColor?: string
  starColor?: string
  cardBackgroundColor?: string
  cardBorderColor?: string
}

export function ReviewsRatingBreakdown({
  reviewsCount,
  reviewsAverage,
  starBreakdown,
  className,
  isMobile = false,
  accentColor,
  textColor,
  starColor,
  cardBorderColor,
}: ReviewsRatingBreakdownProps) {
  if (reviewsCount === 0) return null
  /*
    THE BAR FOLLOWS THE PAGE'S TEXT when the page sets one. The near black
    fallback is Storelib's, and on a product page with a dark theme it was
    darker than the track behind it: five bars you could not see, reading as
    an indigo smudge. A page that names its text colour gets its bars in it.
  */
  const bar = starColor || accentColor || textColor || "#1a1a2e"
  /* The bars count the reviews the breakdown read; until it arrives, the total the page already had. */
  const counted = [1, 2, 3, 4, 5].reduce((n, r) => n + (starBreakdown[r as 1] || 0), 0)
  const total = counted || reviewsCount

  return (
    <div data-rating-summary="" className={cn("w-full", className)}>
      <div className="flex items-end gap-3">
        <span className={cn("font-semibold leading-none tabular-nums", isMobile ? "text-[40px]" : "text-[44px]")} style={{ color: textColor || "#1a1a2e" }}>
          {reviewsAverage.toFixed(1)}
        </span>
        <div className="pb-1">
          <Stars rating={reviewsAverage} size={16} color={starColor} />
          <p className="mt-1 text-[13px]" style={{ color: textColor ? `${textColor}99` : "#6b7280" }}>
            {reviewsCount} {reviewsCount === 1 ? "review" : "reviews"}
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-1.5" aria-label="Reviews by stars">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = starBreakdown[rating as 1] || 0
          const percent = percentOf(count, total)
          return (
            <li key={rating} className="flex items-center gap-2.5 text-[13px]" aria-label={`${rating} stars: ${count}`}>
              <span className="w-3 shrink-0 text-right tabular-nums" style={{ color: textColor ? `${textColor}cc` : "#4b5563" }}>
                {rating}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: cardBorderColor || "#eef0f3" }}>
                <span
                  className="block h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${percent}%`, backgroundColor: bar }}
                />
              </span>
              <span className="w-6 shrink-0 text-right tabular-nums" style={{ color: textColor ? `${textColor}99` : "#6b7280" }}>
                {count}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
