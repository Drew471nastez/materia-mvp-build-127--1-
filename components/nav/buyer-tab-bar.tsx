"use client"

/**
 * ===========================================================================
 *  THE BUYER'S TAB BAR, ON A PHONE, OUTSIDE /app
 * ===========================================================================
 * "Home, Search, Library, Profile avatar, in this order. A mobile nav bar on
 * phones, like the one we have in /app, but not pill shaped and not with
 * that opening menu thing. Normal, but inherit the touch feel: the sliding
 * touch, the glass bubble when you switch, the icon fill on touch, the
 * smoothness. The bar itself a normal white one, clean, with a little depth.
 * No red badges."
 *
 * So the SHAPE is a plain white bar across the foot of the screen, full
 * width, the home indicator's inset under it, a hairline and a soft shadow
 * along its top edge. And the TOUCH is the /app pill's, not a copy of it:
 * components/nav/tab-lens.tsx holds the slide, the glass lens, the spring,
 * the icon cross fade and the little give on a tap, and this bar and the
 * pill both use it.
 *
 * NO BUMP ON A TAP. "I don't really like the bump when I click an icon." So
 * this bar asks the lens for no give (`give: false`): the icon you press does
 * not squeeze and spring back, and the glass does not grow in from a smaller
 * size either. What a press does here is colour only: the icon fills on the
 * frame the finger lands and the glass lights under it. The slide keeps its
 * lift and stretch, because that is a finger dragging the glass, not a tap.
 *
 * AND A TAB IS ALREADY ON ITS WAY BEFORE IT IS PRESSED. Once the page has
 * settled, the other tabs' pages are prefetched while the phone is idle, so
 * a tap lands on a page the router already has (or at least its loading
 * shape, app/library/loading.tsx and the rest, which appear only when a page
 * is slow). The press still asks again, for a page that went stale.
 *
 * WHAT THE GLASS DOES HERE. On the pill the lens always sits on the tab you
 * are on, because the pill is glass and the lens is a clearer piece of it.
 * A white bar with a grey stone resting on it is a badge, so here the lens
 * is only there while a finger is: it comes up under the finger, lifts and
 * stretches along a slide, springs onto the slot it is let go over, and
 * clears over the ink's own curve while the icon it landed on fills. At rest
 * the page you are on is the filled icon and nothing else, as in the
 * reference.
 *
 * PROFILE IS A PERSON, NOT THE PHOTO, since the next round: "the photo is in
 * the header bar up there". And Search keeps its glass when it is the page
 * you are on, drawn heavier rather than solid, because a solid magnifier
 * read as a black blob (components/nav/buyer-tab-icons.tsx).
 *
 * SEARCH IS A SCREEN OVER THE PAGE (components/search/search-overlay.tsx),
 * opened from inside the press so the keyboard comes up with it, and mounted
 * here because this bar is the only thing that opens it.
 *
 * WHERE IT IS DRAWN is lib/nav/buyer-tabs.ts: Storelib's own buyer pages,
 * never /app, admin, checkout, sign in, a receipt, or a creator's own site.
 * It is mounted by the layouts that draw the platform header (marketing,
 * library, account) and decides the rest itself.
 *
 * WHAT IT LEAVES ROOM FOR. A fixed bar takes no space in the page, so it
 * brings its own: a block the height of the bar at the end of the layout,
 * so the last thing on any page ends above it, not under it. And it tells
 * the rest of the page how tall it is (--buyer-tabs-h on <html>, app/
 * globals.css), which the product page's buy bar stands on and the cookie
 * banner lifts over.
 *
 * AND IT GETS OUT OF THE WAY OF A KEYBOARD. While a field has the focus the
 * bar slides down out of sight, the way a phone's own tab bar does, and
 * comes back when the field lets go.
 */

import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"

import { LibraryIcon as LibraryLinear } from "@solar-icons/react/linear/library"
import { LibraryIcon as LibraryBold } from "@solar-icons/react/bold/library"

