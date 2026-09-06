"use client"

/**
 * Every review across everything the creator sells, behind the Reviews tab.
 *
 * It exists because the meta row now claims a rating, and a claim a visitor
 * cannot check is worth less than no claim. "4.9 · 126 reviews" with nowhere
 * to read the 126 is a badge; with somewhere to read them it is evidence.
 */

import { Star } from "lucide-react"
import { SmartLink } from "@/components/smart-link"
import { cn } from "@/lib/utils"

export interface StorefrontReview {
  id: string
  rating: number
  comment?: string | null
  created_at?: string | null
  productTitle?: string | null
  productSlug?: string | null
  buyerName?: string | null
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
}: {
  reviews: StorefrontReview[]
  average: number
  total: number
}) {
  if (total === 0 || reviews.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-3 py-16 sm:px-4 lg:px-6">
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
    <div className="mx-auto w-full max-w-[1100px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
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
            <div className="flex items-center justify-between gap-3">
              <Stars rating={review.rating} />
              {review.created_at && (
                <time className="text-xs text-muted-foreground" dateTime={review.created_at}>
                  {new Date(review.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                </time>
              )}
            </div>

            {review.comment && <p className="mt-2 text-sm leading-relaxed">{review.comment}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              {review.buyerName && <span>{review.buyerName}</span>}
              {review.buyerName && review.productTitle && <span className="opacity-40">·</span>}
              {review.productTitle &&
                (review.productSlug ? (
                  <SmartLink href={`/p/${review.productSlug}`} className="hover:text-foreground hover:underline">
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
