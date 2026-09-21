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
        style={{ paddingBottom: "calc(104px + env(safe-area-inset-bottom, 0px))" }}
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
 * The first version of this was a white pill at 82% over a blurred band: a
 * solid object sitting on frosted glass rather than being made of it. Read
 * back as "not clean at all, it needs to not have solid in the background,
 * it needs a very smooth layer of glassmorphism", which is exactly right.
 *
 * So the blur is on the OBJECTS now. Each one carries its own
 * `backdrop-filter` and a tint thin enough to see the page through, and the
 * band behind them is a fade rather than a second sheet of glass — its job
 * is only to stop text colliding with the bar as it scrolls under, and it
 * does that by dissolving, with no fill of its own to be solid with.
 *
 * DEPTH IS ONE SHADOW AND IT IS ALMOST NOT THERE. "Extremely little, very
 * subtle depth, just a little bit." Two soft drops of 4% and 6%, and a half
 * pixel of inner light along the top edge, which is what separates glass
 * from a flat shape without casting anything.
 */
const GLASS: React.CSSProperties = {
  backgroundColor: "rgba(255,255,255,0.42)",
  backdropFilter: "blur(26px) saturate(180%)",
  WebkitBackdropFilter: "blur(26px) saturate(180%)",
  boxShadow:
    "0 1px 2px rgba(16,18,27,0.04), 0 6px 16px rgba(16,18,27,0.06)," +
    " inset 0 0 0 0.5px rgba(255,255,255,0.55), inset 0 0.5px 0 rgba(255,255,255,0.8)",
}

/** Slim: the old bar was 56 tall with 52px slots, and read as a slab. */
const BAR_H = 48
const SLOT = 46
const PAD = 4
/** The selector is a CIRCLE, so it is as wide as it is tall. */
const DOT = BAR_H - PAD * 2

/**
 * Three bars that become a cross.
 *
 * Thinner than the header's was — 1.6px on 16, which is the weight Solar
 * draws its 1.5 strokes at once they are rasterised — so it sits in the same
 * family as the four glyphs beside it instead of shouting over them.
 */
function MenuGlyph({ open }: { open: boolean }) {
  const bar = "absolute h-[1.6px] w-[16px] rounded-full bg-current"
  const ease = "transition-all duration-[300ms] ease-[cubic-bezier(0.32,0.72,0,1)]"
  return (
    <span className="relative flex h-[16px] w-[16px] items-center justify-center">
      <span className={cn(bar, ease, open ? "top-[7.2px] rotate-45" : "top-[3.2px] rotate-0")} />
      <span className={cn(bar, ease, "top-[7.2px]", open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100")} />
      <span className={cn(bar, ease, open ? "top-[7.2px] -rotate-45" : "top-[11.2px] rotate-0")} />
    </span>
  )
}

type BarItem = {
  key: string
  label: string
  href: string
  icon: NavIconPair
  /** Leaves the app shell, so it may need to be opened outside it. */
  external?: boolean
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
 * this is 48px of the screen that has to be able to refuse a horizontal
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

  return {
    barRef,
    dragging,
    at,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        /* Keeps the moves coming even when the finger leaves the bar, which
           it will: 48px is not much to stay inside of. */
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
        setDragging(false)
        const picked = slotAt(e.clientX)
        setAt(null)
        lastRef.current = null
        if (escaped(e.clientY)) return
        hapticTap("medium")
        onPick(picked)
      },
      onPointerCancel: () => {
        setDragging(false)
        setAt(null)
        lastRef.current = null
      },
      /* Capture can be taken away by the system — a call arriving, a gesture
         the shell claims. Without this the bar would believe a finger is
         still on it and keep drawing the circle under one that has gone. */
      onLostPointerCapture: () => {
        setDragging(false)
        setAt(null)
        lastRef.current = null
      },
    },
  }
}

