"use client"

/**
 * ===========================================================================
 *  THE MEMBER AREA'S FRAME: THE WALL
 * ===========================================================================
 * Somebody's community, not a dashboard, and not under Storelib's bar. At
 * the top the community's own bar (top-bar.tsx: its picture, its name, whose
 * it is, the navigator, the search, Messages, Storelib's bell and the
 * member's own menu). Under it, from 1024px, three columns (round 5):
 *
 *   LEFT    the community card (cover, name, address, Members / Online /
 *           Admins, the faces of who was here last, Settings for its staff)
 *           and the places in the community as a list of soft tiles
 *           (wall.tsx). It replaces the row of tabs on a computer.
 *   CENTER  the page: the feed with its space chips and composer, a post,
 *           Members, the classroom, events...
 *   RIGHT   on the feed, a space and Saved: the next event and the top
 *           contributors, each only when there is something real to show.
 *           One card sits at the top; none, and there is no right column at
 *           all and the center takes its room. From 1024px to 1279px the two
 *           cards sit under the left column instead.
 *
 * Below 1024px there is one column, and the places are one row of plain
 * text tabs under the bar (scrolling sideways on a phone). About is the
 * community's own page, the same sheet a visitor reads with its own card at
 * the right, so it has no left column and keeps the row of tabs at every
 * width.
 *
 * The bar (and the tabs under it) stick together at the top. Their height
 * is measured once (ResizeObserver) and shared as --community-top with
 * everything that sticks under them or sits beside them (the right column,
 * the chat's height, the messages panel), rather than guessed twice.
 *
 * PEOPLE. A name anywhere in the frame opens that person's own page; resting
 * on it on a computer opens their card (person-card.tsx). Message, from the
 * card, the members list or a profile, opens the conversation here in the
 * messages panel and never another page. A profile's Message button links to
 * /community/<slug>?dm=<userId>: the frame opens that conversation once and
 * takes ?dm off the address, so a reload or Back does not open it again.
 *
 * While a member page is on screen it tells the server the member is here,
 * once a minute (POST /presence), so "Online" on the community is a real
 * heartbeat and never a guess.
 */
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ViewerView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { MessagesPanel, MESSAGES_EVENT, useUnreadMessages } from "./messages"
import { navEntries, rightColumnFor, sectionFromPath, tabFor, type NavEntry, type TabKey } from "./nav"
import { PersonCardLayer } from "./person-card"
import { Toasts } from "./toast"
import { CommunityTopBar } from "./top-bar"
import { TAB, TAB_OFF, TAB_ON } from "./ui"
import type { ShellCommunity, ShellSection, TopBarData, WallData } from "./view-types"
import { WallCommunityCard, WallContributorsCard, WallPlaces, WallUpcoming } from "./wall"

export { CommunityMark } from "./top-bar"

export interface ShellFrameProps {
  community: ShellCommunity
  viewer: ViewerView
  topBar: TopBarData
  /** Conversations with something unread; null when member messages are not available here. */
  unreadMessages?: number | null
  /** The side columns' facts (lib/communities/server/wall.ts); null draws the page alone in the middle. */
  wall?: WallData | null
  active?: ShellSection
  children: React.ReactNode
}

/** How often a visible member page says the member is here. The server writes at most this often too. */
export const HEARTBEAT_MS = 60_000

/** What ?dm= may carry: an id's characters and nothing else. The server checks it is somebody here. */
const DM_TARGET = /^[0-9a-z-]{1,64}$/i

/**
 * The presence heartbeat: once now, then once a minute while the page is
 * visible, and again when it comes back into view. A hidden tab sends
 * nothing, so somebody who left a tab open in the background drops off the
 * count after five minutes. Stops for good when the server says the column
 * is not there yet (ready: false) or the member is not one any more.
 */
