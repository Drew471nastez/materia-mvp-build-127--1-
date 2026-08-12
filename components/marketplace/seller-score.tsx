"use client"

import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  ⭐ 4,9 · 63 vândute
 * ===========================================================================
 *
 * The one line on a profile that answers "should I send this person money".
 * Drawn wherever a seller is named — see lib/profile/seller-stats.ts for where
 * the two numbers come from and why they are these two and not the follower
 * count.
 *
 * ---------------------------------------------------------------------------
 * EACH HALF DISAPPEARS ON ITS OWN, AND THE WHOLE THING WITH THEM
 * ---------------------------------------------------------------------------
 * Three states, and the empty ones are the point:
 *
 *   nothing yet    nothing is drawn. Not a zero, not a row of grey stars, not
 *                  "Fără evaluări" — nothing. A brand-new seller's header is
 *                  one line shorter than an established one, and that
 *                  difference is honest: "0,0 ★" reads as RATED BADLY rather
 *                  than as unrated, and "0 vândute" is an accusation printed
 *                  under somebody's name.
 *
 *   sold, unrated  the sales count alone. Somebody can shift twenty things
 *                  before anybody writes a word, and hiding that until a review
 *                  arrives would be withholding the stronger of the two signals
 *                  — a completed sale costs a stranger real money to produce; a
 *                  review costs a tap.
 *
 *   rated          the star, the average, and the count behind it, then the
 *                  sales. An average with no sample size beside it is the oldest
 *                  way to make one five-star review look like a reputation.
 *
 * ---------------------------------------------------------------------------
 * ONE STAR, NOT FIVE
 * ---------------------------------------------------------------------------
 * The profile drew a five-star row with a partial fill, which is right when the
 * rating IS the content of the block — a reviews page, a product listing. As a
 * line under a name it is five glyphs to communicate one number that is written
 * immediately after them, and it is wide enough that the sales count gets
 * pushed onto a second line on a phone.
 *
 * One filled star ahead of the figure is what every marketplace, hotel listing
 * and app store uses in this position, and for the same reason: the star is
 * saying "this number is a rating", not showing the rating itself.
 *
 * `tabular-nums` so the figure does not shuffle sideways when it moves from 4,9
 * to 5,0 next to a count that is changing too.
 */
export type SellerScoreProps = {
  /** 0–5, or null/undefined when nobody has rated them. Never pass 0 for that. */
  rating?: number | null
  /** How many reviews the average is made of. */
  reviews?: number | null
  /** Listings marked sold. */
  sold?: number | null
  language?: string
  /** `sm` under a name in a list or a card; `md` on the profile header. */
  size?: "sm" | "md"
  className?: string
}

/**
 * Romanian counts a noun three ways and this gets it wrong in the one place
 * anybody would notice: 1, then 2–19, then 20+ which takes "de". "63 vândute"
 * and "de 21 de vânzări" are both wrong in opposite directions, so the number
 * of items sold is written as a participle agreeing with nothing — "63
 * vândute" — which is what a seller would say out loud.
 */
function soldLabel(count: number, language: string): string {
  if (language !== "ro") return count === 1 ? "1 sold" : `${count} sold`
  return count === 1 ? "1 vândut" : `${count} vândute`
}

function ratingLabel(count: number, language: string): string {
  if (language !== "ro") return String(count)
  return String(count)
}

export function SellerScore({
  rating,
  reviews,
  sold,
  language = "ro",
  size = "sm",
  className,
}: SellerScoreProps) {
  const hasRating = typeof rating === "number" && Number.isFinite(rating) && (reviews ?? 0) > 0
  const soldCount = typeof sold === "number" && Number.isFinite(sold) ? Math.max(0, sold) : 0
  const hasSold = soldCount > 0

  // Nothing to say. Not an empty row, not a placeholder — no element at all, so
  // the layout above simply closes up.
  if (!hasRating && !hasSold) return null

  const locale = language === "ro" ? "ro-RO" : "en-GB"
  const text = size === "md" ? "text-[13.5px]" : "text-[12.5px]"
  const star = size === "md" ? "h-[15px] w-[15px]" : "h-[13px] w-[13px]"

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", text, className)}>
      {hasRating && (
        <span className="flex shrink-0 items-center gap-1">
          <Star className={cn(star, "shrink-0 fill-amber-400 text-amber-400")} strokeWidth={0} />
          <span className="font-semibold tabular-nums text-neutral-900">
            {(rating as number).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          {/* The sample size, in the lighter weight, immediately after the
              average it belongs to — not at the end of the line, where it would
              read as belonging to the sales count instead. */}
          <span className="tabular-nums text-neutral-400">({ratingLabel(reviews ?? 0, language)})</span>
        </span>
      )}
      {hasRating && hasSold && (
        <span aria-hidden className="shrink-0 text-neutral-300">
          ·
        </span>
      )}
      {hasSold && <span className="truncate text-neutral-500">{soldLabel(soldCount, language)}</span>}
    </div>
  )
}
