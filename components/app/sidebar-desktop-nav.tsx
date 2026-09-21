"use client"

/**
 * ===========================================================================
 *  THE DESKTOP SIDEBAR NAVIGATION
 * ===========================================================================
 * Lifted out of components/app/sidebar.tsx, and the lifting IS the bug fix.
 *
 * Every piece of the desktop nav — the item, the sub-item, the tools row, the
 * whole content block — was declared INSIDE the `AppSidebar` function body:
 *
 *     export function AppSidebar(props) {
 *       const NavItem = ({ item }) => …          // ← a new component TYPE
 *       const SidebarContent = () => …           //   on every single render
 *       …
 *     }
 *
 * A component declared in a render is a different function object each time,
 * so React sees a different element type in the same position and does the
 * only thing it can: unmount the old subtree and mount a new one. Every DOM
 * node in the sidebar was destroyed and rebuilt whenever anything in
 * `AppSidebar` changed — a route change, a notification poll, a hover that
 * set state. That is the jumping, the flashing, and the lost expand state.
 *
 * Module scope fixes it: one stable type per component, React reconciles in
 * place, the DOM nodes survive, and the sidebar sits still while the page
 * behind it changes.
 *
 * ---------------------------------------------------------------------------
 *  ICONS
 * ---------------------------------------------------------------------------
 * Solar, 20px, the linear and bold variants stacked in one box and
 * cross-faded so the fill arrives rather than appears. Every icon sits in a
 * fixed 20×20 box, so nothing an icon does can move the label beside it.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
/*
  IMPORTED ONE MODULE AT A TIME, per style.

  `@solar-icons/react` re-exports every icon from its index at the
  bold-duotone weight, so a bare `import { HomeIcon }` gets the wrong style
  AND pulls the barrel. The subpath exports — /linear/x and /bold/x — are the
  two glyphs this file actually renders, and nothing else ships.
*/
import { AltArrowDownIcon } from "@solar-icons/react/linear/alt-arrow-down"
import { BoltIcon as BoltBold } from "@solar-icons/react/bold/bolt"

import { BillListIcon as OrdersLinear } from "@solar-icons/react/linear/bill-list"
import { BillListIcon as OrdersBold } from "@solar-icons/react/bold/bill-list"
import { BoxIcon as ProductsLinear } from "@solar-icons/react/linear/box"
import { BoxIcon as ProductsBold } from "@solar-icons/react/bold/box"
import { CardIcon as PayoutsLinear } from "@solar-icons/react/linear/card"
import { CardIcon as PayoutsBold } from "@solar-icons/react/bold/card"
import { ChartSquareIcon as AnalyticsLinear } from "@solar-icons/react/linear/chart-square"
import { ChartSquareIcon as AnalyticsBold } from "@solar-icons/react/bold/chart-square"
import { GlobalIcon as OnePageLinear } from "@solar-icons/react/linear/global"
import { GlobalIcon as OnePageBold } from "@solar-icons/react/bold/global"
import { LetterIcon as EmailsLinear } from "@solar-icons/react/linear/letter"
import { LetterIcon as EmailsBold } from "@solar-icons/react/bold/letter"
/**
 * ONE PLAIN SCREEN, not a screen with a phone beside it.
 *
 * Every other glyph in this list is a single object drawn once — an
 * envelope, a card, a box, a bill. `monitor-smartphone` is two devices at
 * two sizes with a gap between them, so at 20px it carries more strokes
 * than anything next to it and reads as busier rather than as different.
 */
import { MonitorIcon as WebsiteBuilderLinear } from "@solar-icons/react/linear/monitor"
import { MonitorIcon as WebsiteBuilderBold } from "@solar-icons/react/bold/monitor"
import { SettingsIcon as SettingsLinear } from "@solar-icons/react/linear/settings"
import { SettingsIcon as SettingsBold } from "@solar-icons/react/bold/settings"
/**
 * A PROFILE CARD.
 *
 * The Creator Page is storelib.com/u/<handle> — a picture, a bio, links,
 * products. A shop icon named the one thing it is not, and it sat two rows
 * above Website and OnePage, so the rail read as three shops.
 *
 * A plain silhouette was the first answer and it was the wrong one: it is
 * what the account menu's avatar is, and it is a lighter version of the
 * People row two below it, so the rail had two people in it and one of them
 * was a page. A card with a person on it says PAGE ABOUT A PERSON, which is
 * what this is, and nothing else in the rail is that shape — Payouts is a
 * plain card with no face on it.
 *
 * The Store Builder this icon was originally drawn for is gone; the name
 * `storeBuilder` stays only because the key is referenced in several places,
 * and renaming it is a separate change from drawing the right picture.
 */