import { NAV_ICONS, FILL_MS, FILL_CURVE, type NavIconPair } from "@/components/app/sidebar-desktop-nav"
import { PERSON_ICONS, SEARCH_ICONS } from "@/components/nav/buyer-tab-icons"
import { SearchOverlay, openSearchOverlay, refocusSearchOverlay } from "@/components/search/search-overlay"
import { startRouteLoading } from "@/components/navigation/route-loading-bar"
import {
  ARRIVING_FILL,
  DROP,
  INK_EASE,
  LENS_GLASS,
  LENS_LIGHT,
  LIFT,
  LIFT_EASE,
  NO_TRAVEL,
  NavIcon,
  PRESS_EDGE,
  PRESS_ON,
  useTabLens,
} from "@/components/nav/tab-lens"
import { readAuthSnapshot, subscribeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { useExploreMarketplaceEnabled } from "@/components/platform/explore-marketplace-context"
import { SIGNED_OUT_PROFILE_HREF, buyerTabFor, buyerTabsAt, buyerTabsBelongOn, communityOf } from "@/lib/nav/buyer-tabs"
import { openCommunitySearch, refocusCommunitySearch } from "@/lib/nav/community-search-bridge"
import { COMMUNITY_HOME_BOOT, COMMUNITY_HOME_LIVE_FLAG, communityContext, enterCommunityContext, useCommunityContext } from "@/lib/nav/community-context"
import { useBuyerTabsWhere } from "@/lib/nav/use-buyer-tabs-where"
import { prefetchHref, prefetchOnIdle } from "@/lib/nav/prefetch-policy"
import { noteTabScroll, prepareTabArrival, restoreTabScroll, scrollPageToTop } from "@/lib/navigation/tab-scroll"

/* ── The look ────────────────────────────────────────────────────────────── */

/** While the bar is on screen (below 768px) its room holds the home indicator's inset, so the body does not pad for it as well. */
export const TAB_BAR_BODY = "@media (max-width: 767px){body{padding-bottom:0}}"

/** Ink on the tab you are on, and on the others: the pill's two. */
const ACTIVE_TEXT = "#1a1a2e"
const REST_TEXT = "#616b7a"
/** The icons, a touch larger than the pill's: this bar is not trying to be small. */
const GLYPH = "24px"
/**
 * The lens, a capsule under the glyph rather than the pill's circle: a slot
 * here is a quarter of the phone, not 56px, and a circle in the middle of it
 * reads as a dot. Drawn wider than it is tall, like the selection on a
 * phone's own tab bar.
 *
 * A TOUCH LARGER (this round): 70x44 rather than 64x42. The glass had less
 * presence under a thumb than the thumb itself, and on a 390px phone a slot
 * is 94px wide, so it still leaves 12px of bar either side of it and never
 * reads as two pieces of glass meeting.
 */
const LENS_W = 70
const LENS_H = 44
/**
 * The lens's glass, on white. The pill's is white over a frosted white bar
 * and holds its shape by its edge; on a white bar white glass has no edge to
 * speak of, so this one carries the faintest cool grey in it, the colour a
 * thick piece of glass takes on over paper.
 */
const LENS_FILL = "rgba(238,239,242,0.92)"
/** Clear: the same list as the lit one with nothing in it, so the shadow eases out rather than switching off. */
const EDGE_CLEAR = "inset 0 1px 0.5px rgba(255,255,255,0), inset 0 -1px 1px rgba(16,18,27,0), inset 0 0 0 0.5px rgba(16,18,27,0)"
const DROP_CLEAR = "0 1px 1.5px rgba(16,18,27,0), 0 4px 12px -2px rgba(16,18,27,0)"
/**
 * THE BAR'S EDGE AND DEPTH. A hairline where it meets the page, then two
 * soft shadows falling upward: close and faint, wide and fainter. "A little
 * depth", which is the difference between a bar and a painted strip, and
 * still nothing like the pill's float.
 *
 * REBALANCED, NOT MOVED. The owner asked for a little less of it and a
 * little more of it in the same breath, which is what you say when the
 * amount is right and the shape is not. The two shadows were doing the same
 * job: the close one at 0.05 over 6px and the wide one at 0.10 over 24px
 * both put their ink in the first few pixels, so the whole of the depth sat
 * in a band thinner than the hairline's own highlight and read as weight
 * rather than as height. Measured off a photograph at three times life size,
 * as darkness above the bar's top edge over a white page:
 *
 *            1px   2px   4px   6px   12px  20px  28px
 *     was     14    11     8     6     3     0     0
 *     now     11     9     7     7     5     3     2
 *
 * So: a little less of the close one (0.05 to 0.042, 6px to 5px), and the
 * wide one spent differently rather than spent more (0.10 over 24px with a
 * -12px spread becomes 0.07 over 46px with -5px), which puts the same amount
 * of ink across thirty pixels instead of six. The hairline is untouched,
 * because that is the bar's edge and not its depth.
 */
const BAR_SHADOW = "0 -0.5px 0 rgba(16,18,27,0.09), 0 -2px 5px -2px rgba(16,18,27,0.042), 0 -6px 46px -5px rgba(16,18,27,0.07)"
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

/**
 * Four glyphs of one family, outline at rest and solid on the page you are
 * on. Search keeps its glass and Profile is a person rather than the photo:
 * components/nav/buyer-tab-icons.tsx says why for both.
 */
const ICONS: Record<"home" | "search" | "library" | "profile", NavIconPair> = {
  home: NAV_ICONS.dashboard,
  search: SEARCH_ICONS,
  library: { line: LibraryLinear, fill: LibraryBold },
  profile: PERSON_ICONS,
}

/* ── Who is signed in ────────────────────────────────────────────────────── */

/**
 * The header's record of the session (lib/auth/auth-snapshot), read the way
 * the header reads it: synchronously, so the Profile tab knows on the first
 * frame after the page wakes up whether it is the account or Log in, and is
 * corrected the moment the header verifies the session. Nothing on the
 * server, which never knows.
 */
const readSignedIn = () => !!readAuthSnapshot()?.signedIn
function useSignedIn(): boolean {
  return useSyncExternalStore(subscribeAuthSnapshot, readSignedIn, () => false)
}

/* ── A field has the focus ───────────────────────────────────────────────── */

const TYPED = /^(text|search|email|password|number|tel|url)$/
function isTyping(el: Element | null): boolean {
  if (!el) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) return TYPED.test(el.type || "text") && !el.readOnly
  return el instanceof HTMLElement && el.isContentEditable
}
/** True while the software keyboard is up, as near as a page can know: a field that takes typing has the focus. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(false)
  useEffect(() => {
    const check = () => setTyping(isTyping(document.activeElement))
    /* Out is asked a frame later: moving from one field to the next blurs
       the first before the second has the focus, and the bar must not bob
       up and down between them. */
    const onOut = () => requestAnimationFrame(check)
    check()
    document.addEventListener("focusin", check)
    document.addEventListener("focusout", onOut)
    return () => {
      document.removeEventListener("focusin", check)
      document.removeEventListener("focusout", onOut)
    }
  }, [])
  return typing
}

