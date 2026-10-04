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
 * Dashboard). At the right, for a member, Messages (the conversations panel,
 * with how many have something unread); for anybody signed in, Storelib's
 * bell (components/notifications/notification-bell.tsx: everything that
 * happened for them, communities included, in one list) and their picture
 * with their profile, library, settings and Explore; for a visitor, Log in.
 *
 * ONE COMPACT BAR (round 4: "not fat"). On a computer from 1024px the
 * section tabs sit in the bar itself, between the name and the icons, so the
 * whole header is one 56px row; below that the tabs are a second, 40px row
 * under a 44px one (48px from 640px). NOTHING IN IT IS A PILL: the icons are
 * plain icon buttons that darken on hover and dim on press, with no disc
 * behind them; Log in is a word; the counts are small squared tags; the only
 * round things are the pictures of people. Every control is still a 40px
 * target on a phone.
 *
 * A BAR OVER THE PAGE. A hairline and a soft shadow under it, so the page
 * reads as passing beneath it. Below the status bar in the phone app
 * (env(safe-area-inset-top)).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { Compass, Library, Settings, Settings2, UserRound } from "lucide-react"
import { ChatRoundDotsIcon as ChatLine } from "@solar-icons/react/linear/chat-round-dots"
import { ChatRoundDotsIcon as ChatBold } from "@solar-icons/react/bold/chat-round-dots"
import { AppAvatar } from "@/components/app/app-avatar"
import { cn } from "@/lib/utils"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { PlaceNavigator } from "./place-navigator"
import { BTN, PLAIN_ICON_BTN } from "./ui"
import type { TopBarCommunity, TopBarData } from "./view-types"

export interface TopBarProps {
  data: TopBarData
  /** The member's conversations with something unread; null when Messages is not available (not a member, or part 83 not run). */
  messages?: number | null
  messagesOpen?: boolean
  onMessages?: () => void
  /** The section tabs (shell-frame.tsx SectionTabs): in the bar on a computer, a row under it on a phone. */
  children?: React.ReactNode
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

export function CommunityTopBar({ data, messages = null, messagesOpen = false, onMessages, children }: TopBarProps) {
  const pathname = usePathname() || ""
  const ref = useRef<HTMLElement>(null)
  useCommunityTop(ref)
  const { community, creator, me } = data
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
      <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center px-4 sm:px-6 lg:flex-nowrap lg:gap-6 lg:px-8" data-community-top-row="">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2.5 sm:h-12 lg:h-14 lg:max-w-[340px] lg:flex-none" data-community-top-lead="">
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

        {children ? (
          /* Below 1024px the tabs wrap onto their own row, edge to edge; from 1024px they fill the middle of the bar. */
          <div className="order-last -mx-4 min-w-0 basis-[calc(100%+2rem)] sm:-mx-6 sm:basis-[calc(100%+3rem)] lg:order-none lg:mx-0 lg:flex-1 lg:basis-auto lg:self-stretch" data-community-top-tabs="">
            {children}
          </div>
        ) : null}

        <div className="ml-auto flex h-11 shrink-0 items-center gap-0.5 pl-2 sm:h-12 sm:gap-1 lg:ml-0 lg:h-14 lg:pl-0" data-community-top-actions="">
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
                <button type="button" aria-label="Your account" className={`${BTN} -mr-1 h-10 w-10`} data-community-me="">
                  <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={32} markWhileLoading />
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