import { UserIdIcon as CreatorPageLinear } from "@solar-icons/react/linear/user-id"
import { UserIdIcon as CreatorPageBold } from "@solar-icons/react/bold/user-id"
import { UsersGroupRoundedIcon as PeopleLinear } from "@solar-icons/react/linear/users-group-rounded"
import { UsersGroupRoundedIcon as PeopleBold } from "@solar-icons/react/bold/users-group-rounded"

import { cn } from "@/lib/utils"

// ── The palette, in one place ───────────────────────────────────────────────
//
// Written as constants rather than sprinkled through class names because the
// same five values decide every state of every row, and a sidebar where one
// row's grey is two shades off the others is exactly the "not quite right"
// that no single line of code explains.
const REST_TEXT = "#666666"
const HOVER_BG = "#f3f3f3"
const HOVER_TEXT = "#333333"
const ACTIVE_BG = "#e8e8e8"
const ACTIVE_TEXT = "#202020"
const MUTED_TEXT = "#b1b1b1"
const LABEL_TEXT = "#a5a5a5"

/**
 * One row's geometry, shared by every state.
 *
 * Height, padding, radius and gap are identical whether a row is resting,
 * hovered or active — the only things that change are two colours and the
 * font weight. Nothing here can make a row move or resize, which is the
 * whole point.
 */
/*
  NO `group` HERE, DELIBERATELY.

  Nothing in this file uses `group-hover:` — the three-colour hover is driven
  from React state, because Tailwind cannot express it. `group` was therefore
  decoration, and expensive decoration: globals.css carries a touch-device
  rule aimed at storefront product cards,

      @media (hover: none) { .group * { transition-property: none !important } }

  which matched every row here and stripped the transitions off everything
  inside them. Measured in Chromium, which reports `hover: none`: the icon
  cross-fade computed `transition-property: none` and the chevron could not
  rotate. On a touch tablet wide enough to show this rail — an iPad at 1024px —
  the sidebar had no animation at all.
*/
const ROW =
  "relative flex h-[38px] w-full items-center gap-2 rounded-[12px] px-[14px] " +
  "font-sans text-[15px] leading-[24px] tracking-[-0.01em] " +
  "transition-[background-color,color] duration-[140ms] ease-out"

/**
 * 470 and 575 — five per cent back off 495/605, and real values rather than
 * rounded ones.
 *
 * `next/font` loads Inter as a VARIABLE font — the call in app/layout.tsx asks
 * for no specific weights, which is what makes the whole 100–900 axis
 * available, so 470 renders as 470. On a static font it would snap to 500,
 * 575 would snap to 600, and a five per cent step would land wherever the
 * rounding happened to put it — which is to say, nowhere near five per cent.
 */
/** Long enough to read as a change, short enough not to lag the click. */
const FILL_TRANSITION = "opacity 160ms cubic-bezier(0.2, 0, 0, 1)"

/**
 * 1.5 in a 24-unit box — Solar's own drawing weight, which is the weight the
 * reference is drawn at. Lighter than what it replaces: Remix's line icons
 * were a 2-unit solid with another 0.3 of stroke painted over them, so this
 * is roughly a third of the ink gone.
 */
const ICON_STROKE = 1.5

const REST_WEIGHT = 470
const ACTIVE_WEIGHT = 575

export type NavChild = { href: string; label: string }

export type NavItemData = {
  href: string
  label: string
  icon: NavIconPair
  /** Leaves the /app router tree, so it cannot be a client-side push. */
  forceNavigation?: boolean
  children?: NavChild[]
}

