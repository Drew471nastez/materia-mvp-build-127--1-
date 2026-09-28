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
 * WHAT THE GLASS DOES HERE. On the pill the lens always sits on the tab you
 * are on, because the pill is glass and the lens is a clearer piece of it.
 * A white bar with a grey stone resting on it is a badge, so here the lens
 * is only there while a finger is: it comes up under the finger, lifts and
 * stretches along a slide, springs onto the slot it is let go over, and
 * clears over the ink's own curve while the icon it landed on fills. At rest
 * the page you are on is the filled icon and nothing else, as in the
 * reference.
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
import { Suspense, useEffect, useState, useSyncExternalStore } from "react"

import { MagnifierIcon as SearchLinear } from "@solar-icons/react/linear/magnifier"
import { MagnifierIcon as SearchBold } from "@solar-icons/react/bold/magnifier"
import { LibraryIcon as LibraryLinear } from "@solar-icons/react/linear/library"
import { LibraryIcon as LibraryBold } from "@solar-icons/react/bold/library"
import { UserCircleIcon as PersonLinear } from "@solar-icons/react/linear/user-circle"
import { UserCircleIcon as PersonBold } from "@solar-icons/react/bold/user-circle"

import { AppAvatar } from "@/components/app/app-avatar"
import { NAV_ICONS, FILL_MS, FILL_CURVE, type NavIconPair } from "@/components/app/sidebar-desktop-nav"
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
import { useShellAvatar } from "@/lib/account/avatar-store"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { BUYER_TABS, SIGNED_OUT_PROFILE_HREF, buyerTabFor, buyerTabsBelongOn } from "@/lib/nav/buyer-tabs"
import { extractUsernameFromHost, isCustomDomain, isSellerPage } from "@/lib/url-helpers"

/* ── The look ────────────────────────────────────────────────────────────── */

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
 */
const LENS_W = 64
const LENS_H = 42
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
 */
const BAR_SHADOW = "0 -0.5px 0 rgba(16,18,27,0.09), 0 -2px 6px -2px rgba(16,18,27,0.05), 0 -10px 24px -12px rgba(16,18,27,0.10)"
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"

const PERSON: NavIconPair = { line: PersonLinear, fill: PersonBold }
const ICONS: Record<"home" | "search" | "library", NavIconPair> = {
  home: NAV_ICONS.dashboard,
  search: { line: SearchLinear, fill: SearchBold },
  library: { line: LibraryLinear, fill: LibraryBold },
}

/* ── Who is signed in ────────────────────────────────────────────────────── */

/**
 * The header's record of the session (lib/auth/auth-snapshot), read the way
 * the header reads it: synchronously, so a signed in person's avatar is in
 * the bar on the first frame after the page wakes up, and corrected the
 * moment the header verifies the session. A string so the store can compare
 * it; nothing on the server, which never knows.
 */
