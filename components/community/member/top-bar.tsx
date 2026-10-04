"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN TOP BAR
 * ===========================================================================
 * Every page of a community carries this bar instead of Storelib's: it is
 * somebody's community, so the bar says whose. At the left the community's
 * picture and name with "By <creator>" under it (their page, in this tab),
 * and right of them the hamburger, which opens Storelib's one navigator (the
 * same one right of the Storelib logo: what I opened lately from my library,
 * my communities, Discover communities, Explore, Start creating or
 * Dashboard). For a member, the community's search in the middle (round 5:
 * "Search discussions, members, or content...", a field from 768px, an icon
 * that opens it over the whole screen on a phone). At the right, for a
 * member, Messages (the conversations panel, with how many have something
 * unread); for anybody signed in, Storelib's bell (components/notifications/
 * notification-bell.tsx) and their picture with a chevron, opening their
 * profile, library, settings and Explore; for a visitor, Log in.
 *
 * ONE COMPACT BAR (round 4: "not fat"): one 56px row on a computer, 44px
 * on a phone (48px from 640px). The places in the community are not in it:
 * from 1024px they are the list in the left column (wall.tsx), and below
 * that (or on a page with no left column, About) they are one row of plain
 * text tabs under the bar. NOTHING IN IT IS A PILL: the icons are plain
 * icon buttons that darken on hover and dim on press, with no disc behind
 * them; the search field is squared at 12px; Log in is a word; the counts
 * are small squared tags; the only round things are the pictures of people.
 * Every control is still a 40px target on a phone.
 *
 * A BAR OVER THE PAGE. A hairline and a soft shadow under it, so the page
 * reads as passing beneath it. Below the status bar in the phone app
 * (env(safe-area-inset-top)).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { ChevronDown, Compass, Library, Settings, Settings2, UserRound } from "lucide-react"
import { ChatRoundDotsIcon as ChatLine } from "@solar-icons/react/linear/chat-round-dots"
import { ChatRoundDotsIcon as ChatBold } from "@solar-icons/react/bold/chat-round-dots"
import { AppAvatar } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { PlaceNavigator } from "./place-navigator"
import { CommunitySearchButton, CommunitySearchField } from "./search"
import { PLAIN_ICON_BTN } from "./ui"
import type { TopBarCommunity, TopBarData } from "./view-types"

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
 * The small count on an icon: Storelib's red, squared off rather than a
 * round blob, so nothing in this bar is a pill. The bell's own count is
 * drawn the same way here (BELL below), so the two read as one pair.
 */
