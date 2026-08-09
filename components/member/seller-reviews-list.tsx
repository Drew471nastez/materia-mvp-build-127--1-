"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"

/**
 * The "Evaluări" tab of a profile: every review this seller has received,
 * across every creator row their account holds.
 *
 * Fetched when the tab is first opened, not with the page — a profile is
 * usually read for its listings, and the reviews are one request that most
 * visits never need. The summary stars in the header are separate and arrive
 * with the server render; this is the detail behind them.
 */

type Review = {
  id: string
  rating: number
  content: string | null
  created_at: string | null
  buyer?: { display_name?: string | null; avatar_url?: string | null } | null
}

function since(iso?: string | null): string | null {
  if (!iso) return null
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  const days = Math.max(0, Math.round((Date.now() - then) / 86400000))
  if (days < 1) return "azi"
  if (days < 30) return `acum ${days} ${days === 1 ? "zi" : "zile"}`
  const months = Math.round(days / 30)
  if (months < 12) return `acum ${months} ${months === 1 ? "lună" : "luni"}`
  const years = Math.round(months / 12)
  return `acum ${years} ${years === 1 ? "an" : "ani"}`
}

function Stars({ n }: { n: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${n} din 5 stele`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className="h-[14px] w-[14px]"
          fill={i <= n ? "#f59e0b" : "none"}
          stroke={i <= n ? "#f59e0b" : "#d4d4d4"}
          strokeWidth={2}
        />
      ))}
    </span>
  )
}

export function SellerReviewsList({ sellerUserId, isOwner }: { sellerUserId: string; isOwner: boolean }) {
  const [reviews, setReviews] = useState<Review[] | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/reviews?sellerUserId=${encodeURIComponent(sellerUserId)}&limit=50`)
      .then((r) => (r.ok ? r.json() : { reviews: [] }))
      .then((d) => {
        if (alive) setReviews(Array.isArray(d?.reviews) ? d.reviews : [])
      })
      .catch(() => {
        if (alive) setReviews([])
      })
    return () => {
      alive = false
    }
  }, [sellerUserId])

  if (reviews === null) {
    return (
      <div className="space-y-3 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl border border-neutral-200/70 p-4">
            <div className="h-3 w-1/3 rounded bg-neutral-100" />
            <div className="mt-2.5 h-3 w-3/4 rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    )
  }

  if (reviews.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-14 text-center">
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
          <Star className="h-6 w-6" />
        </span>
        <p className="text-[16px] font-semibold text-neutral-900">Nicio evaluare încă</p>
        <p className="mt-1.5 max-w-[280px] text-[14px] font-medium leading-relaxed text-neutral-500">
          {isOwner
            ? "După prima vânzare, cumpărătorii te pot evalua aici."
            : "Evaluările de la cumpărători apar aici."}
        </p>
      </div>
    )
  }

  return (
    <ul className="space-y-3 pb-10 pt-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-neutral-200/70 p-4">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-neutral-100">
              {r.buyer?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.buyer.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-neutral-400">
                  {(r.buyer?.display_name || "C").charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-neutral-900">
                {r.buyer?.display_name || "Cumpărător"}
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <Stars n={r.rating} />
                {since(r.created_at) && (
                  <span className="text-[12px] font-medium text-neutral-400">{since(r.created_at)}</span>
                )}
              </span>
            </span>
          </div>
          {r.content && (
            <p className="mt-2.5 text-[14.5px] font-medium leading-relaxed text-neutral-700">{r.content}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
