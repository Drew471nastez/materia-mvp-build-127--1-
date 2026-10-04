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
 * the same 16:9 picture, the same border and lift, the same 16px body. What
 * is a community's own (round 6, the owner's layout):
 *
 *   its mark beside the name, 44px (ten per cent over the 40 it was), and
 *   the name in Roboto 500 18/24 (the --font-community-title face
 *   app/layout.tsx loads for these titles and nothing else), two lines at
 *   most
 *
 *   "by" and the creator, with their face, under the name
 *
 *   a sneak peek of what it is: the tagline, else the start of the
 *   description as plain text, two lines at most with an ellipsis
 *
 *   one row at the foot: the price first, a slim hairline, then the facts,
 *   each a count of real rows: active members, all time views (one per
 *   visitor per day, part 87; left out where they are not known), and the
 *   stars only when somebody reviewed it (the average, no count). There is
 *   no "Launched" line any more.
 *
 * `layout` is the shape for the place: "grid" is the card in a grid, "row"
 * the compact one for a list (the communities somebody is in), with the same
 * title, mark, creator line, sneak peek and foot row, and where they stand
 * in it after the creator.
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
import { ratingLabel, statCount } from "@/lib/explore/communities-mode"
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

/** What the card says it is about: the tagline, else the start of the description, as plain text. */
export function cardBlurb(card: Pick<CommunityCard, "tagline" | "excerpt">): string | null {
  return card.tagline?.trim() || card.excerpt?.trim() || null
}

/*
  THE SNEAK PEEK, two lines at most with an ellipsis, in the creator line's
  grey. Its own paragraph so a screen reader reads it after the name.
*/
function Blurb({ card, className }: { card: CommunityCard; className?: string }) {
  const text = cardBlurb(card)
  if (!text) return null
  return (
    <p className={cn("line-clamp-2 break-words text-[13.5px] leading-5 text-muted-foreground", className)} data-community-blurb="">
      {text}
    </p>
  )
}

/*
  THE FOOT ROW: the price first, then a slim hairline, then the facts. Each
  fact is a count of real rows: members, all time views where they are known,
  and the stars only when somebody has reviewed it (the average, no count).
  No "Launched": the owner took it off.
*/
function Facts({ card }: { card: CommunityCard }) {
  const rating = ratingLabel(card.rating)
  const views = typeof card.viewCount === "number" ? card.viewCount : null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-muted-foreground tabular-nums" data-community-stats="">
      {card.priceLine ? (
        <>
          <span className="whitespace-nowrap text-[14px] font-semibold text-foreground" data-community-price="">
            {card.priceLine}
          </span>
          {/* A hairline, not a bullet: 1px wide, 14px tall, in the border colour, so it parts the price from the facts without a mark of its own. */}
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" data-community-divider="" />
        </>
      ) : null}
      <span className="inline-flex items-center gap-1" data-stat="members" aria-label={`${card.memberCount} ${card.memberCount === 1 ? "member" : "members"}`}>
        <Users aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
        {statCount(card.memberCount)}
      </span>
      {views !== null ? (
        <span className="inline-flex items-center gap-1" data-stat="views" aria-label={`${views} all time ${views === 1 ? "view" : "views"}`}>
          <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.9} />
          {statCount(views)}
        </span>
      ) : null}
      {rating ? (
        <span className="inline-flex items-center gap-1" data-stat="rating" aria-label={`Rated ${rating} out of 5`}>
          <Star aria-hidden className="h-3.5 w-3.5 fill-current text-foreground" />
          {rating}
        </span>
      ) : null}
    </div>
  )
}

function Creator({ card, standing }: { card: CommunityCard; standing?: CommunityStanding | null }) {
  if (!card.creator?.name && !standing) return null
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground" data-community-creator="">
      {card.creator?.name ? (
        <>
          <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={18} className="shrink-0" />
          <span className="truncate">by {card.creator.name}</span>
        </>
      ) : null}
      {standing ? (
        <>
          {card.creator?.name ? <span aria-hidden className="shrink-0 text-muted-foreground/60">·</span> : null}
          <span className={cn("shrink-0 whitespace-nowrap font-medium", standing.pending ? "text-[#92400e]" : "text-foreground")} data-community-standing="">
            {standing.label}
          </span>
        </>
      ) : null}
    </p>
  )
}

export function ExploreCommunityCard({
  card,
  priority = false,
  layout = "grid",
  surface = "platform",
  standing = null,
  href,
}: {
  card: CommunityCard
  priority?: boolean
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
        <Mark card={card} size={57} cover />
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate text-foreground", COMMUNITY_TITLE)} title={card.name} data-community-title="">
            {card.name}
          </h3>
          <Creator card={card} standing={standing} />
          <Blurb card={card} className="mt-1" />
          <div className="mt-1.5">
            <Facts card={card} />
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
            <Mark card={card} size={70} className="shadow-[0_1px_2px_rgba(16,24,40,0.08)]" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Mark card={card} size={44} />
          <div className="min-w-0 flex-1">
            <h3 className={cn("line-clamp-2 break-words text-foreground", COMMUNITY_TITLE)} title={card.name} data-community-title="">
              {card.name}
            </h3>
            <Creator card={card} />
          </div>
        </div>

        <Blurb card={card} className="mt-2.5" />

        {/* At the foot whatever the lengths above, so a row of cards lines up. */}
        <div className="mt-auto pt-3.5">
          <Facts card={card} />
        </div>
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
  className,
  surface = "platform",
  phone = false,
  priorityCount = 3,
}: {
  cards: CommunityCard[]
  className?: string
  surface?: CommunityCardSurface
  phone?: boolean
  priorityCount?: number
}) {
  return (
    <ul className={cn("grid grid-cols-1 gap-5", !phone && "sm:grid-cols-2 lg:grid-cols-3", className)} data-explore-community-grid="">
      {cards.map((c, i) => (
        <li key={c.id} className="flex min-w-0">
          <ExploreCommunityCard card={c} priority={i < priorityCount} surface={surface} />
        </li>
      ))}
    </ul>
  )
}