function readWho(): string {
  const s = readAuthSnapshot()
  return s?.signedIn ? JSON.stringify([s.avatarUrl ?? null, s.displayName ?? s.username ?? ""]) : ""
}
function useWho(): { signedIn: boolean; avatarUrl: string | null; name: string } {
  const raw = useSyncExternalStore(subscribeAuthSnapshot, readWho, () => "")
  if (!raw) return { signedIn: false, avatarUrl: null, name: "" }
  const [avatarUrl, name] = JSON.parse(raw) as [string | null, string]
  return { signedIn: true, avatarUrl, name }
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

/**
 * ASKING FOR THE KEYBOARD ON THE PRESS. Search opens a screen whose field
 * takes the focus as it arrives, but a phone raises its keyboard only for a
 * focus given during a touch, and by the time the screen has arrived the
 * touch is long over. So on the press itself a field that nobody can see
 * takes the focus, the keyboard comes up with the tap, and the search
 * field takes the focus from it a moment later (a focus moved from one field
 * to another keeps the keyboard up). 16px, or iOS zooms the page to it.
 */
function holdKeyboard() {
  if (!window.matchMedia?.("(pointer: coarse)").matches) return
  const el = document.createElement("input")
  el.type = "search"
  el.setAttribute("aria-hidden", "true")
  el.tabIndex = -1
  el.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;padding:0;font-size:16px;pointer-events:none"
  document.body.appendChild(el)
  el.focus({ preventScroll: true })
  const drop = () => el.remove()
  el.addEventListener("blur", drop, { once: true })
  window.setTimeout(drop, 2000)
}

/** The search screen's field (components/explore/search-screen.tsx), when it is on screen. */
function focusSearchField() {
  ;(document.querySelector("[data-search-screen-field]") as HTMLInputElement | null)?.focus({ preventScroll: true })
}

/* ── The query, which Next only hands out under a Suspense ───────────────── */

/**
 * Explore with a query is Search's result, so the bar needs to know whether
 * there is one. useSearchParams suspends a page that is otherwise static, so
 * it is asked in this empty child under its own Suspense rather than by the
 * bar, which then renders on the server like any other part of the page.
 */
function QueryWatch({ onChange }: { onChange: (hasQuery: boolean) => void }) {
  const params = useSearchParams()
  const q = (params?.get("q") ?? "").trim() !== ""
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
  /*
    WHERE THIS IS depends on the host, which the server does not hand a
    client component: a creator's subdomain or their own domain is theirs.
    The first render answers from the address alone (a creator's page is
    left bare until it is known to be browsed from Storelib), and the host
    has the last word a moment later, as it does for the header.
  */
  const [where, setWhere] = useState(() => ({ sellerSurface: isSellerPage(pathname), discover: false, customDomain: false }))
  useEffect(() => {
    const host = window.location.host
    const subdomain = extractUsernameFromHost(host) !== null
    const sellerSurface = subdomain || isSellerPage(pathname)
    const discover = sellerSurface && isDiscoverMode(pathname, new URLSearchParams(window.location.search), { isSubdomain: subdomain })
    setWhere({ sellerSurface, discover, customDomain: isCustomDomain(host) })
  }, [pathname])
  if (!buyerTabsBelongOn(pathname, where)) return null
  return <TabBar pathname={pathname} sellerSurface={where.sellerSurface} />
}

function TabBar({ pathname, sellerSurface }: { pathname: string; sellerSurface: boolean }) {
  const router = useRouter()
  const who = useWho()
  const avatar = useShellAvatar(who.avatarUrl)
  const typing = useTyping()
  const [hasQuery, setHasQuery] = useState(false)
  const current = buyerTabFor(pathname, { query: hasQuery, sellerSurface })

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

  const hrefOf = (index: number): string => {
    const tab = BUYER_TABS[index]
    if (!tab) return "/explore"
    return tab.key === "profile" && !who.signedIn ? SIGNED_OUT_PROFILE_HREF : tab.href
  }

  const { slide, pick, linkRefs, marked, shown, arriving, filling } = useTabLens({
    count: BUYER_TABS.length,
    current,
    heading: toward,
    nav: null,
    onPick: (index) => {
      const tab = BUYER_TABS[index]
      if (!tab) return
      const href = hrefOf(index)
      /*
        THE TAB YOU ARE ALREADY ON takes you to the top of it, as a phone's
        own tab bar does, and Search puts you back in the field.
      */
      if (index === current && pathname === tab.href) {
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" })
        if (tab.key === "search") focusSearchField()
        return
      }
      if (tab.key === "search") holdKeyboard()
      setToward(index)
      router.push(href)
    },
    onPress: (index) => {
      if (index !== current) router.prefetch(hrefOf(index))
    },
  })

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
      <Suspense fallback={null}>
        <QueryWatch onChange={setHasQuery} />
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
              scale: String(marked < 0 ? 0.55 : slide.following ? LIFT : 1),
              opacity: marked < 0 ? 0 : 1,
              backgroundColor: arriving ? ARRIVING_FILL : lit ? LENS_FILL : ARRIVING_FILL,
              backdropFilter: LENS_GLASS,
              WebkitBackdropFilter: LENS_GLASS,
              boxShadow: lit && !arriving ? `${PRESS_EDGE}, ${DROP}` : `${EDGE_CLEAR}, ${DROP_CLEAR}`,
              /* On the instant a finger lands, off over the ink's curve;
                 emptied for the frame it changes slot and filled back
                 (the pill's rules, components/nav/tab-lens.tsx). */
              transition: `${NO_TRAVEL}, ${LIFT_EASE}, transform 0s, opacity 220ms ease-out, ${arriving || (lit && !filling) ? PRESS_ON : `background-color ${INK_EASE}, box-shadow ${INK_EASE}`}`,
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

          {BUYER_TABS.map((tab, i) => {
            const on = i === shown
            const href = hrefOf(i)
            return (
              <Link
                key={tab.key}
                ref={(el) => { linkRefs.current[i] = el }}
                href={href}
                prefetch={false}
                aria-label={tab.key === "profile" && !who.signedIn ? "Log in" : tab.label}
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
                {tab.key === "profile" && who.signedIn ? (
                  <span className="relative block" style={{ width: 28, height: 28 }}>
                    <AppAvatar src={avatar} name={who.name} alt="" size={28} />
                    {/* On: a ring of ink around the photo with a gap of
                        white, the avatar's way of being filled. Off: the
                        faintest ring, so a white photo still has an edge. */}
                    <span
                      aria-hidden="true"
                      data-avatar-ring={on ? "on" : "off"}
                      className="pointer-events-none absolute -inset-[3px] rounded-full"
                      style={{
                        boxShadow: on
                          ? `inset 0 0 0 1.75px ${ACTIVE_TEXT}`
                          : "inset 0 0 0 1.75px rgba(26,26,46,0)",
                        transition: `box-shadow ${FILL_MS}ms ${FILL_CURVE}`,
                      }}
                    />
                    <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 0 0 0.5px rgba(16,18,27,0.10)" }} />
                  </span>
                ) : (
                  <NavIcon icon={tab.key === "profile" ? PERSON : ICONS[tab.key]} active={on} color="currentColor" box={GLYPH} layer />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}