/**
 * A LINE VARIANT AND A FILL VARIANT OF THE SAME GLYPH.
 *
 * Not one component with a weight prop — every icon here ships as two
 * components, and the pair is what the cross-fade needs: something to fade
 * from and something to fade to. `ComponentType` rather than a plain function
 * signature because Solar's icon components render from JSX the same way a
 * hand-written one below does, and the type has to fit both.
 */
type NavIconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
  "data-variant"?: string
}>

export type NavIconPair = { line: NavIconComponent; fill: NavIconComponent }

/**
 * ===========================================================================
 *  HOME, PLAIN
 * ===========================================================================
 * Fitted to a reference image once already — a chunky, hand-drawn silhouette
 * with a wide arched door, converged on by measuring pixel mismatch against
 * a screenshot. Shown that result and asked for something simpler and more
 * basic, the honest answer wasn't a smaller radius on the same shape; it was
 * the wrong SHAPE. A bespoke silhouette reads as designed no matter how its
 * corners are tuned. "Simple, basic" is a request for the generic one.
 *
 * So this is Lucide's own `House` glyph — the exact geometry `lucide-react`
 * ships, and the one every other icon in this app that isn't the rail
 * already uses. A peaked roof, plain walls, a small door notch near the
 * base. Nothing measured, nothing fitted; copied verbatim from the library.
 *
 * TWO PATHS, NOT ONE — which is why this needed more than a paint-mode
 * swap. Lucide draws the house as an outer roof-and-walls contour AND a
 * separate open-bottomed door rectangle, stroked independently: the door's
 * three sides read as a slot because its fourth side was never drawn, which
 * is fine for a stroke and wrong for a fill (an unclosed subpath fills by
 * implicitly closing straight across the gap, which is exactly the edge a
 * real door needs). The outline layer renders both paths stroked, matching
 * Lucide exactly. The filled layer closes the door subpath explicitly and
 * renders BOTH as one path with `fill-rule="evenodd"`.
 *
 * Both pieces of that are load-bearing, checked with `isPointInFill` rather
 * than trusted by eye: TWO SEPARATE `<path>` ELEMENTS, each filled on its
 * own, was the first attempt, and it drew a solid black window instead of a
 * hole — fill-rule only relates contours that share one `<path>`'s `d`.
 * EVENODD ITSELF holds regardless of which direction each subpath happens
 * to wind: the default nonzero rule also cuts a hole here, but only because
 * this door and this roof wind opposite ways by coincidence — flip either
 * arc's sweep flag later and nonzero would double-fill the door solid
 * instead of open it. Evenodd doesn't depend on that coincidence holding.
 */
const HOME_ROOF_D =
  "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
const HOME_DOOR_D = "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"

type HomeIconProps = {
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
  "data-variant"?: string
}

function HomeLineIcon({ size = 24, strokeWidth = 1.5, style, className, ...rest }: HomeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} className={className} {...rest}>
      <path d={HOME_ROOF_D} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      <path d={HOME_DOOR_D} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function HomeFillIcon({ size = 24, style, className, ...rest }: HomeIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" style={style} className={className} {...rest}>
      <path d={`${HOME_ROOF_D} ${HOME_DOOR_D}z`} />
    </svg>
  )
}

/** The icons the sidebar uses, exported so the shell can build its nav list. */
export const NAV_ICONS = {
  dashboard: { line: HomeLineIcon, fill: HomeFillIcon },
  products: { line: ProductsLinear, fill: ProductsBold },
  analytics: { line: AnalyticsLinear, fill: AnalyticsBold },
  orders: { line: OrdersLinear, fill: OrdersBold },
  onepage: { line: OnePageLinear, fill: OnePageBold },
  storeBuilder: { line: CreatorPageLinear, fill: CreatorPageBold },
  websiteBuilder: { line: WebsiteBuilderLinear, fill: WebsiteBuilderBold },
  emails: { line: EmailsLinear, fill: EmailsBold },
  payouts: { line: PayoutsLinear, fill: PayoutsBold },
} as const satisfies Record<string, NavIconPair>

/**
 * The rows that are not routes — the two unavailable tools and Settings.
 * Kept beside NAV_ICONS rather than inlined so every icon in the rail is
 * declared in one place and none of them can drift out of the family.
 */
