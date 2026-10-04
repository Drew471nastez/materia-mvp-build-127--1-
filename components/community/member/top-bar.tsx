"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN TOP BAR
 * ===========================================================================
 * Every page of a community carries this bar instead of Storelib's: it is
 * somebody's community, so the bar says whose. At the left the community's
 * picture and name, with "By <creator>" under it on a computer (their page,
 * in this tab), and the hamburger, which opens Storelib's one navigator
 * (what I opened lately from my library, my communities, Discover
 * communities, Explore, Start creating or Dashboard): right of the name on a
 * computer, LEFT of the picture on a phone (round 7), where the bar reads
 * hamburger, picture, name. For a member, the community's search in the
 * middle ("Search discussions, members, or content...", a field from 768px,
 * an icon that opens it over the whole screen on a phone). At the right, for
 * a member, Messages (the conversations panel, with how many have something
 * unread); for anybody signed in, Storelib's bell (components/notifications/
 * notification-bell.tsx) and a quiet "..." that opens exactly the Storelib
 * header's account menu (account-menu.tsx: Profile is always /account); for
 * a visitor, Log in.
 *
 * ONE COMFORTABLE BAR (round 7: "taller, not fat"): 64px on a computer, 56px
 * on a phone and a tablet; the community's picture 40px (36px on a phone),
 * the bell and Messages 24px glyphs. The places in the community are not in
 * it: from 1024px they are the list in the right column (wall.tsx), and below
 * that (or on a page with no side columns, About) one row of plain text tabs
 * under the bar. NOTHING IN IT IS A PILL: the hamburger and the "..." are
 * 40px squares at 10px with the faintest grey ground, a hairline and a one
 * pixel shadow (DEPTH_ICON_BTN, "extremely little depth"); Messages and the
 * bell are plain icons that darken on hover; the search field is squared at
 * 12px; Log in is a word; the counts are small squared tags; the only round
 * things are the pictures of people.
 *
 * A BAR OVER THE PAGE. A hairline and a soft shadow under it, so the page
 * reads as passing beneath it. Below the status bar in the phone app
 * (env(safe-area-inset-top)).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { ChatRoundDotsIcon as ChatLine } from "@solar-icons/react/linear/chat-round-dots"
import { ChatRoundDotsIcon as ChatBold } from "@solar-icons/react/bold/chat-round-dots"
import { CommunityMark } from "./community-mark"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { CommunityAccountMenu } from "./account-menu"
import { PlaceNavigator } from "./place-navigator"
import { CommunitySearchButton, CommunitySearchField } from "./search"
import { DEPTH_ICON_BTN, PLAIN_ICON_BTN } from "./ui"
import type { TopBarData } from "./view-types"

export interface TopBarProps {
  data: TopBarData
  /** The member's conversations with something unread; null when Messages is not available (not a member, or part 83 not run). */
  messages?: number | null
  messagesOpen?: boolean
  onMessages?: () => void
  /** The community's search, for a member; left out for anybody else. */
  search?: { communityId: string } | null
  /** The section tabs (shell-frame.tsx SectionTabs): a row under the bar below 1024px, and from 1024px only when `tabsOnDesktop` (a page with no left column). */
  children?: React.ReactNode
  tabsOnDesktop?: boolean
}

/**
 * The small count on an icon: Storelib's ink with white figures (round 8:
 * not red), squared off rather than a round blob, so nothing in this bar is
 * a pill. The bell's own count is
 * drawn the same way here (BELL below), so the two read as one pair.
 */
const COUNT = "rounded-[5px]"
function Badge({ n }: { n: number }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center ${COUNT} bg-[#1a1a2e] px-[5px] text-white`} data-count-badge="">
      <span className="block text-[10px] font-semibold leading-none tabular-nums">{n > 99 ? "99+" : String(n)}</span>
    </span>
  )
}

/** Storelib's bell, made a plain icon button here, its glyph 24px (round 7: "a bit bigger"), its count squared like Messages'. */
const BELL = `${PLAIN_ICON_BTN} [&_[data-bell-badge]]:rounded-[5px] [&_svg.lucide-bell]:h-6 [&_svg.lucide-bell]:w-6`

/**
 * The hamburger: three even 2px lines, 18px wide and 4px apart, on whole
 * pixels in a 40px square (so no line blurs into two), in the bar's one
 * control with a little depth (DEPTH_ICON_BTN). Open, it sits pressed in.
 */
const HAMBURGER = `${DEPTH_ICON_BTN} rounded-[10px] text-[#1a1a2e] hover:text-[#1a1a2e] aria-expanded:bg-[#eef0f2] aria-expanded:shadow-none [&_[data-navigator-lines]]:w-[18px] [&_[data-navigator-lines]]:gap-[4px]`

export { CommunityMark }

/**
 * The bar's height (with the pills under it, for a member), measured once
 * and shared as --community-top: on the frame around it, for everything that
 * sticks under it or sizes itself from it (the about card, the feed's side
 * card, a chat), and on <html> for what is portalled to the body (the
 * messages panel). Never guessed twice.
 */
function useCommunityTop(ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const header = ref.current
    const frame = header?.parentElement
    if (!header || !frame) return
    const html = document.documentElement
    const set = () => {
      const h = `${Math.round(header.getBoundingClientRect().height)}px`
      frame.style.setProperty("--community-top", h)
      html.style.setProperty("--community-top", h)
    }
    set()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(set)
    ro?.observe(header)
    return () => {
      ro?.disconnect()
      html.style.removeProperty("--community-top")
    }
  }, [ref])
}

