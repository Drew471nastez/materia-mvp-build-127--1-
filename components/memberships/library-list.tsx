/**
 * ===========================================================================
 *  EVERY MEMBERSHIP, FROM EVERY CREATOR
 * ===========================================================================
 * The buyer's /library/memberships: one row per membership, the ones that
 * are running first (a failed payment at the very top, then the one with
 * the newest post), and the ones that have ended under them, quieter.
 *
 * A row says whose it is (the membership's picture, or the creator's face),
 * where it stands (a dot and a word) and what happens next ("Renews Oct 28,
 * 2026 for $9", "Access until ...", "Update your card by ..."), and how many
 * posts are new since they last looked. The whole row opens the membership.
 *
 * No hooks: drawn on the server, and by the probe.
 */
import Link from "next/link"
import { LibraryEmptyState } from "@/components/library/library-empty-state"
import { ChevronRight } from "lucide-react"
import { AppAvatar } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"
import type { MembershipCard } from "@/lib/memberships/view-types"
import { StatusLabel, TONE_TEXT } from "./status-line"

function Cover({ card, size }: { card: MembershipCard; size: number }) {
  if (card.cover) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={card.cover} alt="" width={size} height={size} loading="lazy" decoding="async" className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />
    )
  }
  return <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={size} markWhileLoading className="rounded-xl" />
}

function Row({ card }: { card: MembershipCard }) {
  return (
    <li>
      <Link
        href={`/library/memberships/${card.id}`}
        data-membership-row={card.id}
        className={cn(
          "group/row flex items-center gap-3.5 rounded-2xl border border-[#e5e7eb]/70 bg-white px-3.5 py-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] outline-none transition-[border-color,box-shadow] duration-150 hover:border-[#d9dce1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-[#8b5cf6] sm:gap-4 sm:px-5 sm:py-4",
          !card.access && "bg-white/70",
        )}
      >
        <Cover card={card} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className={cn("min-w-0 truncate text-[15.5px] font-semibold leading-snug", card.access ? "text-[#1a1a2e]" : "text-[#4b5563]")}>{card.title}</p>
            {card.unread > 0 ? (
              <span data-unread-count={card.unread} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f3efff] px-2 py-0.5 text-[12px] font-semibold text-[#6d28d9]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                {card.unread} new
              </span>
            ) : null}
          </div>
          <p className="truncate text-[13px] text-[#6b7280]">by {card.creator.name}</p>
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug">
            <StatusLabel view={card.view} className="mr-2 align-baseline" />
            {card.view.line ? <span className={card.view.tone === "bad" ? TONE_TEXT.bad : "text-[#6b7280]"}>{card.view.line}</span> : null}
          </p>
        </div>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-[#b6bac2] transition-[translate] duration-150 group-hover/row:translate-x-0.5" />
      </Link>
    </li>
  )
}

export function MembershipsList({ current, ended }: { current: MembershipCard[]; ended: MembershipCard[] }) {
  if (current.length === 0 && ended.length === 0) {
    return (
      <div data-memberships-empty="">
        <LibraryEmptyState
          title="No memberships yet"
          description="Creators you support show up here — memberships you've joined and the posts they share with members."
          ctaLabel="Discover creators"
          ctaHref="/explore"
        />
      </div>
    )
  }
  return (
    <div className="space-y-8">
      {current.length > 0 ? (
        <ul className="space-y-2.5" aria-label="Your memberships">
          {current.map((c) => (
            <Row key={c.id} card={c} />
          ))}
        </ul>
      ) : null}
      {ended.length > 0 ? (
        <section aria-labelledby="memberships-ended">
          <h2 id="memberships-ended" className="mb-2.5 px-1 text-[13px] font-semibold text-[#6b7280]">
            Ended
          </h2>
          <ul className="space-y-2.5">
            {ended.map((c) => (
              <Row key={c.id} card={c} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
