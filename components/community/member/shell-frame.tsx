"use client"

/**
 * ===========================================================================
 *  THE MEMBER AREA'S FRAME: THE WALL
 * ===========================================================================
 * Somebody's community, not a dashboard, and not under Storelib's bar. At
 * the top the community's own bar (top-bar.tsx: its picture, its name, whose
 * it is, the navigator, the search, Messages, Storelib's bell and the
 * Storelib account menu behind "..."). Under it, from 1280px, three columns
 * (round 7 swapped the sides):
 *
 *   LEFT    the community card (cover, name, Members / Online / Admins, the
 *           faces of who was here last, Settings for its staff) and, on the
 *           feed, a space and Saved, the top contributors (or the most
 *           active) under it.
 *   CENTER  the page: the feed with its space chips and composer, a post,
 *           Members, the classroom, events...
 *   RIGHT   the places in the community (Community, Classroom, Calendar,
 *           Members, Leaderboards, About) as a list of soft tiles, and on
 *           the feed the next event under them, sticking under the bar.
 *
 * The three columns are the same on every page inside the community, so
 * moving between the feed, Members and the classroom never moves the
 * middle column: only what is in it changes (round 7, "route transitions
 * without a full re-render of the frame"). From 1024px to 1279px there are
 * two: the left one holds the card, the places, the next event and the
 * contributors, in that order.
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
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ViewerView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { MessagesPanel, MESSAGES_EVENT, useUnreadMessages } from "./messages"
import { FULL_ON_HOVER, navEntries, rightColumnFor, sectionFromPath, tabFor, type NavEntry, type TabKey } from "./nav"
import { PersonCardLayer } from "./person-card"
import { Toasts } from "./toast"
import { CommunityTopBar } from "./top-bar"
import { InviteGlyph } from "./invite-glyph"
import { InviteSheet } from "./invite-sheet"
import { TAB, TAB_OFF, TAB_ON } from "./ui"
import type { ShellCommunity, ShellSection, TopBarData, WallData } from "./view-types"
import { plainClick, WallCommunityCard, WallContributorsCard, WallPlaces, WallUpcoming } from "./wall"

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
  /* Round 8: the invite sheet, opened from the card or the end of the tabs. */
  const [inviting, setInviting] = useState(false)
  const openInvite = useCallback(() => setInviting(true), [])
  const canInvite = !!viewer.can.invite && !community.archived
  /* The creator side's list of invites, for whoever has it (the owner, or a creator account that runs this community). */
  const manageInvites = canInvite && (viewer.isOwner || viewer.isCreatorAccount) ? `/app/community/${community.id}/members` : null

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

  /*
    THE PLACE MARKED AT ONCE. A click on a place marks it on the next frame, before its page has arrived (the frame stays, the page in
    the middle swaps when it is ready); the address catching up clears the mark.
  */
  const [going, setGoing] = useState<{ key: TabKey; from: string | null } | null>(null)
  if (going && going.from !== pathname) setGoing(null)
  const goTo = useCallback((key: TabKey) => setGoing({ key, from: pathname }), [pathname])
  const about = current === "about"
  const tab = going?.key ?? tabFor(current)
  const membersHref = entries.find((e) => e.key === "members")?.href ?? null
  const feedish = rightColumnFor(current)
  const upcoming = wall && feedish ? wall.upcoming : null
  const contributors = wall && feedish ? wall.contributors : null
  /*
    WHICH PAGE IS IN THE MIDDLE, for its entrance. A space, a post, Saved and the feed are all "home" (one place), so moving between spaces,
    which the feed does in place (feed.tsx), never remounts the page; a new place (Members, the classroom...) fades in.
  */
  const pageKey = about ? "about" : tabFor(current)

  return (
    /* The header's real heights until it is measured (56 + 40 of tabs + its hairline below 1024px, one 64px row + 1 from 1024px, About keeps its tabs): no jump on the first frame. */
    <div data-community-shell="" className={`min-h-svh bg-[#f8f9fa] [--community-top:97px] ${about ? "lg:[--community-top:105px]" : "lg:[--community-top:65px]"}`}>
      <CommunityTopBar
        data={topBar}
        messages={canMessage ? messages : null}
        messagesOpen={!!chat}
        onMessages={() => setChat((c) => (c ? null : {}))}
        search={{ communityId: community.id }}
        tabsOnDesktop={about}
      >
        <SectionTabs entries={entries} current={tab} wide={!about} onGo={goTo} trailing={community.archived ? null : <InviteTab onInvite={openInvite} />} />
      </CommunityTopBar>

      {/*
        A PLACE ARRIVES WITH A SHORT FADE, keyed on the place rather than the address, so moving between places reads as one surface
        changing, and moving between spaces (the same place) changes nothing but the list. Opacity only. About brings its own width and
        its own card; every other page sits in the middle column, the classroom and events pages (their own worker's) included.
      */}
      {about ? (
        <div key={pageKey} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none">
          {children}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div
            data-community-columns="three"
            className="pb-16 pt-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-x-6 lg:pt-6 xl:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-rows-[auto_1fr]"
          >
            {/* LEFT: the community card. */}
            <div className="hidden min-w-0 lg:col-start-1 lg:row-start-1 lg:block" data-community-left="">
              {wall ? <WallCommunityCard community={community} card={wall.card} membersHref={membersHref} onInvite={community.archived ? undefined : openInvite} /> : null}
            </div>
            {/* RIGHT from 1280px (under the card from 1024px): the places, then the next event, sticking under the bar. */}
            <aside className="hidden min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-3 lg:block xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:self-stretch" data-community-right="">
              <div className="space-y-3 xl:sticky xl:top-[calc(var(--community-top,65px)+24px)]" data-community-right-cards="">
                <WallPlaces entries={entries} current={tab} onGo={goTo} />
                {upcoming ? <WallUpcoming slug={community.slug} event={upcoming} /> : null}
              </div>
            </aside>
            {/* LEFT, under the card: who takes part, on the feed. */}
            {contributors ? (
              <div className="hidden min-w-0 lg:col-start-1 lg:row-start-3 lg:mt-3 lg:block xl:row-start-2" data-community-left-more="">
                <WallContributorsCard slug={community.slug} data={contributors} viewAllHref={contributors.basis === "points" ? (community.gamificationEnabled ? `/community/${community.slug}/leaderboard` : null) : membersHref} />
              </div>
            ) : null}
            <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1 xl:row-span-2" data-community-main="">
              <div key={pageKey} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none" data-community-body="">
                {children}
              </div>
            </div>
          </div>
        </div>
      )}

      {community.archived ? null : <InviteSheet open={inviting} onClose={() => setInviting(false)} community={community} staff={canInvite} manageHref={manageInvites} />}
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
export function SectionTabs({ entries, current, wide = true, onGo, trailing = null }: { entries: NavEntry[]; current: TabKey; wide?: boolean; onGo?: (key: TabKey) => void; /** Pinned at the row's right end, outside what scrolls (round 8: Invite). */ trailing?: React.ReactNode }) {
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
      {/* The row lines up with the page under it (1360px, About's 1080px); only the tabs scroll, so an action pinned at the end stays put. */}
      <div className={`mx-auto flex w-full items-stretch ${wide ? "lg:max-w-[1360px]" : "lg:max-w-[1080px]"}`}>
        <div className="relative min-w-0 flex-1">
          <div ref={trackRef} onScroll={measure} className="overflow-x-auto overscroll-x-contain scrollbar-hide" data-community-tabs-track="">
            <div className={`flex w-max min-w-full items-end gap-6 px-4 sm:gap-7 sm:px-6 lg:px-8 ${trailing ? "pr-4 sm:pr-5 lg:pr-5" : ""}`}>
              {entries.map((e) => {
                const on = current === e.key
                return (
                  <Link key={e.key} href={e.href} {...FULL_ON_HOVER} onClick={(ev) => { if (plainClick(ev)) onGo?.(e.key) }} data-on={on ? "true" : "false"} data-community-nav={e.label} aria-current={on ? "page" : undefined} className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}>
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
        </div>
        {trailing ? (
          <div className="flex shrink-0 items-center pr-2 sm:pr-4 lg:pr-6" data-community-tabs-end="">
            <span aria-hidden className="mr-1 h-5 w-px bg-[#e6e8ec]" />
            {trailing}
          </div>
        ) : null}
      </div>
    </nav>
  )
}

/**
 * INVITE, AT THE END OF THE ROW OF TABS: where a phone and a tablet (and
 * About, which has no card) find it, since the community card with its own
 * Invite is a computer's. Plain ink words with Solar's person and plus, no
 * box, a 40px target; it opens the invite sheet (invite-sheet.tsx).
 */
export function InviteTab({ onInvite }: { onInvite: () => void }) {
  return (
    <button
      type="button"
      onClick={onInvite}
      aria-haspopup="dialog"
      data-community-invite="tabs"
      className="inline-flex h-10 shrink-0 cursor-pointer select-none items-center gap-1.5 rounded-[10px] px-2 text-[14.5px] font-medium text-[#1a1a2e] outline-none transition-opacity duration-150 active:opacity-60 focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 motion-reduce:transition-none sm:text-[14px] [-webkit-tap-highlight-color:transparent]"
    >
      <InviteGlyph size={18} className="text-[#4b5563]" />
      Invite
    </button>
  )
}
