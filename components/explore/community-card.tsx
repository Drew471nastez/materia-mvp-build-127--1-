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
 *   ROUND 8, THE OWNER'S REFERENCE (a larger mark, a larger name, "by"
 *   with a face, two lines of what it is, one row of facts), without its
 *   "Launched":
 *
 *   its mark beside the name, a rounded square: 56px on a computer, 48 on
 *   a phone; the name in Roboto 500 (the --font-community-title face
 *   app/layout.tsx loads for these titles and nothing else), 20/26 on a
 *   computer and 18/24 on a phone, two lines at most, centred on the mark
 *
 *   "by" and the creator, with their face drawn at 20px from a file of
 *   twice that through the image optimizer, width and height given so
 *   nothing moves when it lands, fetched at once for the first row
 *
 *   a sneak peek of what it is: the tagline, else the start of the
 *   description as plain text, two lines at most with an ellipsis
 *
 *   one row at the foot: the price first and a step larger, a slim
 *   hairline, then the facts, each a count of real rows: active members and
 *   all time views (one per visitor per day, part 87; left out where they
 *   are not known), each icon in a small round well with a hint of depth,
 *   and the stars only when somebody reviewed it (the average, no count).
 *   There is no "Launched" line any more.
 *
 * `layout` is the shape for the place: "grid" is the card in a grid, "row"
 * the compact one for a list (the communities somebody is in), with the same
 * title, mark, creator line, sneak peek and foot row, and where they stand
 * in it after the creator.
 * `surface` is whose colours: "platform" is Storelib's greys, "storefront"
 * leaves the ground to the creator's tokens (--card, --muted...) so the card
 * never looks pasted onto their page.
 * `phone` keeps the phone's sizes where CSS sees a wide window around a
 * narrow frame (the builder's phone preview), as the grid's own `phone` does.
 *
 * The whole card is one link to the community. No hooks: the server draws
 * the first page, the browser the rest, the probe both.
 */
import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronRight, Eye, Star, Users } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { SoftImg } from "@/components/ui/soft-img"
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
  line on a phone, 20px on a 26px line from 640px, no tracking. The variable
  is next/font's (app/layout.tsx); the named family after it covers a page
  drawn without that variable, the probe's. COMMUNITY_TITLE_WIDE is the step
  up, left off where the frame is a phone inside a wide window.
*/
export const COMMUNITY_TITLE = "[font-family:var(--font-community-title,Roboto),sans-serif] text-[18px] font-medium leading-6 tracking-[0px]"
export const COMMUNITY_TITLE_WIDE = "sm:text-[20px] sm:leading-[26px]"

/*
  THE MARK'S SIZES. The file is asked for at the larger one (56px, so a
  128px file on a 2x screen) and drawn at 48 on a phone; one file either
  way, so the browser never fetches a second when the window crosses 640.
*/
/*
  THE COVER AT THE SIZE IT IS DRAWN. It was one file for every screen,
  asked for at twice 640px, which the optimizer rounds up to a 1920px
  picture: on a phone on Slow 3G each card's cover was the heaviest thing on
  the page. Now the browser picks from real widths by the grid's columns
  (one on a phone, two from 640px, three from 1024px in a 1400px page, so
  never wider than about 440px) and the screen's density.
*/
const COVER_WIDTHS = [384, 640, 828, 1080]
export const GRID_SIZES = "(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 440px"

const MARK_PX = 56
/*
  THE MARK'S DEPTH (round 11: "a very little more depth"). It sat flat on the
  card. Storelib's light depth: a hairline drawn as a 1px ring in the shadow
  (so it adds nothing to the size and follows the corner) and a 1px soft drop
  under it, both in the ink of the page's other shadows.
*/
const MARK_DEPTH = "shadow-[0_0_0_1px_rgba(16,24,40,0.07),0_1px_2px_rgba(16,24,40,0.1)]"
const MARK_CLASS = `h-12 w-12 rounded-[12px] ${MARK_DEPTH}`
const MARK_CLASS_WIDE = "sm:h-14 sm:w-14 sm:rounded-[14px]"

