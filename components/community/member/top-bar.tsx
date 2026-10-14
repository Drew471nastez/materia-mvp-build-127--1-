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
 * middle ("Search discussions, members, or content...", a field from 768px).
 * Round 9: no search icon in the bar; on a phone the tab bar's Search opens
 * the community's search screen (search.tsx, drawn here without its icon).
 * At the right, for a member, Messages (the conversations panel, with how
 * many have something unread); for anybody signed in, Storelib's bell
 * (components/notifications/notification-bell.tsx; its phone sheet at least
 * half the screen, round 11) and a flat "..." that opens the Storelib
 * header's account menu in its short form (account-menu.tsx, round 11:
 * Invite people, Saved posts, Profile, Settings, Dashboard for a seller,
 * Log out); for a visitor, Log in.
 *
 * ONE COMFORTABLE BAR (round 7: "taller, not fat"): 64px on a computer, 56px
 * on a phone and a tablet; the community's picture 40px (36px on a phone),
 * the bell and Messages 24px glyphs. The places in the community are not in
 * it: from 1024px they are the list in the right column (wall.tsx), and below
 * that (or on a page with no side columns, About) one row of plain text tabs
 * under the bar. NOTHING IN IT IS A PILL: the hamburger is a 40px square
 * at 10px with the faintest grey ground, a hairline and a one pixel shadow
 * (DEPTH_ICON_BTN, "extremely little depth"); the "..." is flat (round 9,
 * FLAT_ICON_BTN: a tint on hover only); Messages and the bell are plain
 * icons that darken on hover; the search field is squared at 12px; Log in
 * is a word; the only round things are the pictures of people and the red
 * notification bubbles (round 12).
 *
 * ONE OPAQUE WHITE SURFACE WITH THE STATUS BAR (round 9). The bar's white
 * reaches up through env(safe-area-inset-top), so in the phone app the band
 * under the clock is the bar itself, the same white, never a second colour
 * or a tint the page shows through; a hairline at its bottom and nothing
 * else marks where the page passes beneath it.
 *
 * DRAWN ONCE PER VISIT. The bar is memoised and reads nothing from the
 * address (only a visitor's Log in does, in a piece of its own), so moving
 * between the places of a community, which re-renders the frame around it,
 * never draws it again (round 9: "the frame never re-renders or flashes").
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { memo, useLayoutEffect, useRef } from "react"
import { ChatRoundDotsIcon as ChatLine } from "@solar-icons/react/linear/chat-round-dots"
import { ChatRoundDotsIcon as ChatBold } from "@solar-icons/react/bold/chat-round-dots"
import { CommunityMark } from "./community-mark"
import { cn } from "@/lib/utils"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { AppearanceButton } from "@/components/platform/appearance-switch"
import { NOTIFICATION_BADGE } from "@/components/notifications/badge-tone"
import { CommunityAccountMenu, type CommunityMenuRows } from "./account-menu"
import { PlaceNavigator } from "./place-navigator"
import { CommunitySearchButton, CommunitySearchField } from "./search"
import { DEPTH_ICON_BTN, PLAIN_ICON_BTN } from "./ui"
import { FULL_ON_HOVER } from "./nav"
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
  /** The community's own rows in the "..." menu (Invite people, Saved posts), for a member. */
  menu?: CommunityMenuRows | null
  /** Lined up with the frame's three columns (1360px). Left out: a member's bar is, anybody else's is the 1080px sheet's. */
  wide?: boolean
}

/**
 * The small count on an icon: the red notification bubble with white figures
 * (round 12, reversing round 8's ink; components/notifications/badge-tone.ts),
 * round like the bell's own, so Messages and the bell read as one pair and as
 * the same bubble the Storelib header and the dashboard draw.
 */
