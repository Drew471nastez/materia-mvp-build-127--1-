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
import { Compass } from "lucide-react"

import { cn } from "@/lib/utils"
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
function NavIcon({ icon, active, color }: { icon: NavIconPair; active: boolean; color: string }) {
  const Line = icon.line
  const Fill = icon.fill
  return (
    <span className="relative block h-[22px] w-[22px] shrink-0" style={{ color }}>
      <Line
        size={22}
        strokeWidth={1.5}
        style={{ position: "absolute", inset: 0, opacity: active ? 0 : 1, transition: "opacity 160ms ease-out" }}
      />
      <Fill
        size={22}
        style={{ position: "absolute", inset: 0, opacity: active ? 1 : 0, transition: "opacity 160ms ease-out" }}
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
  settingsIcon,
  settingsLabel,
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
  settingsIcon: NavIconPair
  settingsLabel: string
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
          SETTINGS IS A ROW, not a 28px icon in a footer strip.

          It was one of two grey circles at the bottom of the drawer, the size
          of a favicon, beside a compass that meant Explore. Neither was
          labelled and neither was reliably hittable. Settings is a
          destination like the eight above it, so it looks like them.
        */}
        <div className="mt-5 space-y-0.5">
          <p className="mb-1.5 px-3.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: LABEL_TEXT }}>
            Account
          </p>
          <MobileNavItem
            item={{ href: "/app/settings", label: settingsLabel, icon: settingsIcon }}
            expanded={false}
            onToggle={onToggle}
            onNavigate={onNavigate}
            onClose={onClose}
          />
        </div>

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

// ── The pill ────────────────────────────────────────────────────────────────

/**
 * Three bars that become a cross.
 *
 * Lifted from the header's hamburger so the gesture people already know
 * survives the move to the bottom, and because "close with the X" and "open
 * with the menu" want to be the same control in the same place — the finger
 * that opened the menu does not have to go anywhere to close it.
 */
function MenuGlyph({ open }: { open: boolean }) {
  const bar = "absolute h-[2px] w-[18px] rounded-full bg-current"
  const ease = `transition-all duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)]`
  return (
    <span className="relative flex h-[18px] w-[18px] items-center justify-center">
      <span className={cn(bar, ease, open ? "top-[8px] rotate-45" : "top-[3px] rotate-0")} />
      <span className={cn(bar, ease, "top-[8px]", open ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100")} />
      <span className={cn(bar, ease, open ? "top-[8px] -rotate-45" : "top-[13px] rotate-0")} />
    </span>
  )
}

function PillButton({
  label,
  active,
  onClick,
  href,
  children,
}: {
  label: string
  active: boolean
  onClick?: (e: React.MouseEvent) => void
  href?: string
  children: React.ReactNode
}) {
  const { pressed, handlers } = usePressed()
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="absolute inset-[3px] rounded-full"
        style={{
          backgroundColor: active ? "rgba(139,92,246,0.12)" : pressed ? "rgba(16,18,27,0.06)" : "transparent",
          transition: "background-color 180ms ease-out",
        }}
      />
      <span className="relative" style={{ color: active ? ACCENT : "#5b6472" }}>
        {children}
      </span>
    </>
  )
  const className = "relative flex h-[46px] w-[52px] items-center justify-center rounded-full"
  if (href) {
    return (
      <Link href={href} aria-label={label} onClick={onClick} {...handlers} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" aria-label={label} onClick={onClick} {...handlers} className={className}>
      {inner}
    </button>
  )
}

export function MobileNavPill({
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onExplore,
  exploreHref,
  homeIcon,
}: {
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onExplore: (e: React.MouseEvent) => void
  exploreHref: string
  homeIcon: NavIconPair
}) {
  const pathname = usePathname()
  const homeActive = !menuOpen && pathname === "/app"

  return (
    <div
      /*
        A PAGE WITH ITS OWN BOTTOM BAR GETS THE BOTTOM.

        Settings raises a save bar across the foot of the screen when there
        is something to save, and two things cannot both own that strip. The
        pill steps aside for the duration — see the rule in app/globals.css,
        which is a plain CSS relationship between these two attributes rather
        than a piece of state either surface has to keep about the other.
      */
      data-app-nav-pill=""
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex justify-center md:hidden"
      style={{
        paddingBottom: "calc(10px + env(safe-area-inset-bottom, 0px))",
        transition: `transform 260ms ${EASE}, opacity 180ms ease-out`,
      }}
    >
      {/*
        ── THE BAND ──────────────────────────────────────────────────────────
        One blurred layer, masked so it fades out upward instead of ending on
        a line. A hard-edged blur is the thing that reads as a panel stuck to
        the bottom of the screen; a mask makes the page dissolve into it, and
        that dissolve is the whole effect.

        The blur is HERE and not on the pill, deliberately. A backdrop-filter
        inside a backdrop-filter samples the first one's output — two blurs
        over the same pixels, twice the GPU work, and a muddier result than
        either. The pill is translucent white sitting on this, which is what
        makes it read as glass without blurring anything twice.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0"
        style={{
          height: "calc(112px + env(safe-area-inset-bottom, 0px))",
          backdropFilter: "blur(18px) saturate(150%)",
          WebkitBackdropFilter: "blur(18px) saturate(150%)",
          background: "linear-gradient(to top, rgba(248,249,250,0.86), rgba(248,249,250,0))",
          maskImage: "linear-gradient(to top, #000 0%, #000 42%, rgba(0,0,0,0.35) 74%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to top, #000 0%, #000 42%, rgba(0,0,0,0.35) 74%, transparent 100%)",
        }}
      />

      <nav
        aria-label="Main"
        className="pointer-events-auto relative flex items-center gap-1 rounded-full p-[5px]"
        style={{
          backgroundColor: "rgba(255,255,255,0.82)",
          boxShadow:
            "0 10px 30px rgba(16,18,27,0.14), 0 2px 6px rgba(16,18,27,0.06), inset 0 0 0 1px rgba(16,18,27,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
        }}
      >
        <PillButton label="Home" href="/app" active={homeActive} onClick={onCloseMenu}>
          <NavIcon icon={homeIcon} active={homeActive} color="currentColor" />
        </PillButton>
        <PillButton label="Explore" href={exploreHref} active={false} onClick={onExplore}>
          <Compass className="h-[22px] w-[22px]" strokeWidth={1.5} />
        </PillButton>
        <PillButton label={menuOpen ? "Close menu" : "Menu"} active={menuOpen} onClick={onToggleMenu}>
          <MenuGlyph open={menuOpen} />
        </PillButton>
      </nav>
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