export function CommunityTopBar({ data, messages = null, messagesOpen = false, onMessages, search = null, children, tabsOnDesktop = false }: TopBarProps) {
  const pathname = usePathname() || ""
  const ref = useRef<HTMLElement>(null)
  useCommunityTop(ref)
  const { community, creator, me } = data
  /* The member's frame lines the bar up with its three columns (1360px); a visitor's page and About keep the sheet's 1080px. */
  const wide = !!search && !tabsOnDesktop
  const base = `/community/${community.slug}`

  return (
    <header
      ref={ref}
      data-community-top=""
      className="sticky top-0 z-40 border-b border-[#e6e8ec] bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_20px_-14px_rgba(17,24,39,0.16)]"
    >
      <div className={cn("mx-auto flex w-full flex-wrap items-center px-4 sm:px-6 md:gap-x-4 lg:gap-x-6 lg:px-8", wide ? "max-w-[1360px]" : "max-w-[1080px]")} data-community-top-row="">
        <div className={cn("flex h-14 min-w-0 flex-1 items-center gap-2 md:gap-3 lg:h-16", search ? "md:max-w-[320px] md:flex-none" : "lg:max-w-[360px] lg:flex-none", wide && "lg:w-[260px] lg:max-w-none xl:w-[280px]")} data-community-top-lead="">
          <Link href={base} aria-label={`${community.name}, home`} className="flex shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-community-mark="">
            <span className="flex md:hidden">
              <CommunityMark community={community} size={36} />
            </span>
            <span className="hidden md:flex">
              <CommunityMark community={community} size={40} />
            </span>
          </Link>
          <div className="min-w-0 leading-tight" data-community-identity="">
            <Link href={base} className="block truncate text-[15px] font-semibold tracking-[-0.005em] text-[#1a1a2e] outline-none hover:underline focus-visible:underline md:text-[16px]">
              {community.name}
            </Link>
            {creator ? (
              /* A computer only (round 7): on a phone the bar is the picture and the name. */
              <p className="hidden truncate text-[12.5px] leading-[1.35] text-[#6b7280] md:block" data-community-by="">
                By{" "}
                {creator.href ? (
                  <Link href={creator.href} className="font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-person-link="" data-community-creator="">
                    {creator.name}
                  </Link>
                ) : (
                  <span className="font-medium text-[#4b5563]">{creator.name}</span>
                )}
              </p>
            ) : null}
          </div>
          {/*
            Right of the picture and the name on a computer, as the Storelib header has it right of its logo; FIRST on a phone (order), left of
            the picture. One navigator either way, moved by `order` rather than drawn twice. A block flex box, so no line box sits under it.
          */}
          <div className="order-first flex shrink-0 md:order-none md:ml-0.5" data-community-hamburger="">
            <PlaceNavigator current={{ kind: "community", id: community.id }} className={HAMBURGER} />
          </div>
        </div>

        {search ? (
          /* From 768px the field sits in the middle of the bar, lined up with the feed's column from 1024px; on a phone it is the icon among the actions. */
          <CommunitySearchField communityId={search.communityId} slug={community.slug} className="hidden md:block md:max-w-[640px] md:flex-1 md:basis-0" />
        ) : null}

        {children ? (
          /* The tabs are their own row under the bar, edge to edge, below 1024px; from 1024px the right column has the places, so the row is only drawn where there is none. */
          <div className={cn("order-last -mx-4 min-w-0 basis-[calc(100%+2rem)] sm:-mx-6 sm:basis-[calc(100%+3rem)] lg:-mx-8 lg:basis-[calc(100%+4rem)]", !tabsOnDesktop && "lg:hidden")} data-community-top-tabs="">
            {children}
          </div>
        ) : null}

        <div className="ml-auto flex h-14 shrink-0 items-center gap-0.5 pl-2 sm:gap-1 md:pl-0 lg:h-16" data-community-top-actions="">
          {search ? <CommunitySearchButton communityId={search.communityId} slug={community.slug} className="md:hidden" /> : null}
          {messages !== null && onMessages ? (
            <button
              type="button"
              onClick={onMessages}
              aria-label={messages ? `Messages, ${messages} unread` : "Messages"}
              aria-expanded={messagesOpen}
              className={cn(PLAIN_ICON_BTN, "relative", messagesOpen && "text-[#1a1a2e]")}
              data-community-messages-button=""
            >
              <span className="relative inline-flex">
                {messagesOpen ? <ChatBold size={24} /> : <ChatLine size={24} />}
                {messages > 0 ? <Badge n={messages} /> : null}
              </span>
            </button>
          ) : null}
          {me ? <NotificationBell className={BELL} /> : null}
          {me ? (
            <CommunityAccountMenu me={me} className="md:ml-1.5" />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname || base)}`}
              className="-mr-2 inline-flex h-10 shrink-0 items-center px-2 text-[14px] font-semibold text-[#1a1a2e] outline-none underline-offset-4 transition-opacity hover:underline focus-visible:underline active:opacity-60 [-webkit-tap-highlight-color:transparent]"
              data-community-login=""
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