/** The logo, else (in a row) its cover, else the initials of its name on a quiet ground: never an empty square. */
function Mark({ card, size, cover = false, eager = false, className }: { card: CommunityCard; size: number; cover?: boolean; eager?: boolean; className?: string }) {
  const src = card.logoUrl || (cover ? card.coverUrl : null)
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizedImageUrl(src, size)}
        alt=""
        width={size}
        height={size}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        data-community-mark=""
        className={cn("shrink-0 bg-muted object-cover", className)}
      />
    )
  }
  /* A community is a mark, not a person: its initials, never the default face. */
  return <AppAvatar src={null} name={card.name} alt="" size={size} sizedByClass className={className} kind="mark" />
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
  A FACT'S ICON IN A SMALL SQUARE WELL: 22px with a 7px corner (round 10:
  the owner asked for small squares, not circles), a step off the card's
  ground, a hairline and the faintest shadow under it with a lighter top
  edge, so it reads as a pressed tile rather than a printed shape. The depth
  is even quieter than the round wells had: the hairline at 4% and the drop
  at 5%, down from 5% and 8%. On a storefront the ground is a tenth of the
  creator's own text colour, as the avatar's is, so it carries on a white
  page and a near black one alike.
*/
export const STAT_WELL_CLASS = "inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px]"

function Well({ storefront, children }: { storefront: boolean; children: ReactNode }) {
  return (
    <span
      aria-hidden
      data-stat-well=""
      className={cn(
        STAT_WELL_CLASS,
        storefront
          ? "bg-foreground/[0.07] text-foreground/70 shadow-[0_1px_1px_rgba(16,24,40,0.05)]"
          : "bg-[#f3f4f6] text-[#4b5563] shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_0_0_1px_rgba(16,24,40,0.04),0_1px_1px_rgba(16,24,40,0.05)]",
      )}
    >
      {children}
    </span>
  )
}

