"use client"

import Link from "next/link"
import { useState } from "react"
import { Star } from "lucide-react"
import { STAR_AMBER, Stars } from "@/components/reviews/stars"
import type { LibraryItem } from "@/lib/library/library-view"

/**
 * The review line on a purchase: five empty stars to rate it, or their own
 * stars once they have.
 *
 * A star is a link, not a vote. A review on Storelib is stars AND words
 * (lib/reviews/rules MIN_REVIEW_CHARS), so a star pressed here opens the
 * product's review card with that many already chosen (?rate=4#review,
 * components/reviews/library-review.tsx) and the words are theirs to write.
 * Posting a bare number from a list would either be refused or make a
 * review with nothing in it.
 */
export function RateStars({ item, size = 18, label = true }: { item: Pick<LibraryItem, "productId" | "title" | "review" | "canReview">; size?: number; label?: boolean }) {
  const [hover, setHover] = useState(0)
  const href = `/library/products/${item.productId}`

  if (item.review) {
    return (
      <Link
        href={`${href}#review`}
        data-review-state="reviewed"
        className="group/rev inline-flex min-h-[32px] items-center gap-2 rounded-md text-[13px] text-[#6b7280] hover:text-[#1a1a2e]"
      >
        <Stars rating={item.review.rating} size={size - 3} />
        <span className="font-medium">Your review</span>
        <span className="text-[#9ca3af] group-hover/rev:text-[#1a1a2e]">Edit</span>
      </Link>
    )
  }
  if (!item.canReview) return null

  return (
    <div data-review-state="open" className="flex min-h-[32px] items-center gap-2" onMouseLeave={() => setHover(0)}>
      <div role="group" aria-label={`Rate ${item.title}`} className="-ml-1 flex items-center">
        {[1, 2, 3, 4, 5].map((n) => (
          <Link
            key={n}
            href={`${href}?rate=${n}#review`}
            aria-label={`${n} out of 5 stars`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            className="flex h-8 w-7 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
          >
            <Star
              aria-hidden
              strokeWidth={1.5}
              className="transition-colors duration-100"
              style={{ width: size, height: size, color: n <= hover ? STAR_AMBER : "#d5d9e0", fill: n <= hover ? STAR_AMBER : "transparent" }}
            />
          </Link>
        ))}
      </div>
      {label ? <span className="text-[13px] font-medium text-[#6b7280]">Rate it</span> : null}
    </div>
  )
}