export const NAV_ICONS_EXTRA = {
  settings: { line: SettingsLinear, fill: SettingsBold },
  /*
    SCISSORS, NOT A CHAIN LINK — and not by preference.

    RiLinksLine and RiLinksFill are THE SAME PATH. Remix ships a "fill"
    export for that icon that is byte-identical to its line version, so the
    row could never fill: the cross-fade would run and land on the glyph it
    started from. The browser probe caught it by comparing the two path
    strings, which is the only way to catch it — nothing about the types or
    the names says the pair is a pair in name only.

    Scissors has a real filled form, and for a link SHORTENER it is the
    better metaphor anyway.
  */
  communities: { line: PeopleLinear, fill: PeopleBold },
} as const satisfies Record<string, NavIconPair>

/**
 * A 20×20 box with a 20px icon in it.
 *
 * Fixed on both axes and `shrink-0`, so a longer label, a heavier weight or a
 * different icon can never move the text or change the row's width.
 *
 * ---------------------------------------------------------------------------
 *  WHY SOLAR
 * ---------------------------------------------------------------------------
 * Two requirements decide this, and together they rule out most libraries.
 *
 * The row you are on must be FILLED, which needs a real solid variant of the
 * same glyph. Lucide has none — its icons are open strokes, and filling an
 * open path paints the region it implies rather than the glyph. Hugeicons'
 * free set has none either: 6,025 icons, every one of them stroke-rounded,
 * checked before it was ruled out.
 *
 * And the shapes have to be ROUNDED — squircle corners, not the near-square
 * ones Remix draws. Solar builds its corners from wide curves
 * (`M2 12C2 7.28 2 4.93 3.46 3.46`), which is a superellipse, not a small
 * fillet on a square.
 *
 * Its `linear` icons are also genuinely stroked — fill="none", stroke-width
 * 1.5 — so icon weight is a number rather than the overlay trick the previous
 * two libraries forced.
 *
 * Home is Lucide's `House` rather than Solar's — see the note above
 * NAV_ICONS — but it is stroked by the same mechanism: a real stroke, on
 * the same 24-unit box, at the same ICON_STROKE. Nothing about NavIcon
 * below has to know it did not come from Solar.
 *
 * All of this is used HERE ONLY — the rest of the app is Lucide and stays
 * Lucide.
 */
function NavIcon({
  icon,
  active,
  color,
}: {
  icon: NavIconPair
  active: boolean
  color: string
}) {
  const Line = icon.line
  const Fill = icon.fill
  return (
    <span
      data-nav-icon={active ? "filled" : "outline"}
      className="relative flex h-5 w-5 min-w-5 shrink-0 items-center justify-center"
      style={{ color }}
    >
      {/*
        BOTH VARIANTS, STACKED, CROSS-FADED.

        The line and the fill are different paths — `d` changes entirely — and
        there is no way to transition from one path to another in CSS.
        Swapping the component therefore snaps: outline one frame, solid the
        next.

        Rendering both in the same 20×20 box and fading between them gives the
        fill somewhere to come from. Same glyph, same size, same place, so the
        eye reads one icon thickening rather than two icons trading places.
      */}
      <Line
        size={20}
        strokeWidth={ICON_STROKE}
        data-variant="outline"
        style={{ position: "absolute", opacity: active ? 0 : 1, transition: FILL_TRANSITION }}
      />
      <Fill
        size={20}
        data-variant="filled"
        style={{ position: "absolute", opacity: active ? 1 : 0, transition: FILL_TRANSITION }}
      />
    </span>
  )
}

// ── Is this row the page we are on? ─────────────────────────────────────────

/**
 * FROM THE ROUTE, ALWAYS. There is no `selectedItem` state anywhere in here:
 * a second copy of "which page am I on" is a second thing that can be wrong,
 * and it is wrong for exactly as long as it takes to notice.
 */
export function isRouteActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app"
  return pathname === href || pathname.startsWith(`${href}/`)
}

// ── A tooltip that is not the browser's ─────────────────────────────────────

/**
 * Portalled to the body so it is never clipped by the sidebar's own overflow,
 * and positioned from the row's measured box rather than by CSS anchoring,
 * which has no answer in Safari yet.
 */