/*
  THE FOOT ROW: the price first, a step larger than the facts (16px, round
  11: "the price / Free a very little bigger"), then a slim
  hairline, then the facts. Each fact is a count of real rows: members, all
  time views where they are known, and the stars only when somebody has
  reviewed it (the average, no count). No "Launched": the owner took it off.
*/
function Facts({ card, storefront, hideViews = false }: { card: CommunityCard; storefront: boolean; /** Your communities list: members and price only. */ hideViews?: boolean }) {
  const rating = ratingLabel(card.rating)
  const views = !hideViews && typeof card.viewCount === "number" ? card.viewCount : null
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[22px] text-muted-foreground tabular-nums" data-community-stats="">
      {card.priceLine ? (
        <>
          <span className="whitespace-nowrap text-[16px] font-semibold leading-[22px] text-foreground" data-community-price="">
            {card.priceLine}
          </span>
          {/* A hairline, not a bullet: 1px wide, 14px tall, in the border colour, so it parts the price from the facts without a mark of its own. */}
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" data-community-divider="" />
        </>
      ) : null}
      <span className="inline-flex items-center gap-1.5" data-stat="members" aria-label={`${card.memberCount} ${card.memberCount === 1 ? "member" : "members"}`}>
        <Well storefront={storefront}>
          <Users className="h-3 w-3" strokeWidth={2} />
        </Well>
        {statCount(card.memberCount)}
      </span>
      {views !== null ? (
        <span className="inline-flex items-center gap-1.5" data-stat="views" aria-label={`${views} all time ${views === 1 ? "view" : "views"}`}>
          <Well storefront={storefront}>
            <Eye className="h-3 w-3" strokeWidth={2} />
          </Well>
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

/*
  "by" AND THE CREATOR'S FACE. The face is 20px, asked for through the image
  optimizer at that size and twice it (AppAvatar's srcset), with its width
  and height on the <img>, so the line is laid out before it arrives and
  nothing moves. The first row fetches it at once; the rest as they near
  the screen.
*/
function Creator({ card, standing, eager = false, wide = true }: { card: CommunityCard; standing?: CommunityStanding | null; eager?: boolean; wide?: boolean }) {
  if (!card.creator?.name && !standing) return null
  return (
    <p className={cn("mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-5 text-muted-foreground", wide && "sm:text-[14px]")} data-community-creator="">
      {card.creator?.name ? (
        <>
          <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={20} lazy={!eager} className="shrink-0" />
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
  phone = false,
  hideViews = false,
}: {
  card: CommunityCard
  /** In the first row: its pictures are fetched at once rather than as they near the screen. */
  priority?: boolean
  layout?: CommunityCardLayout
  surface?: CommunityCardSurface
  standing?: CommunityStanding | null
  /** Where the card opens, when not the community itself (a request still waiting opens its About). */
  href?: string
  /** A phone's sizes at any window width (the builder's phone preview). */
  phone?: boolean
  /** Row lists (e.g. /account/communities): no public view counts. */
  hideViews?: boolean
}) {
  const storefront = surface === "storefront"
  const wide = !phone
  const ring = storefront ? "focus-visible:ring-foreground/20" : "focus-visible:ring-[#1a1a2e]/20"
  const markClass = cn(MARK_CLASS, wide && MARK_CLASS_WIDE)
  const titleClass = cn(COMMUNITY_TITLE, wide && COMMUNITY_TITLE_WIDE)

  if (layout === "row") {
    return (
      <Link
        href={href ?? card.url}
        data-explore-community={card.slug}
        data-community-card={card.slug}
        data-layout="row"
        className={cn(
          "group/community flex min-h-[72px] w-full min-w-0 items-center gap-3.5 rounded-lg border border-border/60 bg-card px-3.5 py-3.5 outline-none transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-2 active:brightness-[0.98] sm:gap-4 sm:px-5 sm:py-4 [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]",
          ring,
        )}
      >
        <Mark card={card} size={MARK_PX} cover eager={priority} className={cn(markClass, "self-start")} />
        <div className="min-w-0 flex-1">
          <h3 className={cn("truncate text-foreground", titleClass)} title={card.name} data-community-title="">
            {card.name}
          </h3>
          <Creator card={card} standing={standing} eager={priority} wide={wide} />
          <Blurb card={card} className="mt-1" />
          <div className="mt-2">
            <Facts card={card} storefront={storefront} hideViews={hideViews} />
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
        "group/community flex h-full w-full min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card isolate outline-none transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] focus-visible:ring-2 active:brightness-[0.98] [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]",
        ring,
      )}
    >
      <div className="relative aspect-video overflow-hidden bg-muted">
        {card.coverUrl ? (
          /*
            ROUND 29: the cover through SoftImg (components/ui/soft-img.tsx), the same files at the same sizes: on its grey box
            until it is loaded and decoded, then up over a short fade if it arrived after the box was painted. One in the
            page's HTML, or one this tab has shown (back to Explore), is simply there. It used to be painted in whenever it
            landed, in strips on a slow phone.
          */
          <SoftImg
            src={card.coverUrl}
            width={420}
            widths={COVER_WIDTHS}
            sizes={phone ? "390px" : GRID_SIZES}
            eager={priority}
            fetchPriority={priority ? "high" : undefined}
            className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none [@media(hover:hover)]:group-hover/community:scale-[1.02]"
          />
        ) : (
          <div className={cn("absolute inset-0 flex items-center justify-center", storefront ? "bg-muted" : "bg-[#f1f2f4]")}>
            <Mark card={card} size={72} eager={priority} className={`h-[72px] w-[72px] rounded-[16px] ${MARK_DEPTH}`} />
          </div>
        )}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col p-4", wide && "sm:px-5 sm:pb-[18px] sm:pt-5")}>
        {/* The mark and the name side by side, the name and its "by" line centred on the mark as in the owner's reference. */}
        <div className={cn("flex min-w-0 items-center gap-3", wide && "sm:gap-3.5")}>
          <Mark card={card} size={MARK_PX} eager={priority} className={markClass} />
          <div className="min-w-0 flex-1">
            <h3 className={cn("line-clamp-2 break-words text-foreground", titleClass)} title={card.name} data-community-title="">
              {card.name}
            </h3>
            <Creator card={card} eager={priority} wide={wide} />
          </div>
        </div>

        <Blurb card={card} className={cn("mt-3", wide && "sm:mt-3.5 sm:text-[14px] sm:leading-[21px]")} />

        {/* At the foot whatever the lengths above, so a row of cards lines up. */}
        <div className="mt-auto pt-4">
          <Facts card={card} storefront={storefront} />
        </div>
      </div>
    </Link>
  )
}

/**
 * The grid, the product grid's columns: one on a phone, two from 640px,
 * three from 1024px. `phone` keeps it to one column, and the cards to a
 * phone's sizes, where CSS sees a wide window around a narrow frame (the
 * builder's phone preview).
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
          <ExploreCommunityCard card={c} priority={i < priorityCount} surface={surface} phone={phone} />
        </li>
      ))}
    </ul>
  )
}
