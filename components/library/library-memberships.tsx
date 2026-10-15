import Link from "next/link"
import { SoftImg } from "@/components/ui/soft-img"
import { AppAvatar } from "@/components/app/app-avatar"
import { StatusLabel, TONE_TEXT } from "@/components/memberships/status-line"
import { libraryMembershipPath } from "@/lib/library/paths"
import type { MembershipCard } from "@/lib/memberships/view-types"
import { SECONDARY, SMALL } from "./library-ui"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  A MEMBERSHIP, AS A ROW OF THE LIBRARY'S PRODUCTS
 * ===========================================================================
 * Memberships are communities now, so the library has no Memberships pill.
 * A membership bought on its own still bills and still has its page, and
 * the buyer finds it with the rest of what they bought: at the top of
 * Products, drawn like a product row (./product-row.tsx: the same picture,
 * the same grid, the same 36px action), and labelled Membership so it reads
 * as what it is. Where it stands is the line the membership page uses
 * (components/memberships/status-line): a dot, a word, and what happens
 * next. Posts not read yet are counted on the row.
 *
 * The cards come from lib/library/library-memberships.ts. No hooks, so the
 * row draws the same on the server, in the client list and in the probe.
 */

/** Whether a membership answers the words typed into the library's search: its name or its creator. */
export function membershipMatches(card: MembershipCard, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return card.title.toLowerCase().includes(q) || card.creator.name.toLowerCase().includes(q)
}

function Thumb({ card, eager = false }: { card: MembershipCard; eager?: boolean }) {
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#f1f3f5] ring-1 ring-inset ring-black/[0.04] sm:h-[72px] sm:w-[72px]">
      {card.cover ? (
        <SoftImg src={card.cover} width={72} sizes="(min-width: 640px) 72px, 64px" eager={eager} className="absolute inset-0 h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center">
          <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={40} markWhileLoading />
        </span>
      )}
    </div>
  )
}

/** `eager`: a row on the first screen (round 29), whose picture is asked for at once rather than when the browser gets to it. */
export function LibraryMembershipRow({ card, eager = false }: { card: MembershipCard; eager?: boolean }) {
  const href = libraryMembershipPath(card.id)
  return (
    <li data-library-membership={card.id} className="px-4 py-4 sm:px-5">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-x-3.5 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-x-4">
        <Link href={href} tabIndex={-1} aria-hidden className="shrink-0">
          <Thumb card={card} eager={eager} />
        </Link>
        <div className="min-w-0">
          <div className="flex min-w-0 items-start gap-2">
            <Link
              href={href}
              className={cn(
                "line-clamp-2 min-w-0 text-[15px] font-semibold leading-snug [overflow-wrap:anywhere] hover:underline hover:decoration-[#1a1a2e]/30 hover:underline-offset-2",
                card.access ? "text-[#1a1a2e]" : "text-[#4b5563]",
              )}
            >
              {card.title}
            </Link>
            {card.unread > 0 ? (
              <span data-unread-count={card.unread} className="mt-px inline-flex shrink-0 items-center gap-1 rounded-full bg-[#f3efff] px-2 py-0.5 text-[12px] font-semibold text-[#6d28d9]">
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#8b5cf6]" />
                {card.unread} new
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] text-[#6b7280]">
            <span data-membership-label="" className="shrink-0 rounded-md bg-[#f1f2f4] px-1.5 py-px text-[12px] font-medium leading-[18px] text-[#4b5563]">
              Membership
            </span>
            <AppAvatar src={card.creator.avatarUrl} name={card.creator.name} alt="" size={18} markWhileLoading className="shrink-0" />
            <span className="truncate">{card.creator.name}</span>
          </p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug">
            <StatusLabel view={card.view} className="mr-2 align-baseline" />
            {card.view.line ? <span className={card.view.tone === "bad" ? TONE_TEXT.bad : "text-[#6b7280]"}>{card.view.line}</span> : null}
          </p>
        </div>
        <div className="col-span-2 mt-3 flex items-center gap-2 sm:col-span-1 sm:mt-0 sm:self-start">
          <Link href={href} className={cn(SECONDARY, SMALL, "flex-1 sm:min-w-[120px] sm:flex-none")}>
            Open
          </Link>
        </div>
      </div>
    </li>
  )
}
