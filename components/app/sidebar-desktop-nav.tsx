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
/*
  ONE ICON FROM ELSEWHERE, AND WHY IT NEEDED TO BE.

  Home is Tabler's `IconHome` / `IconHomeFilled` — a peaked roof, straight
  walls and an arched door notch. Solar has ten houses and every one of them
  is a rounded pentagon with a slot in the middle; none of them is this
  shape, which is the one that was asked for.

  It was Phosphor's `House` first, which is the same silhouette but with
  sharp corners — a pointed roof peak, square door corners. Told directly
  that the icon needed more rounding, raising Phosphor's stroke weight does
  nothing: `regular` is a FILLED PATH shaped like a stroke, not a stroked
  path, so there is no join or cap to round off. The shape itself would have
  to change, which meant a different icon rather than a different setting.

  Tabler draws the same silhouette with `stroke-linecap="round"` and
  `stroke-linejoin="round"` baked into every icon — the roof peak is a
  curve, not a point, and the door is an arch, not a rectangle. That is the
  "more border radius" that was asked for.

  It also removes a whole category of arithmetic the Phosphor version
  needed. Phosphor's regular is a filled path with no stroke-width to set,
  so matching Solar's weight meant painting a stroke of the icon's own
  colour over the fill and solving for an equivalent number (16/256 vs
  1.5/24, both 6.25% of the frame) — and NAV_ICONS carried a `drawn` field
  just to say Home was the one exception. Tabler's IconHome is a REAL
  stroke on the same 24-unit box Solar uses, at the same ICON_STROKE, so it
  takes the exemption's place instead of needing one: one constant, applied
  uniformly, nothing to except.
*/
import { IconHome, IconHomeFilled } from "@tabler/icons-react"

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
import { SettingsIcon as SettingsLinear } from "@solar-icons/react/linear/settings"
import { SettingsIcon as SettingsBold } from "@solar-icons/react/bold/settings"
import { ShopIcon as StoreLinear } from "@solar-icons/react/linear/shop"
import { ShopIcon as StoreBold } from "@solar-icons/react/bold/shop"
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
 * signature because Tabler's icons are `forwardRef` components and Solar's
 * are not; both render from JSX the same way.
 */
type NavIconComponent = React.ComponentType<{
  size?: number
  strokeWidth?: number
  style?: React.CSSProperties
  className?: string
  "data-variant"?: string
}>

export type NavIconPair = { line: NavIconComponent; fill: NavIconComponent }

/** The icons the sidebar uses, exported so the shell can build its nav list. */
export const NAV_ICONS = {
  dashboard: { line: IconHome, fill: IconHomeFilled },
  products: { line: ProductsLinear, fill: ProductsBold },
  analytics: { line: AnalyticsLinear, fill: AnalyticsBold },
  orders: { line: OrdersLinear, fill: OrdersBold },
  onepage: { line: OnePageLinear, fill: OnePageBold },
  storeBuilder: { line: StoreLinear, fill: StoreBold },
  emails: { line: EmailsLinear, fill: EmailsBold },
  payouts: { line: PayoutsLinear, fill: PayoutsBold },
} as const satisfies Record<string, NavIconPair>

/**
 * The rows that are not routes — the two unavailable tools and Settings.
 * Kept beside NAV_ICONS rather than inlined so every icon in the rail is
 * declared in one place and none of them can drift out of the family.
 */
const NAV_ICONS_EXTRA = {
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
 * Home is the one icon from elsewhere (Tabler, for the roof-and-door shape
 * Solar does not have — see the note by its import) but it is drawn by the
 * same mechanism: a real stroke, on the same 24-unit box, at the same
 * ICON_STROKE. Nothing about NavIcon below has to know it came from
 * somewhere else.
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
