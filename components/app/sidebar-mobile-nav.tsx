"use client"

/**
 * ===========================================================================
 *  THE PHONE'S NAVIGATION
 * ===========================================================================
 * A hamburger in the top left corner is the one control on this screen that
 * a thumb cannot reach, and it opened a 260px drawer over a 390px screen:
 * three quarters of the phone covered by a menu, and a dark strip of the page
 * behind it doing nothing except waiting to be tapped.
 *
 * So the menu moved to the bottom, where the hand is. A pill floats over the
 * page with three things in it — home, explore, and the menu — and the menu
 * opens as a page rather than as a panel.
 *
 * ---------------------------------------------------------------------------
 *  THIS FILE IS AT MODULE SCOPE, AND THAT IS THE OTHER HALF OF THE FIX
 * ---------------------------------------------------------------------------
 * The drawer's rows were declared inside the `AppSidebar` function body, the
 * way the desktop rail's were before sidebar-desktop-nav.tsx existed. A
 * component declared in a render is a new function object every time, so React
 * sees a different element type in the same position and unmounts the whole
 * subtree to mount a new one. Every DOM node in the menu was destroyed and
 * rebuilt on any state change anywhere in the shell — a poll, a route change,
 * a dropdown opening.
 *
 * A group cannot animate open across that. The element carrying the
 * transition is gone before the transition ends, and the new one arrives
 * already in its end state. "The collapsible thing should open smooth and
 * close smooth" is not a matter of easing curves until the element survives
 * long enough to be eased.
 */

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { endLayerMove } from "@/components/app/page-layer"
import { hapticTap } from "@/lib/native-bridge"
import { onPageOf, scrollAppToTop } from "@/lib/ui/scroll-app-top"
import { UpgradeBolt } from "@/components/app/upgrade-bolt"
import { APP_PAGE_KEPT_MS, isPlainClick, pendingPath, prefetchAppPage, useAppNavigation, useShownPath, useShownSearch } from "@/lib/ui/app-navigation"
import { mayLeave } from "@/lib/ui/leave-guard"
import { prefetchPlan } from "@/lib/nav/prefetch-policy"
import {
  isRouteActive,
  type NavIconPair,
  type NavItemData,
  type NavChild,
  FILL_TRANSITION,
  FILL_MS,
  FILL_CURVE,
  UPGRADE_HREF,
} from "@/components/app/sidebar-desktop-nav"
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
  PRESS_FILL,
  PRESS_ON,
  REST_EDGE,
  REST_FILL,
  useTabLens,
} from "@/components/nav/tab-lens"
import { tt } from "@/lib/i18n/text"

/* ── The palette ──────────────────────────────────────────────────────────
   The page this menu covers is #f8f9fa and its cards are white, so the menu
   is the page colour and the row you are on is a step DARKER rather than a
   white card floating on a white card. */
const PAGE = "#f8f9fa"
const REST_TEXT = "#6b7280"
const ACTIVE_TEXT = "#1a1a2e"
const ACTIVE_BG = "#ebecee"
const LABEL_TEXT = "#a5a5a5"

/**
 * The name of the "close yourself" event, exported so the one other place
 * that sends it does not have to spell it.
 */
export const CLOSE_EVENT = "storelib:close-mobile-menu"

/** 44px is the smallest target a thumb hits reliably; the rows are 48. */
/* A size up and a little firmer than the computer's sidebar (round 24, the owner: "a little bit more big ... a little bit more pronounced on the font weight"). */
const ROW =
  "relative flex h-[52px] w-full items-center gap-3 rounded-[14px] px-3.5 text-left " +
  "text-[16.5px] leading-[24px] tracking-[-0.01em] " +
  "transition-[background-color,color] duration-[160ms] ease-out"

const REST_WEIGHT = 510
const ACTIVE_WEIGHT = 620

/**
 * One easing and one duration for everything that opens or closes here, so
 * the pill, the page and the groups move as one thing rather than as three
 * animations that happen to overlap.
 */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const OPEN_MS = 320

// ── The submenu's height ────────────────────────────────────────────────────

/**
 * `grid-template-rows: 0fr → 1fr`, the same as the desktop rail's.
 *
 * The mobile drawer had its own, and its own was the imperative one: read
 * `scrollHeight`, pin an explicit pixel height, force a reflow with
 * `void outer.offsetHeight`, transition to the measured number, then release
 * it back to `auto` on transitionend. That is four layout flushes per toggle
 * and a pinned height that goes stale if the content changes underneath it.
 *
 * The grid track animates a true auto height with no measurement, nothing to
 * release, and an interrupted toggle retargets from wherever it is rather
 * than restarting. `min-height: 0` on the inner row is not optional: a grid
 * item defaults to `min-height: auto`, refuses to shrink below its content,
 * and the row never closes.
 */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      data-nav-submenu={open ? "open" : "closed"}
      aria-hidden={!open}
      inert={!open}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: `grid-template-rows 260ms ${EASE}, opacity 200ms ease`,
      }}
    >
      <div style={{ minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  )
}

// ── The rows ────────────────────────────────────────────────────────────────

/**
 * A PRESS YOU FEEL, AND NEVER A SCROLL THAT LIGHTS UP (round 22).
 *
 * A row used to turn grey the moment a finger landed on it and stay grey
 * until the browser decided the touch was a scroll, so every swipe through
 * the menu lit up the row it started on: the owner's "cheap, bad hover" on
 * Orders while scrolling. Then it showed nothing at all, and the owner: "when
 * I click on something it should also feel like I'm touching it".
 *
 * So the soft fill comes only for a finger that is pressing, never for one
 * that is scrolling: it waits PRESS_WAIT_MS with the finger still, and goes
 * the moment the finger travels PRESS_SLOP_PX (a scroll has started). A tap
 * quicker than the wait is shown the fill for PRESS_FLASH_MS as it lands,
 * with a soft tick in the app. The fill eases in and out with the row's own
 * background transition.
 *
 * The press also starts fetching the row's page on pointerdown, which gives
 * the server the length of the tap (80 to 150ms of a finger on glass) as a
 * head start. The router picks that fetch up when the click arrives.
 */
const PRESS_BG = "#e8e9ec"
const PRESS_WAIT_MS = 90
const PRESS_SLOP_PX = 8
const PRESS_FLASH_MS = 140