/* ── The query, which Next only hands out under a Suspense ───────────────── */

/**
 * Explore with a query is Search's result, so the bar needs to know whether
 * there is one. useSearchParams suspends a page that is otherwise static, so
 * it is asked in this empty child under its own Suspense rather than by the
 * bar, which then renders on the server like any other part of the page.
 */
function QueryWatch({ onChange }: { onChange: (query: string) => void }) {
  const params = useSearchParams()
  const q = (params?.get("q") ?? "").trim()
  useEffect(() => onChange(q), [q, onChange])
  return null
}

/* ── The bar ─────────────────────────────────────────────────────────────── */

/**
 * Mounted by the layouts; draws nothing where the bar does not belong. The
 * question is asked here, where it is mounted, rather than inside the bar,
 * so the bar's own hooks are never behind a return.
 */
export function BuyerTabBar() {
  const pathname = usePathname() || "/"
  const exploreMarketplaceEnabled = useExploreMarketplaceEnabled()
  /* Where this is, as the header asks it too (lib/nav/use-buyer-tabs-where). */
  const where = useBuyerTabsWhere(pathname)
  const signedIn = useSignedIn()
  const whereWithExplore = { ...where, exploreMarketplaceEnabled, signedIn }
  return (
    <>
      {buyerTabsBelongOn(pathname, whereWithExplore) ? (
        <TabBar pathname={pathname} sellerSurface={where.sellerSurface} exploreMarketplaceEnabled={exploreMarketplaceEnabled} />
      ) : null}
      {/* Search, full screen, opened by the Search tab. Mounted beside the
          bar rather than in it, so a result that leads to a page without
          the bar does not take the screen out of the document mid fade. */}
      <SearchOverlay />
    </>
  )
}

