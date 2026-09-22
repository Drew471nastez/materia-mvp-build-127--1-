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
import { useEffect, useLayoutEffect, useRef, useState } from "react"

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
 * ===========================================================================
 *  THE SOLID IS DRAWN AT THE OUTLINE'S SIZE
 * ===========================================================================
 * A 22x22 box with both variants of the glyph stacked in it, cross-faded: the
 * line one while the tab is off, the solid one while it is on.
 *
 * They do not come out the same size. A stroke sits astride its path and so
 * reaches half a stroke beyond it, where a solid stops at its edge, and three
 * of these four are separate drawings from the icon set besides. Photographed
 * on and off in scripts/check-app-mobile-nav.mjs, every one of them came out
 * smaller when its tab turned on — about half a pixel on each edge — which is
 * the icon changing size under the finger that pressed it.
 *
 * TWO OTHER WAYS OF FIXING THAT WERE TRIED AND ARE WRONG, and this is written
 * down because both look reasonable and both wreck the icons.
 *
 *   Drawing the outline over the solid in both states pins the silhouette
 *   exactly. It also fills in the gaps the solid is drawn WITH: the lines
 *   inside the receipt closed up and it went out as a dark blob. Shipped, and
 *   reported back within the hour.
 *
 *   Giving the solid its own 1.5px stroke pins the silhouette exactly too,
 *   and closes the same gaps for the same reason — a stroke runs along every
 *   contour a shape has, including the ones cut out of its middle.
 *
 * What does not touch the drawing is scaling it. The cutouts scale with
 * everything else, so the glyph is the glyph, and both centres were already
 * in the same place, so growing it about its centre is enough. Six per cent
 * lands it on the outline's box: +0 x +0 on three of the four and half a
 * pixel short on Products, against a stroke's soft edge that is worth half a
 * pixel by itself.
 */
/**
 * How much bigger the solid glyph is drawn so that it occupies the same box
 * as the outline it replaces. Measured, not chosen: see NavIcon below.
 */
const FILL_MATCH = 1.06

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  NOTHING IN THIS BAR FADES
 * ═══════════════════════════════════════════════════════════════════════════
 * Every soft thing here was built out of opacity: the glyph dimmed and came
 * back, the lens dipped and came back. Dipping a thing out and bringing it
 * back is what reads as cheap, and the whole of it lands on the press, which
 * is the one moment that has to feel like nothing at all happened in between.
 *
 * So the smoothness moves to where it belongs: the colour. An icon turning on
 * goes to its ink colour over INK_EASE, the same way a button changes colour
 * under a pointer, and that is the icon filling with black. It starts on the
 * frame the finger lands, there is nothing to wait for and nothing to dip
 * through, and no part of it is ever half-visible.
 *
 * The shape swaps outright in the same frame. It has to be outright, because
 * the outline and the solid are different drawings and anything in between
 * them is a shape that is neither — the whole reason a dip was there to hide
 * it. With FILL_MATCH the two occupy the same box, so an outright swap moves
 * nothing and changes no size; what is left to see is the colour arriving,
 * which is the part that takes its time.
 */
const INK_MS = 360
const INK_EASE = `${INK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`

/**
 * ===========================================================================
 *  A 22x22 BOX, BOTH GLYPHS IN IT, AND THE SWAP HAPPENS WHERE IT IS FAINT
 * ===========================================================================
 * The line glyph and the solid one are not drawn the same size. A stroke sits
 * astride its path and reaches half a stroke past it, where a solid stops at
 * its edge, and three of these four are separate drawings from the icon set
 * besides. FILL_MATCH puts the two boxes on top of each other, which fixes
 * the two ENDS of the change.
 *
 * It does not fix what is in between, and that is why they cannot simply be
 * cross-faded: two different drawings blended through each other make every
 * frame of the blend a shape that is neither, which on Products measured
 * 40x40 going in, 40x39 halfway and 39x38 coming out. So for a while the
 * glyph swapped in a single frame instead — nothing to see moving, and hard
 * as a switch to look at.
 *
 * It swaps outright, in the frame the finger lands on, and the colour is what
 * takes its time. See the note by INK_EASE above.
 *
 * THREE WAYS OF MAKING THE TWO AGREE WERE TRIED AND TWO ARE WRONG, recorded
 * because both look obvious. Drawing the outline over the solid, and giving
 * the solid its own stroke, close up the gaps the solid is drawn WITH — a
 * stroke runs along every contour a shape has, including the ones cut out of
 * its middle — and the receipt goes out as a dark blob. Scaling is the one
 * that touches nothing but the size.
 */
