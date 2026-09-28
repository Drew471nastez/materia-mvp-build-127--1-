"use client"

import Link from "next/link"
import { MessageSquareText } from "lucide-react"
import { Stars } from "@/components/reviews/stars"
import type { LibraryItem } from "@/lib/library/library-view"
import { RateStars } from "./rate-stars"
import { CARD, SECONDARY, SMALL, VIOLET, shortDate } from "./library-ui"

/**
 * ===========================================================================
 *  REVIEWS: WHAT THEY HAVE SAID, AND WHAT IS STILL WAITING
 * ===========================================================================
 * Two lists on one screen, the way Etsy's Purchases and Reviews do it:
 *
 *   To review     every purchase a review would be taken for (bought, still
 *                 theirs, not their own product, not reviewed). Five stars
 *                 to start from, which open the product's review card with
 *                 that many chosen, and Write a review.
 *   Your reviews  one per product (the database allows no more, run-now part
 *                 48): the stars, the date, the start of the words, whether
 *                 the seller answered, and Edit. Editing and deleting happen
 *                 on the product (components/reviews/library-review.tsx),
 *                 where the whole card is.
 *
 * A refunded purchase, or the buyer's own product, is in neither list: the
 * review route would refuse it (lib/reviews), so it is never offered.
 */

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" /> : null}
    </div>
  )
}

function Waiting({ item }: { item: LibraryItem }) {
  const href = `/library/products/${item.productId}#review`
  return (
    <li data-review-waiting={item.productId} className="px-4 py-3.5 sm:px-5">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[48px_minmax(0,1fr)_auto]">
        <Thumb src={item.thumbnailUrl} />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{item.title}</p>
          <p className="truncate text-[12.5px] text-[#6b7280]">
            {item.creator.name} · Bought {shortDate(item.purchasedAt)}
          </p>
        </div>
        <div className="col-span-2 mt-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:mt-0 sm:justify-end sm:gap-3">
          <RateStars item={item} size={20} label={false} />
          <Link href={href} className={`${SECONDARY} ${SMALL}`}>
            Write a review
          </Link>
        </div>
      </div>
    </li>
  )
}

function Reviewed({ item }: { item: LibraryItem }) {
  const review = item.review!
  return (
    <li data-review-done={item.productId} className="px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <Thumb src={item.thumbnailUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[14.5px] font-semibold text-[#1a1a2e]">{item.title}</p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] text-[#6b7280]">
                <Stars rating={review.rating} size={14} />
                <span>
                  {shortDate(review.createdAt)}
                  {review.editedAt ? " · Edited" : ""}
                </span>
              </p>
            </div>
            <Link href={`/library/products/${item.productId}#review`} className={`${SECONDARY} ${SMALL} shrink-0`}>
              Edit
            </Link>
          </div>
          {review.content ? <p className="mt-2 line-clamp-2 whitespace-pre-line text-[14px] leading-relaxed text-[#374151] [overflow-wrap:anywhere]">{review.content}</p> : null}
          {review.sellerReply || review.hidden ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
              {review.sellerReply ? (
                <span className="inline-flex items-center gap-1 font-medium text-[#1a1a2e]">
                  <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  {item.creator.name} replied
                </span>
              ) : null}
              {review.hidden ? <span className="text-[#b45309]">Hidden from the product page for now</span> : null}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function LibraryReviews({ items }: { items: LibraryItem[] }) {
  const waiting = items.filter((i) => i.canReview && !i.review)
  const done = items.filter((i) => i.review).sort((a, b) => (b.review!.createdAt || "").localeCompare(a.review!.createdAt || ""))

  if (items.length === 0) {
    return (
      <div data-reviews-empty="" className={`${CARD} px-5 py-10 text-center`}>
        <p className="text-[16px] font-semibold text-[#1a1a2e]">Nothing to review yet</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Once you buy something, you can rate it here and change your mind any time.</p>
        <Link href="/explore" className={`${VIOLET} mt-5`}>
          Discover products
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-[760px] space-y-7" data-library-reviews="">
      <section aria-labelledby="to-review">
        <div className="mb-2.5 flex items-baseline justify-between px-0.5">
          <h2 id="to-review" className="text-[15px] font-semibold text-[#1a1a2e]">
            To review
          </h2>
          <span className="text-[13px] tabular-nums text-[#6b7280]">{waiting.length}</span>
        </div>
        {waiting.length > 0 ? (
          <ul className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {waiting.map((item) => (
              <Waiting key={item.productId} item={item} />
            ))}
          </ul>
        ) : (
          <p className={`${CARD} px-4 py-4 text-[14px] text-[#6b7280]`}>You have reviewed everything you bought.</p>
        )}
      </section>

      <section aria-labelledby="your-reviews">
        <div className="mb-2.5 flex items-baseline justify-between px-0.5">
          <h2 id="your-reviews" className="text-[15px] font-semibold text-[#1a1a2e]">
            Your reviews
          </h2>
          <span className="text-[13px] tabular-nums text-[#6b7280]">{done.length}</span>
        </div>
        {done.length > 0 ? (
          <ul className={`${CARD} divide-y divide-[#eef0f3] overflow-hidden`}>
            {done.map((item) => (
              <Reviewed key={item.productId} item={item} />
            ))}
          </ul>
        ) : (
          <p className={`${CARD} px-4 py-4 text-[14px] text-[#6b7280]`}>Reviews you write show up here, with Edit.</p>
        )}
      </section>
    </div>
  )
}
