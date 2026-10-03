/**
 * ===========================================================================
 *  ONE COMMUNITY, AS A CARD
 * ===========================================================================
 * Explore's communities, Explore's search, and a creator's Communities tab
 * draw a community the same way: its cover (or its logo on a quiet ground
 * when it has none), its name, whose it is, its line, and two facts that are
 * real rows: active members and the price of the way in. The whole card is
 * the link.
 *
 * `surface` is where it sits: "platform" is Storelib's own greys, "storefront"
 * takes the creator's scheme from the CSS tokens their page binds (--card,
 * --foreground, --muted-foreground, --border), so it never looks pasted onto
 * somebody's page.
 *
 * No hooks: drawn on the server, in the browser and by the probe alike.
 */
import Link from "next/link"
import { AppAvatar } from "@/components/app/app-avatar"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { memberCountLabel } from "@/lib/communities/format"
import type { CommunityCard } from "@/lib/communities/types"
import { cn } from "@/lib/utils"

export type CardSurface = "platform" | "storefront"

const SURFACE: Record<CardSurface, { card: string; ink: string; muted: string; soft: string; ground: string; ring: string }> = {
  platform: {
    card: "border-[#e5e7eb]/80 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:border-[#d5d8de] hover:shadow-[0_2px_10px_rgba(16,24,40,0.06)]",
    ink: "text-[#1a1a2e]",
    muted: "text-[#6b7280]",
    soft: "text-[#4b5563]",
    ground: "bg-[#f1f2f4]",
    ring: "focus-visible:ring-[#1a1a2e]/20",
  },
  storefront: {
    card: "border-border bg-card hover:border-foreground/20",
    ink: "text-foreground",
    muted: "text-muted-foreground",
    soft: "text-foreground/75",
    ground: "bg-muted",
    ring: "focus-visible:ring-foreground/20",
  },
}

/** The logo, else the creator's face, else initials: never an empty square. */
function Mark({ card, size, className }: { card: CommunityCard; size: number; className?: string }) {
  if (card.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={optimizedImageUrl(card.logoUrl, size * 2 > 96 ? 128 : 96)}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn("shrink-0 rounded-[10px] object-cover", className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return <AppAvatar src={null} name={card.name} alt="" size={size} className={cn("rounded-[10px]", className)} />
}

export function CommunityCardTile({ card, surface = "platform", priority = false }: { card: CommunityCard; surface?: CardSurface; priority?: boolean }) {
  const s = SURFACE[surface]
  const facts = [memberCountLabel(card.memberCount), card.priceLine].filter(Boolean)
  return (
    <Link
      href={card.url}
      data-community-card={card.slug}
      className={cn(
        "group/card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border outline-none transition-[border-color,box-shadow] duration-150 focus-visible:ring-2",
        s.card,
        s.ring,
      )}
    >
      <div className={cn("relative aspect-[16/9] w-full overflow-hidden", s.ground)}>
        {card.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={optimizedImageUrl(card.coverUrl, 640)}
            alt=""
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-[scale] duration-300 group-hover/card:scale-[1.02] motion-reduce:transition-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Mark card={card} size={56} className="shadow-[0_1px_2px_rgba(16,24,40,0.08)]" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {card.coverUrl ? <Mark card={card} size={32} /> : null}
          <div className="min-w-0">
            <p className={cn("truncate text-[15px] font-semibold leading-5", s.ink)}>{card.name}</p>
            {card.creator?.name ? <p className={cn("truncate text-[12.5px] leading-4", s.muted)}>by {card.creator.name}</p> : null}
          </div>
        </div>
        {card.tagline ? <p className={cn("mt-2 line-clamp-2 text-[13.5px] leading-[1.45]", s.soft)}>{card.tagline}</p> : null}
        <p className={cn("mt-auto pt-3 text-[13px] tabular-nums", s.muted)} data-community-facts="">
          {facts.join(" · ")}
        </p>
      </div>
    </Link>
  )
}

/** A grid of cards: one column on a phone, two from 640px, three from 1024px. */
export function CommunityGrid({ cards, surface = "platform", className }: { cards: CommunityCard[]; surface?: CardSurface; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3", className)} data-community-grid="">
      {cards.map((c, i) => (
        <li key={c.id} className="min-w-0">
          <CommunityCardTile card={c} surface={surface} priority={i < 3} />
        </li>
      ))}
    </ul>
  )
}
