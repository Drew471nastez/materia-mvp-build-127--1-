"use client"

/**
 * ===========================================================================
 *  THE MEMBER AREA'S FRAME
 * ===========================================================================
 * Somebody's community, not a dashboard, and not under Storelib's bar. At
 * the top the community's own bar (top-bar.tsx: its picture, its name, whose
 * it is, the switcher, Messages, Storelib's bell and the member's own menu), and
 * under it ONE row of pills: Community, Classroom, Calendar, Members,
 * Leaderboards, About, each only when the community has it on. Spaces are
 * not in the frame at all: they are chips at the top of the Community feed
 * (space-chips.tsx). Everything below is the community's content.
 *
 * The bar and the pills stick together at the top. Their height is measured
 * once (ResizeObserver) and shared as --community-top with everything that
 * sticks under them or sits beside them (the feed's side card, the chat's
 * height, the messages panel), rather than guessed twice.
 *
 * While a member page is on screen it tells the server the member is here,
 * once a minute (POST /presence), so "Online" on the community is a real
 * heartbeat and never a guess.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ViewerView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { MessagesPanel, MESSAGES_EVENT, useUnreadMessages } from "./messages"
import { navEntries, pillFor, sectionFromPath, type NavEntry, type PillKey } from "./nav"
import { Toasts } from "./toast"
import { CommunityTopBar } from "./top-bar"
import { PILL, PILL_OFF, PILL_ON } from "./ui"
import type { ShellCommunity, ShellSection, TopBarData } from "./view-types"

export { CommunityMark } from "./top-bar"

export interface ShellFrameProps {
  community: ShellCommunity
  viewer: ViewerView
  topBar: TopBarData
  /** Conversations with something unread; null when member messages are not available here. */
  unreadMessages?: number | null
  active?: ShellSection
  children: React.ReactNode
}

/** How often a visible member page says the member is here. The server writes at most this often too. */
export const HEARTBEAT_MS = 60_000

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

export function ShellFrame({ community, viewer, topBar, unreadMessages = null, active, children }: ShellFrameProps) {
  const pathname = usePathname()
  const current: ShellSection = active ?? sectionFromPath(pathname, community.slug)
  const staff = !!viewer.can.manage_members
  const entries = useMemo(() => navEntries(community, staff), [community, staff])
  const [messages, refreshMessages] = useUnreadMessages(community.id, viewer.userId, unreadMessages)
  const [chat, setChat] = useState<{ userId?: string } | null>(null)

  usePresenceHeartbeat(community.id, viewer.userId)
  /* The bar is white, so the browser's bar and the phone's status bar are too. */
  useLightChrome(true)

  /* "Message" on a member's page or a member row opens the panel. */
  useEffect(() => {
    const on = (e: Event) => setChat(((e as CustomEvent<{ userId?: string }>).detail ?? {}) as { userId?: string })
    window.addEventListener(MESSAGES_EVENT, on)
    return () => window.removeEventListener(MESSAGES_EVENT, on)
  }, [])

  /* Null until part 83 is in the database: no button rather than one that opens nothing. */
  const canMessage = messages !== null

  return (
    /* The header's real heights until it is measured: no jump on the first frame. */
    <div data-community-shell="" className="min-h-svh bg-[#f8f9fa] [--community-top:109px] sm:[--community-top:117px]">
      <CommunityTopBar
        data={topBar}
        messages={canMessage ? messages : null}
        messagesOpen={!!chat}
        onMessages={() => setChat((c) => (c ? null : {}))}
      >
        <PillRow entries={entries} current={pillFor(current)} />
      </CommunityTopBar>

      {/*
        EVERY PAGE ARRIVES THE SAME WAY: a short fade, keyed on the address,
        so moving between the feed, a space, Members and the rest reads as
        one surface changing rather than a blink. Opacity only. About is the
        community's own page, the same sheet a visitor reads, and brings its
        own width; the classroom and events pages (their own worker's) draw
        only their body, so the frame gives it the same room as the feed.
      */}
      {current === "about" ? (
        <div key={pathname} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none">
          {children}
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[1080px] px-4 sm:px-6 lg:px-8">
          <div key={pathname} className="animate-in fade-in-0 duration-150 ease-sheet motion-reduce:animate-none">
            {current === "classroom" || current === "events" ? <div className="pb-16 pt-5 lg:pt-7" data-community-body="">{children}</div> : children}
          </div>
        </div>
      )}

      {canMessage ? <MessagesPanel communityId={community.id} slug={community.slug} userId={viewer.userId} open={!!chat} start={chat} onClose={() => setChat(null)} onRead={refreshMessages} /> : null}
      <Toasts />
    </div>
  )
}

/**
 * The one row of places, in the Library's pills. It scrolls sideways when it
 * does not fit (a phone with every place on), keeps the chosen pill in view,
 * and fades at an edge only while there is more that way.
 */
export function PillRow({ entries, current }: { entries: NavEntry[]; current: PillKey }) {
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
    <nav aria-label="Community" data-community-pills="" className="relative mx-auto w-full max-w-[1080px]">
      <div ref={trackRef} onScroll={measure} className="overflow-x-auto overscroll-x-contain px-3 pb-2.5 pt-0.5 scrollbar-hide sm:px-6 lg:px-8">
        <div className="flex w-max items-center gap-2">
          {entries.map((e) => {
            const on = current === e.key
            return (
              <Link key={e.key} href={e.href} data-on={on ? "true" : "false"} data-community-nav={e.label} aria-current={on ? "page" : undefined} className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}>
                {e.label}
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
