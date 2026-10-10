"use client"

/**
 * ===========================================================================
 *  THE MEMBER AREA'S FRAME: THE WALL
 * ===========================================================================
 * Somebody's community, not a dashboard, and not under Storelib's bar. At
 * the top the community's own bar (top-bar.tsx: its picture, its name, whose
 * it is, the navigator, the search, Messages, Storelib's bell and the
 * Storelib account menu behind "...", with Invite people and Saved posts).
 * Under it, from 1280px, three columns (round 9 put the places back left):
 *
 *   LEFT    the community card (cover, name, its address, Members / Online
 *           / Admins, the faces of who was here last, Settings for its
 *           staff) and right under it the places in the community
 *           (Community, Classroom, Calendar, Members, Leaderboards, About)
 *           as a list of soft tiles. No contributors here.
 *   CENTER  the page: the feed with its space chips and composer, a post,
 *           Members, the classroom, events...
 *   RIGHT   the next event and the top contributors (or the most active),
 *           each only when there is one, sticking under the bar.
 *
 * The three columns and what is in the side ones are the same on every page
 * inside the community, so moving between the feed, Members and the
 * classroom never moves or redraws anything but the middle (round 9: "the
 * frame (header, columns, chips) never re-renders or flashes"): the bar and
 * the cards are memoised with props that do not change between places, and
 * the place marked in the list and the tabs comes from a context of its
 * own (wall.tsx PlaceContext). From 1024px to 1279px there are two columns:
 * the left one holds the card, the places, the next event and the
 * contributors, in that order.
 *
 * MOVING BETWEEN PLACES. Every place is asked for in full once the frame is
 * idle (router.prefetch, kind "full"; the router keeps each for five
 * minutes, next.config.mjs staleTimes), so a click usually finds it here and
 * it swaps in on the next frame. A page that arrives fades in (opacity only,
 * on the middle column alone); one that is not here yet shows a small
 * spinner in the middle column after a moment (place-spinner.tsx, every
 * member page's loading.tsx), never a skeleton and never over the frame.
 *
 * Below 1024px there is one column, and the places are one row of plain
 * text tabs under the bar (scrolling sideways on a phone).
 *
 * ABOUT IS A PLACE LIKE THE OTHERS (round 11: "opening About never changes
 * the header's width or moves other elements"). It had a frame of its own:
 * no left column, the bar narrowed to 1080px with the tabs under it, so
 * every visit to it moved the bar, the name and the columns. Now it sits in
 * the same columns with the same bar: the left column stays (it is the way
 * to the other places from 1024px, where the row of tabs is not drawn), and
 * from 1280px the page (the same sheet a visitor reads, with its own card)
 * takes the middle and right columns, where the wall's cards would be; from
 * 1024px to 1279px the middle one. The sheet brings its own padding, so
 * its box steps out of the column's by exactly that much (ABOUT_BOX): on a
 * phone it is edge to edge as it always was, and on a computer its words
 * start on the same line as every other page's.
 *
 * NO SCROLLBAR JUMP. A short page (Members with a few people, an empty
 * classroom) has no scrollbar and a long one has one, and on a computer
 * with a classic scrollbar that moved the whole centred frame by half its
 * width between two places. The frame keeps the scrollbar's room at all
 * times (scrollbar-gutter: stable on the page, drawn with the frame and
 * gone with it), measured on every frame by scripts/check-community-frame11.mjs.
 *
 * LANDING (round 11). Entering a community (from Explore, a card, the
 * navigator), the side columns come in by opacity over a moment, the
 * middle a beat after them, so the frame lands rather than appearing in one
 * cut; moving between places inside it never replays that, because the
 * frame stays mounted.
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
import { WebPushPrompt } from "@/components/notifications/web-push-prompt"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { ViewerView } from "@/lib/communities/types"
import { useLightChrome } from "@/lib/ui/light-chrome"
import { useCommunityTheme } from "@/components/community/use-community-theme"
import "../community-theme.css"
import { MessagesPanel, MESSAGES_EVENT, useUnreadMessages } from "./messages"
import { FULL_ON_HOVER, navEntries, TABS_STILL_MS, tabsFollowTarget, type NavEntry, type TabKey } from "./nav"
import { PersonCardLayer } from "./person-card"
import { toast, Toasts } from "./toast"
import { CommunityTopBar } from "./top-bar"
import { whenIdle } from "./feed-cache"
import { enterCommunityContext } from "@/lib/nav/community-context"
import { rememberCommunityChrome } from "@/lib/nav/community-chrome-cache"
import { InviteSheet } from "./invite-sheet"
import { preloadSearchIndex } from "./search"
import { press, TAB, TAB_OFF, TAB_ON } from "./ui"
import { CLICK_AFTER_MS, isTap, pressShowsAtOnce, type Press } from "./chip-hit"
import type { ShellCommunity, ShellSection, TopBarData, WallData } from "./view-types"
import { onCommunityUpdated } from "@/lib/communities/updated-signal"
import { PlaceContext, plainClick, WallCommunityCard, WallContributorsCard, WallPlaces, WallUpcoming, type PlaceState } from "./wall"
import { useCommunityLanding } from "./landing"
import { scrollKeyFor, useReturnScroll, useSectionTop } from "./return-scroll"
import { JOINED_KEY } from "@/components/community/public/paths"
import { readAuthSnapshot, writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { CommunityPullRefresh } from "./community-pull-refresh"
import { CommunityFixedFootWatch } from "@/components/community/fixed-foot-watch"
import { CommunityNavigatorProvider, useCommunityNavigator, type CommunityNavigator, type NavigatorHooks } from "@/lib/communities/client/navigator-context"
import { isPostAddress, placeFromUrl, placeKey, placeTab, slotKeyOf, slugFromPath, type Place } from "@/lib/communities/client/places"
import { openPostOver } from "@/lib/communities/client/open-post"
import { parsePostParam } from "@/lib/communities/post-url"
import { quietRouterRefresh } from "@/lib/communities/client/resume"
import { usePlaceScreens } from "./place-host"
import { holdLeavingStill } from "@/lib/navigation/leaving-still"
import { arriveWithPageMotion } from "@/lib/navigation/page-push"
import { arrivedByTab, tabSwapInProgress } from "@/lib/nav/tab-swap"
import type { MemberProfileData } from "@/lib/communities/member-profile-view"
import { MemberProfilePlace } from "./place-views"

/** Away this long (another app, a locked phone), the community reads itself again when it comes back (NOT EVERY TIME THE APP COMES BACK). */
const AWAY_REFRESH_MS = 5 * 60_000