function ComingSoonTooltip({ anchor }: { anchor: DOMRect | null }) {
  const [shown, setShown] = useState(false)

  // One frame between mount and the visible state, so the transition has a
  // start frame to run from. Setting both in the same commit means no
  // animation at all — the browser only ever sees the end state.
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  if (!anchor || typeof document === "undefined") return null

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: "fixed",
        left: anchor.right + 10,
        top: anchor.top + anchor.height / 2,
        zIndex: 99999,
        pointerEvents: "none",
        background: ACTIVE_TEXT,
        color: "#ffffff",
        fontSize: 12,
        fontWeight: 500,
        borderRadius: 7,
        padding: "5px 8px",
        whiteSpace: "nowrap",
        opacity: shown ? 1 : 0,
        transform: `translateY(-50%) translateX(${shown ? 0 : -4}px)`,
        transition: "opacity 140ms ease, transform 140ms ease",
      }}
    >
      Coming soon
    </div>,
    document.body,
  )
}

/**
 * A row for something that does not exist yet. It is not a link and it does
 * not navigate; hovering it explains why rather than leaving somebody to
 * click a dead item and wonder.
 */
export function ComingSoonItem({
  icon,
  label,
}: {
  icon: NavIconPair
  label: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  return (
    <span
      ref={ref}
      className={cn(ROW, "cursor-default select-none")}
      style={{ color: MUTED_TEXT }}
      onMouseEnter={() => setAnchor(ref.current?.getBoundingClientRect() ?? null)}
      onMouseLeave={() => setAnchor(null)}
    >
      <NavIcon icon={icon} active={false} color={MUTED_TEXT} />
      <span className="whitespace-nowrap">{label}</span>
      {anchor && <ComingSoonTooltip anchor={anchor} />}
    </span>
  )
}

// ── The rows ────────────────────────────────────────────────────────────────

function rowStyle(active: boolean, hovered: boolean) {
  return {
    backgroundColor: active ? ACTIVE_BG : hovered ? HOVER_BG : "transparent",
    color: active ? ACTIVE_TEXT : hovered ? HOVER_TEXT : REST_TEXT,
    fontWeight: active ? ACTIVE_WEIGHT : REST_WEIGHT,
  }
}

/**
 * Hover is state rather than a `:hover` class because the icon and the label
 * have to change colour together, and the icon is a separate element with its
 * own `color`. `group-hover:` would do it in Tailwind, but the three colours
 * then live in three places instead of one.
 */
function useHover() {
  const [hovered, setHovered] = useState(false)
  return {
    hovered,
    handlers: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
      onFocus: () => setHovered(true),
      onBlur: () => setHovered(false),
    },
  }
}

function SubNavItem({
  child,
  onClick,
  onNavigate,
}: {
  child: NavChild
  onClick?: () => void
  onNavigate?: (href: string) => void
}) {
  const pathname = usePathname()
  const active = isRouteActive(pathname, child.href)
  const { hovered, handlers } = useHover()

  return (
    <Link
      href={child.href}
      onClick={() => {
        onNavigate?.(child.href)
        onClick?.()
      }}
      {...handlers}
      className={cn(ROW, "h-[34px] text-[13px]")}
      style={rowStyle(active, hovered)}
    >
      <span className="whitespace-nowrap">{child.label}</span>
    </Link>
  )
}

