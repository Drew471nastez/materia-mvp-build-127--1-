"use client"

/**
 * Every review across everything the creator sells, at the foot of the page.
 *
 * It exists because the meta row now claims a rating, and a claim a visitor
 * cannot check is worth less than no claim. "4.9 · 126 reviews" with nowhere
 * to read the 126 is a badge; with somewhere to read them it is evidence.
 *
 * NOT A TAB. It was one, and it read as a destination that took the visitor
 * away from the products; the evidence for a rating belongs where they arrive
 * after looking at the work, next to the About. So it renders below the tab
 * panels — which means it needs its own heading, because nothing above it
 * says what these stars are for any more.
 */

import { Star } from "lucide-react"
import { SmartLink } from "@/components/smart-link"
import { AppAvatar } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"
import { UNNAMED_REVIEWER } from "@/lib/reviews/rules"
import { getProductInternalPath } from "@/lib/url-helpers"


/**
 * THE MONTH, THE SAME ON THE SERVER AND IN EVERY BROWSER. It was
 * `toLocaleDateString(undefined, ...)`, the reader's own language and time
 * zone, in a component the server renders first in its own (en-US, UTC):
 * a visitor in Romania was sent "Sep 2026" and drew "sept. 2026", and one
 * east of UTC drew next month for a review written late on the last day.
 * React calls that a hydration error and throws the server's HTML away.
 * The page is in English, so the date is written the one way.
 */
function reviewMonth(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
}

export interface StorefrontReview {
  id: string
  rating: number
  comment?: string | null
  created_at?: string | null
  productTitle?: string | null
  productSlug?: string | null
  /**
   * Who wrote it: the account's display name, else the name a guest bought
   * with (reviews.reviewer_name, run-now part 52). Null for neither, and the
   * card then reads "Verified buyer" with a plain person in the circle.
   */
  buyerName?: string | null
  /** The reviewer's own picture. A name with a face reads as a person. */
  buyerAvatarUrl?: string | null
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn("h-3.5 w-3.5", n <= Math.round(rating) ? "fill-current text-foreground" : "text-border")}
        />
      ))}
    </span>
  )
}

export function ReviewsPanel({
  reviews,
  average,
  total,
  creatorUsername,
}: {
  reviews: StorefrontReview[]
  average: number
  total: number
  /** Whose page this is, so a review links to `/<handle>/<slug>`. */
  creatorUsername?: string
}) {
  if (total === 0 || reviews.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1180px] px-3 py-16 sm:px-4 lg:px-6">
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="font-medium text-foreground">No reviews yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Reviews appear here once buyers have left them.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
      <h2 className="mb-4 text-xl font-semibold text-foreground sm:text-2xl">Reviews</h2>
      <div className="mb-6 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tracking-tight">{average.toFixed(1)}</span>
        <Stars rating={average} />
        <span className="text-sm text-muted-foreground">
          {total} {total === 1 ? "review" : "reviews"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {reviews.map((review) => (
          <div key={review.id} className="rounded-lg border border-border bg-card p-4">
            {/*
              THE PERSON FIRST, then what they said. The card used to lead with
              five stars and a date, which is the same for most reviews and so
              carries almost nothing; who wrote it is the part a reader is
              actually weighing. Picture, name and stars on one line, the way
              every review anyone has read is laid out.
            */}
            <div className="flex items-center gap-2.5">
              {/*
                THE CIRCLE HELD A QUESTION MARK. It was the first letter of
                `buyerName || "?"`, and a guest's review carries no
                `buyerName` at all, so every review written from a receipt
                link showed a grey box with a "?" in it and no name beside
                it. Through the shared avatar now (any host loads, a photo
                that fails becomes the letters), in the page's own muted and
                foreground colours so it reads on a dark theme as well as a
                white one, and with a plain person rather than a "?" when
                nobody ever gave a name.
              */}
              <AppAvatar
                src={review.buyerAvatarUrl}
                name={(review.buyerName || "").trim()}
                alt=""
                size={32}
                tone="theme"
                markWhileLoading
              />

              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{review.buyerName?.trim() || UNNAMED_REVIEWER}</span>
                  <Stars rating={review.rating} />
                </div>
              </div>

              {review.created_at && (
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={review.created_at}>
                  {reviewMonth(review.created_at)}
                </time>
              )}
            </div>

            {review.comment && <p className="mt-2 text-sm leading-relaxed">{review.comment}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {review.productTitle &&
                (review.productSlug ? (
                  <SmartLink href={getProductInternalPath(review.productSlug, creatorUsername)} className="hover:text-foreground hover:underline">
                    {review.productTitle}
                  </SmartLink>
                ) : (
                  <span>{review.productTitle}</span>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
