"use client"

/**
 * ===========================================================================
 *  THE COMMUNITY'S OWN TOP BAR
 * ===========================================================================
 * Every page of a community carries this bar instead of Storelib's: it is
 * somebody's community, so the bar says whose. At the left the community's
 * picture and name with "By <creator>" under it (their page, in this tab),
 * and a switcher: the other communities this person is in, Discover
 * communities and Explore Storelib, which is how somebody inside a community
 * still reaches everything else. At the right, for a member, Messages (the
 * conversations panel, with how many have something unread); for anybody
 * signed in, Storelib's bell (components/notifications/notification-bell.tsx:
 * everything that happened for them, communities included, in one list) and
 * their picture with their profile, library, settings and Explore; for a
 * visitor, Log in.
 *
 * The same bar on a phone, smaller, with the switcher as a sheet. It sits
 * below the status bar in the phone app (env(safe-area-inset-top)).
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef } from "react"
import { ChevronsUpDown, Compass, LayoutGrid, Library, Settings, Settings2, UserRound } from "lucide-react"
import { ChatRoundDotsIcon as ChatLine } from "@solar-icons/react/linear/chat-round-dots"
import { ChatRoundDotsIcon as ChatBold } from "@solar-icons/react/bold/chat-round-dots"
import { AppAvatar } from "@/components/app/app-avatar"
import { ResponsiveActionMenu, type ActionMenuItem } from "@/components/ui/responsive-action-menu"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { BTN, ICON_BTN } from "./ui"
import type { TopBarCommunity, TopBarData } from "./view-types"

export interface TopBarProps {
  data: TopBarData
  /** The member's conversations with something unread; null when Messages is not available (not a member, or part 83 not run). */
  messages?: number | null
  messagesOpen?: boolean
  onMessages?: () => void
  children?: React.ReactNode
}

/** The small count on an icon, drawn exactly as Storelib's bell draws its own, so the two read as one pair. */
function Badge({ n }: { n: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-[5px] text-white" data-count-badge="">
      <span className="block text-[10px] font-semibold leading-none tabular-nums">{n > 99 ? "99+" : String(n)}</span>
    </span>
  )
}

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
  const others = data.communities

  const switchItems: ActionMenuItem[] = [
    ...others.map((c, i) => ({
      label: c.name,
      href: `/community/${c.slug}`,
      icon: <AppAvatar src={c.logoUrl} name={c.name} alt="" size={20} className="rounded-[6px]" />,
      section: i === 0 ? "Your communities" : undefined,
    })),
    { label: "Discover communities", href: "/explore/communities", icon: <Compass aria-hidden />, separatorBefore: others.length > 0 },
    { label: "Explore Storelib", href: "/explore", icon: <LayoutGrid aria-hidden /> },
  ]

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
    <header ref={ref} data-community-top="" className="sticky top-0 z-40 border-b border-[#eceef1] bg-white pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-6 lg:px-8" data-community-top-row="">
        <Link href={base} aria-label={`${community.name}, home`} className="shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15">
          <span className="sm:hidden">
            <CommunityMark community={community} size={34} />
          </span>
          <span className="hidden sm:block">
            <CommunityMark community={community} size={38} />
          </span>
        </Link>
        <div className="min-w-0 leading-tight" data-community-identity="">
          <Link href={base} className="block truncate text-[15px] font-semibold tracking-[-0.005em] text-[#1a1a2e] outline-none hover:underline focus-visible:underline sm:text-[16px]">
            {community.name}
          </Link>
          {creator ? (
            <p className="truncate text-[12.5px] text-[#6b7280]">
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
        <ResponsiveActionMenu
          title="Switch community"
          align="start"
          menuWidth="w-72"
          items={switchItems}
          trigger={
            <button type="button" aria-label="Switch community" className={`${ICON_BTN} -ml-1 shrink-0 text-[#8a8f98]`} data-community-switcher="">
              <ChevronsUpDown className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
            </button>
          }
        />

        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
          {messages !== null && onMessages ? (
            <button
              type="button"
              onClick={onMessages}
              aria-label={messages ? `Messages, ${messages} unread` : "Messages"}
              aria-expanded={messagesOpen}
              className={`${ICON_BTN} relative`}
              data-community-messages-button=""
            >
              <span className="relative inline-flex">
                {messagesOpen ? <ChatBold size={22} /> : <ChatLine size={22} />}
                {messages > 0 ? <Badge n={messages} /> : null}
              </span>
            </button>
          ) : null}
          {me ? <NotificationBell className="text-[#6b7280] outline-none hover:bg-[#f1f2f4] hover:text-[#1a1a2e] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" /> : null}
          {me ? (
            <ResponsiveActionMenu
              title={me.name}
              menuWidth="w-56"
              items={meItems}
              trigger={
                <button type="button" aria-label="Your account" className={`${BTN} ml-0.5 h-10 w-10 sm:ml-1`} data-community-me="">
                  <AppAvatar src={me.avatarUrl} name={me.name} alt="" size={34} markWhileLoading />
                </button>
              }
            />
          ) : (
            <Link
              href={`/login?next=${encodeURIComponent(pathname || base)}`}
              className={`${BTN} ml-1 h-10 border border-[#e3e4e8] bg-white px-4 text-[#1a1a2e] hover:bg-[#f6f7f8]`}
              data-community-login=""
            >
              Log in
            </Link>
          )}
        </div>
      </div>
      {children}
    </header>
  )
}