const COUNT = "rounded-[5px]"
function Badge({ n }: { n: number }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center ${COUNT} bg-red-500 px-[5px] text-white`} data-count-badge="">
      <span className="block text-[10px] font-semibold leading-none tabular-nums">{n > 99 ? "99+" : String(n)}</span>
    </span>
  )
}

/** Storelib's bell, made a plain icon button here, its count squared like Messages'. */
const BELL = `${PLAIN_ICON_BTN} [&_[data-bell-badge]]:rounded-[5px]`

/** The community's picture, or its initials on a quiet grey square. */
export function CommunityMark({ community, size }: { community: Pick<TopBarCommunity, "name" | "logoUrl">; size: number }) {
  return <AppAvatar src={community.logoUrl} name={community.name} alt="" size={size} className="shrink-0 rounded-[10px]" markWhileLoading />
}

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
  const meItems: ActionMenuItem[] = me
    ? [
        ...(data.manageHref ? [{ label: "Manage community", href: data.manageHref, icon: <Settings2 aria-hidden /> }] : []),
        { label: "My profile", href: me.profileHref, icon: <UserRound aria-hidden />, separatorBefore: !!data.manageHref },
        { label: "Library", href: "/account/library", icon: <Library aria-hidden /> },
        { label: "Settings", href: "/account/settings", icon: <Settings aria-hidden /> },
        { label: "Explore Storelib", href: "/explore", icon: <Compass aria-hidden />, separatorBefore: true },
      ]
    : []

  return (
    <header
      ref={ref}
      data-community-top=""
      className="sticky top-0 z-40 border-b border-[#e6e8ec] bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_2px_rgba(17,24,39,0.04),0_8px_20px_-14px_rgba(17,24,39,0.16)]"
    >
      <div className={cn("mx-auto flex w-full flex-wrap items-center px-4 sm:px-6 md:gap-x-4 lg:gap-x-6 lg:px-8", wide ? "max-w-[1360px]" : "max-w-[1080px]")} data-community-top-row="">
        <div className={cn("flex h-11 min-w-0 flex-1 items-center gap-2.5 sm:h-12 lg:h-14", search ? "md:max-w-[300px] md:flex-none" : "lg:max-w-[340px] lg:flex-none", wide && "lg:w-[260px] lg:max-w-none xl:w-[280px]")} data-community-top-lead="">
          <Link href={base} aria-label={`${community.name}, home`} className="shrink-0 rounded-[9px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
            <span className="sm:hidden">
              <CommunityMark community={community} size={32} />
            </span>
            <span className="hidden sm:block">
              <CommunityMark community={community} size={34} />
            </span>
          </Link>
          <div className="min-w-0 leading-tight" data-community-identity="">
            <Link href={base} className="block truncate text-[15px] font-semibold tracking-[-0.005em] text-[#1a1a2e] outline-none hover:underline focus-visible:underline">
              {community.name}
            </Link>
            {creator ? (
              <p className="truncate text-[12.5px] leading-[1.3] text-[#6b7280]">
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
          {/* Right of the picture and the name, as the Storelib header has it right of its logo. A block flex box (not inline), so no line box sits under it and it centres in the row. */}
          <PlaceNavigator current={{ kind: "community", id: community.id }} className={`-ml-1 ${PLAIN_ICON_BTN} flex text-[#1a1a2e] hover:text-[#1a1a2e]`} />
        </div>

        {search ? (
          /* From 768px the field sits in the middle of the bar, lined up with the feed's column from 1024px; on a phone it is the icon among the actions. */
          <CommunitySearchField communityId={search.communityId} slug={community.slug} className="hidden md:block md:max-w-[640px] md:flex-1 md:basis-0" />
        ) : null}

        {children ? (
          /* The tabs are their own row under the bar, edge to edge, below 1024px; from 1024px the left column has the places, so the row is only drawn where there is none. */
          <div className={cn("order-last -mx-4 min-w-0 basis-[calc(100%+2rem)] sm:-mx-6 sm:basis-[calc(100%+3rem)] lg:-mx-8 lg:basis-[calc(100%+4rem)]", !tabsOnDesktop && "lg:hidden")} data-community-top-tabs="">
            {children}
          </div>
        ) : null}

        <div className="ml-auto flex h-11 shrink-0 items-center gap-0.5 pl-2 sm:h-12 sm:gap-1 md:pl-0 lg:h-14" data-community-top-actions="">
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
                {messagesOpen ? <ChatBold size={22} /> : <ChatLine size={22} />}
                {messages > 0 ? <Badge n={messages} /> : null}
              </span>
            </button>
          ) : null}
          {me ? <NotificationBell className={BELL} /> : null}
          {me ? (
            <ResponsiveActionMenu
              title={me.name}
              menuWidth="w-56"
              items={meItems}
              trigger={
                <button type="button" aria-label="Your account" className="group/me -mr-1 inline-flex h-10 min-w-10 shrink-0 cursor-pointer select-none items-center justify-center gap-1 rounded-[10px] outline-none transition-opacity duration-150 active:opacity-70 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none [-webkit-tap-highlight-color:transparent] md:pl-1 md:pr-0.5" data-community-me="">
                  <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={32} markWhileLoading />
                  <ChevronDown className="hidden h-4 w-4 text-[#6b7280] transition-colors group-hover/me:text-[#1a1a2e] md:block" strokeWidth={2} aria-hidden data-community-me-chevron="" />
                </button>
              }
            />
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
