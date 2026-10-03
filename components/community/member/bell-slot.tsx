"use client"

/**
 * THE BELL IN THE COMMUNITY'S TOP BAR.
 *
 * Storelib's own bell (components/notifications/notification-bell.tsx,
 * NotificationBell: every notification a person gets, communities included,
 * in one dropdown) is built on another branch. Until it is here, this slot
 * draws the community's own inbox as it always has: a bell that opens
 * /community/<slug>/notifications, with the unread count kept live from the
 * member's community_notifications rows. Nobody is left without a way to
 * their notifications in the meantime, and nothing here is a dead button.
 *
 * ON MERGE: replace the body of BellSlot with
 *
 *   import { NotificationBell } from "@/components/notifications/notification-bell"
 *   export function BellSlot({ className }: BellSlotProps) {
 *     return <NotificationBell className={className} />
 *   }
 *
 * and nothing else changes: the top bar only ever renders <BellSlot />.
 */
import Link from "next/link"
import { BellIcon as BellLine } from "@solar-icons/react/linear/bell"
import { BellIcon as BellBold } from "@solar-icons/react/bold/bell"
import { useUnreadNotifications } from "./realtime"
import { ICON_BTN } from "./ui"

export interface BellSlotProps {
  className?: string
  /** The community the fallback's inbox belongs to; null for a visitor who is not a member (no bell then). */
  community: { id: string; slug: string } | null
  userId: string | null
  unread: number
  on?: boolean
}

export function countBadge(n: number): string {
  return n > 99 ? "99+" : String(n)
}

export function BellSlot({ className = "", community, userId, unread, on = false }: BellSlotProps) {
  if (!community || !userId) return null
  return <CommunityBell className={className} community={community} userId={userId} initial={unread} on={on} />
}

function CommunityBell({ className, community, userId, initial, on }: { className: string; community: { id: string; slug: string }; userId: string; initial: number; on: boolean }) {
  const unread = useUnreadNotifications(community.id, userId, initial)
  const Icon = on ? BellBold : BellLine
  return (
    <Link
      href={`/community/${community.slug}/notifications`}
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      aria-current={on ? "page" : undefined}
      className={`${ICON_BTN} relative ${className}`}
      data-community-bell=""
    >
      <Icon size={22} />
      {unread > 0 ? <Badge n={unread} /> : null}
    </Link>
  )
}

/** The small count on an icon: ink on white, never a shouting red. */
export function Badge({ n }: { n: number }) {
  return (
    <span className="pointer-events-none absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-[#1a1a2e] px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white ring-2 ring-white" data-count-badge="">
      {countBadge(n)}
    </span>
  )
}