export function DesktopNavItem({
  item,
  expanded,
  onToggle,
  onNavigate,
  onForceNavigate,
  onPrefetch,
  onItemClick,
}: {
  item: NavItemData
  expanded: boolean
  onToggle: (href: string) => void
  onNavigate?: (href: string) => void
  onForceNavigate: (href: string) => void
  onPrefetch?: (href: string) => void
  onItemClick?: () => void
}) {
  const pathname = usePathname()
  const active = isRouteActive(pathname, item.href)
  const { hovered, handlers } = useHover()
  const style = rowStyle(active, hovered)
  const iconColor = active ? ACTIVE_TEXT : hovered ? HOVER_TEXT : REST_TEXT

  const label = (
    <>
      <NavIcon icon={item.icon} active={active} color={iconColor} />
      <span className="whitespace-nowrap">{item.label}</span>
    </>
  )

  const prefetch = () => {
    if (!item.forceNavigation && !active) onPrefetch?.(item.href)
  }

  if (item.forceNavigation) {
    return (
      <button
        type="button"
        onClick={() => {
          onForceNavigate(item.href)
          onItemClick?.()
        }}
        {...handlers}
        className={cn(ROW, "text-left")}
        style={style}
      >
        {label}
      </button>
    )
  }

  if (item.children && item.children.length > 0) {
    return (
      <div>
        <div className="relative">
          <Link
            href={item.href}
            onClick={() => {
              onNavigate?.(item.href)
              onItemClick?.()
            }}
            onMouseEnter={() => {
              handlers.onMouseEnter()
              prefetch()
            }}
            onMouseLeave={handlers.onMouseLeave}
            onFocus={() => {
              handlers.onFocus()
              prefetch()
            }}
            onBlur={handlers.onBlur}
            className={cn(ROW, "pr-[38px]")}
            style={style}
          >
            {label}
          </Link>
          {/*
            OUTSIDE the link and absolutely placed, in a box of its own size.
            Nested inside it, the chevron shared the link's hit area and every
            width change in the label moved it; as a sibling in a fixed box it
            cannot move and cannot be moved.
          */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggle(item.href)
            }}
            aria-label={expanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
            aria-expanded={expanded}
            className="absolute right-[10px] top-1/2 flex h-5 w-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-[6px]"
            style={{ color: active ? ACTIVE_TEXT : hovered ? HOVER_TEXT : LABEL_TEXT }}
          >
            <AltArrowDownIcon
              size={16}
              style={{
                transformOrigin: "center",
                transform: `rotate(${expanded ? 180 : 0}deg)`,
                transition: "transform 180ms cubic-bezier(0.2, 0, 0, 1)",
              }}
            />
          </button>
        </div>
        <Collapsible open={expanded}>
          <div className="ml-[24px] mt-[2px] space-y-[2px] border-l border-neutral-200 pl-[10px]">
            {item.children.map((child) => (
              <SubNavItem
                key={child.href}
                child={child}
                onClick={onItemClick}
                onNavigate={onNavigate}
              />
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
        onItemClick?.()
      }}
      onMouseEnter={() => {
        handlers.onMouseEnter()
        prefetch()
      }}
      onMouseLeave={handlers.onMouseLeave}
      onFocus={() => {
        handlers.onFocus()
        prefetch()
      }}
      onBlur={handlers.onBlur}
      className={ROW}
      style={style}
    >
      {label}
    </Link>
  )
}

// ── The submenu's height ────────────────────────────────────────────────────

/**
 * `grid-template-rows: 0fr → 1fr`.
 *
 * It animates a true auto height with no measurement, no `scrollHeight` read,
 * and no pinned pixel value to release afterwards — so the submenu cannot be
 * left clipped when its contents change, and an interrupted toggle retargets
 * from wherever it is instead of restarting.
 *
 * `min-height: 0` on the inner row is not optional: a grid item's default
 * `min-height: auto` refuses to shrink below its content and the row never
 * closes.
 */
function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  return (
    <div
      /*
        A hook of its own, so nothing has to guess which element this is.
        The browser probe used to find it with `[aria-hidden]` — which held
        until an icon library arrived that puts aria-hidden on every svg it
        renders, and then the probe measured a 20px icon and reported the
        submenu as open.
      */
      data-nav-submenu={open ? "open" : "closed"}
      aria-hidden={!open}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: "grid-template-rows 200ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease",
      }}
    >
      <div style={{ minHeight: 0, overflow: "hidden" }}>{children}</div>
    </div>
  )
}

// ── The sidebar's own content ───────────────────────────────────────────────

