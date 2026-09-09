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
 * Phosphor, 20px, resting and filled weights stacked in one box and
 * cross-faded so the fill arrives rather than appears. Every icon sits in a
 * fixed 20×20 box, so nothing an icon does can move the label beside it.
 */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  CaretDown,
  ChartBar,
  Envelope,
  GearSix,
  Globe,
  HouseSimple,
  Lightning,
  LinkSimple,
  Package,
  Receipt,
  Storefront,
  UsersThree,
  Wallet,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react"

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
 * 450, which is a real weight rather than a rounded one.
 *
 * `next/font` loads Inter as a VARIABLE font — the call in app/layout.tsx asks
 * for no specific weights, which is what makes the whole 100–900 axis
 * available. On a static font 450 would snap to 400 or 500 and the difference
 * between a resting row and an active one would be twice what it should be.
 */
/** Long enough to read as a change, short enough not to lag the click. */
const FILL_TRANSITION = "opacity 160ms cubic-bezier(0.2, 0, 0, 1)"

const REST_WEIGHT = 450
const ACTIVE_WEIGHT = 550

export type NavChild = { href: string; label: string }

export type NavItemData = {
  href: string
  label: string
  icon: PhosphorIcon
  /** Leaves the /app router tree, so it cannot be a client-side push. */
  forceNavigation?: boolean
  children?: NavChild[]
}

/** The icons the sidebar uses, exported so the shell can build its nav list. */
/**
 * Simple and geometric rather than descriptive — a house, a parcel, bars, a
 * receipt. At 20px an icon has about a dozen strokes to work with, and the
 * ones that survive that are the ones with a single obvious silhouette.
 */
export const NAV_ICONS = {
  dashboard: HouseSimple,
  products: Package,
  analytics: ChartBar,
  orders: Receipt,
  onepage: Globe,
  storeBuilder: Storefront,
  emails: Envelope,
  payouts: Wallet,
} as const

/**
 * A 20×20 box with a 20px icon in it.
 *
 * Fixed on both axes and `shrink-0`, so a longer label, a heavier weight or a
 * different icon can never move the text or change the row's width.
 *
 * ---------------------------------------------------------------------------
 *  WHY PHOSPHOR AND NOT LUCIDE
 * ---------------------------------------------------------------------------
 * The reference fills the icon of the row you are on — a solid house, a solid
 * chart square. Lucide cannot do that. Its icons are strokes rather than
 * shapes: reading the path data, `store` has four open subpaths, `package`
 * three, `chart-line` two. Handing those to a fill paints the region an open
 * path implies, which is not the glyph. There is no filled variant to switch
 * to, and no combination of stroke width gets you a filled one.
 *
 * Phosphor ships six real weights of every icon, `fill` among them, which is
 * exactly what the reference is showing and what the brief asked for first.
 * It is used HERE ONLY — the rest of the app is Lucide and stays Lucide.
 */
function NavIcon({
  icon: Icon,
  active,
  color,
}: {
  icon: PhosphorIcon
  active: boolean
  color: string
}) {
  return (
    <span
      data-nav-icon={active ? "filled" : "outline"}
      className="relative flex h-5 w-5 min-w-5 shrink-0 items-center justify-center"
      style={{ color }}
    >
      {/*
        BOTH WEIGHTS, STACKED, CROSS-FADED.
        
        A Phosphor weight is a different path — `d` changes entirely — and
        there is no way to transition from one path to another in CSS. Swapping
        the prop therefore snaps: outline one frame, solid the next.

        Rendering both in the same 20×20 box and fading between them gives the
        fill somewhere to come from. They are the same glyph at the same size
        in the same place, so the eye reads one icon thickening rather than two
        icons trading places.
      */}
      <Icon
        size={20}
        weight="regular"
        data-variant="outline"
        style={{ position: "absolute", opacity: active ? 0 : 1, transition: FILL_TRANSITION }}
      />
      <Icon
        size={20}
        weight="fill"
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
  icon: PhosphorIcon
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
            <CaretDown
              size={16}
              weight="bold"
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
  linkShortenerLabel,
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
  linkShortenerLabel: string
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
        A RESTING ICON, ~15% MORE PRONOUNCED.

        Phosphor does not stroke anything — measured, by rendering one: every
        weight is a FILLED PATH describing the shape, `regular` included. So
        there is no `stroke-width` to raise, and the weights it does offer
        jump from regular to bold, which is far more than fifteen per cent.

        A stroke of the icon's own colour laid over the fill thickens every
        edge instead. Phosphor's regular outline is 16 units wide in a 256-unit
        box; a 2.4 stroke adds 1.2 to each side of every edge, which is that
        outline plus fifteen per cent exactly.

        The outline layer only. The filled one is a solid shape, and a stroke
        around it would just make it very slightly bigger.
      */}
      <style>{`
        [data-nav-icon] svg[data-variant="outline"] path {
          stroke: currentColor;
          stroke-width: 2.4;
        }
      `}</style>
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
            <ComingSoonItem icon={LinkSimple} label={linkShortenerLabel} />
            <ComingSoonItem icon={UsersThree} label={communitiesLabel} />
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
            <Lightning size={14} weight="fill" className="text-violet-500" />
          </div>
        </Link>

        <Link
          href="/app/settings"
          {...settingsHandlers}
          className={ROW}
          style={rowStyle(settingsActive, settingsHovered)}
        >
          <NavIcon
            icon={GearSix}
            active={settingsActive}
            color={settingsActive ? ACTIVE_TEXT : settingsHovered ? HOVER_TEXT : REST_TEXT}
          />
          <span className="whitespace-nowrap">{settingsLabel}</span>
        </Link>
      </div>
    </div>
  )
}
