"use client"

import { useEffect, useState } from "react"
import { Star } from "lucide-react"

import { ProductCard } from "@/components/explore/product-card"
import { FollowButton } from "@/components/explore/follow-button"
import { useLocale } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

/**
 * The buyer-facing seller profile at /member/[username].
 *
 * One screen, two jobs: say who the seller is (avatar, name, member-since,
 * presence, reviews) and show what they are selling. The listings reuse the
 * exact ProductCard from the feed — same photo ratio, same wishlist heart —
 * because a listing must look identical wherever a buyer meets it.
 *
 * There is deliberately NO "send message" button here: conversations on this
 * marketplace start from a listing, so the honest entry point is tapping an
 * item below, not a context-free chat with the seller.
 */

export type MemberListing = {
  id: string
  title: string
  slug: string
  price_cents: number
  compare_at_cents: number | null
  thumbnail_url: string | null
  gallery_urls: string[] | null
  type: string
  category: string | null
  size: string | null
  size_system: string | null
  brand: string | null
  condition: string | null
  saves_count: number
  created_at: string | null
}

export type MemberSummary = {
  /** Profile (auth user) id — what follows and reviews key on. */
  id: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  joinedAt: string | null
  /** true/false when last_seen_at was readable on the server; null means the
   *  presence column isn't deployed yet, so no dot renders at all rather than
   *  a grey one falsely claiming everyone is offline. */
  online: boolean | null
}

/** "Membru din martie 2025" — month precision is all this is worth. */
function joinedLabel(iso: string | null, locale: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  try {
    return d.toLocaleDateString(locale === "ro" ? "ro-RO" : "en-GB", { month: "long", year: "numeric" })
  } catch {
    return null
  }
}

/** Romanian counts need three forms (1 anunț / 3 anunțuri / 20 de anunțuri),
 *  which a flat dictionary key can't express — so the plural rule lives here. */
function listingsLabel(count: number, language: string): string {
  if (language === "ro") {
    if (count === 1) return "1 anunț"
    return count < 20 ? `${count} anunțuri` : `${count} de anunțuri`
  }
  return count === 1 ? "1 listing" : `${count} listings`
}

function reviewsLabel(count: number, language: string): string {
  if (language === "ro") {
    if (count === 1) return "1 recenzie"
    return count < 20 ? `${count} recenzii` : `${count} de recenzii`
  }
  return count === 1 ? "1 review" : `${count} reviews`
}

type ReviewsSummary = { average: number; count: number }

/**
 * Average stars + count for this seller, from GET /api/reviews?sellerId=…
 *
 * That endpoint is landing in a parallel branch, so this reads defensively:
 * any non-OK status, unparseable body or unfamiliar shape simply keeps the
 * strip hidden. A missing reviews row must never cost the profile anything.
 */