function Badge({ n }: { n: number }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute -right-2 -top-1.5 box-border flex h-[18px] min-w-[18px] items-center justify-center px-[5px] ${NOTIFICATION_BADGE}`} data-count-badge="">
      <span className="block text-[10px] font-semibold leading-none tabular-nums">{n > 99 ? "99+" : String(n)}</span>
    </span>
  )
}

/** Storelib's bell, made a plain icon button here, its glyph 24px (round 7: "a bit bigger"), its count the same red bubble as Messages'. */
const BELL = `${PLAIN_ICON_BTN} [&_svg.lucide-bell]:h-6 [&_svg.lucide-bell]:w-6`

/**
 * The hamburger: three even 2px lines, 18px wide and 4px apart, on whole
 * pixels in a 40px square (so no line blurs into two), in the bar's one
 * control with a little depth (DEPTH_ICON_BTN). Open, it sits pressed in.
 */
/* `flex`, not the depth button's `inline-flex`: inline, the button sat on a line box inside the navigator's block wrapper, whose strut put it 2px under the row's centre (30 against 28 at 390) and its lines on half pixels. */
const HAMBURGER = `${DEPTH_ICON_BTN} flex rounded-[10px] text-[#1a1a2e] hover:text-[#1a1a2e] aria-expanded:bg-[#eef0f2] aria-expanded:shadow-none [&_[data-navigator-lines]]:w-[18px] [&_[data-navigator-lines]]:gap-[4px]`

export { CommunityMark }

/**
 * The bar's height (with the pills under it, for a member), measured once
 * and shared as --community-top: on the frame around it, for everything that
 * sticks under it or sizes itself from it (the about card, the feed's side
 * card, a chat), and on <html> for what is portalled to the body (the
 * messages panel). Never guessed twice.
 */
/** Each kind of bar's height as last measured (THE HEIGHT THIS BAR HAD LAST TIME, below). */
const lastTop = new Map<string, string>()
function useCommunityTop(ref: React.RefObject<HTMLElement | null>) {
  /*
    ROUND 21: NO READ ON THE WAY IN, NO WRITE THAT CHANGES NOTHING. The height was read in the layout effect and written on
    <html> every time the bar mounted (and taken off <html> when it went): coming back to the community from the account
    (Home in the tab bar), that read laid the whole new page out in the effect, and the write on <html> restyled every node
    under it again. Now the frame starts from the CSS it already has ([--community-top] in shell-frame.tsx), the
    ResizeObserver reports the bar's own box after the browser's layout, and a value is written only where it differs.
  */
  useLayoutEffect(() => {
    const header = ref.current
    const frame = header?.parentElement
    if (!header || !frame) return
    const html = document.documentElement
    /* Written only where it differs: the inline value when there is one; the frame's CSS default otherwise (read once, on a first visit). */
    const put = (el: HTMLElement, h: string) => {
      const inline = el.style.getPropertyValue("--community-top")
      const now = inline || (el === html ? "" : getComputedStyle(el).getPropertyValue("--community-top").trim())
      if (now !== h) el.style.setProperty("--community-top", h)
    }
    /*
      THE HEIGHT THIS BAR HAD LAST TIME, written in the commit with no read: the frame is new and not yet styled, and <html>
      changes in the same style pass as everything else the arrival writes, instead of in a pass of its own afterwards. Keyed by
      the bar's own kind and the screen's class, so the account's bar and the community's never lend each other a height.
    */
    const kind = `${header.closest("[data-account-community-chrome]") ? "account" : "community"}|${header.className}|${window.matchMedia?.("(min-width: 1024px)").matches ? "lg" : "sm"}`
    const known = lastTop.get(kind)
    if (known) {
      frame.style.setProperty("--community-top", known)
      if (html.style.getPropertyValue("--community-top") !== known) html.style.setProperty("--community-top", known)
    }
    /* Reads first, writes after: the report is taken in the observer, the write on the next frame, so another observer reading a box in the same report never has to lay the page out again because of it. */
    let frameId = 0
    const set = (px: number) => {
      if (!px) return
      const h = `${Math.round(px)}px`
      lastTop.set(kind, h)
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        put(frame, h)
        put(html, h)
      })
    }
    if (typeof ResizeObserver === "undefined") {
      set(header.getBoundingClientRect().height)
      return () => cancelAnimationFrame(frameId)
    }
    const ro = new ResizeObserver((entries) => {
      const e = entries[entries.length - 1]
      set(e?.borderBoxSize?.[0]?.blockSize ?? e?.contentRect.height ?? 0)
    })
    ro.observe(header)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(frameId)
    }
  }, [ref])
}

/** A visitor's Log in, back to the page they are on: the one piece of the bar that follows the address. */
function LogInLink({ base }: { base: string }) {
  const pathname = usePathname() || ""
  return (
    <Link
      href={`/login?next=${encodeURIComponent(pathname || base)}`}
      className="-mr-2 inline-flex h-10 shrink-0 items-center px-2 text-[14px] font-semibold text-[#1a1a2e] outline-none underline-offset-4 transition-opacity hover:underline focus-visible:underline active:opacity-60 [-webkit-tap-highlight-color:transparent]"
      data-community-login=""
    >
      Log in
    </Link>
  )
}

