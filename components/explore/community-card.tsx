/**
 * ===========================================================================
 *  THE COMMUNITY CARD, EVERYWHERE A COMMUNITY IS LISTED
 * ===========================================================================
 * Explore's communities mode, Explore's search, a creator's Communities tab
 * (the storefront, the builder's canvas, a profile) and the communities
 * somebody is in all draw a community with this one card, so it looks the
 * same and says the same things wherever it is found. There used to be a
 * second, older card (components/community/public/community-card.tsx, "3
 * members · Free" with no stats) behind the storefront and profile tabs; it
 * is gone, so nothing can draw that one again.
 *
 * Built from the product card's parts (components/explore/product-card.tsx):
 * the same 16:9 picture, the same border and lift, the same 16px body, the
 * price at the foot. What is a community's own:
 *
 *   its mark beside the name, a little bigger than a seller's face, and the
 *   name in Roboto 500 18/24 (the --font-community-title face app/layout.tsx
 *   loads for these titles and nothing else), two lines at most
 *
 *   "by" and the creator, with their face, under the name
 *
 *   one quiet row of facts, each a count of real rows: the stars only when
 *   somebody reviewed it (the average and no count), active members, all
 *   time views (one per visitor per day, part 87; left out where they are
 *   not known), and how long ago it opened
 *
 * `layout` is the shape for the place: "grid" is the card in a grid, "row"
 * the compact one for a list (the communities somebody is in), with the same
 * title, mark, creator line and stats row and where they stand in it.
 * `surface` is whose colours: "platform" is Storelib's greys, "storefront"
 * leaves the ground to the creator's tokens (--card, --muted...) so the card
 * never looks pasted onto their page.
 *
 * The whole card is one link to the community. No hooks: the server draws
 * the first page, the browser the rest, the probe both.
 */
import Link from "next/link"
import { ChevronRight, Eye, Star, Users } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import type { CommunityCard } from "@/lib/communities/types"
import { launchedLabel, ratingLabel, statCount } from "@/lib/explore/communities-mode"
import { cn } from "@/lib/utils"

export type CommunityCardSurface = "platform" | "storefront"
export type CommunityCardLayout = "grid" | "row"

/** Where the viewer stands in it, for the row in their own list: "Owner", a tier, "Request sent". */
export interface CommunityStanding {
  label: string
  pending?: boolean
}

/*
  THE TITLE'S FACE, one class for every layout: Roboto 500 at 18px on a 24px
  line, no tracking. The variable is next/font's (app/layout.tsx); the named
  family after it covers a page drawn without that variable, the probe's.
*/
export const COMMUNITY_TITLE = "[font-family:var(--font-community-title,Roboto),sans-serif] text-[18px] font-medium leading-6 tracking-[0px]"

/** The logo, else (in a row) its cover, else the initials of its name on a quiet ground: never an empty square. */
function Mark({ card, size, cover = false, className }: { card: CommunityCard; size: number; cover?: boolean; className?: string }) {
  const src = card.logoUrl || (cover ? card.coverUrl : null)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizedImageUrl(src, size > 48 ? 128 : 96)}
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

/** The row of facts, the same in every layout. `standing` leads it in a row. */
function Stats({ card, now, standing, pushLaunched }: { card: CommunityCard; now?: number; standing?: CommunityStanding | null; pushLaunched: boolean }) {
  const rating = ratingLabel(card.rating)
  const launched = launchedLabel(card.launchedAt, now)
  const views = typeof card.viewCount === "number" ? card.viewCount : null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] leading-5 text-muted-foreground tabular-nums" data-community-stats="">
      {standing ? (
        <span className={cn("font-medium", standing.pending ? "text-[#92400e]" : "text-foreground")} data-community-standing="">
          {standing.label}
        </span>
      ) : null}
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
        <span className={cn("whitespace-nowrap", pushLaunched && "ml-auto")} data-stat="launched" suppressHydrationWarning>
          {launched}
        </span>
      ) : null}
    </div>
  )
}

function Creator({ card }: { card: CommunityCard }) {
  if (!card.creator?.name) return null
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground" data-community-creator="">
      <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={18} className="shrink-0" />
      <span className="truncate">by {card.creator.name}</span>
    </p>
  )
}

export function ExploreCommunityCard({
  card,
  priority = false,
  now,
  layout = "grid",
  surface = "platform",
  standing = null,
  href,
}: {
  card: CommunityCard
  priority?: boolean
  now?: number
  layout?: CommunityCardLayout
  surface?: CommunityCardSurface
  standing?: CommunityStanding | null
  /** Where the card opens, when not the community itself (a request still waiting opens its About). */
  href?: string
}) {
  const storefront = surface === "storefront"
  const ring = storefront ? "focus-visible:ring-foreground/20" : "focus-visible:ring-[#1a1a2e]/20"

  if (layout === "row") {
    return (
      <Link
        href={href ?? card.url}
        data-explore-community={card.slug}
        data-community-card={card.slug}
        data-layout="row"
        className={cn(
          "group/community flex min-h-[72px] w-full min-w-0 items-center gap-3.5 rounded-lg border border-border/60 bg-card px-3.5 py-3.5 outline-none transition-[border-color,box-shadow] duration-300 ease-out focus-visible:ring-2 active:brightness-[0.98] sm:gap-4 sm:px-5 sm:py-4 [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]",
          ring,
        )}
      >
        <Mark card={card} size={52} cover />
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate text-foreground", COMMUNITY_TITLE)} title={card.name} data-community-title="">
            {card.name}
          </h3>
          <Creator card={card} />
          <div className="mt-1.5">
            <Stats card={card} now={now} standing={standing} pushLaunched={false} />
          </div>
        </div>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground/60 transition-[translate] duration-150 [@media(hover:hover)]:group-hover/community:translate-x-0.5" />
      </Link>
    )
  }

  return (
    <Link
      href={href ?? card.url}
      data-explore-community={card.slug}
      data-community-card={card.slug}
      data-layout="grid"
      className={cn(
        "group/community flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card outline-none transition-[border-color,box-shadow] duration-300 ease-out focus-visible:ring-2 active:brightness-[0.98] [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]",
        ring,
      )}
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
          <div className={cn("absolute inset-0 flex items-center justify-center", storefront ? "bg-muted" : "bg-[#f1f2f4]")}>
            <Mark card={card} size={64} className="shadow-[0_1px_2px_rgba(16,24,40,0.08)]" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Mark card={card} size={40} />
          <div className="min-w-0 flex-1">
            <h3 className={cn("line-clamp-2 break-words text-foreground", COMMUNITY_TITLE)} title={card.name} data-community-title="">
              {card.name}
            </h3>
            <Creator card={card} />
          </div>
        </div>

        <div className="mt-3">
          <Stats card={card} now={now} pushLaunched />
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

/**
 * The grid, the product grid's columns: one on a phone, two from 640px,
 * three from 1024px. `phone` keeps it to one column where CSS sees a wide
 * window around a narrow frame (the builder's phone preview).
 */
export function ExploreCommunityGrid({
  cards,
  now,
  className,
  surface = "platform",
  phone = false,
  priorityCount = 3,
}: {
  cards: CommunityCard[]
  now?: number
  className?: string
  surface?: CommunityCardSurface
  phone?: boolean
  priorityCount?: number
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-5", !phone && "sm:grid-cols-2 lg:grid-cols-3", className)} data-explore-community-grid="">
      {cards.map((c, i) => (
        <li key={c.id} className="flex min-w-0">
          <ExploreCommunityCard card={c} priority={i < priorityCount} now={now} surface={surface} />
        </li>
      ))}
    </ul>
  )
}
