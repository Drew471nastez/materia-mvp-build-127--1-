/**
 * ===========================================================================
 *  A COMMUNITY ON EXPLORE, DRAWN LIKE A PRODUCT
 * ===========================================================================
 * Communities mode puts these in the grid where the product cards are, so
 * they are built from the product card's parts (components/explore/
 * product-card.tsx): the same 16:9 picture, the same border and lift, the
 * same 16px body, the price at the foot. What is a community's own:
 *
 *   its mark beside the name, a little bigger than a seller's face, and the
 *   name a little bigger than a product title, two lines at most
 *
 *   "by" and the creator, with their face, under the name
 *
 *   one quiet row of facts, each a count of real rows: the stars only when
 *   somebody reviewed it (the average and no count), active members, all
 *   time views (one per visitor per day, part 87; left out where they are
 *   not known), and how long ago it opened
 *
 * The whole card is one link to the community. No hooks: the server draws
 * the first page, the browser the rest, the probe both.
 */
import Link from "next/link"
import { Eye, Star, Users } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import type { CommunityCard } from "@/lib/communities/types"
import { launchedLabel, ratingLabel, statCount } from "@/lib/explore/communities-mode"
import { cn } from "@/lib/utils"

/** The logo, else the initials of its name on a quiet ground: never an empty square. */
function Mark({ card, size, className }: { card: CommunityCard; size: number; className?: string }) {
  if (card.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizedImageUrl(card.logoUrl, size > 48 ? 128 : 96)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 rounded-[10px] bg-muted object-cover", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <AppAvatar src={null} name={card.name} alt="" size={size} className={cn("rounded-[10px]", className)} />
}

export function ExploreCommunityCard({ card, priority = false, now }: { card: CommunityCard; priority?: boolean; now?: number }) {
  const rating = ratingLabel(card.rating)
  const launched = launchedLabel(card.launchedAt, now)
  const views = typeof card.viewCount === "number" ? card.viewCount : null
  return (
    <Link
      href={card.url}
      data-explore-community={card.slug}
      className="group/community flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card outline-none transition-[border-color,box-shadow] duration-300 ease-out focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 active:brightness-[0.98] [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]"
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimizedImageUrl(card.coverUrl, 640)}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-500 ease-out motion-reduce:transition-none [@media(hover:hover)]:group-hover/community:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-[#f1f2f4]">
            <Mark card={card} size={64} className="shadow-[0_1px_2px_rgba(16,24,40,0.08)]" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Mark card={card} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 break-words text-[18px] font-medium leading-tight text-foreground" title={card.name} data-community-title="">
              {card.name}
            </h3>
            {card.creator?.name ? (
              <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground" data-community-creator="">
                <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={18} className="shrink-0" />
                <span className="truncate">by {card.creator.name}</span>
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-5 text-muted-foreground tabular-nums" data-community-stats="">
          {rating ? (
            <span className="inline-flex items-center gap-1" data-stat="rating" aria-label={`Rated ${rating} out of 5`}>
              <Star aria-hidden className="h-3.5 w-3.5 fill-current text-foreground" />
              {rating}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1" data-stat="members" aria-label={`${card.memberCount} ${card.memberCount === 1 ? "member" : "members"}`}>
            <Users aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
            {statCount(card.memberCount)}
          </span>
          {views !== null ? (
            <span className="inline-flex items-center gap-1" data-stat="views" aria-label={`${views} ${views === 1 ? "view" : "views"}`}>
              <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
              {statCount(views)}
            </span>
          ) : null}
          {launched ? (
            <span className="ml-auto whitespace-nowrap" data-stat="launched" suppressHydrationWarning>
              {launched}
            </span>
          ) : null}
        </div>

        {card.priceLine ? (
          <p className="mt-auto pt-4 font-semibold text-foreground" data-community-price="">
            {card.priceLine}
          </p>
        ) : null}
      </div>
    </Link>
  )
}

/** Explore's grid, the product grid's columns: one on a phone, two from 640px, three from 1024px. */
export function ExploreCommunityGrid({ cards, now, className }: { cards: CommunityCard[]; now?: number; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3", className)} data-explore-community-grid="">
      {cards.map((c, i) => (
        <li key={c.id} className="flex min-w-0">
          <ExploreCommunityCard card={c} priority={i < 3} now={now} />
        </li>
      ))}
    </ul>
  )
}