function usePress(onPress?: () => void) {
  const [pressed, setPressed] = useState(false)
  const at = useRef<{ x: number; y: number; timer: number; moved: boolean } | null>(null)
  const flash = useRef(0)
  useEffect(() => () => {
    if (at.current) window.clearTimeout(at.current.timer)
    window.clearTimeout(flash.current)
  }, [])
  const end = () => {
    if (at.current) window.clearTimeout(at.current.timer)
    at.current = null
  }
  return {
    pressed,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        onPress?.()
        end()
        const timer = window.setTimeout(() => {
          if (at.current && !at.current.moved) setPressed(true)
        }, e.pointerType === "touch" ? PRESS_WAIT_MS : 0)
        at.current = { x: e.clientX, y: e.clientY, timer, moved: false }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const p = at.current
        if (!p || p.moved) return
        if (Math.abs(e.clientX - p.x) > PRESS_SLOP_PX || Math.abs(e.clientY - p.y) > PRESS_SLOP_PX) {
          p.moved = true
          window.clearTimeout(p.timer)
          setPressed(false)
        }
      },
      onPointerUp: () => {
        const p = at.current
        end()
        if (!p || p.moved) return setPressed(false)
        /* A tap quicker than the wait: shown as it lands, then let go. */
        setPressed(true)
        hapticTap("soft")
        window.clearTimeout(flash.current)
        flash.current = window.setTimeout(() => setPressed(false), PRESS_FLASH_MS)
      },
      onPointerCancel: () => {
        end()
        setPressed(false)
      },
    },
  }
}

function rowStyle(active: boolean, pressed = false): React.CSSProperties {
  return {
    backgroundColor: active ? ACTIVE_BG : pressed ? PRESS_BG : "transparent",
    color: active ? ACTIVE_TEXT : REST_TEXT,
    fontWeight: active ? ACTIVE_WEIGHT : REST_WEIGHT,
  }
}

function MobileSubNavItem({
  child,
  onNavigate,
  onClose,
}: {
  child: NavChild
  onNavigate?: (href: string) => void
  /** With the address a press is going to: the menu stays until that page is here (MobileMenuPage, ONTO THE PAGE). */
  onClose: (to?: string) => void
}) {
  const router = useRouter()
  const active = isRouteActive(useShownPath(), child.href, useShownSearch())
  const { pressed, handlers } = usePress(() => { if (!active) prefetchAppPage(router, child.href) })
  return (
    <Link
      href={child.href}
      onClick={(e) => {
        if (isPlainClick(e.nativeEvent)) onNavigate?.(child.href)
        onClose(isPlainClick(e.nativeEvent) ? child.href : undefined)
      }}
      {...handlers}
      className={cn(ROW, "h-12 text-[15.5px]")}
      style={rowStyle(active, pressed)}
    >
      {child.thumb ? <span className="-ml-0.5 flex shrink-0 items-center">{child.thumb}</span> : null}
      <span className="min-w-0 truncate">{child.label}</span>
    </Link>
  )
}

