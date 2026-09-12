"use client"

// ============================================================
// Storelib Theme Engine — HeaderSection
// Extracted from SectionRenderer.tsx (Stage 2 refactor).
// Contains: MobileNavItem type,
// HeaderMobileNavDrawer, MobileDrawerInner, HeaderSection.
// These are tightly coupled — the drawers are only used by
// HeaderSection — so they all live in this file together.
// Behaviour is identical to the inline version they replaced.
// ============================================================

import {
  ChevronDown, ChevronLeft, ChevronRight,
  Heart, Menu, User, X,
} from "lucide-react"
import { useState, useEffect, useRef, useLayoutEffect, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { ThemeSocials } from "../../theme/ThemeSocials"
import { cn } from "@/lib/utils"
import { getMainDomain } from "@/lib/url-helpers"
import type { ColorSchemeKey, ColorSchemeValues } from "@/lib/website-builder/types"
import {
  type SectionProps,
  resolveScheme,
  str,
  bool,
  hexToRgba,
  buttonRadiusStyle,
  SectionWrapper,
} from "../_shared"

// ── Header color schemes ─────────────────────────────────────
type HeaderColorScheme = ColorSchemeKey

type MobileNavItem = {
  id: string
  label: string
  href: string
  openInNew: boolean
  children?: MobileNavItem[]
}

function HeaderMobileNavDrawer({
  open,
  onClose,
  items,
  scheme,
  scopedToPreview,
  onEditorNavigate,
  showAccount,
  showWishlist,
}: {
  open: boolean
  onClose: () => void
  items: MobileNavItem[]
  scheme: ColorSchemeValues
  scopedToPreview?: boolean
  onEditorNavigate?: (href: string) => void
  showAccount?: boolean
  showWishlist?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // Keep the drawer permanently in the DOM once it has mounted — it starts
  // off-screen at translateX(-101%) and only the `open` prop flips the
  // transform. That means the very first click from the hamburger plays
  // the transition cleanly (no RAF gymnastics, no mount/unmount jank).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    // Only lock body scroll when not scoped — otherwise the editor page locks
    let prev: string | null = null
    if (!scopedToPreview) {
      prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
    }
    return () => {
      window.removeEventListener("keydown", onKey)
      if (!scopedToPreview && prev !== null) document.body.style.overflow = prev
    }
  }, [open, onClose, scopedToPreview])

  if (!mounted) return null
  const target: HTMLElement | null = scopedToPreview
    ? (document.getElementById("wb-preview-root") ?? document.body)
    : document.body
  if (!target) return null

  const positionClass = scopedToPreview ? "absolute" : "fixed"
  // Filter out empty/placeholder items so the drawer only shows real links
  const visibleItems = items.filter(it => it.label && it.label.trim().length > 0)

  // Use different easing/duration for open vs close — open is a smooth
  // deceleration (iOS-style spring), close is a quicker ease-in so it
  // feels snappy and intentional rather than slow.
  const drawerTransition = open
    ? "transform 360ms cubic-bezier(0.32, 0.72, 0, 1)"
    : "transform 260ms cubic-bezier(0.4, 0, 1, 1)"
  const backdropTransition = open
    ? "opacity 300ms cubic-bezier(0.32, 0.72, 0, 1)"
    : "opacity 220ms cubic-bezier(0.4, 0, 0.6, 1)"

  const drawer = (
    <MobileDrawerInner
      open={open}
      onClose={onClose}
      visibleItems={visibleItems}
      scheme={scheme}
      positionClass={positionClass}
      onEditorNavigate={onEditorNavigate}
      scopedToPreview={!!scopedToPreview}
      drawerTransition={drawerTransition}
      backdropTransition={backdropTransition}
      showAccount={!!showAccount}
      showWishlist={!!showWishlist}
    />
  )

  return createPortal(drawer, target)
}