function CommunityTopBarInner({ data, messages = null, messagesOpen = false, onMessages, search = null, children, tabsOnDesktop = false, menu = null, wide: wideProp }: TopBarProps) {
  const ref = useRef<HTMLElement>(null)
  useCommunityTop(ref)
  const { community, creator, me } = data
  /* The frames line the bar up with their three columns (1360px), the visitor's too since round 12 (public-frame.tsx). */
  const wide = wideProp ?? (!!search && !tabsOnDesktop)
  const base = `/community/${community.slug}`

  return (
    <header
      ref={ref}
      data-community-top=""
      className="sticky top-0 z-40 border-b border-[#e6e8ec] bg-white pt-[env(safe-area-inset-top)]"
    >
      <div className={cn("mx-auto flex w-full flex-wrap items-center px-4 sm:px-6 md:gap-x-4 lg:gap-x-6 lg:px-8", wide ? "max-w-[1360px]" : "max-w-[1080px]")} data-community-top-row="">
        <div className={cn("flex h-14 min-w-0 flex-1 items-center gap-1.5 min-[400px]:gap-2 md:gap-3 lg:h-16", search ? "md:max-w-[320px] md:flex-none" : "lg:max-w-[360px] lg:flex-none", wide && "lg:w-[260px] lg:max-w-none xl:w-[280px]")} data-community-top-lead="">
          <Link href={base} aria-label={`${community.name}, home`} className="flex shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15" data-community-mark="">
            <span className="flex md:hidden">
              <CommunityMark community={community} size={36} priority />
            </span>
            <span className="hidden md:flex">
              <CommunityMark community={community} size={40} priority />
            </span>
          </Link>
          <div className="min-w-0 leading-tight" data-community-identity="">
            {/*
              A PHONE GIVES THE NAME TWO LINES (round 8, at 375 and 390 a one line name read "Clay Stu..."): the bar is 56px, two lines of
              15px (14px under 400px, where the actions also lose their gap, so a 12 letter word still fits a line) sit in it, and a name
              that needs a third is cut on the second. One line again from 768px, where there is room.
            */}
            <Link href={base} className="line-clamp-2 break-words text-[14px] font-semibold leading-[1.2] tracking-[-0.005em] text-[#1a1a2e] outline-none hover:underline focus-visible:underline min-[400px]:text-[15px] md:line-clamp-1 md:text-[16px] md:leading-tight" data-community-name="">
              {community.name}
            </Link>
            {creator ? (
              /* A computer only (round 7): on a phone the bar is the picture and the name. */
              <p className="hidden truncate text-[12.5px] leading-[1.35] text-[#6b7280] md:block" data-community-by="">
                By{" "}
                {creator.href ? (
                  /* Their page read whole the moment a pointer rests on it (round 12), so it lands at once. */
                  <Link href={creator.href} {...FULL_ON_HOVER} className="font-medium text-[#4b5563] outline-none hover:text-[#1a1a2e] hover:underline focus-visible:underline" data-person-link="" data-community-creator="">
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
          /* The tabs are their own row under the bar, edge to edge: below 1024px always, and from 1024px where the frame asks for it (tabsOnDesktop, the member area since round 26). */
          <div className={cn("order-last -mx-4 mt-0 min-w-0 basis-[calc(100%+2rem)] pb-0 pt-0.5 sm:-mx-6 sm:basis-[calc(100%+3rem)] lg:-mx-8 lg:basis-[calc(100%+4rem)]", !tabsOnDesktop && "lg:hidden")} data-community-top-tabs="">
            {children}
          </div>
        ) : null}

        <div className="ml-auto flex h-14 shrink-0 items-center gap-0.5 pl-0 min-[400px]:pl-2 sm:gap-1 md:pl-0 lg:h-16" data-community-top-actions="">
          {/* No icon (round 9): the screen alone, which the phone's tab bar Search opens. */}
          {search ? <CommunitySearchButton communityId={search.communityId} slug={community.slug} trigger={false} /> : null}
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
          {/* Half the screen at least on a phone (round 11): one notification is not a sliver of a sheet. */}
          {/* The bell owns the tab here (round 13): "(3) Clay Studio" and a red dot on the community's icon while something is unread. */}
          {/* Light or dark, beside the bell on a computer (round 27); on a phone it is a row of the account sheet. */}
          <AppearanceButton className="hidden md:grid" />
          {me ? <NotificationBell className={BELL} sheetMin="50dvh" tabBadge /> : null}
          {me ? <CommunityAccountMenu me={me} className="md:ml-1" onInvite={menu?.onInvite} savedHref={menu?.savedHref} membershipHref={menu?.membershipHref} /> : <LogInLink base={base} />}
        </div>
      </div>
    </header>
  )
}

/**
 * The bar, drawn again only when what it shows changes (the count on
 * Messages, the panel opening, a new page of tabs), never because the
 * address moved. The frame (shell-frame.tsx) hands it stable props: the
 * tabs read the place they mark from a context of their own.
 */
export const CommunityTopBar = memo(CommunityTopBarInner)