function useSellerReviews(sellerId: string): ReviewsSummary | null {
  const [summary, setSummary] = useState<ReviewsSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/reviews?sellerId=${encodeURIComponent(sellerId)}`, {
          credentials: "include",
        })
        if (!res.ok) return
        const data: any = await res.json().catch(() => null)
        if (!data || typeof data !== "object") return

        const list: any[] = Array.isArray(data.reviews) ? data.reviews : []
        const count =
          typeof data.total === "number" && Number.isFinite(data.total) && data.total >= 0
            ? data.total
            : list.length
        if (count <= 0) return

        // Prefer a server-computed average under any of its likely names, and
        // only fall back to averaging the page of reviews we were handed.
        let average = [data.average, data.averageRating, data.rating, data?.stats?.average].find(
          (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0,
        )
        if (average === undefined) {
          const ratings = list
            .map((r) => Number(r?.rating))
            .filter((n) => Number.isFinite(n) && n > 0)
          if (ratings.length === 0) return
          average = ratings.reduce((a, b) => a + b, 0) / ratings.length
        }

        if (!cancelled) setSummary({ average: Math.min(5, Math.max(0, average)), count })
      } catch {
        // The strip is decoration — silence is the correct failure mode.
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sellerId])

  return summary
}

/** Five stars with a fractional amber fill — the grey row underneath is always
 *  complete, and the coloured row is clipped to the average, so 4.3 reads as
 *  4.3 rather than snapping to a whole star. */
function Stars({ value }: { value: number }) {
  const pct = (Math.min(5, Math.max(0, value)) / 5) * 100
  const row = (
    <span className="flex gap-px">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-[14px] w-[14px] shrink-0 fill-current" strokeWidth={0} />
      ))}
    </span>
  )
  return (
    <span className="relative inline-flex text-neutral-200" aria-hidden="true">
      {row}
      <span className="absolute inset-y-0 left-0 overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>
        {row}
      </span>
    </span>
  )
}

function Stat({ value, label, lang }: { value: number; label: string; lang: string }) {
  const compact = value >= 1000
    ? new Intl.NumberFormat(lang === "ro" ? "ro-RO" : "en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : String(value)
  return (
    <span className="flex flex-col">
      <span className="text-[17px] font-bold leading-tight text-neutral-900 tabular-nums">{compact}</span>
      <span className="text-[12.5px] text-neutral-500">{label}</span>
    </span>
  )
}

export function MemberProfile({
  member,
  listingsCount,
  followersCount,
  followingCount,
  listings,
}: {
  member: MemberSummary
  /** Exact total from the server — the grid itself is capped, so it may show fewer. */
  listingsCount: number
  followersCount: number
  followingCount: number
  listings: MemberListing[]
}) {
  const { t, language } = useLocale()
  const reviews = useSellerReviews(member.id)

  const name = member.displayName || member.username || "Storelib"
  const joined = joinedLabel(member.joinedAt, language)
  const meta = [
    listingsLabel(listingsCount, language),
    joined ? `${t("mfeed.member_since")} ${joined}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-12 pt-6 md:px-6 md:pt-10">
      <header className="flex items-start gap-4 md:items-center md:gap-6">
        {/* Large avatar with the same initial fallback and ringed presence dot
            the Following list uses, so a seller looks the same everywhere. */}
        <div className="relative shrink-0">
          <span className="block h-20 w-20 overflow-hidden rounded-full bg-neutral-100 md:h-24 md:w-24">
            {member.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[28px] font-semibold text-neutral-400 md:text-[32px]">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
          </span>
          {/* Rendered only when the server could actually read last_seen_at —
              the white ring keeps it legible against any avatar. */}
          {member.online !== null && (
            <span
              className={cn(
                "absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full ring-2 ring-white md:h-[18px] md:w-[18px]",
                member.online ? "bg-emerald-500" : "bg-neutral-300",
              )}
              aria-label={member.online ? t("mfeed.online") : t("mfeed.offline")}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-[-0.01em] text-neutral-900 md:text-2xl">
            {name}
          </h1>
          <p className="truncate text-[13.5px] text-neutral-500">@{member.username}</p>
          {meta && <p className="mt-1 truncate text-[12.5px] text-neutral-400">{meta}</p>}

          {/* Reviews strip — appears only once the seller has at least one
              review, so a new seller isn't introduced by an empty zero. */}
          {reviews && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Stars value={reviews.average} />
              <span className="text-[12.5px] font-semibold text-neutral-700 tabular-nums">
                {reviews.average.toLocaleString(language === "ro" ? "ro-RO" : "en-GB", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span className="truncate text-[12.5px] text-neutral-400">
                ({reviewsLabel(reviews.count, language)})
              </span>
            </div>
          )}
        </div>

        <FollowButton userId={member.id} variant="quiet" className="mt-1 md:mt-0" />
      </header>

      {/* The social shape of the profile in one glance — the row every
          marketplace profile teaches people to look for. Counts are compact
          ("1,2K") past a thousand, because the exact figure stops mattering
          exactly when it stops fitting. */}
      <div className="mt-5 flex items-center gap-8 border-b border-neutral-100 pb-5 md:gap-10">
        <Stat value={listingsCount} label={language === "ro" ? "Articole" : "Listings"} lang={language} />
        <Stat value={followersCount} label={language === "ro" ? "Urmăritori" : "Followers"} lang={language} />
        <Stat value={followingCount} label={language === "ro" ? "Urmărește" : "Following"} lang={language} />
      </div>

      <section className="mt-8 md:mt-10">
        {listings.length === 0 ? (
          // A quiet, centred line — an empty shop is a normal state for a new
          // member, not an error worth illustrating.
          <div className="flex flex-col items-center py-20 text-center">
            <p className="text-[15px] font-medium text-neutral-500">Niciun articol încă.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-x-4 lg:grid-cols-4">
            {listings.map((listing, i) => (
              <ProductCard
                key={listing.id}
                product={listing}
                origin="member"
                // Every card here belongs to the seller named just above —
                // repeating their name under each photo would only add noise.
                showSeller={false}
                priority={i < 4}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