export function DesktopSidebarContent({
  items,
  expandedGroups,
  onToggle,
  onNavigate,
  onForceNavigate,
  onPrefetch,
  toolsLabel,
  communitiesLabel,
  settingsLabel,
  upgradeTitle,
  upgradeSubtitle,
  storeUnpublishedNote,
}: {
  items: NavItemData[]
  expandedGroups: ReadonlySet<string>
  onToggle: (href: string) => void
  onNavigate?: (href: string) => void
  onForceNavigate: (href: string) => void
  onPrefetch?: (href: string) => void
  toolsLabel: string
  communitiesLabel: string
  settingsLabel: string
  upgradeTitle: string
  upgradeSubtitle: string
  storeUnpublishedNote?: string
}) {
  const pathname = usePathname()
  const settingsActive = isRouteActive(pathname, "/app/settings")
  const { hovered: settingsHovered, handlers: settingsHandlers } = useHover()

  return (
    <div className="flex h-full flex-col bg-white font-sans">
      {/*
        NO STROKE OVERLAY ANY MORE, AND THAT IS THE POINT OF THE MOVE.

        Phosphor and Remix both draw a "line" icon as a FILLED PATH shaped
        like a stroke — there is no stroke-width on it to set, so making one
        heavier or lighter meant painting a stroke of the icon's own colour
        over the fill and tuning that. Two libraries, two magic numbers (2.4
        in a 256-unit box, 0.3 in a 24-unit one), and a number that silently
        means something else the moment the library changes.

        A Solar `linear` icon is a REAL stroke: fill="none", stroke-width 1.5.
        The weight is a number on the element, so ICON_STROKE below is the
        whole mechanism and there is nothing to compensate for.
      */}
      {/* px-[7px] — the rows carry their own 14px inner padding, so the
          sidebar's own gutter is only the gap between a row's rounded edge
          and the border. */}
      <nav className="sidebar-nav flex-1 overflow-y-auto px-[7px] py-3">
        <div className="space-y-[2px]">
          {items.map((item) => (
            <DesktopNavItem
              key={item.href}
              item={item}
              expanded={expandedGroups.has(item.href)}
              onToggle={onToggle}
              onNavigate={onNavigate}
              onForceNavigate={onForceNavigate}
              onPrefetch={onPrefetch}
            />
          ))}
        </div>

        <div className="mt-5">
          <p
            className="mb-1 px-[14px] text-[12px] font-semibold uppercase"
            style={{ color: LABEL_TEXT, letterSpacing: "0.02em" }}
          >
            {toolsLabel}
          </p>
          <div className="space-y-[2px]">
            <ComingSoonItem icon={NAV_ICONS_EXTRA.communities} label={communitiesLabel} />
          </div>
        </div>

        {storeUnpublishedNote && (
          <div className="mt-4 rounded-[10px] border border-amber-100/80 bg-amber-50/80 px-3 py-2.5">
            <p className="text-[12px] text-amber-700">{storeUnpublishedNote}</p>
          </div>
        )}
      </nav>

      {/* pb accounts for the iOS home indicator in Capacitor; env() is 0 in a
          browser, so this is a no-op there. */}
      <div className="space-y-2 px-[7px] pb-[calc(0.75rem+env(safe-area-inset-bottom,_0px))]">
        <Link
          href="/app/settings/billing/upgrade"
          className="group flex items-center justify-between rounded-[12px] border border-violet-100/60 bg-gradient-to-r from-violet-50/80 to-purple-50/80 px-[14px] py-3 transition-[background-color,border-color] duration-[140ms] ease-out hover:border-violet-200/70 hover:from-violet-100/80 hover:to-purple-100/80"
        >
          <div>
            <p className="text-[13px] font-semibold text-neutral-900">{upgradeTitle}</p>
            <p className="text-[11px] text-neutral-600">{upgradeSubtitle}</p>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 transition-colors duration-[140ms] ease-out group-hover:bg-gray-200">
            <BoltBold size={14} className="text-violet-500" />
          </div>
        </Link>

        <Link
          href="/app/settings"
          {...settingsHandlers}
          className={ROW}
          style={rowStyle(settingsActive, settingsHovered)}
        >
          <NavIcon
            icon={NAV_ICONS_EXTRA.settings}
            active={settingsActive}
            color={settingsActive ? ACTIVE_TEXT : settingsHovered ? HOVER_TEXT : REST_TEXT}
          />
          <span className="whitespace-nowrap">{settingsLabel}</span>
        </Link>
      </div>
    </div>
  )
}
