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
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import {
  isRouteActive,
  type NavIconPair,
  type NavItemData,
  type NavChild,
} from "@/components/app/sidebar-desktop-nav"

/* ── The palette ──────────────────────────────────────────────────────────
   The page this menu covers is #f8f9fa and its cards are white, so the menu
   is the page colour and the row you are on is a step DARKER rather than a
   white card floating on a white card. */
const PAGE = "#f8f9fa"
const REST_TEXT = "#6b7280"
const ACTIVE_TEXT = "#1a1a2e"
const ACTIVE_BG = "#ebecee"
const PRESS_BG = "#e3e4e7"
const LABEL_TEXT = "#a5a5a5"
const ACCENT = "#8b5cf6"

/**
 * The name of the "close yourself" event, exported so the one other place
 * that sends it does not have to spell it.
 */
export const CLOSE_EVENT = "storelib:close-mobile-menu"

/** 44px is the smallest target a thumb hits reliably; the rows are 48. */
const ROW =
  "relative flex h-12 w-full items-center gap-3 rounded-[14px] px-3.5 text-left " +
  "text-[15.5px] leading-[24px] tracking-[-0.01em] " +
  "transition-[background-color,color] duration-[160ms] ease-out"

const REST_WEIGHT = 470
const ACTIVE_WEIGHT = 575

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
 * A 22×22 box with both variants of the glyph stacked in it, cross-faded.
 *
 * The same trick the rail uses: the fill ARRIVES rather than appears, and
 * because both are painted in a fixed box nothing an icon does can move the
 * label beside it.
 */
function NavIcon({ icon, active, color, size = 22 }: { icon: NavIconPair; active: boolean; color: string; size?: number }) {
  const Line = icon.line
  const Fill = icon.fill
  return (
    <span className="relative block shrink-0" style={{ color, width: size, height: size }}>
      <Line
        size={size}
        strokeWidth={1.5}
        style={{ position: "absolute", inset: 0, opacity: active ? 0 : 1, transition: "opacity 180ms ease-out" }}
      />
      <Fill
        size={size}
        style={{ position: "absolute", inset: 0, opacity: active ? 1 : 0, transition: "opacity 180ms ease-out" }}
      />
    </span>
  )
}

/**
 * Pressed state, not hover state.
 *
 * The rail drives its three colours from `onMouseEnter`, which a phone never
 * sends. What a phone does send is touchstart and touchend, so the row
 * answers the press — within a frame, before the navigation has begun — and
 * that acknowledgement is the whole of "it feels responsive".
 */
function usePressed() {
  const [pressed, setPressed] = useState(false)
  return {
    pressed,
    handlers: {
      onPointerDown: () => setPressed(true),
      onPointerUp: () => setPressed(false),
      onPointerCancel: () => setPressed(false),
      onPointerLeave: () => setPressed(false),
    },
  }
}