export { CommunityMark } from "./top-bar"

export interface ShellFrameProps {
  community: ShellCommunity
  viewer: ViewerView
  topBar: TopBarData
  /** Conversations with something unread; null when member messages are not available here. */
  unreadMessages?: number | null
  /** The side columns' facts (lib/communities/server/wall.ts); null draws the page alone in the middle. */
  wall?: WallData | null
  /** Kept for callers that still pass it; the place on screen is the navigator's now. */
  active?: ShellSection
  /** The community's chat spaces' slugs: a chat space is a place of its own, every feed space is the feed (place-host.tsx). */
  chatSpaces?: string[]
  children: React.ReactNode
}

/** How often a visible member page says the member is here. The server writes at most this often too. */
export const HEARTBEAT_MS = 60_000

/** The router's "full" prefetch (the whole page, not only up to its loading screen), as components/library/library-tabs.tsx asks. */
const FULL = "full" as never

/**
 * A page arriving in the middle column lands: a CSS animation on what is
 * put there, so a place that swaps in (cached, read ahead, or after the
 * spinner) eases in, while the same page drawing again (a refresh, a space
 * switched in place) changes nothing, because nothing new is inserted.
 *
 * ROUND 12, ask 2: "switching Community / Classroom / Calendar / Members /
 * About: smoother landing (content fades and rises a few px), never
 * abrupt". So it fades in and rises 6px over 260ms on a curve that settles
 * (community-place-in, PLACE_KEYFRAMES below), by opacity and `translate`,
 * which the compositor runs. A translate on the page's box would make it the
 * box a fixed bar inside the page is placed in for those 260ms; the one
 * there was (About's join bar on a phone) is portalled to the body now
 * (components/community/public/join-controls.tsx JoinBarPhone), so nothing
 * fixed rides the page. Not filled after it ends (no `both`), so the page is
 * no stacking context or containing block once it has landed. None for
 * reduced motion.
 *
 * ONLY ONCE THE MEMBER HAS MOVED. The first page of a visit is drawn with
 * the frame (its side columns land on an arrival, LAND; the middle never fades), and in the server's
 * HTML before anything is hydrated; it gets no second landing. From the
 * first move to another place (Classroom, Members...) every page that
 * arrives lands this way. A space switched in place is not a move.
 */
/*
  THE PAGE, NOT ITS WRAPPER. The body holds the pull to refresh wrapper (community-pull-refresh.tsx), which is one element for
  the whole visit now; the page is the child of its content box. Aimed at the body's own child, the landing ran once, the
  first time the class was put on, and never again for the next place. Written out whole, so Tailwind finds it.
*/
export const ARRIVE = "[&>[data-pull-to-refresh]>[data-pull-content]>*]:animate-[community-place-in_260ms_cubic-bezier(0.22,1,0.36,1)] motion-reduce:[&>[data-pull-to-refresh]>[data-pull-content]>*]:animate-none"

/** The landing's keyframes, printed with the frame (and the visitor's frame, public-frame.tsx), so no stylesheet has to carry them. */
export const PLACE_KEYFRAMES = "@keyframes community-place-in{from{opacity:0;translate:0 6px}to{opacity:1;translate:0 0}}"

/**
 * The side columns' landing (opacity only), on an arrival from outside the community only (useCommunityLanding).
 * ROUND 19, the owner: "when I land on the community feed the first post flashes". The middle column used to fade in a
 * beat later on every mount of the frame, the server's own HTML included: the posts were drawn, hidden for 60ms and faded
 * back in. The middle is simply there now, on every arrival; on a phone it is the whole page.
 */
