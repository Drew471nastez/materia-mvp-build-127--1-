"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { AppAvatar } from "@/components/app/app-avatar"
import { reviewerOf } from "@/lib/reviews/rules"
import { Stars } from "./stars"

/**
 * ===========================================================================
 *  ONE REVIEW, AS A VISITOR READS IT ON THE PRODUCT PAGE
 * ===========================================================================
 * The buyer's photo (AppAvatar: their initials on a neutral circle when there
 * is none), their name, "Verified purchase" (every review here is one:
 * nobody without an order can write one), the stars, the date, the words,
 * and under them the seller's one reply. What Etsy, Shopify's product
 * reviews and the App Store show, and nothing else: no "New" badge, no
 * tooltip to find out what a blue tick means.
 *
 * Long reviews are cut at six lines with "Show more", so one essay does not
 * push the other reviews off the page.
 *
 * Colours come from the product page's theme when it sets them (text, star,
 * border); otherwise Storelib's greys and amber.
 */

export interface ReviewCardData {
  id: string
  rating: number
  content: string
  created_at: string
  edited_at?: string | null
  reviewer_name?: string | null
  seller_reply?: string | null
  seller_reply_at?: string | null
  buyer?: { id?: string; display_name?: string | null; avatar_url?: string | null } | null
}

interface ReviewCardProps {
  review: ReviewCardData
  isMobile?: boolean
  textColor?: string
  starColor?: string
  cardBackgroundColor?: string
  cardBorderColor?: string
}

/* The same words on the server and in every browser: the page is in English and renders first on the server. */
export function reviewDate(iso?: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

const tint = (color: string | undefined, alpha: string, fallback: string) => (color ? `${color}${alpha}` : fallback)

export function ReviewCard({ review, isMobile = false, textColor, starColor, cardBorderColor }: ReviewCardProps) {
  const { name, avatarUrl } = reviewerOf(review)
  const body = useRef<HTMLParagraphElement>(null)
  const [long, setLong] = useState(false)
  const [open, setOpen] = useState(false)

  /* Whether the words run past six lines, measured once they are drawn. */
  useLayoutEffect(() => {
    const el = body.current
    if (el) setLong(el.scrollHeight > el.clientHeight + 2)
  }, [review.content])

  return (
    <article
      data-review=""
      className={cn("border-b last:border-0", isMobile ? "py-4 first:pt-0" : "py-5 first:pt-0")}
      style={{ borderColor: cardBorderColor || "#eef0f3" }}
    >
      <div className="flex items-center gap-3">
        <AppAvatar src={avatarUrl} name={name} alt="" size={isMobile ? 36 : 40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-5" style={{ color: textColor || "#1a1a2e" }}>
            {name}
          </p>
          <p className="flex items-center gap-1 text-[12px] leading-4" style={{ color: tint(textColor, "99", "#6b7280") }}>
            <Check aria-hidden className="h-3 w-3" strokeWidth={2.5} style={{ color: tint(textColor, "99", "#067647") }} />
            Verified purchase
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stars rating={review.rating} size={isMobile ? 14 : 15} color={starColor} />
        <span className="text-[12px]" style={{ color: tint(textColor, "99", "#6b7280") }}>
          {reviewDate(review.created_at)}
          {review.edited_at ? " · Edited" : ""}
        </span>
      </div>

      <p
        ref={body}
        className={cn("mt-2 whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]", !open && "line-clamp-6")}
        style={{ color: tint(textColor, "d9", "#374151") }}
      >
        {review.content}
      </p>
      {long || open ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[13px] font-medium underline underline-offset-2"
          style={{ color: textColor || "#1a1a2e" }}
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}

      {review.seller_reply ? (
        <div
          data-seller-reply=""
          className="mt-3 rounded-xl px-3.5 py-3"
          style={{ backgroundColor: tint(textColor, "0a", "#f6f7f9") }}
        >
          <p className="text-[12px] font-semibold" style={{ color: textColor || "#1a1a2e" }}>
            Seller&apos;s reply
            {review.seller_reply_at ? (
              <span className="font-normal" style={{ color: tint(textColor, "99", "#6b7280") }}>
                {" · "}
                {reviewDate(review.seller_reply_at)}
              </span>
            ) : null}
          </p>
          <p className="mt-1 whitespace-pre-line text-[14px] leading-relaxed [overflow-wrap:anywhere]" style={{ color: tint(textColor, "d9", "#374151") }}>
            {review.seller_reply}
          </p>
        </div>
      ) : null}
    </article>
  )
}