function TabBar({
  pathname,
  sellerSurface,
  exploreMarketplaceEnabled,
}: {
  pathname: string
  sellerSurface: boolean
  exploreMarketplaceEnabled: boolean
}) {
  const router = useRouter()
  const signedIn = useSignedIn()
  const typing = useTyping()
  const [query, setQuery] = useState("")
  /*
    INSIDE A COMMUNITY THE BAR IS THE COMMUNITY'S (lib/nav/buyer-tabs.ts):
    Home is its home, Search its own search screen, Library and Profile the
    same as anywhere. Read from the address, so it is right on the frame a
    community opens.
  */
  const community = communityOf(pathname)
  /*
    THE COMMUNITY STAYS HOME (round 12, lib/nav/community-context.ts). Inside
    a community it becomes the context; outside one, Home still leads back to
    it from Profile, Library and Search, until the navigator's Explore,
    Discover communities or Dashboard ends it.
  */
  const context = useCommunityContext()
  useEffect(() => enterCommunityContext(community), [community])
  /*
    AND THE PRINTED LISTENER STANDS DOWN while this bar is mounted: from here
    on the press is answered by the gesture, from the context as it stands
    (AND THE PRESS READS THE CONTEXT AGAIN, below), and the listener would
    only answer it a second time with a whole page load. In a layout effect,
    so the flag is up in the same commit the bar hydrates in rather than a
    paint later, which is where the seam would otherwise be (AND IT STANDS
    DOWN THE MOMENT THE BAR IS LIVE in lib/nav/community-context).
  */
  useLayoutEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w[COMMUNITY_HOME_LIVE_FLAG] = 1
    return () => {
      delete w[COMMUNITY_HOME_LIVE_FLAG]
    }
  }, [])
  const homeCommunity = community ? null : context
  const tabs = buyerTabsAt(pathname, exploreMarketplaceEnabled, homeCommunity)
  /*
    AND THE PRESS READS THE CONTEXT AGAIN, AS IT IS PRESSED. `context` is the
    store's answer as of this render, and a render can be behind it: on the
    first (hydrating) render of a page the store answers null by design (the
    server never knew), and the right answer only arrives on the effect after
    it. A press that lands in that window must still go to the community, so
    the press works the tabs out from the context as it stands at the moment
    the finger lifts rather than from this render's copy. Outside that window
    the two are the same object's answer and nothing changes.
    components/nav/buyer-tab-bar's printed boot script answers the window
    before React is running at all.
  */
  const tabsNow = () => (community ? tabs : buyerTabsAt(pathname, exploreMarketplaceEnabled, communityContext()))
  const current = buyerTabFor(pathname, { query: query !== "", sellerSurface, exploreMarketplaceEnabled, homeCommunity })

  /*
    WHERE A PRESS IS GOING, until the address says it has arrived. The /app
    shell keeps a record of its navigations and hands the pill `heading`;
    the rest of the site has no such record, so the bar keeps the one fact
    it needs itself: the slot it sent the page to, dropped the moment the
    address changes, whether it arrived there or was sent on somewhere else.
    Without it the lens would go back to the old tab while a slow page loads.
  */
  const [toward, setToward] = useState<number | null>(null)
  useEffect(() => setToward(null), [pathname])
  /* The page a press is taking the bar to, and where on it to land (lib/navigation/tab-scroll.ts). */
  const arrival = useRef<{ href: string; y: number | null } | null>(null)

  const hrefOf = (index: number, from: ReturnType<typeof buyerTabsAt> = tabs): string => {
    const tab = from[index]
    const home = community || (from === tabs ? homeCommunity : communityContext())
    if (!tab) return home ? `/community/${home}` : exploreMarketplaceEnabled ? "/explore" : "/account/library"
    return tab.key === "profile" && !signedIn ? SIGNED_OUT_PROFILE_HREF : tab.href
  }

  const { slide, pick, linkRefs, shown, arriving, filling } = useTabLens({
    count: tabs.length,
    current,
    heading: toward,
    nav: null,
    onPick: (index) => {
      /* The tabs as the context stands right now (AND THE PRESS READS THE CONTEXT AGAIN, above). */
      const now = tabsNow()
      const tab = now[index]
      if (!tab) return
      /*
        SEARCH OPENS OVER THE PAGE, from inside this press, so the keyboard
        comes up with it (components/search/search-overlay.tsx). On Explore's
        results it opens on the words that found them. Only where there is
        no screen to open (never on a phone) does it go to the address.
        Inside a community it is that community's own search screen, when
        the community's bar has one (a member's); otherwise the site's.
      */
      if (tab.key === "search" && community && openCommunitySearch(community)) return
      if (tab.key === "search" && openSearchOverlay(query)) return
      const href = hrefOf(index, now)
      /*
        THE TAB YOU ARE ALREADY ON takes you to the top of it, as a phone's
        own tab bar does.
      */
      if (index === current && pathname === tab.href) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
        return
      }
      setToward(index)
      /*
        EACH TAB KEEPS ITS PLACE (lib/navigation/tab-scroll.ts): the page
        left is noted, and the page arriving goes back to where it was left
        instead of the top. The push does not scroll; the arrival does.
      */
      noteTabScroll(pathname)
      arrival.current = { href: href.split(/[?#]/)[0], y: prepareTabArrival(href) }
      /*
        THE CLICK NEVER ARRIVES ON A PHONE. The touch's end below is
        cancelled so it cannot fall through onto the page, and cancelling
        it is what keeps the click from being sent at all. The loading line
        only hears clicks, so without this a slow page (Profile, which has
        to ask who you are before it can draw) filled its icon and then sat
        there. The line and, past half a second, the page's own spinner are
        what say the tap landed.
      */
      startRouteLoading({ cover: true })
      router.push(href, { scroll: false })
    },
    onPress: (index) => {
      /* Search is a screen already in the page: nothing to fetch. The page under the finger is read whole, whatever the network (lib/nav/prefetch-policy.ts). */
      if (index !== current && tabs[index]?.key !== "search") prefetchHref(router, hrefOf(index), "press")
    },
    /* No squeeze on a tap: see NO BUMP ON A TAP above. */
    give: false,
  })

  /*
    THE OTHER TABS' PAGES, FETCHED WHILE NOTHING ELSE IS HAPPENING. Once per
    set of addresses (signing in changes Profile's), on a phone only, where
    the bar is drawn, and never for the page you are on or for Search, which
    is a screen already in the page.
  */
  /*
    HOW MANY, AND HOW WHOLE, IS THE DEVICE'S CALL (lib/nav/prefetch-policy.ts):
    on a fast phone every tab's whole page, so a tab already seen and one not
    yet seen both land without a skeleton (the router keeps them for
    staleTimes, next.config.mjs); on a slow network only the frame of the
    next one; with Save-Data nothing until a finger lands.
  */
  const prefetchKey = tabs.map((_, i) => hrefOf(i)).join(" ")
  useEffect(() => {
    if (!window.matchMedia?.("(max-width: 767px)").matches) return
    const hrefs = tabs.flatMap((tab, i) => (tab.key === "search" || i === current ? [] : [hrefOf(i)]))
    return prefetchOnIdle(router, hrefs)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefetchKey, current, router])

  /* The tab that was pressed has arrived: back to where it was left (see EACH TAB KEEPS ITS PLACE), before the frame is painted. */
  useLayoutEffect(() => {
    const a = arrival.current
    if (!a || a.href !== pathname) return
    arrival.current = null
    if (a.y === null) return
    if (a.y === 0) return scrollPageToTop({ smooth: true, frames: 10 })
    return restoreTabScroll(a.y)
  }, [pathname])

  /* A finger is on the bar: the only time the glass is there. */
  const lit = slide.pressed || slide.following

  /*
    ── THE BAR'S HEIGHT, TOLD TO THE PAGE ───────────────────────────────────
    `data-buyer-tabs` on <html> is what app/globals.css turns into
    --buyer-tabs-h on a phone: the product page's buy bar stands on it and
    the cookie banner lifts over it. "away" while a field has the focus,
    when the bar has slid out of sight and the buy bar may come back down.
  */
  const away = typing
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute("data-buyer-tabs", away ? "away" : "shown")
    return () => root.removeAttribute("data-buyer-tabs")
  }, [away])

  return (
    <>
      {/* The room at the end of the page, so nothing ends under the bar. */}
      <div aria-hidden="true" data-buyer-tabs-room="" className="shrink-0 md:hidden" style={{ height: "var(--buyer-tabs-room)" }} />
      {/*
        THE HOME INDICATOR'S ROOM, COUNTED ONCE (round 12: "the library on a phone scrolls when there is nothing to scroll"). The body
        pads itself by env(safe-area-inset-bottom) (app/globals.css), and the room above already holds that inset under the bar. A page
        as tall as the screen (the profile's min-h-svh column: header, page, this room) was therefore the inset taller than the screen,
        34px on an iPhone, and scrolled by that much. Where the bar is drawn the body gives its padding up; printed with the bar, so it
        is in the first paint and goes with the bar.
      */}
      <style>{TAB_BAR_BODY}</style>
      {/* Home leads back to the community from the first byte of the page,
          before anything of React is running: see AND HOME IS THE
          COMMUNITY'S BEFORE THE PAGE IS AWAKE in lib/nav/community-context. */}
      <script dangerouslySetInnerHTML={{ __html: COMMUNITY_HOME_BOOT }} />
      <Suspense fallback={null}>
        <QueryWatch onChange={setQuery} />
      </Suspense>

      <div
        data-buyer-tab-bar={away ? "away" : "shown"}
        className="fixed inset-x-0 bottom-0 z-50 bg-white md:hidden"
        style={{
          boxShadow: BAR_SHADOW,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          /* Out of sight, and a little further so its shadow goes too. */
          translate: away ? "0 calc(100% + 12px)" : "0 0",
          transition: `translate 280ms ${EASE}`,
          pointerEvents: away ? "none" : undefined,
        }}
      >
        <nav
          ref={slide.barRef}
          aria-label="Storelib"
          {...slide.handlers}
          /*
            NO MOUSE AFTER THE FINGER. A phone follows a tap with a mousedown
            and a click at the same point, for pages written for a mouse. The
            pointer gesture has already answered by then, and a tap that
            gives a field the focus (Search) has sent this bar out of the
            keyboard's way: the mousedown and the click that follow land on
            whatever the page has there instead. Measured: a category link
            on the search screen, opened by a tap on Search. Cancelling the
            touch's end is what tells the browser not to send them.
          */
          onTouchEnd={(e) => {
            if (e.cancelable) e.preventDefault()
            /* A touch's end is a gesture on every phone; the pointer's end,
               where Search opened, may not be to an older WebKit. The field
               is given the focus again here, so the keyboard comes up either
               way. */
            refocusSearchOverlay()
            refocusCommunitySearch(community)
          }}
          className="relative flex select-none"
          style={{
            height: "var(--buyer-tabs-bar)",
            /* The same on both sides, because the slide's arithmetic works
               in from both edges by the one number (useSlide's `pad`). */
            paddingLeft: "max(6px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
            paddingRight: "max(6px, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
            touchAction: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {/* ── THE LENS ── see "WHAT THE GLASS DOES HERE" above. */}
          <span
            ref={slide.dotRef}
            aria-hidden="true"
            data-buyer-tabs-lens={lit ? "lit" : "clear"}
            className="pointer-events-none absolute rounded-full"
            style={{
              width: LENS_W,
              height: LENS_H,
              top: `calc((var(--buyer-tabs-bar) - ${LENS_H}px) / 2)`,
              left: 0,
              /* Only a drag lifts it. A tap never changes its size: on a
                 page with no tab of its own it used to grow in from 55%
                 under the finger, which was a bump of its own. */
              scale: String(slide.following ? LIFT : 1),
              backgroundColor: arriving ? ARRIVING_FILL : lit ? LENS_FILL : ARRIVING_FILL,
              backdropFilter: LENS_GLASS,
              WebkitBackdropFilter: LENS_GLASS,
              boxShadow: lit && !arriving ? `${PRESS_EDGE}, ${DROP}` : `${EDGE_CLEAR}, ${DROP_CLEAR}`,
              /* On the instant a finger lands, off over the ink's curve;
                 emptied for the frame it changes slot and filled back
                 (the pill's rules, components/nav/tab-lens.tsx). */
              transition: `${NO_TRAVEL}, ${LIFT_EASE}, transform 0s, ${arriving || (lit && !filling) ? PRESS_ON : `background-color ${INK_EASE}, box-shadow ${INK_EASE}`}`,
              willChange: "translate, scale, transform",
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: LENS_LIGHT,
                opacity: lit && !arriving ? 1 : 0,
                transition: arriving || (lit && !filling) ? "opacity 0s" : `opacity ${INK_EASE}`,
              }}
            />
          </span>

          {tabs.map((tab, i) => {
            const on = i === shown
            const href = hrefOf(i)
            return (
              <Link
                key={tab.key}
                ref={(el) => { linkRefs.current[i] = el }}
                href={href}
                prefetch={false}
                aria-label={tab.key === "profile" && !signedIn ? "Log in" : tab.label}
                aria-current={i === current ? "page" : undefined}
                data-buyer-tab={tab.key}
                /* The pointer gesture decides (useSlide); a click with no
                   pointer behind it is Enter on a focused tab. */
                onClick={(e) => {
                  e.preventDefault()
                  if (e.detail === 0) pick(i)
                }}
                draggable={false}
                className="relative flex flex-1 items-center justify-center outline-none focus-visible:rounded-xl focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20"
                style={{ color: on ? ACTIVE_TEXT : REST_TEXT, transition: `color ${FILL_MS}ms ${FILL_CURVE}` }}
              >
                <NavIcon icon={ICONS[tab.key]} active={on} color="currentColor" box={GLYPH} layer />
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}