const LAND = "motion-safe:animate-[fade-in_260ms_cubic-bezier(0.22,1,0.36,1)_both]"

/**
 * About's sheet is edge to edge on a phone (as it always was): its box steps out of the column's padding there. From 640px it sits in
 * the columns like any page (round 12: it no longer pads or centres itself, components/community/public/sales-page.tsx). Its ground is
 * see-through here.
 */
const ABOUT_BOX = "max-sm:-mx-4 max-sm:-mt-4 [&_[data-community-sales]]:bg-transparent"

/** The scrollbar's room kept on every page of the frame, so a short page and a long one centre the frame on the same line. */
const GUTTER = "@media (min-width:1024px){html{scrollbar-gutter:stable}}html{overscroll-behavior-y:none}"

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

/*
  ROUND 15: THE LAYOUT OWNS THE SCREEN. The frame is the community's navigator (lib/communities/client/navigator-context.tsx):
  a move between places is history.pushState and the place host (place-host.tsx) draws the place from data, so the bar, the
  row of places and the side columns are this one element for the whole visit and the middle changes under them. The place
  the visit starts on is the address the server drew.
*/
const NO_CHAT: string[] = []

export function ShellFrame(props: ShellFrameProps) {
  const pathname = usePathname()
  const search = useSearchParams()
  const [initial] = useState<Place>(() => placeFromUrl(pathname || "", search?.toString() ?? "") ?? { kind: "feed" })
  /* The navigator calls into the host through this, so the provider can sit above the frame that holds the host. */
  const hooksRef = useRef<NavigatorHooks>({})
  const hooks = useMemo<NavigatorHooks>(
    () => ({
      beforeGo: (from, to, opts) => hooksRef.current.beforeGo?.(from, to, opts),
      prefetch: (p) => hooksRef.current.prefetch?.(p),
      refresh: (p) => hooksRef.current.refresh?.(p) ?? Promise.resolve(),
    }),
    [],
  )
  const chatList = props.chatSpaces ?? NO_CHAT
  const chat = useMemo(() => new Set(chatList.map((s) => s.toLowerCase())), [chatList])
  return (
    <CommunityNavigatorProvider slug={props.community.slug} initial={initial} hooks={hooks} chatSpaces={chat}>
      <Frame {...props} chatSpaces={chatList} hooksRef={hooksRef} />
    </CommunityNavigatorProvider>
  )
}