export function MobileNavPill({
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onNavigate,
  onExplore,
  exploreHref,
  icons,
}: {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onNavigate: (href: string) => void
  onExplore: () => void
  exploreHref: string
  icons: { home: NavIconPair; orders: NavIconPair; products: NavIconPair; explore: NavIconPair; settings: NavIconPair }
}) {
  const pathname = usePathname()

  /*
    HOME, ORDERS, PRODUCTS, EXPLORE — in that order, and the menu is its own
    button beside them rather than a fifth slot. It is the only one of the
    six that does not go anywhere, so it does not belong in a row of places.
  */
  const items: BarItem[] = menuOpen
    ? [{ key: "settings", label: "Settings", href: "/app/settings", icon: icons.settings }]
    : [
        { key: "home", label: "Home", href: "/app", icon: icons.home },
        { key: "orders", label: "Orders", href: "/app/orders", icon: icons.orders },
        { key: "products", label: "Products", href: "/app/products", icon: icons.products },
        { key: "explore", label: "Explore", href: exploreHref, icon: icons.explore, external: true },
      ]

  const current = menuOpen ? -1 : items.findIndex((i) => !i.external && isRouteActive(pathname, i.href))

  const pick = (index: number) => {
    const item = items[index]
    if (!item) return
    if (item.external) onExplore()
    else onNavigate(item.href)
    onCloseMenu()
  }

  /*
    With one item in it the bar IS the item, so it is round rather than a
    46px slot in a 48px box, which reads as a pill that has been squashed.
  */
  const slot = items.length === 1 ? DOT : SLOT
  const slide = useSlide(items.length, pick)
  /* Where the circle is: under the finger while one is down, otherwise on
     the page you are on, and nowhere at all when you are on none of them. */
  const marked = slide.at ?? current

  return (
    <div
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center gap-2 md:hidden"
      style={{
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        transition: `transform 260ms ${EASE}, opacity 180ms ease-out`,
      }}
    >
      {/*
        ── THE FADE ──────────────────────────────────────────────────────────
        Not a second sheet of glass. It has no fill and it blurs only enough
        to keep a line of text from colliding with the bar as it scrolls
        under, masked so it dissolves upward instead of ending on an edge —
        an edge is the thing that reads as a panel bolted to the screen.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "calc(104px + env(safe-area-inset-bottom, 0px))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          maskImage: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 48%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, #000 0%, rgba(0,0,0,0.55) 48%, transparent 100%)",
        }}
      />

      <nav
        ref={slide.barRef}
        aria-label="Main"
        {...slide.handlers}
        className="pointer-events-auto relative select-none rounded-full"
        style={{
          ...GLASS,
          height: BAR_H,
          width: items.length * slot + PAD * 2,
          padding: PAD,
          touchAction: "none",
          transition: `width 300ms ${EASE}`,
        }}
      >
        {/*
          ── THE SELECTOR ─────────────────────────────────────────────────
          A circle, drawn at the bar's coordinates rather than inside a slot,
          which is what lets it be between two of them while a finger is
          moving. It was an oval before, because it was an inset on a
          rectangular slot and slots are not square.

          No accent colour on it. It is a lens over the glass — a touch more
          white and a hairline — so the bar has one material rather than a
          bar and a badge.
        */}
        <span
          aria-hidden="true"
          className="absolute rounded-full"
          style={{
            width: DOT,
            height: DOT,
            top: PAD,
            left: 0,
            transform: `translateX(${PAD + (marked < 0 ? 0 : marked) * slot + (slot - DOT) / 2}px) scale(${marked < 0 ? 0.6 : 1})`,
            opacity: marked < 0 ? 0 : 1,
            backgroundColor: slide.dragging ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.62)",
            boxShadow: "inset 0 0 0 0.5px rgba(255,255,255,0.7), 0 1px 2px rgba(16,18,27,0.06)",
            transition: `transform 260ms ${EASE}, opacity 200ms ease-out, background-color 160ms ease-out`,
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
              aria-current={on && !menuOpen ? "page" : undefined}
              /*
                A real link, so it carries a URL for the browser and for
                anything reading the page — but the POINTER gesture above is
                what decides, and letting the anchor navigate as well would
                run the same trip twice from one press.

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
                left: PAD + i * slot,
                top: PAD,
                width: slot,
                height: DOT,
                color: on ? ACTIVE_TEXT : "#616b7a",
                transition: "color 180ms ease-out",
              }}
            >
              <NavIcon icon={item.icon} active={on} color="currentColor" size={21} />
            </Link>
          )
        })}
      </nav>

      {/*
        The menu is its own button, and it is the same button open or shut:
        the finger that opened the menu does not have to go anywhere to close
        it again.
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