export function usePresenceHeartbeat(communityId: string, userId: string | null) {
  useEffect(() => {
    if (!userId) return
    let stopped = false
    let last = 0
    const beat = async () => {
      if (stopped || document.visibilityState !== "visible") return
      if (Date.now() - last < HEARTBEAT_MS - 5_000) return
      last = Date.now()
      try {
        const res = await fetch(`/api/community/${communityId}/presence`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true })
        if (res.status === 401 || res.status === 403 || res.status === 404) stopped = true
        const data = (await res.json().catch(() => null)) as { ready?: boolean } | null
        if (data && data.ready === false) stopped = true
      } catch {
        /* Offline for a moment: the next minute tries again. */
      }
    }
    void beat()
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS)
    const onVisible = () => void beat()
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      stopped = true
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [communityId, userId])
}

export function ShellFrame({ community, viewer, topBar, unreadMessages = null, wall = null, active, children }: ShellFrameProps) {
  const pathname = usePathname()
  const current: ShellSection = active ?? sectionFromPath(pathname, community.slug)
  const staff = !!viewer.can.manage_members
  const entries = useMemo(() => navEntries(community, staff), [community, staff])
  const [messages, refreshMessages] = useUnreadMessages(community.id, viewer.userId, unreadMessages)
  const [chat, setChat] = useState<{ userId?: string } | null>(null)

  usePresenceHeartbeat(community.id, viewer.userId)
  /* The bar is white, so the browser's bar and the phone's status bar are too. */
  useLightChrome(true)

  /* "Message" on a person's card or a member row opens the panel. */
  useEffect(() => {
    const on = (e: Event) => setChat(((e as CustomEvent<{ userId?: string }>).detail ?? {}) as { userId?: string })
    window.addEventListener(MESSAGES_EVENT, on)
    return () => window.removeEventListener(MESSAGES_EVENT, on)
  }, [])

  /* Null until part 83 is in the database: no button rather than one that opens nothing. */
  const canMessage = messages !== null

  /*
    ?dm=<userId>: A PROFILE'S MESSAGE BUTTON. The conversation with that
    person opens once, and the address loses ?dm (and keeps everything else)
    so a reload or Back does not open it again. Read from the address the
    frame is on now, so it works on arrival and on a link inside the
    community alike, because the frame itself stays mounted between pages.
  */
  const search = useSearchParams()
  const dm = search?.get("dm") ?? null
  useEffect(() => {
    if (!dm) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has("dm")) return
    url.searchParams.delete("dm")
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash)
    if (!canMessage || !DM_TARGET.test(dm) || dm === viewer.userId) return
    setChat({ userId: dm })
  }, [dm, canMessage, viewer.userId])

  const about = current === "about"
  const tab = tabFor(current)
  const membersHref = entries.find((e) => e.key === "members")?.href ?? null
  const right = wall && rightColumnFor(current) ? { upcoming: wall.upcoming, contributors: wall.contributors } : null
  const hasRight = !!right && !!(right.upcoming || right.contributors)

  return (
    /* The header's real heights until it is measured (44 + 40 + its hairline on a phone, 48 + 40 + 1 from 640px, one 56px row + 1 from 1024px): no jump on the first frame. */
    <div data-community-shell="" className={`min-h-svh bg-[#f8f9fa] [--community-top:85px] sm:[--community-top:89px] ${about ? "lg:[--community-top:97px]" : "lg:[--community-top:57px]"}`}>
      <CommunityTopBar
        data={topBar}
        messages={canMessage ? messages : null}
        messagesOpen={!!chat}
        onMessages={() => setChat((c) => (c ? null : {}))}
        search={{ communityId: community.id }}
        tabsOnDesktop={about}
      >
        <SectionTabs entries={entries} current={tab} wide={!about} />
      </CommunityTopBar>

      {/*
        EVERY PAGE ARRIVES THE SAME WAY: a short fade, keyed on the address,
        so moving between the feed, a space, Members and the rest reads as
        one surface changing rather than a blink. Opacity only. About brings
        its own width and its own card; every other page sits in the middle
        column, the classroom and events pages (their own worker's) included.
      */}
      {about ? (
        <div key={pathname} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none">
          {children}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div
            data-community-columns={hasRight ? "three" : "two"}
            className={`pb-16 pt-4 lg:grid lg:items-start lg:gap-x-6 lg:pt-6 ${hasRight ? "lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-rows-[auto]" : "lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]"}`}
          >
            <aside className="hidden min-w-0 space-y-3 lg:col-start-1 lg:row-start-1 lg:block" data-community-left="">
              {wall ? <WallCommunityCard community={community} card={wall.card} membersHref={membersHref} /> : null}
              <WallPlaces entries={entries} current={tab} />
            </aside>
            <div className={`min-w-0 lg:col-start-2 lg:row-start-1 ${hasRight ? "lg:row-span-2 xl:row-span-1" : ""}`} data-community-main="">
              <div key={pathname} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none" data-community-body="">
                {children}
              </div>
            </div>
            {hasRight && right ? (
              <aside className="hidden min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-3 lg:block xl:col-start-3 xl:row-start-1 xl:mt-0 xl:self-stretch" data-community-right="">
                <div className="space-y-3 xl:sticky xl:top-[calc(var(--community-top,57px)+24px)]" data-community-right-cards="">
                  {right.upcoming ? <WallUpcoming slug={community.slug} event={right.upcoming} /> : null}
                  {right.contributors ? <WallContributorsCard slug={community.slug} data={right.contributors} viewAllHref={right.contributors.basis === "points" ? (community.gamificationEnabled ? `/community/${community.slug}/leaderboard` : null) : membersHref} /> : null}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      )}

      <PersonCardLayer communityId={community.id} canMessage={canMessage} />
      {canMessage ? <MessagesPanel communityId={community.id} slug={community.slug} userId={viewer.userId} open={!!chat} start={chat} onClose={() => setChat(null)} onRead={refreshMessages} /> : null}
      <Toasts />
    </div>
  )
}

/**
 * THE ROW OF SECTION TABS under the bar, below 1024px (and on About at every
 * width). Plain words, not pills: the chosen one is ink with a 2px line
 * under it, sitting on the row's bottom edge; the others are muted until
 * hovered. The line grows in from its middle (scale and opacity, nothing
 * that moves the layout). The row scrolls sideways when it does not fit,
 * keeps the chosen tab in view, and fades at an edge only while there is
 * more that way.
 */
export function SectionTabs({ entries, current, wide = true }: { entries: NavEntry[]; current: TabKey; wide?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = () => {
    const el = trackRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }
  useLayoutEffect(() => {
    measure()
    const el = trackRef.current
    const on = el?.querySelector<HTMLElement>('[data-on="true"]')
    if (el && on) {
      const to = on.offsetLeft + on.offsetWidth + 24 - el.clientWidth
      if (to > el.scrollLeft) el.scrollLeft = to
    }
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [current])
  return (
    <nav aria-label="Community sections" data-community-tabs="" className="relative w-full">
      <div ref={trackRef} onScroll={measure} className="overflow-x-auto overscroll-x-contain scrollbar-hide">
        <div className={`mx-auto flex w-max min-w-full items-end gap-6 px-4 sm:gap-7 sm:px-6 lg:px-8 ${wide ? "lg:max-w-[1360px]" : "lg:max-w-[1080px]"}`}>
          {entries.map((e) => {
            const on = current === e.key
            return (
              <Link key={e.key} href={e.href} data-on={on ? "true" : "false"} data-community-nav={e.label} aria-current={on ? "page" : undefined} className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}>
                {e.label}
                <span
                  aria-hidden
                  data-tab-line=""
                  className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-200 ease-sheet motion-reduce:transition-none ${on ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`}
                />
              </Link>
            )
          })}
        </div>
      </div>
      {/* The fade is a layer over the row, not a mask on it, so measuring the scroll never repaints the row. */}
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent transition-opacity duration-200 ${edges.left ? "opacity-100" : "opacity-0"}`} />
      <span aria-hidden className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity duration-200 ${edges.right ? "opacity-100" : "opacity-0"}`} />
    </nav>
  )
}