/**
 * The chevron is its own button beside the link, not a wrapper around it.
 *
 * Products is a page AND a group. One control that both navigates and expands
 * can only pick one, and on a phone there is no second mouse button to carry
 * the other. Two targets, each 44px wide, and the row still reads as one row.
 */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        transform: `rotate(${open ? 180 : 0}deg)`,
        transformOrigin: "center",
        transition: `transform 260ms ${EASE}`,
        willChange: "transform",
      }}
    >
      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MobileNavItem({
  item,
  expanded,
  onToggle,
  onNavigate,
  onForceNavigate,
  onClose,
}: {
  item: NavItemData
  expanded: boolean
  onToggle: (href: string) => void
  onNavigate?: (href: string) => void
  onForceNavigate?: (href: string) => void
  onClose: (to?: string) => void
}) {
  const router = useRouter()
  const active = isRouteActive(useShownPath(), item.href, useShownSearch())
  /* A row that reloads the document (forceNavigation) has nothing to fetch ahead. */
  const { pressed, handlers } = usePress(() => { if (!active && !item.forceNavigation && !item.children?.length) prefetchAppPage(router, item.href) })
  const style = rowStyle(active, pressed)
  const tint = active ? ACTIVE_TEXT : REST_TEXT

  const body = (
    <>
      <NavIcon icon={item.icon} active={active} color={tint} />
      <span className="truncate">{item.label}</span>
    </>
  )

  if (item.forceNavigation) {
    return (
      <button
        type="button"
        onClick={() => {
          onForceNavigate?.(item.href)
          onClose()
        }}
        {...handlers}
        className={ROW}
        style={style}
      >
        {body}
      </button>
    )
  }

  if (item.children?.length) {
    /*
      ON A PHONE THE ROW OPENS ITS LIST (round 22). Products was a page and a
      group in one row: a tap went to the page and the list opened under it
      in the same moment, and the menu slid away mid opening, which the owner
      saw as a glitch, with the chevron the only way to just open the list.
      The whole row opens and closes the list now, as a phone's settings do,
      and the page itself is the list's first row ("All products").
    */
    const overview = item.href === "/app/products" ? tt("All products") : item.href === "/app/integrations" ? tt("All integrations") : item.label
    return (
      <div>
        <button
          type="button"
          onClick={() => onToggle(item.href)}
          aria-expanded={expanded}
          {...handlers}
          className={cn(ROW, "justify-between")}
          /* Its words say it is the page's group; the fill is the page's own row's, below. */
          style={{ ...style, backgroundColor: pressed ? PRESS_BG : "transparent" }}
          data-nav-group=""
        >
          <span className="flex min-w-0 items-center gap-3">{body}</span>
          <span className="flex h-6 w-6 shrink-0 items-center justify-center" style={{ color: LABEL_TEXT }}>
            <Chevron open={expanded} />
          </span>
        </button>
        <Collapsible open={expanded}>
          <div className="space-y-0.5 pl-[30px] pt-1">
            <MobileSubNavItem child={{ href: item.href, label: overview }} onNavigate={onNavigate} onClose={onClose} />
            {item.children.map((child) => (
              <MobileSubNavItem key={child.href} child={child} onNavigate={onNavigate} onClose={onClose} />
            ))}
          </div>
        </Collapsible>
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={(e) => {
        if (isPlainClick(e.nativeEvent)) onNavigate?.(item.href)
        onClose(isPlainClick(e.nativeEvent) ? item.href : undefined)
      }}
      {...handlers}
      className={ROW}
      style={style}
    >
      {body}
    </Link>
  )
}

// ── The menu, as a page ─────────────────────────────────────────────────────

/** When each of the menu's pages was last fetched whole as it opened (MobileMenuPage). */
const menuWarmedAt = new Map<string, number>()

export function MobileMenuPage({
  open,
  items,
  expandedGroups,
  onToggle,
  onNavigate,
  onForceNavigate,
  onClose,
  upgradeTitle,
  upgradeSubtitle,
  storeUnpublishedNote,
  setupSlot,
}: {
  open: boolean
  items: NavItemData[]
  expandedGroups: ReadonlySet<string>
  onToggle: (href: string) => void
  onNavigate?: (href: string) => void
  onForceNavigate?: (href: string) => void
  onClose: () => void
  upgradeTitle: string
  upgradeSubtitle: string
  storeUnpublishedNote?: string
  setupSlot?: React.ReactNode
}) {
  /*
    ── THE HARDWARE BACK BUTTON CLOSES IT ────────────────────────────────
    On Android, back on a root route means "tap again to exit the app"
    (components/app/native-back-handler). With a full screen menu over the
    page that is plainly wrong: the first thing back should dismiss is the
    thing on top.

    The handler does not import this component and this component does not
    import the handler. They meet at one attribute and one event: anything
    can find `[data-mobile-menu="open"]` and ask it to close, and this is
    what answers.
  */
  const router = useRouter()
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const nodeRef = useRef<HTMLDivElement>(null)
  /*
    THE TAP CLOSES IT, AT ONCE (round 26, the owner: "tapping an item sometimes blocks ~4 seconds before navigating").
    Round 24 kept the menu up until the new page had committed under it, up to 1.6s, so on a slow answer the menu sat
    frozen over the screen with the row lit and nothing else moving, and then the page you were on came back for the
    rest of the wait. Now the press starts the navigation (Link) and closes the menu in the same tap: it fades in its
    own 180ms while the router brings the page, and the page you were on stays under it with the shell's spinner if
    the server is slow (components/app/app-stage). The `to` is still passed by the rows; it no longer holds anything.
  */
  const closeOnto = useCallback((to?: string) => {
    void to
    closeRef.current()
  }, [])
  /*
    WHAT IT LISTS IS WARMED AS IT OPENS (round 25, the owner: "/app navigation faster and smoother"). The pill's four
    pages are fetched whole when the app starts; the menu's others (Emails, Payouts, Settings...) were fetched only
    when a row was pressed, a tenth of a second before the tap lands, and a cold page then took 300 to 700ms over a
    phone connection with the menu waiting on it. Opening the menu says where you are going next, so its pages are
    fetched whole as it opens: after its own motion, one every 80ms so nothing in it stutters, each at most once in
    APP_PAGE_KEPT_MS (the time the router keeps it, next.config staleTimes).
  */
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    if (!open) return
    /* Round 26: not the pill's four, which it keeps warm itself, and no more than the device's plan allows in one go
       (lib/nav/prefetch-policy: 8 on a fast phone, 4 on most, none on Save-Data). A dozen whole pages drawn on the server
       at once are a dozen renders the page the person then taps waits behind. Closing the menu cancels the rest. */
    const plan = prefetchPlan()
    const tabs = new Set<string>(TABS.map((t) => t.href))
    const hrefs = itemsRef.current
      .filter((i) => !i.forceNavigation && !i.children?.length && i.href.startsWith("/app") && !tabs.has(i.href))
      .map((i) => i.href)
      .slice(0, plan.idleBudget)
    const timers: number[] = []
    let n = 0
    for (const href of hrefs) {
      if (Date.now() - (menuWarmedAt.get(href) ?? 0) < APP_PAGE_KEPT_MS) continue
      timers.push(window.setTimeout(() => {
        menuWarmedAt.set(href, Date.now())
        prefetchAppPage(router, href)
      }, 280 + 80 * n++))
    }
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [open, router])
  useEffect(() => {
    const node = nodeRef.current
    if (!node) return
    const handler = () => closeRef.current()
    node.addEventListener(CLOSE_EVENT, handler)
    return () => node.removeEventListener(CLOSE_EVENT, handler)
  }, [])

  /*
    KEPT MOUNTED, HIDDEN WITH `visibility`.

    Unmounting on close throws away the scroll position and every open group,
    so the menu forgets where it was every time it is used. `visibility:
    hidden` takes it out of the accessibility tree and out of hit testing —
    it is not a `display: none`, which would cancel the transition it is in
    the middle of.
  */
  return (
    <div
      ref={nodeRef}
      id="app-mobile-menu"
      role="dialog"
      aria-modal="true"
      aria-label={tt("Menu")}
      data-mobile-menu={open ? "open" : "closed"}
      /*
        Z 50, THE PHONE HEADER'S OWN, AND RENDERED BEFORE IT (sidebar.tsx), so
        the header and its rounded corners stay drawn over the menu's top.
        At 45 it was under Settings as a page (49): the button became an X
        and the screen still showed Settings. Over a page layer that keeps
        the pill (the product editor, 52) the header is hidden and the layer
        is above 50, so app/globals.css lifts the menu to 54 and up to the
        top of the screen there (MENU OVER A PAGE LAYER). The top is a class
        rather than a style for that rule to win.
      */
      className="fixed inset-x-0 top-[calc(68px+env(safe-area-inset-top,0px))] z-[50] flex flex-col md:hidden"
      style={{
        bottom: 0,
        backgroundColor: PAGE,
        /*
          Transform and opacity only, so the whole thing is one compositor
          job. A page that RISES a little as it fades in reads as coming from
          the pill it was opened with; a drawer sliding in from the left reads
          as a panel, which is what this stopped being.
        */
        transform: open ? "translateY(0)" : "translateY(14px)",
        opacity: open ? 1 : 0,
        visibility: open ? "visible" : "hidden",
        transition: open
          ? `transform ${OPEN_MS}ms ${EASE}, opacity 220ms ease-out, visibility 0s`
          : `transform 240ms ${EASE}, opacity 180ms ease-in, visibility 0s linear 240ms`,
        willChange: "transform, opacity",
      }}
    >
      {/*
        The list scrolls; the pill floats over its last rows, so the padding
        at the bottom is the page's room for the pill (--app-nav-room), and a little
        more, since the last thing here is a card rather than a row.
      */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3"
        style={{ paddingBottom: "calc(var(--app-nav-room) + 12px)" }}
      >
        <div className="space-y-0.5">
          {items.map((item) => (
            <MobileNavItem
              key={item.href}
              item={item}
              expanded={expandedGroups.has(item.href)}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onForceNavigate={onForceNavigate}
              onClose={closeOnto}
            />
          ))}
        </div>

        {/*
          SETTINGS IS NOT A ROW HERE.

          It was one of two unlabelled grey circles in the drawer's footer,
          the size of a favicon; it was briefly a row in this list; it is a
          button in the bar at the foot of the screen now, which appears the
          moment this menu opens. One place, and it is the place a thumb is
          already resting.
        */}

        {storeUnpublishedNote && (
          <p className="mt-4 rounded-[14px] border border-amber-100/80 bg-amber-50/80 px-3.5 py-2.5 text-[13px] text-amber-700">
            {storeUnpublishedNote}
          </p>
        )}

        {setupSlot}

        {/* The card as this menu had it until 09-25 (white on this grey page,
            a violet hairline, 14px and 12px words, "Unlock more benefits"),
            with the rail's white bolt on violet at its old 32px
            (components/app/upgrade-bolt). Fetched on the press, recorded on
            the tap, like every row above. */}
        <Link
          href={UPGRADE_HREF}
          data-upgrade-card=""
          onClick={(e) => {
            if (isPlainClick(e.nativeEvent)) onNavigate?.(UPGRADE_HREF)
            onClose()
          }}
          onPointerDown={() => prefetchAppPage(router, UPGRADE_HREF)}
          className="group/upgrade mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-violet-100/70 bg-white px-4 py-3.5"
        >
          <span className="block min-w-0">
            <span className="block truncate text-[14px] font-semibold" style={{ color: ACTIVE_TEXT }}>{upgradeTitle}</span>
            <span className="block truncate text-[12px]" style={{ color: REST_TEXT }}>{upgradeSubtitle}</span>
          </span>
          <UpgradeBolt size={32} />
        </Link>
      </nav>
    </div>
  )
}

// ── The bar ─────────────────────────────────────────────────────────────────

/**
 * ===========================================================================
 *  GLASS, AND NOT A PANEL PAINTED TO LOOK LIKE IT
 * ===========================================================================
 * The first version was a white pill at 82% over a blurred band: a solid
 * object sitting on frosted glass rather than being made of it. The blur
 * moved onto the objects, the tint came down to 42%, and it was still read
 * back as "it should not have a solid background, look at the image".
 *
 * It was right. 42% white is not far off opaque when what is behind it is
 * already near white, and the bar sits over #f8f9fa most of the time. The
 * tint is 28% now, which is thin enough that the page's own colour comes
 * through it — over the dashboard's artwork the bar takes the artwork's hue,
 * which is the whole point of glass and the thing a fixed white panel can
 * never do.
 *
 * What holds the shape at that opacity is not the fill, it is the edge: a
 * half pixel of white along the top where light would catch, and a half
 * pixel ring all the way round.
 *
 * DEPTH IS THREE DROPS, AND IT IS STILL SOFT. "A little bit more" made it a
 * contact shadow at 5% and a lift at 10%; "add some more depth" makes it
 * three: the contact line right under the edge, a near drop that gives the
 * glass its thickness, and a far one that puts the whole pill above the
 * page. Three soft drops read as distance; one hard one reads as a sticker.
 */
const GLASS: React.CSSProperties = {
  /*
    FROSTED, NOT CLEAR. This went as low as 18% while "solid" was the
    complaint, and over the dashboard's artwork that left the bar the colour
    of the artwork, with its glyphs sitting on saturated red. Asked for
    directly: "the buttons themselves don't need to be full glassmorphism
    transparent, the bar itself doesn't need to be transparent". And then, at
    70%, over the dark artwork it read as warm grey: "I know it's see-through
    but I don't want it greyish in any circumstances". 93% white over a blur,
    with the saturation boost pulled back: it reads WHITE over anything, and
    what is under it is a breath, not a colour. "Not really that see-through,
    more whitish" took it the last step from 90.
  */
  backgroundColor: "rgba(255,255,255,0.93)",
  /* 25px: 5% more than the 24 it was, asked for "just 5% more" around it. */
  backdropFilter: "blur(25px) saturate(120%)",
  WebkitBackdropFilter: "blur(25px) saturate(120%)",
  /* A touch more depth (round 22, "just a little bit"): each layer a little deeper and lower, and a hairline of shade along its foot. */
  boxShadow:
    "0 1px 2px rgba(16,18,27,0.07), 0 5px 12px rgba(16,18,27,0.085), 0 16px 34px rgba(16,18,27,0.16)," +
    " inset 0 0 0 0.5px rgba(255,255,255,0.65), inset 0 0.5px 0 rgba(255,255,255,0.9), inset 0 -0.5px 0 rgba(16,18,27,0.05)",
}

/**
 * ===========================================================================
 *  THE PILL'S SIZE LIVES IN ONE PLACE: app/globals.css
 * ===========================================================================
 * "Reduce the overall size of the pill by 4%, and make sure it fits every
 * phone since 2015." The numbers (a 60.48px bar, 55.68px slots, 21.12px
 * icons: 63, 58 and 22 times 0.96) are CSS variables on :root, under "Room
 * for the nav pill", with the rule that scales them to the width of the
 * phone. This file draws the pill from those variables and has no copy of
 * any of them:
 *
 *   --app-nav-bar    the bar's height, and the round buttons' size
 *   --app-nav-width  the bar's width: four tabs and its padding
 *   --app-nav-slot   one tab's width
 *   --app-nav-pad    the bar's inner padding
 *   --app-nav-dot    the lens, a circle
 *   --app-nav-gap    between the bar and the buttons beside it
 *   --app-nav-glyph  the icons
 *   --app-nav-lift   the gap under the pill (see PILL_LIFT)
 *
 * The page's room for the pill (--app-nav-room) is worked out from the same
 * variables in the same place, so it follows the bar on every phone.
 *
 * Where the lens sits is arithmetic in JS, and that arithmetic MEASURES the
 * drawn bar (useSlide's geometry) rather than working the size out again
 * from the window's width. Whatever CSS made it, the lens agrees.
 */
const TABS = [
  { key: "home", get label() { return tt("Home") }, href: "/app" },
  { key: "orders", get label() { return tt("Orders") }, href: "/app/orders" },
  { key: "products", get label() { return tt("Products") }, href: "/app/products" },
  { key: "analytics", get label() { return tt("Analytics") }, href: "/app/analytics" },
] as const
/**
 * How far the bottom of the pill sits above the bottom of the screen: the
 * larger of 4px and the home indicator's inset (the reasoning is beside
 * --app-nav-lift in globals.css). Read once, by the pill and by the halo, so
 * the two cannot disagree. An iPhone 8 or SE has no inset and gets the 4px.
 */
const PILL_LIFT = "var(--app-nav-lift)"
/** The glyphs, at the size the bar is drawn at on this phone. */
const GLYPH_BOX = "var(--app-nav-glyph)"
/** A length in the icons' own units (22 across), so the menu glyph follows them. */
const gx = (n: number) => `calc(var(--app-nav-glyph) * ${Math.round((n / 22) * 10000) / 10000})`

/**
 * ===========================================================================
 *  THE HALO: A FADE AROUND THE BAR, NOT A BAND ACROSS THE SCREEN
 * ===========================================================================
 * "The fade needs to be around the pill, not across all the screen at the
 * bottom, and extremely subtle and clean. And not cut with strips."
 *
 * Both complaints have the same answer. The old fade was six full-width
 * rectangles with blurs of 1 to 6 pixels stacked toward the bottom edge, and
 * each rectangle's top edge was a step in blur radius that the eye could
 * find: the strips. Now the layers are CONCENTRIC stadiums around the bar
 * group, each inset a few pixels from the one before, and every one carries
 * the SAME small blur. Where they overlap the blur compounds toward the bar,
 * so it is softest at the halo's edge and strongest right around the bar, and
 * no single edge changes the radius by more than 1.4px, which is under what
 * a screen can show as a line. Eight of them compound to about 4px at the
 * centre: "almost unobservable" is the brief.
 *
 * Still no mask anywhere, for the same reason as before: WKWebView draws a
 * masked backdrop-filter as a flat plate. A rounded rectangle with only a
 * blur on it is drawn the same way everywhere.
 *
 * The tint is one radial gradient in the page's colour, no filter, centred
 * on the bar and gone by the halo's edge.
 */
/**
 * ELLIPSES, NOT STADIUMS. A stadium is a rectangle with round ends, and its
 * top and bottom are STRAIGHT: "it should not end with a straight line, it
 * should morph into outside of it". An ellipse has no straight edge anywhere,
 * so the halo's boundary is a curve all the way round. The tint is the same
 * ellipse, so there is one shape, not a blob inside a different shape —
 * which is what "empty spots" was.
 *
 * THE BLUR RAMPS. Ten ellipses each carrying the same 1.2px still had an
 * edge: the OUTERMOST one, where 1.2px of blur began all at once on crisp
 * text, and over the menu's cards that read as a cut along the halo's left
 * side. So the layers no longer carry the same blur. The outermost carries
 * almost none, and each one inward carries more, on a square curve, so
 * that the first thing a screen can show as a change is a dozen pixels in
 * from where the halo begins. Where they all overlap, around the bar, they
 * compound to under 3px: "not that powerful, just a little bit".
 *
 * WIDER THAN THE SCREEN. "The spread should cover the left and right, full
 * width." An ellipse the exact width of the screen cannot: its two tips have
 * no height at all, so the last 40px at each side would be left bare, in an
 * arc. So the ellipse is drawn WIDER than the screen and the screen crops
 * it, which is how a system bar's does it — at the screen's left edge it is
 * still about two thirds of its full height, and what is cut off is cut off
 * by the edge of the display rather than by an edge of its own.
 *
 * It is centred on the screen rather than on the bar group, because the group
 * is not always where the bar is: with the menu open a settings circle sits
 * to the left of it, and a halo hung on the group left that circle standing
 * on bare page.
 *
 * AND THEN BACK DOWN. 1.6px at the innermost layer was as close to nothing as
 * a blur gets, which was the brief at the time ("almost unobservable"); "not
 * that potent, but more than visible" took it to 2.4, compounding to about
 * 4px where the layers overlap. Asked down again with a picture of the bar
 * and an arrow at the smear under it, and measured at 2.4 the stripes behind
 * it read 255 of contrast above the halo and 15 beside the bar — 94% of it
 * gone at the strongest point, which is the smear. Asked down three more
 * times from there, and measured each time as the contrast that survives
 * behind it, out of 255 with nothing over it:
 *
 *     blur / tint      beside the bar   left margin   under the pill
 *     2.4 / 0.30                   15            22               25
 *     1.2 / 0.30                   33            49               57
 *     0.9 / 0.18                   63            86              108
 *     0.6 / 0.18                  125           161              154
 *     0.45 / 0.18                 191           234              191
 *     0.35 / 0.18                 220           248              203
 *     0.2 / 0.18                  220           248              203
 *
 * 0.45 is where it sits after being asked back up a little. 0.35 was the
 * floor: at 0.2 every reading is identical — the radius has
 * stopped resolving to a whole device pixel on the innermost layers and the
 * blur does not thin any further, so this is the floor rather than a
 * preference. What is left over the artwork at the bottom is the tint, and
 * that has its own alpha above.
 *
 * The tint came down with it: it is the page's own colour, so it is
 * invisible over the page and only shows over something that is not the
 * page — a picture, a coloured card — where it washes the artwork. That is
 * the whitish overlay near the bottom, and it is meant to stay subtle.
 *
 * AND IT GOES PAST THE BOTTOM OF THE SCREEN. Its lower edge used to be tied
 * to the pill's own lift off the bottom, which on a phone with a home
 * indicator put it 18px ABOVE the bottom of the display: a strip under the
 * pill, exactly where a thumb rests, with nothing over it. "The blur should
 * be spread at the bottom more, under the pill, fully." So the ellipse is
 * anchored below the display instead, deep enough that the bottom edge of
 * the screen cuts across it where it is still near its full width, and the
 * part of it nobody can see is the part that would have tapered.
 */
const HALO_LAYERS = 12
const HALO_STEP = 3
/** The strongest layer's blur; the outermost carries this over HALO_LAYERS². */
const HALO_BLUR = 0.47
const haloBlur = (i: number) => Math.round(HALO_BLUR * ((i + 1) / HALO_LAYERS) ** 2 * 1000) / 1000
/** How far the halo reaches: above the bar, past the bottom of the screen,
    and past each side of it. The display crops the last two. */
const HALO_REACH = { top: 30, below: 44, side: 56 }
/**
 * The page under the bar on a phone is #f8f9fa, and the tint is that colour.
 *
 * Which is why it is invisible over the page itself and only shows over
 * something that is not the page — a picture, a coloured card — where it
 * reads as a whitish cast washing over the artwork. "Get rid of the whitish
 * fade it has a little bit" is about that, and it is this alpha: 45% read as
 * a plate under the bar, 30% still washed the card under it, 18% leaves the
 * artwork its own colour while the halo still has something to soften the
 * boundary with.
 */
const HALO_TINT = "rgba(248,249,250,0.18)"
const HALO_TINT_NONE = "rgba(248,249,250,0)"

/**
 * WHERE THE PILL DOES NOT GO.
 *
 * OnePage is an editor, not a page of the shop: it owns the whole screen,
 * it has its own controls along the bottom, and a second bar floating over
 * them is one bar too many. Asked for directly, and it is a property of the
 * route rather than of anything on the page, so it is decided here rather
 * than by a page remembering to say so.
 *
 * A prefix, so /app/onepage and anything under it are covered alike.
 *
 * It is applied where the pill is MOUNTED rather than inside it. Inside, it
 * would have to be `if (...) return null` after every hook the component
 * owns, and a hook below a return is the crash this repository has a test
 * for; tests/hook-order.test.ts reads a file at a time, so the rule holds
 * whether or not the return is in the same component as the hook. Not
 * rendering a component at all is the ordinary way to say this anyway.
 */
const NO_PILL = ["/app/onepage"]
export const pillBelongsOn = (pathname: string): boolean =>
  !NO_PILL.some((base) => pathname === base || pathname.startsWith(`${base}/`))

/**
 * Three bars that become a cross.
 *
 * The bars used to sit 4px apart, which at 1.6px of stroke leaves 2.4px of
 * air and reads as a stack rather than as three lines. Five apart now, for
 * the "extremely little bit more space" that was asked for and no more.
 */
function MenuGlyph({ open }: { open: boolean }) {
  /* Drawn in the icons' units (gx: 22 across), so it is the same size beside
     them on every phone: 18 across, bars 17 by 1.6, where the icons are 22. */
  const bar = "absolute rounded-full bg-current"
  const ease = "transition-all duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
  const line = (top: number): React.CSSProperties => ({ top: gx(top), width: gx(17), height: gx(1.6) })
  return (
    <span className="relative flex items-center justify-center" style={{ width: gx(18), height: gx(18) }}>
      <span className={cn(bar, ease, open ? "rotate-45" : "rotate-0")} style={line(open ? 8.2 : 3.2)} />
      <span className={cn(bar, ease, open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100")} style={line(8.2)} />
      <span className={cn(bar, ease, open ? "-rotate-45" : "rotate-0")} style={line(open ? 8.2 : 13.2)} />
    </span>
  )
}

type BarItem = {
  key: string
  label: string
  href: string
  icon: NavIconPair
}

export function MobileNavPill({
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onNavigate,
  onPrefetch,
  icons,
}: {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onNavigate: (href: string) => void
  /** Warms a route so the first press on it does not stream from cold. */
  onPrefetch?: (href: string) => void
  icons: { home: NavIconPair; orders: NavIconPair; products: NavIconPair; analytics: NavIconPair; settings: NavIconPair }
}) {
  const pathname = usePathname()

  /*
    HOME, ORDERS, PRODUCTS, ANALYTICS — four pages of this person's own shop,
    in that order, and they stay put when the menu opens. Settings had the
    fourth slot for a while; it is a circle that appears to the LEFT of the
    bar while the menu is open now, mirroring the X on the right, and the
    slot went to the page somebody actually visits between the other three.

    The menu is not a place, so it is its own button beside the four rather
    than a fifth slot in a row of places.

    The four are TABS, at module scope, because how many there are is part
    of how wide the pill is (--app-nav-tabs in app/globals.css says the same,
    and tests/app-mobile-nav.test.ts holds the two together).
  */
  const items: BarItem[] = TABS.map((tab) => ({ ...tab, icon: icons[tab.key] }))

  /*
    WARMED ONCE. A page pressed for the first time waits for the server,
    with the page you are on still showing; a page the router already has
    lands on the next frame. The shell prefetches the four whole pages on
    mount (prefetchAppPage, lib/ui/app-navigation), so the first press on any
    of them finds the page waiting, and next.config's staleTimes is what
    keeps a page you have been on from being fetched again on the way back.

    AND WARMED AGAIN when the app comes back after longer than the router
    keeps a page (APP_PAGE_KEPT_MS, the same five minutes as next.config's
    staleTimes). An app left in the background over lunch came back with all
    four cold, and every first tap after that waited for the server. Date.now,
    not performance.now: a phone that sleeps may stop the second clock.
  */
  useEffect(() => {
    if (!onPrefetch) return
    let warmedAt = 0
    const warm = () => {
      warmedAt = Date.now()
      for (const item of items) onPrefetch(item.href)
    }
    warm()
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - warmedAt > APP_PAGE_KEPT_MS) warm()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = items.findIndex((i) => isRouteActive(pathname, i.href))
  /* Where the navigation underway is going, as a slot: null with none, -1
     for a page of /app that has no slot (a menu row, a link in the page). */
  const nav = useAppNavigation()
  const toPath = pendingPath(nav)
  const heading = toPath == null ? null : items.findIndex((i) => isRouteActive(toPath, i.href))

  /*
    THE LENS, THE PICK AND THE PULSE are the shared tab bar's
    (components/nav/tab-lens.tsx useTabLens), so the buyer bar outside /app
    answers a finger exactly as this one does — including a press the screen
    swallowed, which is that file's A PRESS THAT FELL THROUGH THE BAR. What is
    this pill's own is where a pick goes, which page gets its head start, and
    what has to happen before a pick can go anywhere at all: this bar floats
    over pages that MOVE, and over one that holds work.
  */
  const { slide, pick, pickFromClick, release, linkRefs, marked, shown, arriving, filling } = useTabLens({
    count: items.length,
    current,
    heading,
    nav,
    /*
      A PICK ENDS WHATEVER IS MOVING, AND ASKS THE PAGE IT IS LEAVING.

      A layer rising or dropping holds the screen: a view transition draws the
      whole document as a photograph that takes no presses, and a move played
      by hand starts its navigation a frame after the press that asked for it.
      Both are the bug the owner reported — a tab tapped over the product
      editor that does nothing — and both are ended here rather than waited
      out, so the press that landed navigates (components/app/page-layer.tsx
      endLayerMove, which has the measurements).

      And the product editor holds work nobody typed twice: Cancel asks before
      it throws it away, and a tab is another door out of the same page
      (lib/ui/leave-guard). Refusing the pick is what keeps the bar still while
      the question is on the screen: Keep editing leaves the lens exactly where
      it was.
    */
    onPick: (index) => {
      const item = items[index]
      if (!item) return false
      /*
        THE TAB YOU ARE ON TAKES YOU TO ITS TOP (round 24), as a phone's own tab bar does: on that tab's own page (not
        one under it, an order or a product), whatever of /app is scrolled glides back up, and nothing navigates.
      */
      if (index === current && onPageOf(item.href)) {
        hapticTap("soft")
        scrollAppToTop()
        return false
      }
      const go = () => {
        endLayerMove()
        onNavigate(item.href)
        onCloseMenu()
        return true
      }
      const may = mayLeave(item.href)
      if (may === true) return go()
      return may.then((yes) => (yes ? go() : false))
    },
    onPress: (index) => {
      const item = items[index]
      if (item && index !== current) onPrefetch?.(item.href)
    },
    /* A press the screen swallowed: whatever is moving ends now, so the rest
       of the gesture — and every other control — is live again at once. */
    onSwallowed: endLayerMove,
  })

  return (
    <div
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden"
      style={{
        paddingBottom: `calc(${PILL_LIFT})`,
        transition: `transform 260ms ${EASE}, opacity 180ms ease-out`,
      }}
    >
      {/* ── THE HALO ── see the note on HALO_LAYERS above. Before the group in
          the tree, so it paints under it, and centred on the screen rather
          than on the group, so it is under the settings circle too. */}
      <div
        aria-hidden="true"
        data-app-nav-fade=""
        className="pointer-events-none absolute left-1/2"
        style={{
          width: `calc(100% + ${HALO_REACH.side * 2}px)`,
          /* From HALO_REACH.below under the screen to HALO_REACH.top above
             the bar, which is the pill's lift plus its height plus that. The
             height is the bar's on this screen, so the halo follows it. */
          height: `calc(var(--app-nav-bar) + ${HALO_REACH.top + HALO_REACH.below}px + ${PILL_LIFT})`,
          bottom: -HALO_REACH.below,
          transform: "translateX(-50%)",
        }}
      >
        {Array.from({ length: HALO_LAYERS }, (_, i) => (
          <div
            key={i}
            data-app-nav-fade-step=""
            className="absolute"
            style={{
              inset: i * HALO_STEP,
              borderRadius: "50%",
              backdropFilter: `blur(${haloBlur(i)}px)`,
              WebkitBackdropFilter: `blur(${haloBlur(i)}px)`,
            }}
          />
        ))}
        {/*
          ── THE WHITE FADE ──────────────────────────────────────────────────
          A band, not an oval. It was a radial gradient inset in the same
          ellipse as the blur layers, which meant the page's colour came up
          in the MIDDLE and fell away towards the sides — over a picture that
          reads as a soft patch sitting behind the bar rather than the bottom
          of the screen quietly turning into page.

          Asked for it to be smooth, with a reference: content dissolving
          evenly across the full width as it goes down. That is one vertical
          ramp — nothing through the top third, the page's colour by the
          bottom edge — and it needs no border radius, because a gradient
          that reaches zero has no edge to round.
        */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to bottom, ${HALO_TINT_NONE} 0%, ${HALO_TINT_NONE} 30%, ${HALO_TINT} 100%)`,
          }}
        />
      </div>
      {/*
        ── THE GROUP ─────────────────────────────────────────────────────────
        The bar and the menu button, and with the menu open the settings
        circle to the left of them. Every length in it is one of the
        --app-nav-* variables, so on a narrow phone the whole group is drawn
        smaller and keeps its shape (app/globals.css).
      */}
      <div
        className="relative flex items-center"
        style={{
          gap: "var(--app-nav-gap)",
          /* Settings appears to the LEFT, out of flow; the group slides half
             its width to the right to stay centred, one transform, no layout. */
          transform: `translateX(${menuOpen ? "calc((var(--app-nav-bar) + var(--app-nav-gap)) / 2)" : "0px"})`,
          transition: `transform 380ms ${EASE}`,
          willChange: "transform",
        }}
      >
        <nav
          ref={slide.barRef}
          aria-label={tt("Main")}
          {...slide.handlers}
          className="pointer-events-auto relative select-none rounded-full"
          style={{
            ...GLASS,
            height: "var(--app-nav-bar)",
            width: "var(--app-nav-width)",
            padding: "var(--app-nav-pad)",
            touchAction: "none",
          }}
        >
          {/*
            ── THE SELECTOR ─────────────────────────────────────────────────
            A circle, drawn at the bar's coordinates rather than inside a
            slot, which is what lets it be between two of them while a finger
            is moving. It was an oval before, because it was an inset on a
            rectangular slot and slots are not square.

            No accent colour on it. It is a lens of glass over the bar's
            frosted white (LENS_GLASS): a clearer fill with its own blur and
            saturation, light caught along its top edge, a faint band of
            refracted light low inside it, and a soft shadow under it, so it
            reads as a drop of glass resting on the bar rather than a badge.
          */}
          <span
            ref={slide.dotRef}
            aria-hidden="true"
            data-app-nav-lens=""
            className="absolute rounded-full"
            style={{
              width: "var(--app-nav-dot)",
              height: "var(--app-nav-dot)",
              top: "var(--app-nav-pad)",
              left: 0,
              /* `translate` is written by the loop, the spring and the effect
                 above, never here; `transform` (the stretch) likewise. */
              scale: String(marked < 0 ? 0.55 : slide.following ? LIFT : 1),
              opacity: marked < 0 ? 0 : 1,
              backgroundColor: arriving ? ARRIVING_FILL : slide.pressed ? PRESS_FILL : REST_FILL,
              backdropFilter: LENS_GLASS,
              WebkitBackdropFilter: LENS_GLASS,
              boxShadow: `${slide.pressed ? PRESS_EDGE : REST_EDGE}, ${DROP}`,
              /* No transition on the position or the stretch: under a finger
                 the loop is the motion, and after one the spring is. The
                 brightening goes on instantly and comes off eased (see the
                 note by PRESS_FILL); emptied instantly on the frame it
                 changes slot, then filled back over the ink's own curve,
                 which outranks the press's instant while the filling lasts. */
              transition: `${NO_TRAVEL}, ${LIFT_EASE}, transform 0s, opacity 220ms ease-out, ${arriving || (slide.pressed && !filling) ? PRESS_ON : `background-color ${INK_EASE}, box-shadow ${INK_EASE}`}`,
              willChange: "translate, scale, transform",
            }}
          >
            {/* The light in the glass: a highlight across the top, a faint
                refracted band near the bottom. It empties and fills with the
                lens's own colour, on the same curve. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background: LENS_LIGHT,
                opacity: arriving ? 0 : 1,
                transition: arriving || (slide.pressed && !filling) ? "opacity 0s" : `opacity ${INK_EASE}`,
              }}
            />
          </span>

          {items.map((item, i) => {
            const on = i === shown
            return (
              <Link
                key={item.key}
                ref={(el) => { linkRefs.current[i] = el }}
                href={item.href}
                aria-label={item.label}
                aria-current={on ? "page" : undefined}
                /*
                  A real link, so it carries a URL for the browser and for
                  anything reading the page — but the POINTER gesture above
                  is what decides, and letting the anchor navigate as well
                  would run the same trip twice from one press.

                  `detail === 0` is a click that no pointer made: Enter or
                  Space on a focused link, which never produced a pointerdown
                  and so would otherwise do nothing at all.
                */
                onClick={(e) => {
                  e.preventDefault()
                  /* ...and it is also the last way in, for a keyboard and for
                     a gesture the browser took back before the lift that
                     picks (tab-lens, THE LINK IS THE LAST WAY IN). */
                  pickFromClick(i, e.detail)
                }}
                draggable={false}
                className="absolute flex items-center justify-center"
                style={{
                  /* The whole column the bar answers a press in, top to
                     bottom: on a 320px phone that is still 46 by 50. The
                     glyph is centred in it, where it was in the circle. */
                  left: `calc(var(--app-nav-pad) + var(--app-nav-slot) * ${i})`,
                  top: 0,
                  width: "var(--app-nav-slot)",
                  height: "var(--app-nav-bar)",
                  color: on ? ACTIVE_TEXT : "#616b7a",
                  /*
                    THE COLOUR TRAVELS WITH THE GLYPH, NOT WITH THE GLASS.

                    This was on INK_EASE, 360ms, from when the glyph swapped
                    in one frame and the colour was the only thing with any
                    duration in it. Against a 160ms cross-fade that reads as
                    two events: the solid arrives, and then it darkens for
                    another fifth of a second. One fill, one duration.
                  */
                  transition: `color ${FILL_MS}ms ${FILL_CURVE}`,
                }}
              >
                <NavIcon icon={item.icon} active={on} color="currentColor" box={GLYPH_BOX} layer />
              </Link>
            )
          })}
        </nav>

        {/*
          The menu is its own button, and it is the same button open or shut:
          the finger that opened the menu does not have to go anywhere to
          close it again.
        */}
        {/*
          ── SETTINGS, ONLY WHILE THE MENU IS OPEN, ON THE LEFT ───────────
          A circle to mirror the X on the right, out of the flow so nothing
          is laid out again when it comes and goes. Closed, it takes no
          presses and no tab stop.
        */}
        <button
          type="button"
          aria-label={tt("Settings")}
          aria-hidden={!menuOpen}
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => {
            hapticTap("light")
            /* The same two questions a tab asks, for the same reasons (the
               pick above): the page it is leaving, and the move on the screen. */
            const go = () => {
              release()
              endLayerMove()
              onNavigate("/app/settings")
              onCloseMenu()
            }
            const may = mayLeave("/app/settings")
            if (may === true) go()
            else void may.then((yes) => { if (yes) go() })
          }}
          className={cn(
            "absolute flex items-center justify-center rounded-full",
            menuOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{
            ...GLASS,
            right: "100%",
            marginRight: "var(--app-nav-gap)",
            width: "var(--app-nav-bar)",
            height: "var(--app-nav-bar)",
            color: "#616b7a",
            opacity: menuOpen ? 1 : 0,
            transform: `scale(${menuOpen ? 1 : 0.6})`,
            transition: `transform 380ms ${EASE}, opacity 220ms ease-out`,
            willChange: "transform",
          }}
        >
          <NavIcon icon={icons.settings} active={false} color="currentColor" box={GLYPH_BOX} />
        </button>

        <button
          type="button"
          aria-label={menuOpen ? tt("Close menu") : tt("Menu")}
          aria-expanded={menuOpen}
          onClick={() => {
            hapticTap("light")
            onToggleMenu()
          }}
          className="pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full"
          style={{ ...GLASS, width: "var(--app-nav-bar)", height: "var(--app-nav-bar)", color: menuOpen ? ACTIVE_TEXT : "#616b7a" }}
        >
          <MenuGlyph open={menuOpen} />
        </button>

      </div>
    </div>
  )
}

/**
 * The page behind a menu must not scroll while the menu is over it.
 *
 * /app scrolls in `.app-content-scroll`, not in the document, so the usual
 * `body { overflow: hidden }` does nothing here — the element has to be told.
 * Its scroll position is left exactly where it was, because the menu covers
 * it rather than replacing it.
 */
export function useLockAppScroll(locked: boolean) {
  const previous = useRef<string | null>(null)
  useEffect(() => {
    if (!locked) return
    const el = document.querySelector(".app-content-scroll") as HTMLElement | null
    if (!el) return
    previous.current = el.style.overflowY
    el.style.overflowY = "hidden"
    return () => {
      el.style.overflowY = previous.current ?? ""
    }
  }, [locked])
}