function rowStyle(active: boolean, pressed: boolean): React.CSSProperties {
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
  onClose: () => void
}) {
  const pathname = usePathname()
  const active = isRouteActive(pathname, child.href)
  const { pressed, handlers } = usePressed()
  return (
    <Link
      href={child.href}
      onClick={() => {
        onNavigate?.(child.href)
        onClose()
      }}
      {...handlers}
      className={cn(ROW, "h-11 text-[14.5px]")}
      style={rowStyle(active, pressed)}
    >
      <span>{child.label}</span>
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
  onClose: () => void
}) {
  const pathname = usePathname()
  const active = isRouteActive(pathname, item.href)
  const { pressed, handlers } = usePressed()
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
    return (
      <div>
        <div className="flex items-center gap-1">
          <Link
            href={item.href}
            onClick={() => {
              onNavigate?.(item.href)
              onClose()
            }}
            {...handlers}
            className={cn(ROW, "min-w-0 flex-1")}
            style={style}
          >
            {body}
          </Link>
          <button
            type="button"
            onClick={() => onToggle(item.href)}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px]"
            style={{ color: LABEL_TEXT }}
          >
            <Chevron open={expanded} />
          </button>
        </div>
        <Collapsible open={expanded}>
          <div className="space-y-0.5 pl-[30px] pt-1">
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
      onClick={() => {
        onNavigate?.(item.href)
        onClose()
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
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const nodeRef = useRef<HTMLDivElement>(null)
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
      aria-label="Menu"
      data-mobile-menu={open ? "open" : "closed"}
      className="fixed inset-x-0 z-[45] flex flex-col md:hidden"
      style={{
        top: "calc(68px + env(safe-area-inset-top, 0px))",
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
        at the bottom is the pill's height plus the home indicator.
      */}
      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-3"
        style={{ paddingBottom: "calc(116px + env(safe-area-inset-bottom, 0px))" }}
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
              onClose={onClose}
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

        <Link
          href="/app/settings/billing/upgrade"
          onClick={onClose}
          className="mt-4 flex items-center justify-between rounded-[16px] border border-violet-100/70 bg-white px-4 py-3.5"
        >
          <span className="block">
            <span className="block text-[14px] font-semibold" style={{ color: ACTIVE_TEXT }}>{upgradeTitle}</span>
            <span className="block text-[12px]" style={{ color: REST_TEXT }}>{upgradeSubtitle}</span>
          </span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(139,92,246,0.12)" }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={ACCENT} aria-hidden="true">
              <path d="M13 2 4.5 13.2a.6.6 0 0 0 .48.96H11l-1 8.04 8.5-11.2a.6.6 0 0 0-.48-.96H12z" />
            </svg>
          </span>
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
 * DEPTH IS ONE SHADOW, AND IT IS SMALL. Asked for "a little bit more", so it
 * is 5% at one pixel and 10% at eight, which is a lift rather than a cast.
 */
const GLASS: React.CSSProperties = {
  /*
    FROSTED, NOT CLEAR. This went as low as 18% while "solid" was the
    complaint, and over the dashboard's artwork that left the bar the colour
    of the artwork, with its glyphs sitting on saturated red. Asked for
    directly: "the buttons themselves don't need to be full glassmorphism
    transparent, the bar itself doesn't need to be transparent". 70% white
    over a blur is the material a system tab bar is made of: it reads white
    over anything and still takes a breath of whatever is under it.
  */
  backgroundColor: "rgba(255,255,255,0.7)",
  backdropFilter: "blur(24px) saturate(160%)",
  WebkitBackdropFilter: "blur(24px) saturate(160%)",
  boxShadow:
    "0 1px 2px rgba(16,18,27,0.05), 0 8px 22px rgba(16,18,27,0.10)," +
    " inset 0 0 0 0.5px rgba(255,255,255,0.65), inset 0 0.5px 0 rgba(255,255,255,0.9)",
}

/** A little bigger again, as asked: 54 with 50px slots before this. */
const BAR_H = 58
const SLOT = 53
const PAD = 4
/** The selector is a CIRCLE, so it is as wide as it is tall. */
const DOT = BAR_H - PAD * 2
/** Between the bar and the buttons beside it. */
const GAP = 8

/**
 * The fade's six blurs, top of the fade first. They compound where the
 * rectangles overlap, roughly as the root of the sum of their squares, so the
 * bottom of the fade lands near 12px of blur and the top near 2, and no step
 * between neighbours is more than a couple of pixels.
 */
const FADE_STEPS = [1, 2, 3, 4, 5, 6]
/**
 * The page under the bar on a phone is #f8f9fa, and the tint is that colour.
 * Lighter than the first cut: "subtle, smooth, clean, not so much". The bar
 * carries its own frost now, so the fade only has to soften the page around
 * it, not carry the whole effect.
 */
const FADE_TINT = "rgba(248,249,250,0.62)"
const FADE_TINT_MID = "rgba(248,249,250,0.34)"
const FADE_TINT_NONE = "rgba(248,249,250,0)"

/**
 * ===========================================================================
 *  HOW THE CIRCLE MOVES
 * ===========================================================================
 * Two different jobs, and one curve cannot do both.
 *
 * UNDER A FINGER it has to be where the finger is, now. Any overshoot reads
 * as the control being loose, and any duration reads as lag.
 *
 * LET GO OF IT and it should arrive rather than stop. A little over, a
 * little back: that is the whole of what "more iOS style bouncing and
 * satisfying" is asking for, and it is one cubic-bezier with its third
 * control point past 1.
 */
const TRACK = `transform 110ms cubic-bezier(0.2, 0, 0, 1)`
const SETTLE = `transform 420ms cubic-bezier(0.32, 1.24, 0.44, 1)`
/**
 * Under a finger the circle LIFTS a little, which is the tell of the newer
 * system bars: the thing you are holding is the thing that is bigger. It
 * settles back to size on the same spring it settles into place with.
 */
const LIFT = 1.08

/**
 * Three bars that become a cross.
 *
 * The bars used to sit 4px apart, which at 1.6px of stroke leaves 2.4px of
 * air and reads as a stack rather than as three lines. Five apart now, for
 * the "extremely little bit more space" that was asked for and no more.
 */
function MenuGlyph({ open }: { open: boolean }) {
  const bar = "absolute h-[1.6px] w-[17px] rounded-full bg-current"
  const ease = "transition-all duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
  return (
    <span className="relative flex h-[18px] w-[18px] items-center justify-center">
      <span className={cn(bar, ease, open ? "top-[8.2px] rotate-45" : "top-[3.2px] rotate-0")} />
      <span className={cn(bar, ease, "top-[8.2px]", open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100")} />
      <span className={cn(bar, ease, open ? "top-[8.2px] -rotate-45" : "top-[13.2px] rotate-0")} />
    </span>
  )
}

type BarItem = {
  key: string
  label: string
  href: string
  icon: NavIconPair
}

/**
 * ===========================================================================
 *  A FINGER CAN SLIDE ALONG THIS, NOT ONLY LAND ON IT
 * ===========================================================================
 * "The new iOS feeling, like I can drag left and right."
 *
 * The selector is one circle that lives at the bar's coordinates rather than
 * inside any slot, so it can be anywhere between two of them. Put a finger
 * down and it comes to meet you; slide, and it follows to whichever slot the
 * finger is over, ticking once per slot crossed; lift, and that slot is the
 * one you navigated to.
 *
 * WHY IT IS A POINTER LISTENER AND NOT FIVE onClick HANDLERS. A press is a
 * drag of zero length — there is no second code path for a tap, which is how
 * the two can never disagree about which slot was chosen. And it means the
 * answer to "which one am I on" is a number this component owns for the
 * length of the gesture, so the circle can be drawn anywhere on the way.
 *
 * `touch-action: none` on the bar only. The page under it still scrolls;
 * this is 54px of the screen that has to be able to refuse a horizontal
 * gesture, because a horizontal gesture is what the bar is for.
 */
function useSlide(count: number, onPick: (index: number) => void) {
  const [dragging, setDragging] = useState(false)
  const [at, setAt] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const lastRef = useRef<number | null>(null)

  const slotAt = (clientX: number): number => {
    const box = barRef.current?.getBoundingClientRect()
    if (!box) return 0
    const inner = box.width - PAD * 2
    const x = clientX - box.left - PAD
    return Math.max(0, Math.min(count - 1, Math.floor((x / inner) * count)))
  }

  /**
   * A gesture that has left the bar vertically was never for the bar.
   *
   * The whole strip answers a press, which is what a tab bar does — but a
   * finger that lands on it and then travels 80px up the screen was trying
   * to scroll, or to reach the card above, and navigating on the lift would
   * be a page change nobody asked for. Sideways has no such limit: sideways
   * is the gesture.
   */
  const ESCAPED = 72
  const escaped = (clientY: number): boolean => {
    const box = barRef.current?.getBoundingClientRect()
    if (!box) return false
    return clientY < box.top - ESCAPED || clientY > box.bottom + ESCAPED
  }

  const move = (clientX: number) => {
    const next = slotAt(clientX)
    setAt(next)
    if (lastRef.current !== next) {
      lastRef.current = next
      /* One tick per slot crossed, not one per frame. */
      hapticTap("light")
    }
  }

  const end = () => {
    setDragging(false)
    setAt(null)
    lastRef.current = null
  }

  return {
    barRef,
    dragging,
    at,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        /* Keeps the moves coming even when the finger leaves the bar, which
           it will: 54px is not much to stay inside of. */
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        setDragging(true)
        lastRef.current = null
        move(e.clientX)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!dragging) return
        move(e.clientX)
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (!dragging) return
        const picked = slotAt(e.clientX)
        const away = escaped(e.clientY)
        end()
        if (away) return
        hapticTap("medium")
        onPick(picked)
      },
      onPointerCancel: end,
      /* Capture can be taken away by the system — a call arriving, a gesture
         the shell claims. Without this the bar would believe a finger is
         still on it and keep drawing the circle under one that has gone. */
      onLostPointerCapture: end,
    },
  }
}

export function MobileNavPill({
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onNavigate,
  icons,
}: {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onNavigate: (href: string) => void
  icons: { home: NavIconPair; orders: NavIconPair; products: NavIconPair; settings: NavIconPair }
}) {
  const pathname = usePathname()

  /*
    HOME, ORDERS, PRODUCTS, SETTINGS — four pages of this person's own shop,
    in that order, and they stay put when the menu opens.

    Explore used to be the fourth of these and it was the odd one out: the
    public site, somebody else's shops, a door out of this shell entirely. It
    is up in the header beside the bell now, and settings has the slot, which
    is where a settings button belongs — always there, rather than appearing
    beside the X for as long as a menu happens to be open.

    The menu is not a place either, so it is its own button beside the four
    rather than a fifth slot in a row of places.
  */
  const items: BarItem[] = [
    { key: "home", label: "Home", href: "/app", icon: icons.home },
    { key: "orders", label: "Orders", href: "/app/orders", icon: icons.orders },
    { key: "products", label: "Products", href: "/app/products", icon: icons.products },
    { key: "settings", label: "Settings", href: "/app/settings", icon: icons.settings },
  ]

  const current = items.findIndex((i) => isRouteActive(pathname, i.href))

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE CIRCLE DOES NOT SNAP BACK WHILE THE PAGE IS STILL ARRIVING
   * ═══════════════════════════════════════════════════════════════════════
   * This is the glitch. Press Products: the circle follows the finger to
   * Products. Lift: the gesture is over, the drag's own answer is thrown
   * away, and `current` is still HOME, because the route has not changed
   * yet — so the circle springs all the way back to the first slot, waits
   * for the navigation, and then travels to Products a second time.
   *
   * Reported as "randomly glitchy when I click on icons", and random is
   * exactly right: how far it goes back and how long it stays there depend
   * on how quickly the route resolves, which is different every time.
   *
   * So a pick is remembered until the route catches up with it. The timer is
   * the safety net for a pick that never arrives — a failed navigation, or
   * the one item here that does not change the route at all.
   */
  const [pending, setPending] = useState<number | null>(null)
  useEffect(() => {
    if (pending == null) return
    if (current === pending) { setPending(null); return }
    const t = window.setTimeout(() => setPending(null), 1500)
    return () => window.clearTimeout(t)
  }, [pending, current])

  const pick = (index: number) => {
    const item = items[index]
    if (!item) return
    setPending(index)
    onNavigate(item.href)
    onCloseMenu()
  }

  const slide = useSlide(items.length, pick)
  /* Under the finger while one is down, then on the slot that was picked,
     then on the page you are actually on. */
  const marked = slide.at ?? pending ?? current

  /**
   * Where it FADES OUT, which is not where slot zero is.
   *
   * On a page with no slot of its own — Analytics, say — the circle has
   * nothing to sit on and goes. Reading its position as 0 at that moment
   * would send it flying back to Home as it shrank, which is a second thing
   * moving for no reason. It shrinks where it stands.
   */
  const restRef = useRef(0)
  if (marked >= 0) restRef.current = marked
  const x = PAD + (marked >= 0 ? marked : restRef.current) * SLOT + (SLOT - DOT) / 2

  return (
    <div
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden"
      style={{
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        transition: `transform 260ms ${EASE}, opacity 180ms ease-out`,
      }}
    >
      {/*
        ── THE FADE, BUILT OUT OF PLAIN RECTANGLES ──────────────────────────
        The page dissolves into frosted glass over the last hundred pixels of
        the screen, and the bar floats in that. It is what an iOS tab bar does
        and it is what was asked for: "a very smooth tint, till the bottom,
        fading into glassmorphism, blurring smoothly as you scroll".

        THE FIRST VERSION WAS ONE ELEMENT, WITH `backdrop-filter` AND
        `mask-image` ON IT, and on an iPhone that is a pale plate with a hard
        top edge: WKWebView drops the mask and paints the filtered region as
        a flat fill. Chromium composites the pair correctly, which is why no
        probe here could ever see it, and why it was reported four times.

        So there is no mask anywhere in this. A progressive blur is stacked
        instead: six rectangles, all anchored to the bottom edge, each a
        little shorter than the one before and each carrying a small blur of
        its own. Where they overlap the blurs compound, so the top of the
        fade is barely touched and the bottom is well blurred, with no single
        step big enough to see. A rectangle with a backdrop-filter and nothing
        else is the one thing every engine draws the same way.

        The tint is a separate plain gradient, no filter on it, in the PAGE'S
        colour rather than white: over a plain page it is invisible, which is
        what keeps this from being a plate, and over content it frosts.
      */}
      <div
        aria-hidden="true"
        data-app-nav-fade=""
        className="pointer-events-none absolute inset-x-0 bottom-0"
        style={{ height: "calc(128px + env(safe-area-inset-bottom, 0px))" }}
      >
        {FADE_STEPS.map((blur, i) => (
          <div
            key={blur}
            data-app-nav-fade-step=""
            className="absolute inset-x-0 bottom-0"
            style={{
              height: `${100 - i * (100 / FADE_STEPS.length)}%`,
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to top, ${FADE_TINT} 0%, ${FADE_TINT_MID} 42%, ${FADE_TINT_NONE} 100%)`,
          }}
        />
      </div>

      {/*
        ── THE GROUP ─────────────────────────────────────────────────────────
        The bar and the menu button, and that is all of it. A settings button
        used to appear beside the X while the menu was open, which meant the
        group changed width, the whole thing had to slide to stay centred,
        and settings was only reachable from inside a menu. Settings is the
        fourth slot in the bar now, so nothing here is ever added or removed
        and nothing has to move to make room.
      */}
      <div className="relative flex items-center" style={{ gap: GAP }}>
        <nav
          ref={slide.barRef}
          aria-label="Main"
          {...slide.handlers}
          className="pointer-events-auto relative select-none rounded-full"
          style={{
            ...GLASS,
            height: BAR_H,
            width: items.length * SLOT + PAD * 2,
            padding: PAD,
            touchAction: "none",
          }}
        >
          {/*
            ── THE SELECTOR ─────────────────────────────────────────────────
            A circle, drawn at the bar's coordinates rather than inside a
            slot, which is what lets it be between two of them while a finger
            is moving. It was an oval before, because it was an inset on a
            rectangular slot and slots are not square.

            No accent colour on it. It is a lens over the glass — more white
            than the bar, which at 28% is thin enough for that to read — so
            the bar has one material rather than a bar and a badge.
          */}
          <span
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
              width: DOT,
              height: DOT,
              top: PAD,
              left: 0,
              transform: `translateX(${x}px) scale(${marked < 0 ? 0.55 : slide.dragging ? LIFT : 1})`,
              opacity: marked < 0 ? 0 : 1,
              backgroundColor: slide.dragging ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.82)",
              boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.75), 0 1px 3px rgba(16,18,27,0.08)",
              transition: `${slide.dragging ? TRACK : SETTLE}, opacity 220ms ease-out, background-color 160ms ease-out`,
              willChange: "transform",
            }}
          />

          {items.map((item, i) => {
            const on = i === marked
            return (
              <Link
                key={item.key}
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
                  if (e.detail === 0) pick(i)
                }}
                draggable={false}
                className="absolute flex items-center justify-center"
                style={{
                  left: PAD + i * SLOT,
                  top: PAD,
                  width: SLOT,
                  height: DOT,
                  color: on ? ACTIVE_TEXT : "#616b7a",
                  transition: "color 200ms ease-out",
                }}
              >
                <NavIcon icon={item.icon} active={on} color="currentColor" size={22} />
              </Link>
            )
          })}
        </nav>

        {/*
          The menu is its own button, and it is the same button open or shut:
          the finger that opened the menu does not have to go anywhere to
          close it again.
        */}
        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Menu"}
          aria-expanded={menuOpen}
          onClick={() => {
            hapticTap("medium")
            onToggleMenu()
          }}
          className="pointer-events-auto relative flex shrink-0 items-center justify-center rounded-full"
          style={{ ...GLASS, width: BAR_H, height: BAR_H, color: menuOpen ? ACTIVE_TEXT : "#616b7a" }}
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
