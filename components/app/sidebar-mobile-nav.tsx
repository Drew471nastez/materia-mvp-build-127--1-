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
import { useEffect, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import { hapticTap } from "@/lib/native-bridge"
import { UpgradeBolt } from "@/components/app/upgrade-bolt"
import { APP_PAGE_KEPT_MS, isPlainClick, pendingPath, prefetchAppPage, useAppNavigation, useShownPath } from "@/lib/ui/app-navigation"
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
 *  WHAT THE LENS TAKES ITS TIME OVER
 * ═══════════════════════════════════════════════════════════════════════════
 * This used to say NOTHING IN THIS BAR FADES, and it was the rule that
 * produced the clipped band NavIcon no longer uses. The reasoning behind it
 * was about one specific fade: the glyph DIMMING OUT AND COMING BACK, a dip
 * to nothing and a return, landing on the press. That is still the thing to
 * avoid, and nothing here does it.
 *
 * A cross-fade between two glyphs is not that. Neither one dips: one is
 * arriving exactly as fast as the other leaves, and because FILL_MATCH puts
 * them in the same box the pair never goes light or changes size. It is what
 * the desktop sidebar has always done, and it is what was asked for after
 * the band shipped.
 *
 * INK_MS and INK_EASE are now the LENS's timing, not the glyph's — the glass
 * emptying for the frame it changes slot and filling back. The icon is
 * quicker than the glass on purpose: the thing you pressed answers first and
 * the weight of the bar follows it.
 */
const INK_MS = 360
const INK_EASE = `${INK_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`

/**
 * ===========================================================================
 *  THE SAME FILL THE SIDEBAR HAS
 * ===========================================================================
 * This was a band of ink opening out from the centre line of the glyph: the
 * solid clipped to the band, the outline drawn twice and clipped to the two
 * halves outside it, the three exact complements at every moment. It was
 * built that way to avoid a fade, because a fade had been reported as cheap,
 * and to avoid a one-frame swap, because a swap had been reported as a bump.
 *
 * It was still wrong. Ink travelling out of the middle of a glyph is a
 * gesture — it draws attention to itself, and the icon reads as performing
 * rather than as being on. What was asked for after seeing it is the fill
 * the DESKTOP SIDEBAR has, which is none of that: both variants stacked in
 * the same box, cross-faded, nothing moving.
 *
 * So this is now sidebar-desktop-nav's NavIcon, on a 22px box instead of a
 * 20px one, down to importing its transition rather than restating it. The
 * things that were learned the hard way and still apply are kept:
 *
 *   FILL_MATCH stays. The solid and the outline are different drawings and
 *   the solid reads about six per cent smaller; cross-fading two glyphs of
 *   different sizes shows the size changing through the blend, which is the
 *   bump that was reported over and over. Matched, the blend has nothing
 *   left to change but the ink inside the outline. It is a constant and
 *   never animates.
 *
 *   Neither glyph is drawn over the other, and the solid gets no stroke of
 *   its own. Both close up the gaps the solid is drawn WITH — a stroke runs
 *   along every contour including the ones cut out of the middle — and the
 *   receipt icon goes out as a dark blob. That shipped once.
 *
 * The lens's glass keeps its own timing (INK_EASE, INK_MS). That part was
 * not what was objected to, and it is the bar's weight rather than the
 * icon's.
 */
/**
 * `layer`: each glyph on a compositor layer of its own for good. In the pill
 * the lens moves under the icons, on its own layer, and a glyph that is not
 * on one is drawn into whichever layer the browser puts over the lens at
 * that moment. As the lens came to rest under the next icon that choice
 * changed, and the glyph was drawn again on another layer's pixel grid: half
 * a device pixel over, on the frame you let go. "Exactly at that moment the
 * button icon glitches and moves a little bit." A glyph that is always on
 * its own layer is always drawn the same way, and its fade is a change of
 * opacity and nothing else.
 *
 * `box`: a CSS length the icon is drawn at instead of `size` pixels. The pill
 * passes its own glyph size (--app-nav-glyph), which follows the width of
 * the phone, and both glyphs are drawn at it rather than scaled to it.
 */
function NavIcon({ icon, active, color, size = 22, box, layer = false }: { icon: NavIconPair; active: boolean; color: string; size?: number; box?: string; layer?: boolean }) {
  const Line = icon.line
  const Fill = icon.fill
  const piece = { position: "absolute", inset: 0, transition: FILL_TRANSITION, ...(layer ? { willChange: "opacity" } : {}) } as const
  /* On a layer of its own the solid is DRAWN at the matched size rather than
     scaled to it: a layer is painted before its transform, so a scaled one
     would be a 22px drawing stretched by the compositor, a pixel softer at
     the edge than the outline it replaces. Drawn at 23.3px it is as crisp. */
  const grow = (size * (FILL_MATCH - 1)) / 2
  const fit = box ? { width: "100%", height: "100%" } : {}
  const matched = box
    ? { inset: `calc(${box} * ${-Math.round(((FILL_MATCH - 1) / 2) * 10000) / 10000})`, width: `calc(${box} * ${FILL_MATCH})`, height: `calc(${box} * ${FILL_MATCH})` }
    : { inset: -grow }
  /*
    ── A GLYPH IN A BOX IS DRAWN AT THE BOX, AND NOT AT `size` ────────────
    "Make sure the settings button icon sits there correctly centred in the
    white circle."

    Solar's IconBase takes the `size` prop and writes it into the inline
    style as `width` and `height` — AFTER spreading the style it was handed.
    So the `width: 100%` above lost, silently, and every Solar glyph was
    drawn at 22px inside a box that is --app-nav-glyph: 21px on a 390px
    phone, 20 on a 360. `inset: 0` on an absolutely positioned element that
    carries its own width resolves to left and top, so the whole of that
    extra pixel hung off the RIGHT and the BOTTOM, and the ink sat a pixel
    down and to the right of the middle of its circle.

    The hand-drawn icons in this family (Home, OnePage, Payouts) put `size`
    on the svg's width ATTRIBUTE, which a style beats, so they were already
    the size of their box — which is why only four of the nine were off, and
    why the gear, alone in a white circle beside a menu glyph made of divs,
    was the one that got reported.

    So a glyph with a box is handed no `size` at all: the box's own width
    and height are then the only ones in the style, whichever family the
    icon came from. `size` still draws the rail's icons, which have no box.
  */
  const noSize = box != null
  return (
    <span className="relative block shrink-0" style={{ color, width: box ?? size, height: box ?? size }}>
      <Line
        {...(noSize ? {} : { size })}
        strokeWidth={1.5}
        data-part="outline"
        style={{ ...piece, ...fit, opacity: active ? 0 : 1 }}
      />
      <Fill
        {...(noSize ? {} : { size: layer ? size * FILL_MATCH : size })}
        data-part="ink"
        style={layer ? { ...piece, ...matched, opacity: active ? 1 : 0 } : { ...piece, ...fit, opacity: active ? 1 : 0, scale: String(FILL_MATCH) }}
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
 *
 * `onPress` runs on the same pointerdown: the rows use it to start fetching
 * their page, which gives the server the length of the tap (80 to 150ms of a
 * finger on glass) as a head start. The router picks that fetch up when the
 * click arrives instead of starting its own.
 */
function usePressed(onPress?: () => void) {
  const [pressed, setPressed] = useState(false)
  return {
    pressed,
    handlers: {
      onPointerDown: () => { setPressed(true); onPress?.() },
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
  const router = useRouter()
  const active = isRouteActive(useShownPath(), child.href)
  const { pressed, handlers } = usePressed(() => { if (!active) prefetchAppPage(router, child.href) })
  return (
    <Link
      href={child.href}
      onClick={(e) => {
        if (isPlainClick(e.nativeEvent)) onNavigate?.(child.href)
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
  const router = useRouter()
  const active = isRouteActive(useShownPath(), item.href)
  /* A row that reloads the document (forceNavigation) has nothing to fetch ahead. */
  const { pressed, handlers } = usePressed(() => { if (!active && !item.forceNavigation) prefetchAppPage(router, item.href) })
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
            onClick={(e) => {
              if (isPlainClick(e.nativeEvent)) onNavigate?.(item.href)
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
      onClick={(e) => {
        if (isPlainClick(e.nativeEvent)) onNavigate?.(item.href)
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
  const router = useRouter()
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
          className="group/upgrade mt-4 flex items-center justify-between gap-3 rounded-[16px] border border-violet-100/70 bg-white px-4 py-3.5 transition-colors duration-100 active:bg-violet-50/60"
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
  boxShadow:
    "0 1px 2px rgba(16,18,27,0.06), 0 4px 10px rgba(16,18,27,0.07), 0 14px 30px rgba(16,18,27,0.14)," +
    " inset 0 0 0 0.5px rgba(255,255,255,0.65), inset 0 0.5px 0 rgba(255,255,255,0.9)",
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
  { key: "home", label: "Home", href: "/app" },
  { key: "orders", label: "Orders", href: "/app/orders" },
  { key: "products", label: "Products", href: "/app/products" },
  { key: "analytics", label: "Analytics", href: "/app/analytics" },
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

/** The bar as drawn on this screen, in screen pixels: read off the DOM, never computed. */
type Geometry = { pad: number; slot: number; dot: number }
/**
 * The lens's left edge on slot `index`. The one place this is worked out:
 * the pill at rest and the gesture under a finger both call it.
 */
const slotLeft = (index: number, g: Geometry): number =>
  Math.round((g.pad + index * g.slot + (g.slot - g.dot) / 2) * 100) / 100

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
 * ===========================================================================
 *  HOW THE CIRCLE MOVES
 * ===========================================================================
 * Two different jobs, and one mechanism cannot do both.
 *
 * UNDER A FINGER it is where the finger is. Not where the finger's SLOT is:
 * the first version moved the circle slot to slot, each hop on a 90ms
 * transition, and that is what "very snappy, very direct, landing on it,
 * not smooth at all" describes. So while a finger is down there is no
 * transition on the circle's position at all.
 *
 * AND NOW IT IS UNDER THE FINGER, NOT A LITTLE BEHIND IT. It used to close
 * the distance by 72% a frame (and lean 22% of the way into the slot under
 * the finger), which left it a few pixels behind a quick finger and never
 * quite under a slow one: "smoother, cleaner, and accurate". So it tracks
 * the finger one to one. The only lag left is the pick up: a drag begins
 * with the circle on its slot and the finger somewhere in that slot, so the
 * gap between them is carried as an offset that dies away over about a
 * tenth of a second (CATCH_UP a frame), rather than a jump.
 *
 * LET GO OF IT and it springs onto the slot, carrying the speed the finger
 * gave it (settleSpring below). A spring started at the finger's speed has
 * no seam at the release, where a curve from rest had one; it is sampled
 * into keyframes and played by the compositor, so a page rendering on the
 * main thread cannot stall it; and it ends on the slot's exact centre,
 * because the last keyframe and the resting style are the same number.
 * Position and size are separate CSS properties (`translate`, `scale`), and
 * the stretch is `transform`, so each keeps its own motion.
 */
const CATCH_UP = 0.6
/**
 * The spring a released drag lands on: stiff enough to be there in about a
 * third of a second, damped to a single small overshoot (about 3% of the
 * distance left), which reads as arriving rather than as stopping.
 */
const SPRING = { stiffness: 520, damping: 34 }
/**
 * WHICH SLOT A RELEASE MEANS. A finger that lets go while still moving
 * means the slot it is moving towards, not the one it happens to be over:
 * the release is projected PROJECT_MS ahead at the speed it had. A finger
 * that stopped first lands where it stopped.
 */
const PROJECT_MS = 90
/**
 * LIQUID, LIKE A DROP OF GLASS. It stretches along the way it is moving, by
 * how fast it is moving, and rounds off as it slows: up to STRETCH_MAX wider
 * (a little narrower top to bottom, so it reads as the same drop pulled
 * along rather than a bigger one), on top of the lift, for about 1.12 in
 * all. From the speed, smoothed over a few frames, so a finger's uneven
 * events do not make it wobble. Stretch is written as `transform`, which
 * composes with `translate` and `scale` without touching either.
 */
const STRETCH_MAX = 0.08
/** px per ms of speed for all of STRETCH_MAX: three slots in a quarter of a second, an ordinary slide. */
const STRETCH_AT = 0.6
const stretchFor = (speed: number) => Math.min(STRETCH_MAX, (Math.abs(speed) / STRETCH_AT) * STRETCH_MAX)

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A DROP OF WATER, NOT A RUBBER STAMP
 * ═══════════════════════════════════════════════════════════════════════════
 * "Make the glassy bubble a bit more fluid, like a drop of water stretching
 * slightly in the drag direction and settling." The stretch used to BE the
 * speed: as fast as the finger went, that wide, and as the finger stopped it
 * went round again on the same curve, like a shape being redrawn rather than
 * a thing with a little weight in it.
 *
 * So the stretch has a body of its own now: a small underdamped spring
 * (DROP_SPRING) chasing what the speed asks for. Pulled along, it leans into
 * the stretch a moment after the finger does; stopped, it runs on past round
 * into a slight squash (at most SQUASH_MAX, a little narrower and taller)
 * and settles in one soft wobble. And it leads: the stretch reaches a touch
 * further ahead of the finger than behind it (DROP_LEAD of it), the way a
 * drop pulled across glass is fuller at its front. All of it is one
 * `transform` on the lens, written once a frame under a finger and sampled
 * into the landing spring's keyframes after it, so it runs on the
 * compositor like the rest. It never passes STRETCH_MAX, so the widest the
 * lens gets is unchanged.
 */
const DROP_SPRING = { stiffness: 420, damping: 9 }
const SQUASH_MAX = 0.03
const DROP_LEAD = 0.2
type Drop = { d: number; dv: number; dir: number }
/** One step of the drop's spring towards the stretch `speed` asks for; `ms` is split so a slow frame stays stable. */
function stepDrop(drop: Drop, speed: number, ms: number) {
  if (Math.abs(speed) > 0.02) drop.dir = Math.sign(speed)
  const target = stretchFor(speed)
  let left = ms / 1000
  while (left > 0) {
    const dt = Math.min(left, 1 / 120)
    left -= dt
    drop.dv += (DROP_SPRING.stiffness * (target - drop.d) - DROP_SPRING.damping * drop.dv) * dt
    drop.d = Math.max(-SQUASH_MAX, Math.min(STRETCH_MAX, drop.d + drop.dv * dt))
  }
}
/** The lens's shape for a drop: wider and a little flatter while stretched, leaning the way it goes; narrower and taller in the squash. `dot` is the lens's width on this screen. */
function dropStyle(drop: Drop, dot: number): string {
  const d = drop.d
  if (Math.abs(d) < 0.002) return "scale(1, 1)"
  const lead = d > 0 ? Math.round(drop.dir * d * dot * DROP_LEAD * 100) / 100 : 0
  return `translateX(${lead}px) scale(${Math.round((1 + d) * 1000) / 1000}, ${Math.round((1 - d * 0.5) * 1000) / 1000})`
}
const dropSettled = (drop: Drop) => Math.abs(drop.d) < 0.002 && Math.abs(drop.dv) < 0.05

/**
 * The spring from `from` (px, with `speed` px/ms) to `to`, as keyframes of
 * position and stretch, one per 1/120s. Semi implicit Euler at that step is
 * stable for these constants and ends when both the distance and the speed
 * are below what a screen can show.
 */
function settleSpring(from: number, speed: number, to: number, dot: number, drop: Drop = { d: stretchFor(speed), dv: 0, dir: Math.sign(speed) }): { frames: Keyframe[]; ms: number } {
  const dt = 1 / 120
  let x = from - to
  let v = speed * 1000
  const frames: Keyframe[] = []
  let t = 0
  for (let i = 0; i < 240; i++) {
    const place = `${Math.round((to + x) * 100) / 100}px 0`
    /* The drop's shape rides along on its own spring, from the stretch it
       had under the finger: the landing and the settling are one motion. */
    frames.push({ translate: place, transform: dropStyle(drop, dot) })
    if (Math.abs(x) < 0.05 && Math.abs(v) < 5 && dropSettled(drop)) break
    v += (-SPRING.stiffness * x - SPRING.damping * v) * dt
    x += v * dt
    stepDrop(drop, v / 1000, dt * 1000)
    t += dt
  }
  const rest = `${to}px 0`
  frames.push({ translate: rest, transform: "scale(1, 1)" })
  return { frames, ms: Math.max(1, Math.round(t * 1000)) }
}
/**
 * AND A PRESS DOES NOT TRAVEL.
 *
 * "When I click on the icon, make sure that it doesn't bump, scale, or do any
 * of the movements left and right."
 *
 * A finger sliding along the bar carries the circle with it, and letting go
 * of it springs it into the slot; that is the gesture this was built for. A
 * press is not that gesture. The circle is simply on the
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
/*
 * CLEARER THAN THE BAR, AND LIT. "Should feel more like glass, like iOS
 * 2026." It was a disc of 82% white on a bar of 93% white: a white disc with
 * a ring, which is a badge. Now the fill is thinner and the glass is in the
 * light: its own blur and saturation over what is behind it (LENS_GLASS), a
 * highlight along the top edge and a band of refracted light low inside it
 * (LENS_LIGHT, REST_EDGE), and a soft shadow that lifts it off the bar
 * (DROP). A press still brightens it, by 0.18.
 */
const PRESS_FILL = "rgba(255,255,255,0.9)"
const REST_FILL = "rgba(255,255,255,0.72)"
const LENS_GLASS = "blur(8px) saturate(180%)"
const LENS_LIGHT =
  "radial-gradient(80% 55% at 50% 4%, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 72%)," +
  " radial-gradient(70% 38% at 50% 100%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 75%)," +
  " linear-gradient(180deg, rgba(255,255,255,0) 45%, rgba(16,18,27,0.03) 100%)"
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
/* The glass's edge: light caught along the top, a hairline of shade along
   the bottom, and a rim all round, a touch stronger under a finger. */
const PRESS_EDGE = "inset 0 1px 0.5px rgba(255,255,255,1), inset 0 -1px 1px rgba(16,18,27,0.06), inset 0 0 0 0.5px rgba(16,18,27,0.08)"
const REST_EDGE = "inset 0 1px 0.5px rgba(255,255,255,0.95), inset 0 -1px 1px rgba(16,18,27,0.05), inset 0 0 0 0.5px rgba(16,18,27,0.06)"
const DROP = "0 1px 1.5px rgba(16,18,27,0.08), 0 4px 12px -2px rgba(16,18,27,0.14)"
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
 * system bars: the thing you are holding is the thing that is bigger. 4%, so
 * that with the stretch on top (STRETCH_MAX) it is never more than about
 * 1.12 wide.
 */
const LIFT = 1.04
const LIFT_EASE = `scale 200ms cubic-bezier(0.32, 0.72, 0, 1)`

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  A TAP HAS A LITTLE GIVE
 * ═══════════════════════════════════════════════════════════════════════════
 * "Make tapping an icon feel a touch more satisfying: a subtle press scale,
 * a spring, nothing big." The icon you touch gives under the finger, to 0.9,
 * and springs back through 1.03 to rest, in 420ms.
 *
 * What it is careful not to be is the bump this bar spent so long losing:
 * the lens does not move or grow on a tap (it is still simply on the icon),
 * the glyph does not change its box or its place (a scale about its own
 * centre, on its own `scale` property), and it is the same every time. That
 * last is why it is one fixed animation started on the touch rather than a
 * pressed state eased in and out: a tap is over in sixty milliseconds, so a
 * held squeeze would be cut off at a different depth on every tap, which is
 * exactly what the old lift did. Played by the compositor with no fill, so
 * when it ends nothing is left on the icon.
 */
const TAP_PULSE: Keyframe[] = [
  { scale: "1", easing: "cubic-bezier(0.3, 0, 0.7, 1)" },
  { scale: "0.9", offset: 0.2, easing: "cubic-bezier(0.2, 0.9, 0.3, 1)" },
  { scale: "1.03", offset: 0.6, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
  { scale: "1", offset: 1 },
]
const TAP_PULSE_MS = 420

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
function useSlide(count: number, onPick: (index: number) => void, onPress?: (index: number) => void) {
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
  /**
   * THE BAR AS IT IS DRAWN, READ OFF THE BAR ITSELF. CSS decides how big the
   * pill is on this phone (--app-nav-*, app/globals.css), and where the lens
   * sits is arithmetic here. Rather than work the size out a second time from
   * the window's width, this reads the three lengths the arithmetic needs
   * from what was drawn: the bar's padding, a tab's width, the lens's width.
   * Read before the first paint, and again when the bar changes size (a
   * phone turned on its side). Null until then, and nothing is placed.
   */
  const [geometry, setGeometry] = useState<Geometry | null>(null)
  const geoRef = useRef<Geometry>({ pad: 0, slot: 0, dot: 0 })
  useLayoutEffect(() => {
    const bar = barRef.current
    const lens = dotRef.current
    if (!bar || !lens) return
    const read = () => {
      const tab = bar.querySelector("a")
      if (!tab) return
      const next = {
        pad: Number.parseFloat(getComputedStyle(bar).paddingLeft),
        slot: Number.parseFloat(getComputedStyle(tab).width),
        dot: Number.parseFloat(getComputedStyle(lens).width),
      }
      if (!(next.slot > 0) || !(next.dot > 0) || !(next.pad >= 0)) return
      const was = geoRef.current
      if (was.pad === next.pad && was.slot === next.slot && was.dot === next.dot) return
      geoRef.current = next
      setGeometry(next)
    }
    read()
    if (typeof ResizeObserver === "undefined") return
    const observer = new ResizeObserver(read)
    observer.observe(bar)
    return () => observer.disconnect()
  }, [])
  const lastRef = useRef<number | null>(null)
  /* React state answers a render later; a move handler that asks it whether
     a finger is down can be told no about the finger that just landed. */
  const activeRef = useRef(false)
  /* The circle's left edge in the bar's own coordinates: where the finger
     puts it, where it is drawn, and the frame loop between them. */
  const targetRef = useRef(0)
  const posRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  /* The gap between the circle and the finger when a drag picks it up,
     dying away by CATCH_UP a frame. */
  const offsetRef = useRef(0)
  /* How fast it is going, px per ms, smoothed; and when it was last drawn. */
  const speedRef = useRef(0)
  /* The drop's shape and its spring (A DROP OF WATER, above). */
  const dropRef = useRef<Drop>({ d: 0, dv: 0, dir: 1 })
  const stampRef = useRef(0)
  /* The spring a released drag is on, and the slot it is landing on. */
  const settleRef = useRef<Animation | null>(null)
  const settleToRef = useRef<number | null>(null)

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

  /** The circle's left edge when it is sitting on a slot. The same function
      the component uses at rest, so the two cannot disagree by a pixel. */
  const leftForSlot = (index: number): number => slotLeft(index, geoRef.current)

  /** The circle's left edge that puts its centre under a finger, kept inside the bar. */
  const leftFor = (clientX: number): number => {
    const { pad, dot } = geoRef.current
    const box = barRef.current?.getBoundingClientRect()
    if (!box) return pad
    const centre = Math.max(pad + dot / 2, Math.min(box.width - pad - dot / 2, clientX - box.left))
    return centre - dot / 2
  }

  const paint = () => {
    const dot = dotRef.current
    if (!dot || posRef.current == null) return
    dot.style.translate = `${Math.round(posRef.current * 100) / 100}px 0`
    dot.style.transform = dropSettled(dropRef.current) ? "" : dropStyle(dropRef.current, geoRef.current.dot)
  }
  /**
   * One frame under a finger: the finger's place, plus what is left of the
   * pick up gap. Runs for as long as the finger is dragging, still or not,
   * so the gap and the stretch both settle while it holds still.
   */
  const step = (now: number) => {
    frameRef.current = 0
    if (posRef.current == null || !activeRef.current) return
    const dt = stampRef.current ? Math.min(64, Math.max(1, now - stampRef.current)) : 16.7
    stampRef.current = now
    offsetRef.current *= Math.pow(CATCH_UP, dt / 16.7)
    if (Math.abs(offsetRef.current) < 0.05) offsetRef.current = 0
    const next = targetRef.current + offsetRef.current
    /* Speed as an average over the last few frames: the finger's own events
       are uneven, and a stretch read off one of them would wobble. */
    const blend = 1 - Math.pow(0.55, dt / 16.7)
    speedRef.current += ((next - posRef.current) / dt - speedRef.current) * blend
    posRef.current = next
    stepDrop(dropRef.current, speedRef.current, dt)
    paint()
    frameRef.current = requestAnimationFrame(step)
  }
  const wake = () => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(step)
  }
  /** Where the circle is drawn right now, mid-spring included, so a press
      during a spring picks it up from where it is rather than where it was going. */
  const drawnAt = (): number | null => {
    const dot = dotRef.current
    if (!dot) return null
    const m = /^(-?[\d.]+)px/.exec(getComputedStyle(dot).translate || "")
    return m ? Number.parseFloat(m[1]) : null
  }
  /**
   * Stop a spring where it is: the drawn place becomes the resting style, so
   * whatever comes next (a drag picking it up, a press moving it) starts
   * from what the eye last saw.
   */
  const stopSettle = () => {
    const a = settleRef.current
    if (!a) return
    const dot = dotRef.current
    const at = drawnAt()
    a.cancel()
    settleRef.current = null
    settleToRef.current = null
    if (dot && at != null) { dot.style.translate = `${at}px 0`; dot.style.transform = "" }
  }
  /**
   * A released drag onto `to`: the spring, from where the circle is and at
   * the speed it had. The resting style is the landing place before the
   * first keyframe plays, so when the spring ends there is nothing to hand
   * over: it is on the slot's exact centre.
   */
  const settle = (to: number) => {
    const dot = dotRef.current
    const from = posRef.current ?? drawnAt()
    if (!dot || from == null) return
    const speed = speedRef.current
    const drop = { ...dropRef.current }
    dropRef.current = { d: 0, dv: 0, dir: drop.dir }
    dot.style.translate = `${to}px 0`
    dot.style.transform = ""
    if (typeof dot.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const { frames, ms } = settleSpring(from, speed, to, geoRef.current.dot, drop)
    const a = dot.animate(frames, { duration: ms, easing: "linear" })
    settleRef.current = a
    settleToRef.current = to
    a.onfinish = () => { if (settleRef.current === a) { settleRef.current = null; settleToRef.current = null } }
  }

  const slotAt = (clientX: number): number => {
    const box = barRef.current?.getBoundingClientRect()
    if (!box) return 0
    const pad = geoRef.current.pad
    const inner = box.width - pad * 2
    const x = clientX - box.left - pad
    return Math.max(0, Math.min(count - 1, Math.floor((x / inner) * count)))
  }
  /** The slot whose resting place is nearest a left edge of the circle. */
  const slotNearest = (left: number): number =>
    Math.max(0, Math.min(count - 1, Math.round((left - leftForSlot(0)) / (geoRef.current.slot || 1))))

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
      /* Pick the circle up from where it is drawn (a spring still running
         included), so following it on starts where the eye last saw it, and
         carry the gap to the finger as an offset that dies away. */
      stopSettle()
      const drawn = drawnAt() ?? leftFor(clientX)
      posRef.current = drawn
      offsetRef.current = drawn - leftFor(clientX)
      speedRef.current = 0
      dropRef.current = { d: 0, dv: 0, dir: 1 }
      stampRef.current = 0
      setFollowing(true)
      /* And a drag, released, is the gesture the spring was asked for. */
      setBounce(true)
    }
    const next = slotAt(clientX)
    if (movedRef.current) {
      /* Under the finger, one to one, every frame, with no transition to be
         a delay. */
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
    stampRef.current = 0
    /* Round again as it lets go: the spring that lands it (the pill's layout
       effect, settleTo) starts from the stretch its speed gives it, in the
       same frame, so this is never painted on its own. */
    if (dotRef.current) dotRef.current.style.transform = ""
    setFollowing(false)
    setPressed(false)
    setAt(null)
    lastRef.current = null
    movedRef.current = false
  }

  useEffect(() => () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }, [])

  /**
   * Land a released drag on `to`, once: a spring already landing there is
   * left to finish, and a circle already resting there has nowhere to go.
   */
  const settleTo = (to: number) => {
    if (settleToRef.current === to) return
    stopSettle()
    const at = drawnAt()
    if (at != null && Math.abs(at - to) < 0.05 && Math.abs(speedRef.current) < 0.01 && dropSettled(dropRef.current)) {
      if (dotRef.current) dotRef.current.style.translate = `${to}px 0`
      return
    }
    posRef.current = at
    settle(to)
    posRef.current = null
  }

  /* The spring's controls, for the pill's layout effect: one ref for the life
     of the bar, its contents refreshed each render (they read only refs). */
  const motion = useRef({ settleTo, stopSettle, settlingTo: () => settleToRef.current })
  motion.current = { settleTo, stopSettle, settlingTo: () => settleToRef.current }

  return {
    barRef,
    dotRef,
    geometry,
    following,
    pressed,
    bounce,
    at,
    motion,
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
        onPress?.(slotAt(e.clientX))
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        move(e.clientX)
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (!activeRef.current) return
        const dragged = movedRef.current
        /* A tap picks the slot it landed on. A drag picks the slot its
           circle is heading for: where it is, PROJECT_MS on at the speed it
           has, so a finger let go mid slide lands where it was going. */
        const picked = dragged && posRef.current != null
          ? slotNearest(posRef.current + speedRef.current * PROJECT_MS)
          : slotAt(e.clientX)
        const away = escaped(e.clientY)
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
   * So a pick is remembered until the route catches up with it, for as long
   * as its navigation is underway, however long that is. It used to be let go
   * of after 1500ms on a timer, which put the glitch back on every page that
   * took longer than that: the circle went home at 1.5s and came out again
   * when the page landed. Now it is let go of when the route arrives, when
   * the navigation ends without arriving (it failed, or was sent somewhere
   * else), or when another navigation replaces it. The timer is left only for
   * a pick that no navigation record ever answered.
   */
  const [pending, setPending] = useState<number | null>(null)
  const answered = useRef(false)
  useEffect(() => {
    if (pending == null) return
    if (current === pending) { setPending(null); return }
    if (heading === pending) { answered.current = true; return }
    if (nav || answered.current) { setPending(null); return }
    const t = window.setTimeout(() => setPending(null), 1500)
    return () => window.clearTimeout(t)
  }, [pending, current, heading, nav])

  const pick = (index: number) => {
    const item = items[index]
    if (!item) return
    answered.current = false
    setPending(index)
    onNavigate(item.href)
    onCloseMenu()
  }

  /* The page under the finger starts coming the moment it lands, not when it
     lifts: the length of the tap is a head start for the server, and a page
     already warm is not fetched again (prefetchAppPage). */
  const linkRefs = useRef<(HTMLAnchorElement | null)[]>([])
  const pulse = (index: number) => {
    const glyph = linkRefs.current[index]?.firstElementChild as HTMLElement | null | undefined
    if (!glyph || typeof glyph.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    for (const a of glyph.getAnimations()) if (a.id === "tap") a.cancel()
    const a = glyph.animate(TAP_PULSE, { duration: TAP_PULSE_MS })
    a.id = "tap"
  }
  const slide = useSlide(items.length, pick, (index) => {
    pulse(index)
    const item = items[index]
    if (item && index !== current) onPrefetch?.(item.href)
  })
  /* Under the finger while one is down, then on the slot that was picked,
     then on the page being opened, then on the page you are actually on. The
     third is what answers a press anywhere else (a menu row, a link in the
     page) on the press, rather than when the page arrives. */
  const marked = slide.at ?? pending ?? heading ?? current
  /*
    THE GLYPHS DO NOT CHANGE UNDER A MOVING FINGER. The circle follows the
    finger; the fill and the ink colour follow only what has been COMMITTED.
    Cross-fading four glyphs on every slot the circle crossed is what read as
    "icons glitch, scale randomly, jumpy": each crossing flipped a line glyph
    to a filled one and back within a frame or two. The system bars this is
    modelled on do the same thing — the lens moves, the icons wait.
  */
  const shown = slide.following ? (pending ?? heading ?? current) : marked

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
  const restSlot = marked >= 0 ? marked : restRef.current
  /* In screen pixels, at the size the bar is drawn on this phone; null until it has been measured. */
  const x = slide.geometry ? slotLeft(restSlot, slide.geometry) : null
  /*
    The circle's position is never a style prop. Under a finger the frame
    loop in useSlide writes it straight to the element, and a prop rendered
    on the way would either fight that or, on the lift, be the same string
    React last rendered and so never be written at all, leaving the circle
    the few pixels off where the loop left it. So at rest the position is
    written here, after the render, from wherever the loop left it to the
    slot it belongs on: by the spring after a drag, in one step otherwise.
  */
  /*
    Where the lens was last put down, so a change of slot can be told from a
    re-render that changes nothing — only the first of those is a hand-over.
  */
  /*
    Which slot the glass was last laid down on, so a change of slot can be
    told from a re-render that changes nothing: only the first of those is an
    arrival. A slot and not a position, so a bar that changes size (the first
    measurement, a phone turned on its side) moves the glass with it rather
    than fading it out and in again.
  */
  const laidAt = useRef(restSlot)
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
    if (slide.following) { laidAt.current = restSlot; return }
    const dot = slide.dotRef.current
    if (!dot || x == null) return
    const lay = () => { dot.style.translate = `${x}px 0`; laidAt.current = restSlot }
    /* A released drag brings its own arrival with it: it springs onto the
       slot from where the finger left it, at the finger's speed (settleTo,
       once per landing place). */
    if (slide.bounce) { slide.motion.current.settleTo(x); laidAt.current = restSlot; return }
    /* A lens already where it belongs has not moved. */
    if (laidAt.current === restSlot) { lay(); return }
    /* One frame with no colour in it, and the next one somewhere else, where
       the glass comes in. The move is invisible because there is nothing
       painted to see move. A spring still landing somewhere else stops, or
       it would carry on over the new place until it ended. */
    if (!arriving) { setArriving(true); return }
    if (slide.motion.current.settlingTo() != null) slide.motion.current.stopSettle()
    lay()
    setFilling(true)
    const id = requestAnimationFrame(() => setArriving(false))
    return () => cancelAnimationFrame(id)
  }, [x, restSlot, arriving, slide.following, slide.bounce, slide.dotRef, slide.motion])
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
          aria-label="Main"
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
                  if (e.detail === 0) pick(i)
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
          aria-label={menuOpen ? "Close menu" : "Menu"}
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
