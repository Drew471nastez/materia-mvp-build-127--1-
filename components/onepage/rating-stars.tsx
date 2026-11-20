/**
 * Storelib Reviews' stars on a OnePage product card and in its sheet (lib/onepage/product-rating).
 *
 * One reading for a screen reader, "4.8 out of 5, 23 reviews", on the whole row (role="img"); the stars and figures
 * inside it are hidden from it, so nothing is read twice. Each star is filled to its share of the score (4.6 is four
 * full and one 60%), as the Reviews block draws them (components/onepage/data-blocks StarRow). The row has a fixed
 * line height and is drawn on the server with the card, so it never moves anything when the page wakes up.
 */
import { Star } from "lucide-react"
import { tt } from "@/lib/i18n/text"
import { cn } from "@/lib/utils"
import { starShares } from "@/lib/onepage/reviews-block"
import { cleanRating, ratingLabel } from "@/lib/onepage/product-rating"

export const STAR_GOLD = "#F5A524"

export function ratingAria(average: number, count: number): string {
  return tt("{value} out of 5, {count, plural, one {# review} other {# reviews}}", { value: ratingLabel(average), count })
}

export function Stars({ value, size, color = STAR_GOLD, faint = 0.28 }: { value: number; size: number; color?: string; faint?: number }) {
  return (
    <span aria-hidden className="inline-flex shrink-0" data-stars={ratingLabel(value)}>
      {starShares(value).map((share, i) => (
        <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
          <Star className="absolute inset-0" strokeWidth={1.75} style={{ width: size, height: size, opacity: faint }} />
          <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${share * 100}%` }}>
            <Star fill={color} stroke={color} strokeWidth={1.75} style={{ width: size, height: size }} />
          </span>
        </span>
      ))}
    </span>
  )
}

/**
 * The compact rating a product card carries under its title: five small stars, the score and how many, in the
 * card's own text colour. Nothing at all for a product with no rating.
 */
export function CardRatingLine({ rating, color, className, size = 12 }: { rating: unknown; color?: string; className?: string; size?: number }) {
  const r = cleanRating(rating)
  if (!r) return null
  return (
    <span role="img" aria-label={ratingAria(r.average, r.count)} className={cn("flex min-w-0 items-center gap-1 text-[12.5px] leading-4", className)} style={color ? { color } : undefined} data-product-rating={ratingLabel(r.average)}>
      <Stars value={r.average} size={size} />
      <span aria-hidden className="font-semibold tabular-nums">{ratingLabel(r.average)}</span>
      <span aria-hidden className="truncate tabular-nums opacity-75">({r.count.toLocaleString("en-US")})</span>
    </span>
  )
}