function Frame({ community, viewer, topBar, unreadMessages = null, wall = null, chatSpaces = NO_CHAT, hooksRef, children }: ShellFrameProps & { hooksRef: React.MutableRefObject<NavigatorHooks> }) {
  const pathname = usePathname()
  const router = useRouter()
  const nav = useCommunityNavigator()
  const staff = !!viewer.can.manage_members
  const entries = useMemo(() => navEntries(community, staff), [community, staff])
  const [messages, refreshMessages] = useUnreadMessages(community.id, viewer.userId, unreadMessages)
  const [chat, setChat] = useState<{ userId?: string } | null>(null)
  /* The invite sheet, opened from "Invite people" in the bar's "..." menu (round 9; the card and the tabs had it in round 8). */
  const [inviting, setInviting] = useState(false)
  const openInvite = useCallback(() => setInviting(true), [])
  const canInvite = !!viewer.can.invite && !community.archived
  /* The creator side's list of invites, for whoever has it (the owner, or a creator account that runs this community). */
  const manageInvites = canInvite && (viewer.isOwner || viewer.isCreatorAccount) ? `/app/community/${community.id}/members` : null

  usePresenceHeartbeat(community.id, viewer.userId)
  useEffect(() => {
    enterCommunityContext(community.slug, { id: community.id, name: community.name })
  }, [community.slug, community.id, community.name])
  useLayoutEffect(() => {
    rememberCommunityChrome(community.slug, topBar)
  }, [community.slug, topBar])
  /*
    A brand-new account lands here straight from signup. The platform header
    (the thing that usually writes who is signed in) is not on a community
    page, so the phone tab bar stayed hidden and the section row sat in the
    wrong place. The member frame already knows they are signed in.
  */
  useEffect(() => {
    if (!viewer.userId || !viewer.signedIn) return
    const snap = readAuthSnapshot()
    if (snap?.signedIn && snap.userId === viewer.userId) return
    writeAuthSnapshot({
      signedIn: true,
      userId: viewer.userId,
      avatarUrl: snap?.avatarUrl ?? null,
      displayName: snap?.displayName ?? null,
      username: snap?.username ?? null,
      isSeller: snap?.isSeller ?? !!viewer.isCreatorAccount,
    })
  }, [viewer.userId, viewer.signedIn, viewer.isCreatorAccount])
  /* A section tab lands at the top. Back from a creator's page (or any page outside) lands where the community was left (return-scroll.ts, round 12). */
  /* Only for the arrival: moves inside the community keep and restore each place's scroll in the host (place-host.tsx). */
  const firstPath = useRef(pathname || "").current
  useSectionTop(firstPath, community.slug)
  const searchNow = useSearchParams()
  useReturnScroll(scrollKeyFor(pathname || "", searchNow?.toString() ?? ""), { onlyOnArrival: true })
  /* The browser's bar, the phone's status bar and the canvas a bounce shows take the page's colour (the bar pads itself under the clock in white). */
  const appearance = community.appearance === "dark" ? "dark" : "light"
  useCommunityTheme(appearance)
  useLightChrome(true, appearance === "dark" ? "#0e1014" : "#f8f9fa")
  /*
    Opened from Discover or anywhere outside (landing.ts): the middle
    column's spinner waits as the app's slow page does. The frame itself
    gets no fade of its own: only its side columns land (LAND), and the
    middle, the posts, is simply there.
  */
  const landing = useCommunityLanding()

  /*
    JUST JOINED (round 12, ask 13): the join button set this as it asked for the member's frame
    (components/community/public/join-controls.tsx enterCommunity). Once the frame has landed, one quiet line says welcome, and
    the note is forgotten, so a reload says nothing.
  */
  useEffect(() => {
    let fromStore = false
    try {
      const joined = window.sessionStorage.getItem(JOINED_KEY)
      if (joined === community.slug) {
        window.sessionStorage.removeItem(JOINED_KEY)
        fromStore = true
      }
    } catch {
      /* No storage: the address can still say welcome. */
    }
    let fromAddress = false
    try {
      const url = new URL(window.location.href)
      if (url.searchParams.get("welcome") === "1") {
        fromAddress = true
        url.searchParams.delete("welcome")
        const next = url.pathname + url.search + url.hash
        window.history.replaceState(window.history.state, "", next)
      }
    } catch {
      /* A broken address still shows the community. */
    }
    if (!fromStore && !fromAddress) return
    const t = window.setTimeout(() => toast(`Welcome to ${community.name}`), 120)
    return () => window.clearTimeout(t)
  }, [community.slug, community.name])

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
    THE PLACE MARKED AT ONCE (round 15): the navigator's place changes on the tap itself, so the row and the left column mark
    it on that frame, before the place's data has arrived. The columns follow the place actually in the middle (`shown`),
    which changes on the same frame as the middle does.
  */
  /* The profile place, drawn with the community and the viewer the frame already has. */
  const profileCommunity = useMemo(() => ({ id: community.id, slug: community.slug, name: community.name }), [community.id, community.slug, community.name])
  const profileViewer = useMemo(() => ({ userId: viewer.userId, signedIn: viewer.signedIn }), [viewer.userId, viewer.signedIn])
  const renderProfile = useCallback((ref: string, data: unknown) => <MemberProfilePlace community={profileCommunity} viewer={profileViewer} profileRef={ref} data={data as MemberProfileData | null} />, [profileCommunity, profileViewer])
  const screens = usePlaceScreens({ communityId: community.id, slug: community.slug, chatSpaces, entries, renderProfile, viewer, readOnly: community.archived || !!viewer.mutedUntil, children })
  hooksRef.current = screens.hooks
  const shown = screens.shown
  const tab = placeTab(nav.place)
  const about = shown.kind === "about"
  /** Lesson player: the middle column takes the right column's room (like About), so the video is not squeezed beside the curriculum. */
  const lessonPage = shown.kind === "program"
  const wideCenter = about || lessonPage || shown.kind === "learn" || shown.kind === "calendar" || shown.kind === "event"
  const noGo = useCallback(() => {}, [])
  const place = useMemo<PlaceState>(() => ({ tab, onGo: noGo }), [tab, noGo])
  const membersHref = entries.find((e) => e.key === "members")?.href ?? null
  /* The right column is the community's, the same on every place (round 9): the next event and who takes part. */
  const upcoming = wall?.upcoming ?? null
  const contributors = wall?.contributors ?? null
  const contributorsAll = contributors ? (contributors.basis === "points" ? (community.gamificationEnabled ? `/community/${community.slug}/leaderboard` : null) : membersHref) : null
  const onLeaderboard = shown.kind === "leaderboard"

  /* What the bar is handed, the same objects from place to place, so the memoised bar is not drawn again. */
  const onMessages = useCallback(() => setChat((c) => (c ? null : {})), [])
  const searchProp = useMemo(() => ({ communityId: community.id }), [community.id])
  const menu = useMemo(() => ({ onInvite: community.archived ? null : openInvite, savedHref: `/community/${community.slug}/saved`, membershipHref: `/community/${community.slug}/membership` }), [community.archived, community.slug, openInvite])
  const tabs = useMemo(() => <SectionTabs entries={entries} />, [entries])

  /*
    EVERY PLACE, READ AHEAD (round 15). The router's prefetch of every place's page (rounds 9 and 24) is gone: places are not
    pages any more. The host reads each place's first screen as data once the first screen has painted and the phone is idle
    (place-host.tsx), and a finger landing on a place's link reads that one at once (below).
  */
  useEffect(
    () =>
      whenIdle(() => {
        /* What the search knows before a key is pressed (round 10), so its first results come at once. */
        void preloadSearchIndex(community.id)
      }),
    [community.id],
  )

  /*
    KEPT WARM FOR THE WAY BACK (round 13, ask 23: "back to the community from anywhere is quick"). The frame goes when the member
    leaves the community (a profile, the library, a creator's page); at that moment the community's home is asked for in full once
    more, so the router holds a fresh copy for its five minutes (next.config.mjs staleTimes) and Home, Back or a link into the
    community swaps it in on the next frame with no spinner. The feed's own lists stay in memory for the visit (feed-cache.ts).
  */
  /*
    THE COMMUNITY'S OWN LOOK, KEPT CURRENT (round 15: "a cover I update in the admin should change here"). Saved in another tab,
    the frame reads itself again at once (lib/communities/updated-signal.ts); come back to after half a minute away (another
    app, the admin on a computer), it reads itself again too, so its cover, picture and name are the admin's latest.
  */
  /*
    NOT EVERY TIME THE APP COMES BACK (round 16, the owner: "the posts reload and refresh randomly"). Half a minute in another
    app was enough to read the whole community again the moment it came forward, while the member was already scrolling.
    Now it is after five minutes away, and only once the page is idle, so the first frames back are the member's.
  */
  useEffect(() => {
    /*
      NEVER A WHITE PAGE ON THE WAY BACK (round 15). router.refresh() whose request fails falls back to a whole page load
      (Next's refresh reducer: a failed fetch is an "external URL", location.replace, the app suspended meanwhile): on a
      phone that just woke, before its connection is back, that was a white page that stayed white. quietRouterRefresh asks
      only once the network answers (lib/communities/client/resume.ts), and the place on screen is read again as data.
    */
    const again = () => {
      quietRouterRefresh(router)
      void navRef.current.refresh()
    }
    const off = onCommunityUpdated(community.id, again)
    let hiddenAt = 0
    const idle = (run: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
      if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 2000 })
      else window.setTimeout(run, 600)
    }
    const onVisible = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > AWAY_REFRESH_MS) idle(again)
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      off()
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [community.id, router])

  /*
    ONE LANDING, AND NONE ON BACK (round 24, kept in round 15): the host animates a place the member moved to (rises 6px and
    fades in, 180ms) and puts one reached by Back or Forward back with no motion (place-host.tsx). The watcher that did this
    for router pages is gone with the router pages.
  */
  const navRef = useRef<CommunityNavigator>(nav)
  navRef.current = nav
  const shownRef = useRef(shown)
  shownRef.current = shown
  const chatRef = useRef<ReadonlySet<string>>(new Set())
  chatRef.current = useMemo(() => new Set(chatSpaces.map((c) => c.toLowerCase())), [chatSpaces])
  const rootRef = useRef<HTMLDivElement>(null)
  /*
    A LINK TO A PLACE IN THIS COMMUNITY IS A MOVE, NOT A PAGE (round 15). Every link inside the frame (the row of places, the
    left column, a space or event named in a post, the cards) and in its layers (the person card, the messages panel, which
    are portalled out of it) is caught before Next's Link sees it, and becomes navigator.go: pushState, the place drawn from
    data. Not caught: a modified click, a new tab, a download, another community, a post (its own opening), an address that is
    not a place, the place already on screen (a lesson's ?lesson= link stays the player's), or a link marked data-native-nav.
    A finger landing on (or a pointer resting over) such a link reads its place ahead.
  */
  useEffect(() => {
    const anchor = (e: Event) => ((e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null) ?? null
    const placeOf = (a: HTMLAnchorElement): Place | null => {
      if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.nativeNav !== undefined) return null
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return null
      }
      if (url.origin !== window.location.origin || url.hash) return null
      if ((slugFromPath(url.pathname) || "").toLowerCase() !== community.slug.toLowerCase()) return null
      return placeFromUrl(url.pathname, url.search)
    }
    /* The post a link opens, by its id or its address's short id, when it is a post of this community. */
    const postIdOf = (a: HTMLAnchorElement): string | null => {
      if ((a.target && a.target !== "_self") || a.hasAttribute("download") || a.dataset.nativeNav !== undefined) return null
      let url: URL
      try {
        url = new URL(a.href, window.location.href)
      } catch {
        return null
      }
      /* A comment's link carries #c-<comment> (every comment notification does): it is still the post, opened over the place (round 17). */
      if (url.origin !== window.location.origin || (url.hash && !/^#(c-[\w-]+|comments)$/.test(url.hash))) return null
      if ((slugFromPath(url.pathname) || "").toLowerCase() !== community.slug.toLowerCase() || !isPostAddress(url.pathname)) return null
      const parsed = parsePostParam(url.pathname.split("/").pop() || "")
      return parsed ? (parsed.kind === "uuid" ? parsed.id : parsed.short) : null
    }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = anchor(e)
      /* Out to Explore (the community menu's row, any link there): the frame pops away as it goes (LEAVING, below). */
      if (a && !a.target) {
        try {
          const to = new URL(a.href, window.location.href)
          if (to.origin === window.location.origin && /^\/explore(\/|$)/.test(to.pathname)) leavingRef.current = "pop"
        } catch {
          /* Not an address: nothing to do. */
        }
      }
      const p = a ? placeOf(a) : null
      /*
        A POST OF THIS COMMUNITY OPENS OVER THE PLACE (round 16): a notification, a mention, a link in a post. A card on screen
        or the host's reader (post-opener.tsx) takes it, and the place under it stays; only a post neither can open loads its page.
      */
      if (!p && a) {
        const id = postIdOf(a)
        if (id && openPostOver(id, a)) e.preventDefault()
        return
      }
      if (!p) return
      const onScreen = placeFromUrl(window.location.pathname, window.location.search)
      if (onScreen && placeKey(onScreen) === placeKey(p)) return
      /* The feed's own pills (and its sort menu's Saved) switch its list in place, with the fill gliding: theirs, not the shell's. */
      if (slotKeyOf(p, chatRef.current) === "feed" && slotKeyOf(shownRef.current, chatRef.current) === "feed" && (e.target as Element | null)?.closest?.("[data-space-chips], [data-sort-menu]")) return
      e.preventDefault()
      navRef.current.go(p)
    }
    const onIntent = (e: Event) => {
      const a = anchor(e)
      const p = a ? placeOf(a) : null
      if (p) navRef.current.prefetch(p)
    }
    document.addEventListener("click", onClick, true)
    document.addEventListener("pointerdown", onIntent, { capture: true, passive: true })
    rootRef.current?.addEventListener("mouseover", onIntent, { passive: true })
    const root = rootRef.current
    return () => {
      document.removeEventListener("click", onClick, true)
      document.removeEventListener("pointerdown", onIntent, true)
      root?.removeEventListener("mouseover", onIntent)
    }
  }, [community.slug])

  /*
    ENTERING AND LEAVING LIKE A NATIVE PUSH AND POP (round 15, the owner: "from a community I click the hamburger, then
    Explore: Explore appears too fast, too direct"). Arriving from outside (Explore, a card), the frame slides in from the
    right and settles (300ms, translate and opacity on the compositor). Leaving for Explore, a copy of the frame as it stood
    is laid over the page in the commit that takes it away and slides off to the right, under the tab bar, with Explore
    already drawn beneath it (lib/navigation/leaving-still.ts: never a view transition, which would freeze the screen while
    Explore loads). Neither under reduced motion, nor inside the app's own tab swap (it already moves the page).
  */
  const leavingRef = useRef<"pop" | null>(null)
  useLayoutEffect(() => {
    const el = rootRef.current
    /* Back from a full page opened with Visit page: it comes from the left under the page popping off (lib/navigation/page-push.ts), not with the push in from outside. */
    const popped = landing && arriveWithPageMotion(el)
    /* Not for Home pressed on the tab bar either (round 18, lib/nav/tab-swap.ts arrivedByTab): a tab shows its page whole. */
    if (!popped && landing && el && typeof el.animate === "function" && !tabSwapInProgress() && !arrivedByTab() && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      el.animate([{ translate: "36px 0", opacity: 0.6 }, { translate: "0 0", opacity: 1 }], { duration: 300, easing: "cubic-bezier(0.32, 0.72, 0, 1)" })
    }
    return () => {
      if (leavingRef.current === "pop" && el) holdLeavingStill(el, 320, { motion: "pop", under: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const homeHref = `/community/${community.slug}`
  useEffect(
    () => () => {
      window.setTimeout(() => {
        try {
          router.prefetch(homeHref, { kind: FULL })
        } catch {
          /* A router that has gone with the page: the next visit reads it as usual. */
        }
      }, 0)
    },
    [homeHref, router],
  )

  return (
    /* The header's real heights until it is measured (56 + the tabs' 2px top padding + 40 of tabs + its hairline below 1024px, one 64px row + 1 from 1024px): no jump on the first frame. It said 97 after the tabs row gained its 2px (top-bar.tsx), so a chat's height and the sticky pills moved 2px when the bar was measured. */
    <PlaceContext.Provider value={place}>
      <style>{GUTTER + PLACE_KEYFRAMES}</style>
      <CommunityFixedFootWatch />
      <div
        ref={rootRef}
        data-community-shell=""
        data-community-theme={appearance}
        data-community-landing={landing ? "" : undefined}
        className="min-h-svh bg-[#f8f9fa] text-[#1a1a2e] transition-[background-color,color] duration-300 motion-reduce:transition-none [--community-top:99px] lg:[--community-top:65px]"
      >
        <CommunityTopBar data={topBar} messages={canMessage ? messages : null} messagesOpen={!!chat} onMessages={onMessages} search={searchProp} menu={menu}>
          {tabs}
        </CommunityTopBar>

        {/*
          Every page sits in the middle column (About across the middle and the right from 1280px, with its own card), the classroom
          and events pages included. What arrives there fades in (ARRIVE); the columns either side are not touched.
        */}
        <div className="mx-auto w-full max-w-[1360px] px-4 sm:px-6 lg:px-8">
          <div
            data-community-columns="three"
            data-community-place={about ? "about" : lessonPage ? "lesson" : shown.kind === "learn" ? "learn" : shown.kind === "calendar" ? "events" : shown.kind === "event" ? "event" : undefined}
            className="pb-16 pt-4 lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-6 lg:pt-6 xl:grid-cols-[280px_minmax(0,1fr)_300px]"
          >
            {/* LEFT: the community card, and the places right under it (round 9). */}
            <div className={`hidden min-w-0 space-y-3 lg:col-start-1 lg:row-start-1 ${lessonPage ? "" : about ? "lg:block xl:hidden" : "lg:block"} ${landing ? LAND : ""}`} data-community-left="">
              {wall ? <WallCommunityCard community={community} card={wall.card} membersHref={membersHref} /> : null}
              <WallPlaces entries={entries} />
            </div>
            {/* RIGHT from 1280px (under the places from 1024px): the next event, then who takes part, sticking under the bar. About and the lesson player use the extra width instead. */}
            <aside className={`hidden min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-3 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-0 xl:self-stretch ${wideCenter ? "" : "lg:block"} ${landing ? LAND : ""}`} data-community-right="" data-leaderboard-page={onLeaderboard ? "" : undefined}>
              {upcoming || (contributors && !onLeaderboard) ? (
                <div className="space-y-3 xl:sticky xl:top-[calc(var(--community-top,65px)+24px)]" data-community-right-cards="">
                  {upcoming ? <WallUpcoming slug={community.slug} event={upcoming} /> : null}
                  {contributors && !onLeaderboard ? <WallContributorsCard slug={community.slug} data={contributors} viewAllHref={contributorsAll} /> : null}
                </div>
              ) : null}
            </aside>
            <div className={`min-w-0 lg:row-span-2 lg:row-start-1 ${lessonPage ? "lg:col-span-full lg:col-start-1" : about ? "lg:col-start-2 xl:col-span-full xl:col-start-1" : wideCenter ? "lg:col-start-2 xl:col-span-2" : "lg:col-start-2"}`} data-community-main="">
              <div className={about ? ABOUT_BOX : ""} data-community-body="">
                <CommunityPullRefresh slug={community.slug} place={shown} off={shown.kind === "space" && chatSpaces.includes(shown.slug)} onRefresh={nav.refresh}>
                  {screens.middle}
                </CommunityPullRefresh>
              </div>
            </div>
          </div>
        </div>

        {community.archived ? null : <InviteSheet open={inviting} onClose={() => setInviting(false)} community={community} staff={canInvite} manageHref={manageInvites} />}
        <PersonCardLayer communityId={community.id} canMessage={canMessage} />
        {canMessage ? <MessagesPanel communityId={community.id} slug={community.slug} userId={viewer.userId} open={!!chat} start={chat} onClose={() => setChat(null)} onRead={refreshMessages} /> : null}
        {viewer.active ? <WebPushPrompt communityName={community.name} joinedAt={viewer.joinedAt ?? null} placement="floating" /> : null}
        <Toasts />
      </div>
    </PlaceContext.Provider>
  )
}

/**
 * THE ROW OF SECTION TABS under the bar, below 1024px (and on About at every
 * width). Plain words, not pills: the chosen one is ink with a 2px line
 * under it, sitting on the row's bottom edge; the others are muted until
 * hovered, and dim the moment a finger lands on one (round 10: press
 * feedback on the first frame, before the place is asked for). The line
 * grows in from its middle (scale and opacity, nothing that moves the
 * layout). The row fades at an edge only while there is more that way.
 *
 * A NATIVE SIDEWAYS SCROLL (round 10, ask 27). The row is the browser's own
 * scroller, with its own momentum: no snap points, nothing that sets its
 * position while a finger is on it or a throw is still gliding. When the
 * chosen tab changes and is not wholly in view, the row glides to it
 * (scrollTo smooth) once the row is still: never during a touch, never
 * within a moment of the last scroll, so the follow can never fight a fling.
 * The first draw puts it in view at once (nothing to glide from).
 */
export function SectionTabs({ entries, current: currentProp, wide = true, onGo: onGoProp }: { entries: NavEntry[]; /** Left out, the frame's PlaceContext says. */ current?: TabKey; /** The row lines up with the 1360px frame; false for a 1080px page. */ wide?: boolean; onGo?: (key: TabKey) => void }) {
  const place = useContext(PlaceContext)
  const current = currentProp ?? place.tab
  const onGo = onGoProp ?? place.onGo
  const trackRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  /* A finger on the row, and when it last scrolled: the row is only moved by code once it is still. */
  const touching = useRef(false)
  const lastScroll = useRef(0)
  const drawn = useRef(false)
  /*
    THE TAP IS TAKEN ON THE LIFT (round 18, the space pills' rule, chip-hit.ts). A tab was a link answered by the browser's
    click, and a phone sends none for a tap that stopped the row's scroll or rolled a little: the tap did nothing and the
    second one worked. A finger that lands on a tab and lifts within TAP_SLOP and TAP_MS is that tab, whatever the browser
    does with the click; the click it may still send after is the same tap and is let go (CLICK_AFTER_MS). A mouse, a pen
    on a computer and the keyboard keep the click. Nothing changes on the tab before the lift (ui.ts TAB).
  */
  const tabDown = useRef<(Press & { id: number }) | null>(null)
  const tookAt = useRef(0)
  const tabPress = {
    onPointerDown: (ev: React.PointerEvent<HTMLAnchorElement>) => {
      if (pressShowsAtOnce(ev.pointerType)) press(ev)
      tabDown.current = ev.button === 0 && !pressShowsAtOnce(ev.pointerType) ? { x: ev.clientX, y: ev.clientY, t: performance.now(), id: ev.pointerId } : null
    },
    onPointerUp: (ev: React.PointerEvent<HTMLAnchorElement>) => {
      ev.currentTarget.removeAttribute("data-pressed")
      const started = tabDown.current?.id === ev.pointerId ? tabDown.current : null
      tabDown.current = null
      if (!started || !isTap(started, { x: ev.clientX, y: ev.clientY, t: performance.now() })) return
      tookAt.current = performance.now()
      /* The same path a click takes (the frame's link handler: the navigator's go), so the two can never differ. */
      ev.currentTarget.click()
    },
    onPointerCancel: (ev: React.PointerEvent<HTMLAnchorElement>) => {
      ev.currentTarget.removeAttribute("data-pressed")
      tabDown.current = null
    },
    onPointerLeave: (ev: React.PointerEvent<HTMLAnchorElement>) => {
      if (ev.pointerType === "mouse") ev.currentTarget.removeAttribute("data-pressed")
    },
  }
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
    if (!el || typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  /* The chosen tab into view: at once on the first draw, gliding after, and only when the row is still. */
  useLayoutEffect(() => {
    const el = trackRef.current
    const on = el?.querySelector<HTMLElement>('[data-on="true"]')
    if (!el || !on) return
    const first = !drawn.current
    drawn.current = true
    let timer = 0
    const follow = () => {
      if (touching.current || performance.now() - lastScroll.current < TABS_STILL_MS) {
        timer = window.setTimeout(follow, TABS_STILL_MS)
        return
      }
      const to = tabsFollowTarget({ left: on.offsetLeft, width: on.offsetWidth }, el)
      if (to === null) return
      if (first || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || typeof el.scrollTo !== "function") el.scrollLeft = to
      else el.scrollTo({ left: to, behavior: "smooth" })
    }
    follow()
    return () => window.clearTimeout(timer)
  }, [current])
  return (
    <nav
      aria-label="Community sections"
      data-community-tabs="" className="relative w-full"
      onClickCapture={(ev) => {
        /* The browser's own click after a tap already taken on the lift (above): the same tap, not a second one. */
        if (ev.nativeEvent.isTrusted && performance.now() - tookAt.current < CLICK_AFTER_MS && (ev.target as Element | null)?.closest?.("[data-community-nav]")) {
          ev.preventDefault()
          ev.stopPropagation()
        }
      }}
    >
      {/* The row lines up with the page under it (1360px, About's 1080px). */}
      <div className={`mx-auto flex w-full items-stretch ${wide ? "lg:max-w-[1360px]" : "lg:max-w-[1080px]"}`}>
        <div className="relative min-w-0 flex-1">
          <div
            ref={trackRef}
            onScroll={() => {
              lastScroll.current = performance.now()
              measure()
            }}
            onTouchStart={() => (touching.current = true)}
            onTouchEnd={() => (touching.current = false)}
            onTouchCancel={() => (touching.current = false)}
            className="-my-[2px] overflow-x-auto overscroll-x-contain scrollbar-hide [-webkit-overflow-scrolling:touch]"
            data-community-tabs-track=""
          >
            {/* 2px above and below, taken back by the track's margin: room inside the scroll box for the tabs' 44px hit areas (ui.ts TAB). */}
            <div className="flex w-max min-w-full items-end gap-6 px-4 py-[2px] sm:gap-7 sm:px-6 lg:px-8">
              {entries.map((e) => {
                const on = current === e.key
                return (
                  <Link key={e.key} href={e.href} {...FULL_ON_HOVER} {...tabPress} onClick={(ev) => { if (plainClick(ev)) onGo?.(e.key) }} data-on={on ? "true" : "false"} data-community-nav={e.label} aria-current={on ? "page" : undefined} className={`${TAB} ${on ? TAB_ON : TAB_OFF}`}>
                    {/* The chosen word a step heavier; its heavier twin (::after, unseen and unread) holds the width, so nothing in the row moves. */}
                    <span className="inline-grid after:invisible after:col-start-1 after:row-start-1 after:font-semibold after:content-[attr(data-label)]" data-label={e.label}>
                      <span className={`col-start-1 row-start-1 ${on ? "font-semibold" : "font-medium"}`}>{e.label}</span>
                    </span>
                    <span
                      aria-hidden
                      data-tab-line=""
                      className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#1a1a2e] transition-[opacity,scale] duration-200 ease-sheet shadow-[0_1px_3px_rgba(26,26,46,0.28)] motion-reduce:transition-none ${on ? "scale-x-100 opacity-100" : "scale-x-50 opacity-0"}`}
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
      </div>
    </nav>
  )
}