// Inner render — kept as its own component so the expanded-submenu state
// (useState) lives here rather than in the outer drawer, keeping the parent
// portal logic clean.
function MobileDrawerInner({
  open,
  onClose,
  visibleItems,
  scheme,
  positionClass,
  onEditorNavigate,
  scopedToPreview,
  drawerTransition,
  backdropTransition,
  showAccount,
  showWishlist,
}: {
  open: boolean
  onClose: () => void
  visibleItems: MobileNavItem[]
  scheme: ColorSchemeValues
  positionClass: string
  onEditorNavigate?: (href: string) => void
  scopedToPreview: boolean
  drawerTransition: string
  backdropTransition: string
  showAccount: boolean
  showWishlist: boolean
}) {
  // Active submenu id — null means we're on the ROOT menu. When an item
  // with children is tapped this flips to that item's id and the drawer
  // slides to a sub-page showing just that item's children (iOS-style).
  // The back button on the sub-page returns us to the root by clearing it.
  const [activeSubmenuId, setActiveSubmenuId] = useState<string | null>(null)
  // Reset to root whenever the drawer closes so reopening always starts
  // fresh on the main menu.
  useEffect(() => {
    if (!open) {
      // Delay slightly so the reset happens AFTER the drawer has started
      // sliding off-screen — otherwise the user briefly sees the root
      // menu snap back into view during the close animation.
      const t = window.setTimeout(() => setActiveSubmenuId(null), 280)
      return () => window.clearTimeout(t)
    }
  }, [open])
  const activeSubmenuItem = activeSubmenuId
    ? visibleItems.find(i => i.id === activeSubmenuId) ?? null
    : null
  const inSubmenu = !!activeSubmenuItem

  const handleLinkClick = (href: string) => (e: React.MouseEvent) => {
    if (onEditorNavigate) {
      e.preventDefault()
      e.stopPropagation()
      onEditorNavigate(href)
    }
    onClose()
  }

  return (
    <>
      {/* Backdrop — spans the ENTIRE viewport (top:0) so the drawer and
          overlay fully cover the sticky header when opened. */}
      <div
        aria-hidden
        onClick={onClose}
        className={cn(positionClass, "left-0 right-0 top-0 bottom-0 z-[90] bg-black/50")}
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: backdropTransition,
          willChange: "opacity",
        }}
      />
      <aside
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
        className={cn(
          positionClass,
          "left-0 top-0 bottom-0 z-[95] flex flex-col",
          open && "shadow-2xl",
          scopedToPreview ? "w-[82%] max-w-[320px]" : "w-[85vw] max-w-[360px]",
        )}
        style={{
          background: scheme.bg,
          color: scheme.heading,
          transform: open ? "translateX(0)" : "translateX(-101%)",
          transition: drawerTransition,
          willChange: "transform",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Header bar: back button + title + X close.
            On the ROOT menu: "Menu" title, back button hidden.
            Inside a submenu: back button appears on the left, title is
            the submenu's label — exactly like the iOS Settings app. */}
        <div
          className="flex items-center px-3 h-[60px] shrink-0 gap-1"
          style={{ background: "#0f0f10", color: "#ffffff" }}
        >
          {/* Back button — mounted but invisible/non-interactive on root
              so the title's position stays stable during the slide. */}
          <button
            type="button"
            onClick={() => setActiveSubmenuId(null)}
            aria-label="Back to main menu"
            className={cn(
              "h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-all text-white",
              inSubmenu ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
            style={{
              transition: "opacity 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={2} />
          </button>
          <span className="flex-1 text-[18px] font-semibold truncate px-1">
            {inSubmenu ? activeSubmenuItem!.label : "Menu"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-white"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable link list — uses a 2-track slide. The ROOT pane and
            the SUBMENU pane live side-by-side inside a 200%-wide rail;
            switching views just translates the rail by -50%. This is the
            exact pattern iOS uses for drill-down navigation and keeps
            animation work on the GPU. */}
        <nav
          className="flex-1 relative overflow-hidden"
          style={{ overscrollBehavior: "contain" }}
        >
          <div
            className="absolute inset-0 flex"
            style={{
              width: "200%",
              transform: inSubmenu ? "translateX(-50%)" : "translateX(0%)",
              transition: "transform 340ms cubic-bezier(0.32, 0.72, 0, 1)",
              willChange: "transform",
            }}
          >
            {/* ── Pane 1: ROOT menu ── */}
            <div
              className="w-1/2 h-full overflow-y-auto"
              aria-hidden={inSubmenu}
              style={{ overscrollBehavior: "contain" }}
            >
              {visibleItems.map((item, idx) => {
                const hasChildren = !!item.children && item.children.length > 0
                return (
                  <div key={item.id} className={cn(idx > 0 && "border-t border-black/10")}>
                    {hasChildren ? (
                      <button
                        type="button"
                        onClick={() => setActiveSubmenuId(item.id)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-black/5 transition-colors"
                        style={{ color: scheme.nav_link }}
                        aria-haspopup="menu"
                      >
                        <span className="text-[17px] font-semibold">{item.label}</span>
                        <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2} />
                      </button>
                    ) : (
                      <a
                        href={item.href}
                        target={item.openInNew ? "_blank" : undefined}
                        rel={item.openInNew ? "noopener noreferrer" : undefined}
                        onClick={handleLinkClick(item.href)}
                        className="flex items-center justify-between px-5 py-4 hover:bg-black/5 transition-colors"
                        style={{ color: scheme.nav_link }}
                      >
                        <span className="text-[17px] font-semibold">{item.label}</span>
                      </a>
                    )}
                  </div>
                )
              })}
            </div>

            {/* ── Pane 2: SUBMENU content ──
                Renders the currently-active submenu's children. We keep
                this pane mounted even when inactive so the slide-out
                animation has something to slide toward. */}
            <div
              className="w-1/2 h-full overflow-y-auto"
              aria-hidden={!inSubmenu}
              style={{ overscrollBehavior: "contain" }}
            >
              {activeSubmenuItem?.children?.map((child, idx) => (
                <a
                  key={child.id}
                  href={child.href}
                  target={child.openInNew ? "_blank" : undefined}
                  rel={child.openInNew ? "noopener noreferrer" : undefined}
                  onClick={handleLinkClick(child.href)}
                  className={cn(
                    "flex items-center justify-between px-5 py-4 hover:bg-black/5 transition-colors",
                    idx > 0 && "border-t border-black/10",
                  )}
                  style={{ color: scheme.nav_link }}
                >
                  <span className="text-[17px] font-semibold">{child.label}</span>
                  <ChevronRight className="h-[18px] w-[18px] opacity-40" strokeWidth={2} />
                </a>
              ))}
            </div>
          </div>
        </nav>

        {/* ── Account + Wishlist row ──
            Sits ABOVE the currency/language row. Only renders when at least
            one icon is enabled so the drawer doesn't grow a dead divider
            when both are off.
            Alignment rules (per spec):
              • Account only            → Log In LEFT
              • Wishlist only           → Wishlist LEFT
              • Both account + wishlist → Log In LEFT, Wishlist RIGHT
            We render a single row with `justify-between` and conditionally
            place each element on the correct side. */}
        {(showAccount || showWishlist) && (
          <div
            className="border-t border-black/10 px-5 py-3 flex items-center justify-between shrink-0"
            style={{ background: scheme.bg }}
          >
            {/* LEFT slot */}
            {showAccount ? (
              /**
               * `/login` was relative, which on a creator's own address is a
               * page of their site rather than Storelib's sign-in: it was
               * rewritten to /w/<name>/login and answered 404. The session
               * lives on the platform, so the link does too.
               */
              <a
                href={`https://${getMainDomain()}/login`}
                onClick={onEditorNavigate ? (e) => e.preventDefault() : () => onClose()}
                className="flex items-center gap-2 text-[15px] font-semibold hover:opacity-70 transition-opacity"
                style={{ color: scheme.nav_link }}
              >
                <User className="h-5 w-5" strokeWidth={1.8} />
                <span>Log In</span>
              </a>
            ) : (
              // Wishlist-only case: wishlist goes on the LEFT.
              <a
                href={`https://${getMainDomain()}/wishlist`}
                aria-label="Wishlist"
                onClick={onEditorNavigate ? (e) => e.preventDefault() : undefined}
                className="relative h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors -ml-2"
              >
                {/* No count badge. It was the character "0", written into the
                    markup: a number that was never anything else. */}
                <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} style={{ color: scheme.nav_link }} />
              </a>
            )}
            {/* RIGHT slot — only when BOTH are on so wishlist moves to the right */}
            {showAccount && showWishlist ? (
              <a
                href={`https://${getMainDomain()}/wishlist`}
                aria-label="Wishlist"
                onClick={onEditorNavigate ? (e) => e.preventDefault() : undefined}
                className="relative h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors -mr-2"
              >
                <Heart className="h-[22px] w-[22px]" strokeWidth={1.8} style={{ color: scheme.nav_link }} />
              </a>
            ) : (
              // Empty right slot so `justify-between` keeps the left element
              // flush to the edge instead of centring it.
              <span aria-hidden />
            )}
          </div>
        )}

      </aside>
    </>
  )
}

// NOTE: The mobile drawer's currency + language selectors were removed
// entirely at user request. The drawer now ends at the nav list / footer
// icons — no trigger row, no expanding panel, no state.


export function HeaderSection({ section, theme, isEditing, isSelected, onClick, deviceMode, wrapperId, onEditorNavigate, canvasRoundedTopPx, insideEditor }: SectionProps) {
  // Treat ANY presence of `onEditorNavigate` as "we're inside the editor",
  // as a safety-net fallback for call sites that haven't yet been updated
  // to pass `insideEditor` explicitly. The website-builder editor is the
  // ONLY consumer that ever sets `onEditorNavigate`.
  const renderingInsideEditor = insideEditor ?? !!onEditorNavigate
  const s = section.settings
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Resolve color scheme (falls back to explicit bg/text colors if still set)
  const schemeKey = (str(s.color_scheme, "white") as HeaderColorScheme)
  const scheme = resolveScheme(theme, schemeKey)
  /**
   * `header_transparent` is the control the panel offers; `transparent_on_hero`
   * is what it used to be called. Headers saved under the old name are still
   * out there, so it stays as the FALLBACK — read only when the current
   * control has never been set. It was a second primary read before, which
   * meant a creator turning the toggle off could not turn transparency off.
   */
  const transparent = bool(s.header_transparent, bool(s.transparent_on_hero, false))
  // We approximate this by using transparent background only when the toggle is on
  // — the consumer (page renderer) wraps the header above the hero in those cases.
  const bg = transparent ? "transparent" : scheme.bg
  const textColor = scheme.heading
  const navLinkColor = scheme.nav_link
  const borderColor = scheme.inset_border

  const layout = str(s.header_layout, "logo_left_nav_right")
  const showAccount = s.show_account_icon !== false
  const showWishlist = s.show_wishlist_icon !== false
  // Hover style for desktop menu links — mirrors the select in Header Settings.
  // Values: "inherit" | "none" | "underline" | "underline_reverse" | "fade_siblings"
  const menuHoverStyle = str(s.menu_link_hover_style, "inherit")
  // Header width — 3 real, working options for desktop screens + a full-width
  // edge-to-edge option. The number is a max-width cap applied to the
  // INNER container on `md:` and above, so on mobile the layout never
  // feels cramped. `legacy fields:` `max_width` and "fixed" both fall
  // through to sensible caps for backwards compat with older themes.
  //   narrow  — 960px  (compact, text-focused stores)
  //   medium  — 1140px (balanced default for most stores)
  //   wide    — 1280px (roomy for big hero imagery & dense nav)
  //   full    — no cap (edge-to-edge)
  const headerWidthRaw = str(s.header_width, str(s.max_width, "wide"))
  const headerWidthMaxPx: number | null =
    headerWidthRaw === "narrow" ? 960 :
    headerWidthRaw === "medium" ? 1140 :
    headerWidthRaw === "wide"   ? 1280 :
    headerWidthRaw === "fixed"  ? 1280 : // legacy alias
    null // "full"
  const isFixedWidth = headerWidthMaxPx !== null
  // Sticky header — honour new fields with legacy fallbacks.
  //   header_sticky_enabled       — master toggle
  //   header_sticky_on_scroll_up  — only reveal when scrolling up
  //   legacy: header_fixed / sticky
  const headerStickyEnabled = bool(
    s.header_sticky_enabled,
    bool(s.header_fixed, bool(s.sticky, true)),
  )
  const headerStickyOnScrollUp = bool(s.header_sticky_on_scroll_up, false)
  // Back-compat alias used further down
  const headerFixed = headerStickyEnabled

  // ── Scroll-aware sticky header ────────────────────────────────
  // SIMPLE + SMOOTH. The earlier three-state Glozin port was buggy in the
  // editor (it gated sticky on `stickyActive`, but the scroll target lookup
  // ran before the ref attached so `window` got the listener instead of
  // `#wb-preview-root` — result: sticky never activated inside the editor
  // and "blocked" on scroll-up). We're back to the proven two-state model:
  //
  //   • sticky is ALWAYS on when `headerStickyEnabled` — no activation gate
  //   • `stickyVisible === false` slides the header up 100% (only when
  //     `headerStickyOnScrollUp` is also true AND we're past 80px)
  //
  // Scroll-direction detection uses a 4px hysteresis so sub-pixel momentum
  // trackpad scroll doesn't flicker the state. The reveal/hide transition
  // uses Glozin's fadeInSticky curve (see `hideTransition` below).
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  THE REVEAL IS DRIVEN FROM THE SCROLL EVENT, NOT FROM REACT STATE
   * ═══════════════════════════════════════════════════════════════════════
   *
   * It used to be `useState` + a style prop, and that is what made it flash.
   * Scrolling is handled on the compositor; a React state update is a render,
   * a reconcile and a commit later. Flick to the top and for those few frames
   * the page has already arrived while the header is still holding
   * `translateY(-100%)` — displaced up over the announcement bar with its own
   * sticky space left empty underneath. That is the white band, for exactly as
   * long as the render lag, which is why it reads as a millisecond flicker
   * rather than as a layout bug.
   *
   * Written straight to the node instead, in the scroll handler, so the header
   * moves on the same tick as the scroll that moved it. It also means the
   * header no longer re-renders on scroll at all.
   *
   * AND THE HIDDEN STATE CANNOT OUTLIVE BEING PINNED. `hidden && pinned` is
   * the value applied, not `hidden` — so there is no ordering between two
   * pieces of state to get wrong, and no frame in which an unpinned header is
   * translated. That was the previous fix's remaining hole: the gate decided
   * when to CHANGE `hidden`, but the transform still rendered from `hidden`
   * alone.
   *
   * The transition stays ON while pinned, which is the smooth reveal, and is
   * off only while unpinned — where there is nothing to travel, because the
   * header is never translated there.
   */
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const clear = () => {
      el.style.transform = ""
      el.style.transition = ""
      el.style.pointerEvents = ""
    }
    if (!headerStickyOnScrollUp) {
      clear()
      return
    }

    const target = ((): HTMLElement | Window => {
      if (!renderingInsideEditor) return window
      const preview = typeof document !== "undefined" ? document.getElementById("wb-preview-root") : null
      if (preview) return preview
      let node: HTMLElement | null = scrollAnchorRef.current
      while (node) {
        const oy = window.getComputedStyle(node).overflowY
        if ((oy === "auto" || oy === "scroll") && node.scrollHeight > node.clientHeight) return node
        node = node.parentElement
      }
      return window
    })()

    const getY = () => (target === window ? window.scrollY : (target as HTMLElement).scrollTop)

    /**
     * How far down the page the header's own box sits — the announcement bar's
     * height, plus anything else above it. `offsetTop` and not
     * `getBoundingClientRect().top`, because the rect is displaced by the very
     * transform this decides whether to apply.
     */
    /**
     * WHERE THE HEADER'S BOX SITS IN THE SCROLLING CONTENT.
     *
     * This used to walk `offsetParent`, and that is wrong inside the editor:
     * `offsetParent` SKIPS ancestors that are not positioned, so the walk never
     * reaches `#wb-preview-root` and instead accumulates the editor page's own
     * offsets. `settled` came out enormous, `mayMove` was never true, and the
     * header simply never hid — the reveal looked like it was not implemented.
     *
     * Rects instead, which are the same in both surfaces. The catch is that a
     * PINNED header reports a top of zero, so measuring then would say the box
     * lives wherever you have scrolled to. So the sample is only taken when the
     * header is demonstrably NOT pinned — its top still below the container's,
     * or the scroller at rest — and the last good value is kept otherwise. The
     * first sample is taken on mount, at whatever position the page loads at.
     */
    const containerTop = () => (target === window ? 0 : (target as HTMLElement).getBoundingClientRect().top)
    let origin = 0
    const sampleOrigin = () => {
      const rel = el.getBoundingClientRect().top - containerTop()
      const y = getY()
      if (rel > 1 || y <= 1) origin = Math.max(0, y + rel)
    }

    const REVEAL = "transform 350ms cubic-bezier(0.22, 0.61, 0.36, 1)"
    const apply = (hide: boolean, pinned: boolean) => {
      el.style.transition = pinned ? REVEAL : "none"
      el.style.transform = hide ? "translateY(-100%)" : "translateY(0)"
      el.style.pointerEvents = hide ? "none" : ""
    }

    let lastY = getY()
    let hidden = false
    apply(false, false)
    sampleOrigin()

    const onScroll = () => {
      const y = getY()

      /**
       * A HEADER'S HEIGHT OF CLEARANCE BEFORE IT MAY MOVE AT ALL.
       *
       * The previous gate was `y >= origin - 1`: one pixel of slack, which is
       * none. Un-pinning is done by the BROWSER, natively, as the scroll
       * happens; the transform is applied by US, from a scroll event. Right at
       * the origin those two disagree for a frame or more — the browser has let
       * the header drop back to its place while the transform still holds it
       * up — and the header is drawn off its own box with the gap underneath
       * showing the page background. Filmed at 60fps it is a white band under
       * the header that grows toward the announcement bar's height and then
       * snaps shut.
       *
       * The fix is clearance, not precision. Below `origin + height` the header
       * is FORCED to `translateY(0)` with no transition, so by the time the
       * browser is anywhere near un-pinning it, there has been no transform on
       * the element for a whole header's worth of scrolling. Above it, the
       * header is unambiguously pinned and free to animate.
       *
       * Read fresh each time: both the announcement bar's height and the
       * header's own are settings, and a header that measured itself once at
       * mount is a header that is wrong after the first edit.
       */
      sampleOrigin()
      const settled = origin + el.offsetHeight
      const mayMove = y >= settled

      if (!mayMove) hidden = false
      else if (y > lastY + 4) hidden = true
      else if (y < lastY - 4) hidden = false
      lastY = y
      apply(hidden && mayMove, mayMove)
    }

    target.addEventListener("scroll", onScroll as EventListener, { passive: true })
    return () => {
      target.removeEventListener("scroll", onScroll as EventListener)
      clear()
    }
  }, [renderingInsideEditor, headerStickyEnabled, headerStickyOnScrollUp])
  const transparentOnHero = transparent
  // A control at last, rather than a value nobody could set. Read by the
  // default "logo left, nav right" layout.
  const navAlignment = str(s.nav_alignment, "right")

  const paddingVw = Number.isFinite(Number(s.vertical_padding_vw))
    ? Number(s.vertical_padding_vw)
    : 1.2
  const linkSpacingVw = Number.isFinite(Number(s.link_spacing_vw))
    ? Number(s.link_spacing_vw)
    : 1.4

  const forceMobile = deviceMode === "mobile"
  const hasDeviceMode = !!deviceMode

  /**
   * THE STORE'S LOGO, WHEREVER IT WAS UPLOADED.
   *
   * The theme's Branding group has a logo image and a logo width, and the
   * header read neither — it only looked at its own `logo_url`. A creator who
   * uploaded their logo under Branding, which is where you would look for it,
   * got the store name in text and no explanation.
   */
  const branding = theme as Record<string, unknown>
  const headerLogo = str(s.logo_url) || str(branding.logo_url)
  const logoMaxWidth = Number(branding.logo_width) || undefined

  const mobileLogoSrc = s.use_mobile_logo && s.mobile_logo_url ? str(s.mobile_logo_url) : headerLogo
  const mobileLogoH = s.use_mobile_logo && s.mobile_logo_url ? (Number(s.mobile_logo_height) || 32) : (Number(s.logo_height) || 64)
  const desktopLogoH = Number(s.logo_height) || 64

  // Custom logo horizontal position — desktop & mobile (separate)
  const desktopLogoOffsetEnabled = bool(s.logo_horizontal_offset_enabled, false)
  const desktopLogoOffsetPx = Number.isFinite(Number(s.logo_horizontal_offset_px))
    ? Number(s.logo_horizontal_offset_px)
    : 0
  const mobileLogoOffsetEnabled = bool(s.mobile_logo_horizontal_offset_enabled, false)
  const mobileLogoOffsetPx = Number.isFinite(Number(s.mobile_logo_horizontal_offset_px))
    ? Number(s.mobile_logo_horizontal_offset_px)
    : 0

  const desktopLogoTransform = desktopLogoOffsetEnabled && desktopLogoOffsetPx !== 0
    ? `translateX(${desktopLogoOffsetPx}px)`
    : undefined
  const mobileLogoTransform = mobileLogoOffsetEnabled && mobileLogoOffsetPx !== 0
    ? `translateX(${mobileLogoOffsetPx}px)`
    : undefined

  const renderLogo = () => {
    if (!headerLogo) {
      return (
        <span
          className="text-[17px] font-bold whitespace-nowrap"
          style={{
            color: textColor,
            fontFamily: str(s.logo_font, "inherit"),
            transform: forceMobile ? mobileLogoTransform : desktopLogoTransform,
          }}
        >
          {str(s.logo_text, theme.brand_name ?? "My Store")}
        </span>
      )
    }
    if (hasDeviceMode) {
      return (
        <img
          src={forceMobile ? mobileLogoSrc : headerLogo}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain"
          style={{
            height: `${forceMobile ? mobileLogoH : desktopLogoH}px`,
            maxWidth: logoMaxWidth ? `${logoMaxWidth}px` : undefined,
            transform: forceMobile ? mobileLogoTransform : desktopLogoTransform,
          }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      )
    }
    return (
      <>
        <img
          src={headerLogo}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain hidden md:block"
          style={{ height: `${desktopLogoH}px`, maxWidth: logoMaxWidth ? `${logoMaxWidth}px` : undefined, transform: desktopLogoTransform }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <img
          src={mobileLogoSrc}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain md:hidden"
          style={{ height: `${mobileLogoH}px`, maxWidth: logoMaxWidth ? `${logoMaxWidth}px` : undefined, transform: mobileLogoTransform }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </>
    )
  }

  // Default nav links fallback (Home / Shop / About / Contact)
  const DEFAULT_NAV_BLOCKS: { id: string; type: string; settings: Record<string, unknown> }[] = [
    { id: "nav-home",    type: "nav_link", settings: { label: "Home",    url: "/",        link_type: "custom" } },
    { id: "nav-shop",    type: "nav_link", settings: { label: "Shop",    url: "/shop",    link_type: "custom" } },
    { id: "nav-about",   type: "nav_link", settings: { label: "About",   url: "/about",   link_type: "custom" } },
    { id: "nav-contact", type: "nav_link", settings: { label: "Contact", url: "/contact", link_type: "custom" } },
  ]
  const navBlocks = (section.blocks && section.blocks.length > 0) ? section.blocks : DEFAULT_NAV_BLOCKS

  const resolveHref = (block: { settings: Record<string, unknown> }): string => {
    const linkType = str(block.settings.link_type, "custom")
    const url = str(block.settings.url, "")
    const targetId = str(block.settings.target_id, "")
    if (linkType === "product" && targetId) return `/products/${targetId}`
    // No "collection": there is no collection in this product, so the option
    // is gone from the control and a link saved under it before now has
    // nothing to point at. It falls through to whatever URL it carries.
    if (linkType === "page" && targetId) return `/${targetId}`
    if (linkType === "blog" && targetId) return `/blog/${targetId}`
    if (linkType === "blog_post" && targetId) return `/blog/${targetId}`
    return url || "#"
  }

  // Group nav blocks: root items + children keyed by parent id.
  const rootNavBlocks = navBlocks.filter(b => !(b.settings?.parent_id))
  const childrenByParent: Record<string, typeof navBlocks> = {}
  navBlocks.forEach(b => {
    const pid = b.settings?.parent_id as string | undefined
    if (pid) {
      if (!childrenByParent[pid]) childrenByParent[pid] = []
      childrenByParent[pid].push(b)
    }
  })

  // Hover classes — applied to the <span> that wraps the label TEXT inside
  // each anchor. Wrapping text in a span (instead of styling the anchor
  // directly) guarantees `hover:underline` and `hover:scale` render reliably
  // even when the anchor itself is `inline-flex` (required for the chevron
  // to sit to the right of the label). `fade_siblings` is handled at the
  // nav level via `:has()` so this returns an empty string.
  //
  // All styles are tuned to be SUBTLE, SMOOTH and MINIMAL — short easing,
  // light underline weight, small scale.
  const hoverClassFor = (style: string): string => {
    switch (style) {
      case "none":
        return ""
      case "underline":
        return "relative after:absolute after:left-0 after:right-0 after:-bottom-[3px] after:h-[1.5px] after:bg-current after:scale-x-0 after:origin-left hover:after:scale-x-100 after:transition-transform after:duration-[280ms] after:ease-[cubic-bezier(0.22,1,0.36,1)]"
      case "underline_reverse":
        return "relative after:absolute after:left-0 after:right-0 after:-bottom-[3px] after:h-[1.5px] after:bg-current after:scale-x-100 after:origin-right hover:after:scale-x-0 after:transition-transform after:duration-[280ms] after:ease-[cubic-bezier(0.22,1,0.36,1)]"
      case "fade_siblings":
        // Siblings fade is applied at the nav-level via :has(). Individual
        // link keeps full opacity on hover so it pops.
        return ""
      case "inherit":
      default:
        return "transition-opacity duration-200 hover:opacity-60"
    }
  }
  const hoverLabelClass = hoverClassFor(menuHoverStyle)

  const renderNavLinks = () => {
    if (!rootNavBlocks.length) return null
    return rootNavBlocks.map(block => {
      const openInNew = bool(block.settings.open_in_new_tab, false)
      const href = resolveHref(block)
      const label = str(block.settings.label)
      const kids = childrenByParent[block.id] ?? []
      const hasChildren = kids.length > 0

      const linkAnchor = (
        <a
          href={href}
          target={openInNew ? "_blank" : undefined}
          rel={openInNew ? "noopener noreferrer" : undefined}
          className="text-[14px] font-medium whitespace-nowrap inline-flex flex-row items-center gap-1.5 leading-none align-middle"
          style={{ color: navLinkColor }}
          /**
           * Intercepted whenever this header is INSIDE THE EDITOR, not only
           * while the inspector is on. `onEditorNavigate` is only ever passed
           * by the editor, so its presence is the test. Gated on `isEditing`,
           * a nav link with the inspector off was a real anchor to "/" — which
           * in the editor's own document is storelib.com, not the site being
           * built. Home took people out of the builder.
           */
          onClick={e => {
            if (onEditorNavigate) {
              e.preventDefault()
              e.stopPropagation()
              onEditorNavigate(href)
            }
          }}
        >
          {/* Label — hover styles apply to this span so they render reliably
              regardless of the anchor's flex layout. */}
          <span className={cn("inline-block", hoverLabelClass)}>{label}</span>
          {hasChildren && (
            <ChevronDown
              className="h-[14px] w-[14px] shrink-0 translate-y-[0.5px] transition-transform duration-200 group-hover/navitem:rotate-180"
              strokeWidth={2}
              aria-hidden
            />
          )}
        </a>
      )

      // Hide on mobile shells.
      const visibilityClass = cn(
        hasDeviceMode && forceMobile ? "hidden" : "",
        !hasDeviceMode && "hidden md:inline-block",
      )

      if (!hasChildren) {
        return (
          <span key={block.id} className={cn("inline-block", visibilityClass)}>
            {linkAnchor}
          </span>
        )
      }

      // With children: wrap in a `group/navitem` container, render dropdown.
      return (
        <div
          key={block.id}
          className={cn(
            "relative group/navitem",
            visibilityClass,
          )}
        >
          {linkAnchor}
          {/* Hover bridge — prevents the dropdown from closing when the
              cursor travels from the trigger into the panel. */}
          <div aria-hidden className="absolute left-0 right-0 top-full h-2" />
          {/* Dropdown panel */}
          <div
            role="menu"
            className={cn(
              // Dropdown z-index MUST be higher than every section below
              // (which sit at `isolate` / z:auto). We use z-[70] so the panel
              // paints over hero/image/product sections that render with
              // their own internal z-10 overlays. The header's own sticky
              // wrapper sits at z-[60] (below the drawer at z-[90]/[95]),
              // and because the dropdown lives inside that stacking context
              // its effective paint order vs. outside siblings = z-[60] —
              // still comfortably above all non-sticky section content.
              "absolute left-0 top-full mt-2 min-w-[200px] rounded-xl shadow-xl ring-1 ring-black/5 bg-white py-2 z-[70]",
              "opacity-0 translate-y-1 pointer-events-none",
              "group-hover/navitem:opacity-100 group-hover/navitem:translate-y-0 group-hover/navitem:pointer-events-auto",
              "transition-[opacity,transform] duration-200 ease-out",
            )}
          >
            {kids.map(child => {
              const childHref = resolveHref(child)
              const childOpenInNew = bool(child.settings.open_in_new_tab, false)
              return (
                <a
                  key={child.id}
                  href={childHref}
                  target={childOpenInNew ? "_blank" : undefined}
                  rel={childOpenInNew ? "noopener noreferrer" : undefined}
                  className="block px-4 py-2 text-[13.5px] font-medium text-gray-800 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  onClick={e => {
                    if (onEditorNavigate) {
                      e.preventDefault()
                      e.stopPropagation()
                      onEditorNavigate(childHref)
                    }
                  }}
                >
                  {str(child.settings.label)}
                </a>
              )
            })}
          </div>
        </div>
      )
    })
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  THERE IS NO CART, SO THERE IS NO CART ICON
   * ═════════════════════════════════════════════════════════════════════════
   * The header carried a shopping bag, a count badge, a subtotal and a
   * slide-out drawer. Nothing ever put anything in any of them: the count
   * came from a `window` event no code dispatches, the drawer said "your
   * cart is empty" because it could say nothing else, and the "Page" style
   * sent people to /cart, which is not a route anywhere in this product.
   * Storelib sells one thing at a time — Buy goes straight to
   * /checkout?productId= — so a cart is a feature, not a fix, and a shopping
   * bag that can never fill is a shop that looks broken.
   *
   * The three theme settings that configured it went with it.
   */

  // On a phone the header carries the hamburger and nothing else: account
  // and wishlist live in the drawer it opens, where there is room for a word
  // beside the icon.
  const renderIcons = (forMobile: boolean = false) => (
    <div className="flex min-w-0 items-center gap-2 shrink-0" style={{ color: textColor }}>
      {/*
        ACCOUNT AND WISHLIST GO SOMEWHERE NOW. Both were buttons whose only
        behaviour was `preventDefault()`: on a published site they were three
        pixels of hover state and nothing else. What they mean already exists,
        on the platform rather than on the site — a buyer's purchases and
        their saved items — and the session that knows who the buyer is is
        held on storelib.com, so these are absolute links to it. Signed out,
        the library sends them to sign in, which is the right answer to
        "Account" too.
      */}
      {showAccount && !forMobile && (
        <a
          href={`https://${getMainDomain()}/library`}
          aria-label="Account"
          onClick={onEditorNavigate ? (e) => e.preventDefault() : undefined}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        >
          <User className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </a>
      )}
      {showWishlist && !forMobile && (
        <a
          href={`https://${getMainDomain()}/wishlist`}
          aria-label="Wishlist"
          onClick={onEditorNavigate ? (e) => e.preventDefault() : undefined}
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
        >
          <Heart className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </a>
      )}
      {/*
        The store's social links, when the theme says they belong up here.
        "Show icons in header" was a toggle with no wire behind it.
      */}
      {!forMobile && (
        <ThemeSocials theme={theme} where="header" className="flex items-center gap-2 pl-1" size={16} />
      )}
      {/* Call-to-action button.
          Visibility is gated by the `show_cta_button` toggle (default ON).
          The label falls back to "Shop Now" if the user hasn't typed one —
          so enabling the toggle always produces a real, clickable button
          instead of nothing. */}
      {(s.show_cta_button !== false) && (
        <a
          href={str(s.cta_url, "#")}
          className={cn(
            /**
             * IT MAY SHRINK, AND IT MAY NOT PUSH THE PAGE.
             *
             * `shrink-0` on a nowrap label means the button's width is
             * whatever its text needs, for ever. Measured at 834px with a
             * forty-character call to action — a real one, somebody's actual
             * button copy — the header ran 104px past the edge of the page and
             * took the whole document into horizontal scroll with it.
             *
             * The theme's `overflow-wrap: anywhere` cannot help here: a flex
             * item that is not allowed to shrink never gets down to its
             * min-content width in the first place. So it shrinks, it has a
             * ceiling, and anything past that is an ellipsis.
             */
            "ml-1 min-w-0 max-w-[160px] truncate font-semibold px-3 py-1.5 text-[13px]",
            hasDeviceMode ? (forceMobile ? "hidden" : "") : "hidden md:inline-block",
          )}
          /**
           * The header offered a CTA colour and a CTA label colour and painted
           * the button with the THEME's primary colour and hard-coded white
           * text. Both pickers are read now; both default to what was being
           * painted, so no header that already exists changes.
           */
          style={{
            background: str(s.cta_color) || theme.primary_color || "#6366f1",
            color: str(s.cta_text_color) || scheme.primary_btn_text,
            ...buttonRadiusStyle(theme),
          }}
          onClick={e => {
            if (onEditorNavigate) {
              e.preventDefault()
              e.stopPropagation()
              onEditorNavigate(str(s.cta_url, "#"))
            }
          }}
        >
          {str(s.cta_text, "Shop Now")}
        </a>
      )}
    </div>
  )

  // Mobile hamburger — 3 animated bars that morph into an X when open.
  // Rendered on the LEFT side of the header on mobile.
  const renderHamburger = () => (
    <button
      type="button"
      aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
      aria-expanded={mobileNavOpen}
      className={cn(
        "h-9 w-9 items-center justify-center rounded-full hover:bg-black/5 transition-colors shrink-0",
        hasDeviceMode
          ? (forceMobile ? "flex" : "hidden")
          : "flex md:hidden",
      )}
      style={{ color: navLinkColor }}
      onClick={e => { e.preventDefault(); setMobileNavOpen(o => !o) }}
    >
      <span className="relative block h-[16px] w-[22px]">
        <span
          aria-hidden
          className="absolute left-0 h-[2px] w-full rounded-full"
          style={{
            background: navLinkColor,
            top: mobileNavOpen ? "7px" : "0px",
            transform: mobileNavOpen ? "rotate(45deg)" : "rotate(0deg)",
            transition: mobileNavOpen
              ? "top 180ms cubic-bezier(0.4, 0, 0.6, 1), transform 200ms 80ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "transform 160ms cubic-bezier(0.4, 0, 1, 1), top 180ms 60ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
        <span
          aria-hidden
          className="absolute left-0 top-[7px] h-[2px] w-full rounded-full"
          style={{
            background: navLinkColor,
            opacity: mobileNavOpen ? 0 : 1,
            transition: mobileNavOpen
              ? "opacity 120ms ease-out"
              : "opacity 160ms 60ms ease-in",
          }}
        />
        <span
          aria-hidden
          className="absolute left-0 h-[2px] w-full rounded-full"
          style={{
            background: navLinkColor,
            top: mobileNavOpen ? "7px" : "14px",
            transform: mobileNavOpen ? "rotate(-45deg)" : "rotate(0deg)",
            transition: mobileNavOpen
              ? "top 180ms cubic-bezier(0.4, 0, 0.6, 1), transform 200ms 80ms cubic-bezier(0.32, 0.72, 0, 1)"
              : "transform 160ms cubic-bezier(0.4, 0, 1, 1), top 180ms 60ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        />
      </span>
    </button>
  )

  // ── Layout variants ──────────────────────────────────────
  // For the "fade siblings" hover style we wire the fade with an `:has()`
  // selector on the nav wrapper. When any anchor inside the nav is hovered,
  // every anchor drops to 40% opacity, and the hovered one stays at 100%.
  const navNode = (
    <nav
      className={cn(
        "flex items-center",
        // "Fade siblings": when any link is hovered, every other anchor in
        // the nav smoothly fades to 40% opacity. Uses :has() so it requires
        // no JS, and hits every anchor — including dropdown triggers.
        menuHoverStyle === "fade_siblings" &&
          "[&_a]:transition-opacity [&_a]:duration-[220ms] [&:has(a:hover)_a]:opacity-40 [&:has(a:hover)_a:hover]:opacity-100",
      )}
      style={{ gap: `${linkSpacingVw}vw` }}
    >
      {renderNavLinks()}
    </nav>
  )

  const logoNode = (
    <div className="flex items-center gap-2 shrink-0">
      {renderLogo()}
    </div>
  )

  // ── Mobile shell (driven by `mobile_header_layout`) ──────
  const mobileLayout = str(s.mobile_header_layout, "logo_center_hamburger_left")
  const buildMobileShell = (): React.ReactNode => {
    if (mobileLayout === "logo_left_hamburger_right") {
      return (
        <div className="w-full flex items-center justify-between gap-3">
          <div className="flex items-center min-w-0">{logoNode}</div>
          <div className="flex items-center gap-1">
            {renderIcons(true)}
            {renderHamburger()}
          </div>
        </div>
      )
    }
    if (mobileLayout === "hamburger_left_logo_left") {
      return (
        <div className="w-full flex items-center gap-3">
          {renderHamburger()}
          <div className="flex items-center min-w-0">{logoNode}</div>
          <div className="flex-1" />
          {renderIcons(true)}
        </div>
      )
    }
    // logo_center_hamburger_left (default) — truly centered logo via 3-col grid
    return (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-start">{renderHamburger()}</div>
        <div className="flex items-center justify-center min-w-0">{logoNode}</div>
        <div className="flex items-center justify-end">{renderIcons(true)}</div>
      </div>
    )
  }

  // When we KNOW the device (editor preview) we render only one layout;
  // otherwise (live site) we render BOTH and use Tailwind `md:` classes to
  // swap at the breakpoint so mobile browsers see the hamburger shell and
  // desktop browsers see the configured desktop layout.
  const isMobileShell = hasDeviceMode && forceMobile
  const isLiveResponsive = !hasDeviceMode
  let content: React.ReactNode
  if (isMobileShell) {
    content = buildMobileShell()
  } else if (layout === "logo_left_nav_center") {
    // Truly centered nav using 3-col grid
    content = (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex items-center">{logoNode}</div>
        <div className="flex items-center justify-center">{navNode}</div>
        <div className="flex items-center justify-end">{renderIcons()}</div>
      </div>
    )
  } else if (layout === "nav_left_logo_center") {
    // Truly centered logo using 3-col grid
    content = (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
        <div className="flex items-center justify-start">{navNode}</div>
        <div className="flex items-center justify-center">{logoNode}</div>
        <div className="flex items-center justify-end">{renderIcons()}</div>
      </div>
    )
  } else if (layout === "logo_center_nav_below") {
    content = (
      <div className="w-full flex flex-col items-center gap-3">
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div />
          <div className="flex items-center justify-center">{logoNode}</div>
          <div className="flex items-center justify-end">{renderIcons()}</div>
        </div>
        <div className="flex items-center justify-center w-full">{navNode}</div>
      </div>
    )
  } else if (layout === "logo_left_nav_inline") {
    content = (
      <div className="w-full flex items-center gap-8">
        {logoNode}
        {navNode}
        <div className="flex-1" />
        {renderIcons()}
      </div>
    )
  } else {
    // logo_left_nav_right (default) — honours legacy nav_alignment when set
    if (navAlignment === "center") {
      content = (
        <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="flex items-center">{logoNode}</div>
          <div className="flex items-center justify-center">{navNode}</div>
          <div className="flex items-center justify-end">{renderIcons()}</div>
        </div>
      )
    } else if (navAlignment === "left") {
      content = (
        <div className="w-full flex items-center gap-6">
          {logoNode}
          {navNode}
          <div className="flex-1" />
          {renderIcons()}
        </div>
      )
    } else {
      content = (
        <div className="w-full flex items-center justify-between gap-6">
          {logoNode}
          <div className="flex items-center" style={{ gap: `${linkSpacingVw}vw` }}>
            {navNode}
            {renderIcons()}
          </div>
        </div>
      )
    }
  }

  // On the live site (no deviceMode) always wrap the desktop content in a
  // `hidden md:flex` container and also render the mobile shell with
  // `flex md:hidden`, so every visitor gets a proper responsive header.
  if (isLiveResponsive) {
    const desktopContent = content
    content = (
      <>
        <div className="hidden md:flex w-full">{desktopContent}</div>
        <div className="flex md:hidden w-full">{buildMobileShell()}</div>
      </>
    )
  }

  const innerStyle: CSSProperties = {
    paddingTop: `${paddingVw}vw`,
    paddingBottom: `${paddingVw}vw`,
    borderColor,
    color: textColor,
  }
  const widthClass = isFixedWidth ? "mx-auto" : "w-full"
  // Width change reflects LIVE in the editor. The transition on maxWidth is
  // what makes Narrow/Medium/Wide/Full feel "snappy but visible" — without it
  // the change is instantaneous and hard to perceive when the preview frame
  // is already close to the cap (e.g. selecting Wide 1280 in a 1300px canvas).
  const widthStyle: CSSProperties = isFixedWidth && headerWidthMaxPx
    ? {
        maxWidth: `${headerWidthMaxPx}px`,
        width: "100%",
        transition: "max-width 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
      }
    : {
        maxWidth: "none",
        width: "100%",
        transition: "max-width 260ms cubic-bezier(0.22, 0.61, 0.36, 1)",
      }
  const outerPaddingClass = hasDeviceMode
    ? (forceMobile ? "px-4" : "px-[5%]")
    : "px-4 md:px-[5%]"


  /**
   * ===========================================================================
   *  ONE STICKY MODE, AND IT IS `position: sticky`
   * ===========================================================================
   * The live site used `position: fixed` plus an in-flow spacer, on the
   * grounds that the marketing layout's `<main className="[overflow-x:clip]">`
   * "kills `position: sticky` in most browsers". That is true of
   * `overflow: hidden` and NOT true of `clip` — not making a scroll container
   * is the entire reason `clip` exists. Measured in Chromium against the real
   * layout, flex wrapper and all: sticky pins at 0 and returns to 44px, exactly
   * as it should.
   *
   * The fixed version produced both of the bugs a creator could see on their
   * published site and not in the editor:
   *
   *   • A header pinned to `top: 0` COVERS THE ANNOUNCEMENT BAR, and the
   *     spacer underneath it reserves the header's height a second time — so
   *     the bar vanished and a band of empty background appeared below the
   *     header.
   *
   *   • Scrolling back to the top slid the header DOWN OVER the bar, because
   *     a fixed header has no natural position to return to.
   *
   * Sticky has neither problem: the bar scrolls away, the header pins, and on
   * the way back the header lands under the bar again because that is where it
   * lives. And the editor and the published page now run the same branch,
   * which is what stops the two disagreeing a third time.
   */
  /**
   * EITHER TOGGLE MAKES IT STICK, BECAUSE REVEAL-ON-SCROLL-UP IS A KIND OF
   * STICKY.
   *
   * These were master-and-sub: "Sticky header on scroll up" did nothing unless
   * "Enable sticky header" was also on. But the two describe DIFFERENT
   * behaviours, not a feature and its option — one is "always pinned", the
   * other is "pinned, but out of the way until you scroll up" — and the second
   * one reads, on its own control with its own description, as a complete
   * choice. Turning it on and getting a header that does not move at all is the
   * setting lying.
   *
   * A header that reveals on scroll up has to be sticky to reveal ANYWHERE, so
   * the position follows from either toggle.
   */
  const useSticky = headerStickyEnabled || headerStickyOnScrollUp

  const headerRef = useRef<HTMLDivElement | null>(null)
  const [measuredH, setMeasuredH] = useState(0)
  useLayoutEffect(() => {
    // Measure for both the live fixed header (so the spacer reserves the
    // right height) and the editor sticky header (so the mobile drawer can
    // start just below it).
    // Measured whenever the header is sticky OR transparent: the transparent
    // overlay below needs the height to cancel out with a negative margin.
    if (!headerStickyEnabled && !transparent) { setMeasuredH(0); return }
    const el = headerRef.current
    if (!el) return
    const update = () => setMeasuredH(el.offsetHeight)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [headerStickyEnabled])

  // ── Bottom border + depth shadow (Header settings) ──────────
  //
  // The header used to always render a hard `border-b`. That's now
  // controlled by three settings in Header Settings → Border & Shadow:
  //   • show_bottom_border   (toggle)   — master on/off
  //   • border_style         (radio)    — "solid" | "subtle"
  //   • border_visibility    (select)   — "none" | "home_only" |
  //                                        "inner_only" | "all"
  //   • header_depth_shadow  (toggle)   — subtle modern drop shadow
  //                                        under the header (default ON)
  //
  // Legacy fields (show_border) still feed show_bottom_border when the
  // new field is missing, so older themes don't lose their border.
  const borderEnabled = bool(s.show_bottom_border, bool(s.show_border, true))
  const borderStyleRaw = str(s.border_style, "solid") // "solid" | "subtle"
  const borderVisibility = str(s.border_visibility, "all") // "none" | "home_only" | "inner_only" | "all"
  // Determine whether the CURRENT page counts as "home" — only relevant when
  // the visibility selector limits the border to a subset. We detect this
  // at render time via the pathname because the header doesn't know which
  // page it's on otherwise. Inside the editor we treat every page as
  // "home" for visibility purposes so the setting is easy to preview.
  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  const isHomePage = renderingInsideEditor
    ? true
    : (pathname === "/" || /^\/(w|c)\/[^/]+\/?$/.test(pathname) || /^\/[^/]+\/?$/.test(pathname))
  const shouldShowBorder = borderEnabled && (
    borderVisibility === "all"
      ? true
      : borderVisibility === "home_only"
        ? isHomePage
        : borderVisibility === "inner_only"
          ? !isHomePage
          : false // "none"
  )
  // Depth shadow — default ON. A very soft 1–2px shadow that gives the
  // header subtle physical depth. Sits on the OUTER wrapper so it
  // doesn't get clipped by the inner content.
  const headerDepthShadow = bool(s.header_depth_shadow, true)

  // The actual header visual — always identical between editor and live.
  // We put the slide-up/down transform on the OUTERMOST wrapper so the
  // whole header (including its background) hides together instead of
  // leaving an empty bar behind.
  const headerInner = (
    <div
      className="relative"
      style={{
        background: bg,
        // Border rendered INSIDE the header (inset) so it doesn't add any
        // layout offset when toggled on/off. "subtle" uses 50% alpha of
        // the scheme's inset_border; "solid" uses the scheme colour as-is.
        boxShadow: [
          shouldShowBorder
            ? `inset 0 -1px 0 ${borderStyleRaw === "subtle"
                ? hexToRgba(borderColor, 0.5)
                : borderColor}`
            : null,
          // Smooth subtle depth shadow (Figma-like). Two layers:
          //   - 1px hairline with 4% alpha: creates the sense of a hard
          //     edge separating the header from the content
          //   - 6px soft blur with 5% alpha: the "hover off the page"
          //     feel the user asked for in the screenshot
          headerDepthShadow
            ? "0 1px 0 rgba(15, 23, 42, 0.04), 0 4px 12px -6px rgba(15, 23, 42, 0.08)"
            : null,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      }}
    >
      <div className={cn(widthClass, outerPaddingClass)} style={{ ...innerStyle, ...widthStyle }}>
        {content}
      </div>
    </div>
  )

  // Sticky reveal timing ported verbatim from the Glozin theme's
  // `fadeInSticky` animation (see assets/theme.css → .shopify-section-header-sticky):
  //   transition: transform 350ms cubic-bezier(0.22, 0.61, 0.36, 1);
  // The 0.22/0.61/0.36/1 curve is a "quint-like" ease-out that feels crisp
  // and confident at the start and settles softly at the end — exactly the
  // "smooth, clean, accurate" reveal the user asked for.
  /**
   * ─────────────────────────────────────────────────────────────────────────
   *  NOTHING MOVES UNLESS THE REVEAL IS TURNED ON
   * ─────────────────────────────────────────────────────────────────────────
   *
   * `header_sticky_on_scroll_up` defaults to FALSE, so on almost every site
   * this header never moves — and yet it was still shipping
   * `transform: translateY(0)`, a `transition` and `will-change: transform`
   * on every render. An identity transform is not free: with `will-change` it
   * promotes the header to its own compositor layer, permanently, for an
   * animation that never runs.
   *
   * That is what leaves the band. The LAYOUT is correct — measured in
   * Chromium, in all four configurations, the next section's top and the
   * header's bottom are the same pixel — so what is visible under the header
   * is not a gap in the page, it is a stale tile from a promoted layer that
   * the compositor did not repaint. A permanently promoted `position: sticky`
   * element inside an `overflow-x: clip` ancestor is exactly where that shows
   * up, and it explains the two things a layout bug cannot: why it appears
   * only after scrolling, and why it comes and goes.
   *
   * So the promotion is now tied to the thing that needs it. Reveal off: no
   * transform, no transition, no `will-change` — an ordinary sticky header,
   * with nothing for the compositor to keep alive. Reveal on: the machinery
   * is there, because then it genuinely animates on every scroll.
   */
  const revealEnabled = headerStickyOnScrollUp

  const mobileDrawer = (
    <HeaderMobileNavDrawer
      open={mobileNavOpen}
      onClose={() => setMobileNavOpen(false)}
      scheme={scheme}
      // CRITICAL: use `renderingInsideEditor`, NOT `isEditing`. `isEditing`
      // flips with the Inspector toggle — when the user turns Inspector off
      // the drawer would portal into `document.body` with `position: fixed`
      // and cover the entire editor viewport (including the left nav + rail)
      // instead of staying scoped to the preview card. `renderingInsideEditor`
      // stays TRUE for the whole editor session, so the drawer is always
      // scoped to `#wb-preview-root` in both desktop and mobile preview modes.
      scopedToPreview={renderingInsideEditor}
      onEditorNavigate={renderingInsideEditor ? onEditorNavigate : undefined}
      showAccount={showAccount}
      showWishlist={showWishlist}
      items={rootNavBlocks.map(b => {
        const kids = childrenByParent[b.id] ?? []
        return {
          id: b.id,
          label: str(b.settings.label),
          href: resolveHref(b),
          openInNew: bool(b.settings.open_in_new_tab, false),
          children: kids.length > 0
            ? kids.map(c => ({
                id: c.id,
                label: str(c.settings.label),
                href: resolveHref(c),
                openInNew: bool(c.settings.open_in_new_tab, false),
              }))
            : undefined,
        }
      })}
    />
  )

  /**
   * THE TRANSPARENT HEADER TAKES NO SPACE.
   *
   * "Make header transparent" is for a header sitting over a hero image, and
   * in flow it only ever showed the page background instead. A negative bottom
   * margin of exactly its own height cancels the space it occupies, so the
   * section below starts underneath it — the overlay the control describes,
   * without leaving `position: sticky` behind. Verified in Chromium: the
   * header's top and the hero's top land on the same pixel.
   */
  const overlayMargin: React.CSSProperties | undefined = transparent
    ? {
        /**
         * A CSS variable with a real default rather than a plain negative
         * number, because `measuredH` comes from a layout effect and there is
         * no layout effect on the server. With a bare `-measuredH` the header
         * took full space in the first paint and jumped up on hydration — a
         * layout that needs JavaScript to be correct is a layout that flashes.
         *
         * 72px is a header with the default 64px logo and its padding; the
         * measured value replaces it a frame later, so the correction is a few
         * pixels rather than the whole header.
         */
        marginBottom: "calc(-1 * var(--storelib-header-h, 72px))",
        ...(measuredH ? ({ "--storelib-header-h": `${measuredH}px` } as React.CSSProperties) : {}),
      }
    : undefined

  // 1) Sticky — the editor canvas and the published page, the same branch.
  //    The transform lives on the SectionWrapper's root div rather than on an
  //    inner wrapper, so when the header slides up the WHOLE thing (background
  //    and content) goes with it.
  if (useSticky) {
    return (
      <SectionWrapper
        isChrome
        id={wrapperId}
        bgColor={bg}
        isEditing={isEditing}
        isSelected={isSelected}
        onClick={onClick}
        disableWrapperTransition
        canvasRoundedTopPx={canvasRoundedTopPx}
        className={cn(
          "sticky top-0 z-[60] isolate",
          // Only when it actually animates — the reveal effect above writes
          // the transform straight to this node on scroll.
          revealEnabled && "will-change-transform",
          // Suppress the hover ring on the sticky header — it looks broken
          // when it appears over the sliding transform. The SELECTED ring
          // (blue) must remain so the user can see which section is
          // currently picked, matching every other section's behaviour.
          "hover:!ring-0",
        )}
        style={{
          // Make sure the background is fully opaque (no glassmorphism /
          // bleed-through from the content behind it).
          backgroundColor: bg,
          opacity: 1,
          // Absent entirely when the reveal is off, so the header is a plain
          // sticky box with no compositor layer of its own.
          // NOT set here. `transform`, `transition` and `pointerEvents` are
          // owned by the reveal effect and written straight to the node, so a
          // React render can never race the scroll that moved it — and so this
          // prop cannot overwrite them on an unrelated re-render.
          ...overlayMargin,
        }}
        forwardRef={(el: HTMLDivElement | null) => {
          headerRef.current = el
          scrollAnchorRef.current = el
        }}
      >
        {headerInner}
        {mobileDrawer}
      </SectionWrapper>
    )
  }

  // 2) Plain non-sticky. Still honours transparency, which it did not before:
  //    a transparent header with sticky turned off simply showed the page
  //    background, so the control meant two different things.
  return (
    <SectionWrapper
      isChrome
      id={wrapperId}
      bgColor={bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      canvasRoundedTopPx={canvasRoundedTopPx}
      className={transparent ? "z-[60]" : undefined}
      style={overlayMargin}
      forwardRef={(el: HTMLDivElement | null) => {
        headerRef.current = el
      }}
    >
      {headerInner}
      {mobileDrawer}
    </SectionWrapper>
  )
}

export default HeaderSection