function NavIcon({ icon, active, color, size = 22 }: { icon: NavIconPair; active: boolean; color: string; size?: number }) {
  const Line = icon.line
  const Fill = icon.fill
  return (
    <span className="relative block shrink-0" style={{ color, width: size, height: size }}>
      {/* No transition on either. One is showing, the other is not, and the
          change between them is the same frame the finger lands on. */}
      <Line size={size} strokeWidth={1.5} style={{ position: "absolute", inset: 0, opacity: active ? 0 : 1 }} />
      <Fill
        size={size}
        style={{
          position: "absolute",
          inset: 0,
          opacity: active ? 1 : 0,
          /* A constant, never animated: the solid is drawn at the size of the
             outline it replaces. See the note above. */
          scale: String(FILL_MATCH),
        }}
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
  backdropFilter: "blur(24px) saturate(120%)",
  WebkitBackdropFilter: "blur(24px) saturate(120%)",
  boxShadow:
    "0 1px 2px rgba(16,18,27,0.06), 0 4px 10px rgba(16,18,27,0.07), 0 14px 30px rgba(16,18,27,0.14)," +
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
const HALO_BLUR = 0.45
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
 * How far the bottom of the pill sits above the bottom of the screen. Read
 * once, by the pill and by the halo, so the two cannot disagree.
 *
 * MAX, NOT PLUS, AND THAT IS THE WHOLE DIFFERENCE. It was `4px + env(...)`,
 * which on a phone is 4px ON TOP of a 34px home indicator inset: 38px of air
 * under the pill, and the reference sits nearer the bottom than that. Asked
 * down three times, and 2px was refused by the probe, which holds the pill to
 * at least 4px off the bottom EDGE — the room a thumb needs to press the
 * outer buttons without catching the side of the display.
 *
 * Both are right, and they are about different things. The 4px is a floor
 * against the edge of the glass; the inset is a floor against the home
 * indicator. Taking the larger of the two satisfies whichever one applies:
 * 34px on a phone, which is four pixels lower than it was, and 4px in a
 * browser with no inset at all, which is where the probe measures and where
 * nothing changes.
 */
const PILL_LIFT = "max(4px, env(safe-area-inset-bottom, 0px))"

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
 * ===========================================================================
 *  HOW THE CIRCLE MOVES
 * ===========================================================================
 * Two different jobs, and one mechanism cannot do both.
 *
 * UNDER A FINGER it is where the finger is. Not where the finger's SLOT is:
 * the first version moved the circle slot to slot, each hop on a 90ms
 * transition, and that is what "very snappy, very direct, landing on it,
 * not smooth at all" describes. A transition is a delay by definition, and
 * a slot is a step by definition. So while a finger is down there is no
 * transition on the circle's position at all. The finger's x is written to
 * it every frame by a loop that closes the remaining distance by FOLLOW,
 * which is what lets it catch up from a slot away on the press without a
 * transition to be cut short, and what leaves it a pixel or two behind a
 * fast finger, like something with a little weight rather than a cursor.
 *
 * LET GO OF IT and it should arrive rather than stop. A little over, a
 * little back: that is the whole of what "more iOS style bouncing and
 * satisfying" is asking for, and it is one cubic-bezier with its third
 * control point past 1. Position and size are separate CSS properties
 * (`translate`, `scale`) so the lift can keep its own easing under the
 * finger while the position has none.
 */
const FOLLOW = 0.6
const SETTLE = `translate 420ms cubic-bezier(0.32, 1.24, 0.44, 1)`
/**
 * AND A PRESS DOES NOT TRAVEL.
 *
 * "When I click on the icon, make sure that it doesn't bump, scale, or do any
 * of the movements left and right."
 *
 * A finger sliding along the bar carries the circle with it, and letting go
 * of it bounces it into the slot; that is the gesture this was built for and
 * it is untouched. A press is not that gesture. The circle is simply on the
 * icon that was pressed, on the frame it was pressed, with no journey across
 * the bar to watch and nothing to be caught halfway through.
 */
const NO_TRAVEL = "translate 0s"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE BAR ANSWERS A FINGER, AND IT ANSWERS IT THE SAME WAY EVERY TIME
 * ═══════════════════════════════════════════════════════════════════════════
 * Everything that moved on a press has been taken out of this bar one piece
 * at a time, and taking the last of it out left a control that does not react
 * to being touched at all.
 *
 * So it reacts, in the one way that cannot drift: the lens brightens under
 * the finger. No size, no position, nothing that can be a pixel out.
 *
 * AND IT GOES ON INSTANTLY AND COMES OFF SLOWLY. This is the whole trick, and
 * it is what the old lift got wrong. That was 200ms of easing IN, and a tap
 * lasts about sixty — so it was cut off partway, at a different point every
 * time, which is why a press looked like a different amount of something on
 * every press and read as a glitch. A press that is full the instant a finger
 * lands is the same press whether it is held for a frame or a second. The
 * release is where the easing belongs, because nothing interrupts a release.
 */
const PRESS_FILL = "rgba(255,255,255,0.97)"
const REST_FILL = "rgba(255,255,255,0.82)"
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LENS ARRIVES AS A COLOUR, THE WAY THE INK DOES
 * ═══════════════════════════════════════════════════════════════════════════
 * With the fades gone the lens was simply THERE, at full strength, on the
 * frame the finger landed, and that is what reads as too direct. The only
 * thing in the bar taking any time at all was the ink filling the icon.
 *
 * It is not dipped back out to fix that. A dip is a thing going away and
 * coming back, on an element that was already where it belonged, and that
 * flicker is the cheapness. This is the other kind of change entirely and it
 * is the one the reference button makes: a colour going from one value to
 * another, once, in one direction. The lens is drawn in no colour at all on
 * the frame it changes slot, and its glass arrives over INK_EASE.
 *
 * ITS OPACITY NEVER MOVES. Not a detail — it is what keeps this from being
 * the fade that was thrown out. The element is fully opaque the whole way
 * through; what changes is the colour painted in it, which is the same thing
 * the icon's ink does, on the same curve, starting on the same frame. One
 * movement of colour across the whole bar.
 */
const ARRIVING_FILL = "rgba(255,255,255,0)"
const PRESS_EDGE = "inset 0 0 0 0.5px rgba(255,255,255,0.95)"
const REST_EDGE = "inset 0 0 0 0.5px rgba(255,255,255,0.75)"
const DROP = "0 1px 2px rgba(16,18,27,0.07), 0 3px 8px rgba(16,18,27,0.10)"
/** On instantly, off over this. Never the other way round. */
/* The same length and the same curve as the ink, so a press and the icon it
   fills are one movement of colour rather than two of different lengths. */
const PRESS_OFF = "background-color 360ms cubic-bezier(0.22, 0.61, 0.36, 1), box-shadow 360ms cubic-bezier(0.22, 0.61, 0.36, 1)"
const PRESS_ON = "background-color 0s, box-shadow 0s"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  THE LENS IS SIMPLY ON THE ICON YOU PRESSED
 * ═══════════════════════════════════════════════════════════════════════════
 * It has been three things. It slid across the bar, and the slide overshot
 * and came back by an amount that depended on how fast you tapped — the glitch
 * that started all of this. It teleported, which was correct and read as
 * abrupt. Then it dipped almost out of sight, moved while faint, and came
 * back, which covered the move and put a fade on every press.
 *
 * The fade is what reads as cheap, and it is a wait however short it is. So
 * there is none: on the frame the finger lands the lens is on the icon under
 * it, at full strength, and nothing about it is ever half-visible.
 *
 * Which leaves the change of place in the open — and that is fine, because
 * there is no longer anything to see it happen against. It does not travel,
 * so there is no path to follow; it does not fade, so there is no flicker to
 * catch; and the thing that carries the smoothness is the ink filling the
 * icon over INK_EASE, which starts on the same frame and takes its time.
 */

/**
 * Under a finger the circle LIFTS a little, which is the tell of the newer
 * system bars: the thing you are holding is the thing that is bigger.
 */
const LIFT = 1.06
const LIFT_EASE = `scale 200ms cubic-bezier(0.32, 0.72, 0, 1)`

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
  const [at, setAt] = useState<number | null>(null)
  /* Whether the gesture that just ended was a drag, which is what decides
     whether the circle bounces into the slot or lands on it. A route change
     with no gesture behind it lands too. */
  const [bounce, setBounce] = useState(false)
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A PRESS IS NOT A HOLD
   * ═════════════════════════════════════════════════════════════════════════
   * The circle grows under a finger, which is the tell that you are holding
   * something you can drag. It read `dragging` to decide, and `dragging` meant
   * "a finger is down" — so every tap grew it and shrank it back with nothing
   * being held: measured at 1.047x, 2.35px across, on a 60ms press.
   *
   * And it was never the same twice. The lift takes 200ms and a tap is over in
   * sixty, so how big it got depended on how long you happened to press, which
   * is the "sometimes" and the "for no reason" in the report. Every check in
   * scripts/check-app-mobile-nav.mjs read the circle's POSITION, which was
   * clean, so none of them ever saw it.
   *
   * This is the gesture actually dragging: false on the way down, true only
   * once a finger has travelled far enough to mean it. The lift, the brighter
   * fill and the glyphs waiting all belong to it. Where the circle IS still
   * belongs to the press, from the moment it lands.
   */
  const [following, setFollowing] = useState(false)
  /* A finger is on the bar. Nothing geometric reads this — it is what the
     lens brightens for, and brightness cannot be a pixel out of place. */
  const [pressed, setPressed] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLSpanElement>(null)
  const lastRef = useRef<number | null>(null)
  /* React state answers a render later; a move handler that asks it whether
     a finger is down can be told no about the finger that just landed. */
  const activeRef = useRef(false)
  /* The circle's left edge in the bar's own coordinates: where the finger
     wants it, where it is, and the frame between them. */
  const targetRef = useRef(0)
  const posRef = useRef<number | null>(null)
  const frameRef = useRef(0)

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  A TAP IS NOT A ONE-PIXEL DRAG
   * ═════════════════════════════════════════════════════════════════════════
   * Reported as the icons glitching and bumping when you press one to
   * navigate, and it was the circle rather than the icons.
   *
   * The press began by aiming the circle at `leftFor(clientX)` — the point
   * the FINGER landed on. Nobody taps the exact centre of a 55px slot, so the
   * circle set off towards a spot a dozen or twenty pixels off-centre, got
   * part of the way there in the time a tap lasts, and was then written to
   * the slot's centre when the finger lifted. Out and back, every press, by a
   * distance that depends on where in the slot you happened to hit: exactly
   * the "moving, misaligned, bump" in the report, and random-looking for the
   * same reason the last one was.
   *
   * So the finger's own x is only the target once the gesture has proved it
   * is a drag. Until then the target is the centre of the slot under it,
   * which is where the circle is going to end up anyway — so a tap is one
   * movement to one place, and the lift writes the value it already has.
   */
  const movedRef = useRef(false)
  const downXRef = useRef(0)
  /** Past this the gesture is a drag, and the circle belongs under the finger. */
  const DRAG_SLOP = 8

  /** The circle's left edge when it is sitting on a slot. The same arithmetic
      the component uses at rest, so the two cannot disagree by a pixel. */
  const leftForSlot = (index: number): number => PAD + index * SLOT + (SLOT - DOT) / 2

  /** The circle's left edge that puts its centre under a finger, kept inside the bar. */
  const leftFor = (clientX: number): number => {
    const box = barRef.current?.getBoundingClientRect()
    if (!box) return PAD
    const centre = Math.max(PAD + DOT / 2, Math.min(box.width - PAD - DOT / 2, clientX - box.left))
    return centre - DOT / 2
  }

  const paint = () => {
    const dot = dotRef.current
    if (dot && posRef.current != null) dot.style.translate = `${posRef.current}px 0`
  }
  const step = () => {
    frameRef.current = 0
    if (posRef.current == null) return
    const gap = targetRef.current - posRef.current
    if (Math.abs(gap) < 0.15) {
      posRef.current = targetRef.current
      paint()
      return
    }
    posRef.current += gap * FOLLOW
    paint()
    frameRef.current = requestAnimationFrame(step)
  }
  const wake = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(step)
  }
  /** Where the circle is drawn right now, mid-settle included, so a press
      during a spring picks it up from where it is rather than where it was going. */
  const drawnAt = (): number | null => {
    const dot = dotRef.current
    if (!dot) return null
    const m = /^(-?[\d.]+)px/.exec(getComputedStyle(dot).translate || "")
    return m ? Number.parseFloat(m[1]) : null
  }

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
    if (!movedRef.current && Math.abs(clientX - downXRef.current) > DRAG_SLOP) {
      movedRef.current = true
      /* Pick the circle up from where it is drawn, so following it on starts
         where the eye last saw it. */
      posRef.current = drawnAt() ?? leftFor(clientX)
      setFollowing(true)
      /* And a drag, released, is the gesture the bounce was asked for. */
      setBounce(true)
    }
    const next = slotAt(clientX)
    if (movedRef.current) {
      /* Under the finger, every frame, with no transition to be a delay. */
      targetRef.current = leftFor(clientX)
      wake()
    }
    /* A press writes nothing here. `at` below moves the slot, and the effect
       that draws the resting position puts the circle on it, in one frame. */
    if (lastRef.current !== next) {
      /*
        THE FIRST TICK OF A GESTURE IS THE DECISIVE ONE, and it is the moment
        a finger lands. A tap used to fire twice — light going down, medium
        coming up, sixty milliseconds apart — which is a stutter rather than a
        tick. One tick, at the instant of contact, at the same moment the lens
        brightens and the icon fills, so the touch and the answer are the same
        event. The lighter ticks are the slots counted off under a finger that
        is dragging, which is a different thing and still worth feeling.
      */
      const first = lastRef.current === null
      lastRef.current = next
      /* A render only when the slot changes, never per move. */
      setAt(next)
      /*
        LIGHT IS THE FLOOR, AND THAT IS A PROPERTY OF THE PHONE.

        These went medium, then light, then soft — and soft turned the bar
        silent. Not broken: soft is selection feedback, the generator behind a
        picker wheel, and it is so slight that on a real device it could not
        be felt at all. The plugin has three impact styles, Heavy, Medium and
        Light, and nothing between Light and selection, so Light is the
        quietest thing here that a thumb can actually notice.

        So the tick a press makes is Light, and the only place selection
        feedback still earns its keep is counting slots off under a finger
        that is dragging — there are several of those in a row, and slight is
        exactly right when they come in a stream.
      */
      hapticTap(first ? "light" : "soft")
    }
  }

  const end = () => {
    if (!activeRef.current) return
    activeRef.current = false
    if (frameRef.current) cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    posRef.current = null
    setFollowing(false)
    setPressed(false)
    setAt(null)
    lastRef.current = null
    movedRef.current = false
  }

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

  return {
    barRef,
    dotRef,
    following,
    pressed,
    bounce,
    at,
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        /* Keeps the moves coming even when the finger leaves the bar, which
           it will: 54px is not much to stay inside of. */
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        activeRef.current = true
        /* Left null: the loop paints nothing until a finger proves it is
           dragging, so a press never animates. */
        posRef.current = null
        setPressed(true)
        /* Every gesture starts as a press: no lift, and it lands rather than
           bouncing. Both are promoted if a finger goes anywhere. */
        setFollowing(false)
        setBounce(false)
        lastRef.current = null
        movedRef.current = false
        downXRef.current = e.clientX
        move(e.clientX)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        move(e.clientX)
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        const picked = slotAt(e.clientX)
        const away = escaped(e.clientY)
        const dragged = movedRef.current
        end()
        if (away) return
        /* A drag lands, and landing is worth a tick of its own. A tap already
           ticked, at the better moment: when the finger arrived. */
        if (dragged) hapticTap("light")
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
  */
  const items: BarItem[] = [
    { key: "home", label: "Home", href: "/app", icon: icons.home },
    { key: "orders", label: "Orders", href: "/app/orders", icon: icons.orders },
    { key: "products", label: "Products", href: "/app/products", icon: icons.products },
    { key: "analytics", label: "Analytics", href: "/app/analytics", icon: icons.analytics },
  ]

  /*
    WARMED ONCE. A page pressed for the first time streams from the server
    and shows its skeleton; a page the router has already fetched does not.
    Prefetching the four on mount means the first press on any of them finds
    at least the route's shell waiting, and next.config's staleTimes is what
    keeps a page you have been on from being fetched again on the way back.
  */
  useEffect(() => {
    if (!onPrefetch) return
    for (const item of items) onPrefetch(item.href)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  /*
    THE GLYPHS DO NOT CHANGE UNDER A MOVING FINGER. The circle follows the
    finger; the fill and the ink colour follow only what has been COMMITTED.
    Cross-fading four glyphs on every slot the circle crossed is what read as
    "icons glitch, scale randomly, jumpy": each crossing flipped a line glyph
    to a filled one and back within a frame or two. The system bars this is
    modelled on do the same thing — the lens moves, the icons wait.
  */
  const shown = slide.following ? (pending ?? current) : marked

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
  /*
    The circle's position is never a style prop. Under a finger the frame
    loop in useSlide writes it straight to the element, and a prop rendered
    on the way would either fight that or, on the lift, be the same string
    React last rendered and so never be written at all, leaving the circle
    the few pixels off where the loop left it. So at rest the position is
    written here, after the render that set the SETTLE transition, from
    wherever the loop left it to the slot it belongs on.
  */
  /*
    Where the lens was last put down, so a change of slot can be told from a
    re-render that changes nothing — only the first of those is a hand-over.
  */
  /*
    Where the glass was last laid down, so a change of slot can be told from a
    re-render that changes nothing — only the first of those is an arrival.
  */
  const laidAt = useRef(x)
  const [arriving, setArriving] = useState(false)
  /*
    AND WHILE THE GLASS IS COMING IN, IT IS THE INK'S CURVE THAT RULES.

    A press makes the lens brighten instantly, on purpose: easing that IN is
    what made the old lift a different amount on every press, because a tap is
    over in sixty milliseconds and interrupts it. But both of those are
    background-color on the same element, so the press's instant was
    swallowing the arrival as well and the glass was switched on rather than
    filling. Measured as zero values between empty and full.

    So an arrival says so for as long as it lasts, and wins.
  */
  const [filling, setFilling] = useState(false)
  useLayoutEffect(() => {
    if (slide.following) { laidAt.current = x; return }
    const dot = slide.dotRef.current
    if (!dot) return
    const lay = () => { dot.style.translate = `${x}px 0`; laidAt.current = x }
    /* A released drag brings its own arrival with it — it springs into the
       slot on SETTLE — and a lens already where it belongs has not moved. */
    if (laidAt.current === x || slide.bounce) { lay(); return }
    /* One frame with no colour in it, and the next one somewhere else, where
       the glass comes in. The move is invisible because there is nothing
       painted to see move. */
    if (!arriving) { setArriving(true); return }
    lay()
    setFilling(true)
    const id = requestAnimationFrame(() => setArriving(false))
    return () => cancelAnimationFrame(id)
  }, [x, arriving, slide.following, slide.bounce, slide.dotRef])
  useEffect(() => {
    if (!filling) return
    const t = window.setTimeout(() => setFilling(false), INK_MS)
    return () => window.clearTimeout(t)
  }, [filling, x])

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
             the bar, which is the pill's lift plus its height plus that. */
          height: `calc(${BAR_H + HALO_REACH.top + HALO_REACH.below}px + ${PILL_LIFT})`,
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
        The bar and the menu button, and that is all of it. A settings button
        used to appear beside the X while the menu was open, which meant the
        group changed width, the whole thing had to slide to stay centred,
        and settings was only reachable from inside a menu. Settings is the
        fourth slot in the bar now, so nothing here is ever added or removed
        and nothing has to move to make room.
      */}
      <div
        className="relative flex items-center"
        style={{
          gap: GAP,
          /* Settings appears to the LEFT, out of flow; the group slides half
             its width to the right to stay centred, one transform, no layout. */
          transform: `translateX(${menuOpen ? (BAR_H + GAP) / 2 : 0}px)`,
          transition: `transform 380ms ${EASE}`,
          willChange: "transform",
        }}
      >
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
            ref={slide.dotRef}
            aria-hidden="true"
            className="absolute rounded-full"
            style={{
              width: DOT,
              height: DOT,
              top: PAD,
              left: 0,
              /* `translate` is written by the loop and the effect above, never here. */
              scale: String(marked < 0 ? 0.55 : slide.following ? LIFT : 1),
              opacity: marked < 0 ? 0 : 1,
              backgroundColor: arriving ? ARRIVING_FILL : slide.pressed ? PRESS_FILL : REST_FILL,
              boxShadow: `${slide.pressed ? PRESS_EDGE : REST_EDGE}, ${DROP}`,
              /* No transition on the position under a finger: the loop is the
                 motion. And the brightening goes on instantly, comes off
                 eased — see the note by PRESS_FILL. */
              /* Emptied instantly on the frame it changes slot, filled back
                 over the ink's own curve. Never the other way round. */
              /* Emptied instantly on the frame it changes slot, then filled
                 back over the ink's own curve — which outranks the press's
                 instant for as long as the filling lasts. */
              transition: `${slide.bounce && !slide.following ? SETTLE : NO_TRAVEL}, ${LIFT_EASE}, opacity 220ms ease-out, ${arriving || (slide.pressed && !filling) ? PRESS_ON : `background-color ${INK_EASE}, box-shadow ${INK_EASE}`}`,
              willChange: "translate, scale",
            }}
          />

          {items.map((item, i) => {
            const on = i === shown
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
                  /* The icon filling with black. See INK_EASE. */
                  transition: `color ${INK_EASE}`,
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
        {/*
          ── SETTINGS, ONLY WHILE THE MENU IS OPEN, ON THE LEFT ───────────
          A circle to mirror the X on the right, out of the flow so nothing
          is laid out again when it comes and goes. Closed, it takes no
          presses and no tab stop.
        */}
        <button
          type="button"
          aria-label="Settings"
          aria-hidden={!menuOpen}
          tabIndex={menuOpen ? 0 : -1}
          onClick={() => {
            hapticTap("light")
            setPending(null)
            onNavigate("/app/settings")
            onCloseMenu()
          }}
          className={cn(
            "absolute flex items-center justify-center rounded-full",
            menuOpen ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{
            ...GLASS,
            right: "100%",
            marginRight: GAP,
            width: BAR_H,
            height: BAR_H,
            color: "#616b7a",
            opacity: menuOpen ? 1 : 0,
            transform: `scale(${menuOpen ? 1 : 0.6})`,
            transition: `transform 380ms ${EASE}, opacity 220ms ease-out`,
            willChange: "transform",
          }}
        >
          <NavIcon icon={icons.settings} active={false} color="currentColor" size={22} />
        </button>

        <button
          type="button"
          aria-label={menuOpen ? "Close menu" : "Menu"}
          aria-expanded={menuOpen}
          onClick={() => {
            hapticTap("light")
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
