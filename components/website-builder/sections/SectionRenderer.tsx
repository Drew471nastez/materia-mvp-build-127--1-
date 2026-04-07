"use client"

// ============================================================
// Storelib Theme Engine — Section Renderer
// Renders a SectionInstance using its registered React component.
// All sections receive: settings (their config), blocks, themeSettings.
// ============================================================

import type { SectionInstance, ThemeSettingsValues, ColorSchemeKey, ColorSchemeValues } from "@/lib/website-builder/types"
import { DEFAULT_COLOR_SCHEMES } from "@/lib/website-builder/types"
import {
  Zap, Shield, Star, CheckCircle, Download, Heart, Globe, Lock,
  RefreshCw, Rocket, ChevronDown, ChevronUp,
  Share2, Package, FileText, Eye, Search, ShoppingBag, X, Menu,
} from "lucide-react"
import { useState, useEffect, useRef, useLayoutEffect, CSSProperties } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

// ── Header color schemes ─────────────────────────────────────
type HeaderColorScheme = ColorSchemeKey

// Resolve a section's color scheme — falls back to the theme-level scheme,
// then to DEFAULT_COLOR_SCHEMES.
function resolveScheme(theme: ThemeSettingsValues, key: string | undefined): ColorSchemeValues {
  const k = (key && (key in DEFAULT_COLOR_SCHEMES) ? key : "white") as ColorSchemeKey
  const themeSchemes = (theme.color_schemes as Record<string, ColorSchemeValues> | undefined) ?? {}
  return { ...DEFAULT_COLOR_SCHEMES[k], ...(themeSchemes[k] ?? {}) }
}

// Single entry point every section uses to resolve its effective colors.
// Reads section.settings.color_scheme and returns the merged scheme.
function sectionColors(section: SectionInstance, theme: ThemeSettingsValues): ColorSchemeValues {
  const schemeKey = typeof section.settings.color_scheme === "string" ? section.settings.color_scheme : "white"
  return resolveScheme(theme, schemeKey)
}

interface SectionProps {
  section: SectionInstance
  theme: ThemeSettingsValues
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
  deviceMode?: "desktop" | "mobile"
  /** Optional DOM id set on the outer section wrapper — used by the editor
   *  to `scrollIntoView` without needing a separate wrapping <div> which
   *  would constrain sticky's containing block. */
  wrapperId?: string
}

// ── Utility ──────────────────────────────────────────────────

function str(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v
  if (typeof v === "number") return String(v)
  return fallback
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === "boolean" ? v : fallback
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  zap: Zap,
  shield: Shield,
  star: Star,
  "check-circle": CheckCircle,
  download: Download,
  heart: Heart,
  globe: Globe,
  lock: Lock,
  "refresh-cw": RefreshCw,
  rocket: Rocket,
}

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Zap
  return <Icon className={className} strokeWidth={1.5} />
}

function buttonRadiusStyle(theme: ThemeSettingsValues): CSSProperties {
  const style = theme.button_style ?? "rounded"
  const r = theme.border_radius ?? 8
  if (style === "pill") return { borderRadius: "9999px" }
  if (style === "square") return { borderRadius: "4px" }
  return { borderRadius: `${r}px` }
}

function SectionWrapper({
  id,
  children,
  bgColor,
  isEditing,
  isSelected,
  onClick,
  className,
  style,
  forwardRef,
  disableWrapperTransition,
}: {
  id?: string
  children: React.ReactNode
  bgColor?: string
  isEditing?: boolean
  isSelected?: boolean
  onClick?: () => void
  className?: string
  style?: CSSProperties
  forwardRef?: React.Ref<HTMLDivElement>
  /** Drop the default `transition-all` so inline `transition` rules (e.g.
   *  for sticky hide) aren't fighting the wrapper's own transitions. */
  disableWrapperTransition?: boolean
}) {
  return (
    <div
      id={id}
      ref={forwardRef as any}
      className={cn(
        "relative w-full",
        !disableWrapperTransition && "transition-all",
        isEditing && "cursor-pointer",
        isEditing && !isSelected && "hover:ring-2 hover:ring-blue-400/50 hover:ring-inset",
        isEditing && isSelected && "ring-2 ring-blue-500 ring-inset",
        className,
      )}
      style={{ background: bgColor, ...style }}
      onClick={onClick}
    >
      {isEditing && isSelected && (
        <div className="absolute top-0 left-0 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 z-50 rounded-br">
          Selected
        </div>
      )}
      {children}
    </div>
  )
}

// ── Section components ────────────────────────────────────────

function HeaderCartDrawer({
  open,
  onClose,
  scheme,
}: {
  open: boolean
  onClose: () => void
  scheme: HeaderColorScheme
}) {
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="fixed inset-0 z-[90] bg-black/40 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Cart"
        className="fixed top-0 right-0 z-[95] h-full w-full sm:w-[420px] max-w-[92vw] bg-white shadow-2xl flex flex-col"
        style={{
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Your cart</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cart"
            className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-700 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto flex flex-col items-center justify-center px-6 text-center">
          <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ShoppingBag className="h-7 w-7 text-gray-400" strokeWidth={1.5} />
          </div>
          <p className="text-[15px] font-medium text-gray-900">Your cart is empty</p>
          <p className="text-[13px] text-gray-500 mt-1">Browse the shop to add something.</p>
        </div>
        <div className="border-t border-gray-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-lg bg-gray-900 text-white text-[14px] font-semibold hover:bg-gray-800 transition-colors"
          >
            Continue shopping
          </button>
        </div>
      </aside>
    </>
  )
}

function HeaderMobileNavDrawer({
  open,
  onClose,
  items,
  scheme,
  scopedToPreview,
  headerOffset = 0,
}: {
  open: boolean
  onClose: () => void
  items: { id: string; label: string; href: string; openInNew: boolean }[]
  scheme: ColorSchemeValues
  scopedToPreview?: boolean
  headerOffset?: number
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

  const drawer = (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(positionClass, "left-0 right-0 bottom-0 z-[90] bg-black/50 backdrop-blur-[2px]")}
        style={{
          top: headerOffset ? `${headerOffset}px` : 0,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)",
          visibility: open ? "visible" : "hidden",
          transitionProperty: "opacity, visibility",
          transitionDuration: "320ms",
          transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDelay: open ? "0ms, 0ms" : "0ms, 320ms",
        }}
      />
      <aside
        role="dialog"
        aria-label="Menu"
        aria-hidden={!open}
        className={cn(
          positionClass,
          "left-0 bottom-0 z-[95] shadow-2xl flex flex-col will-change-transform",
          scopedToPreview ? "w-[82%] max-w-[320px]" : "w-[85vw] max-w-[360px]",
        )}
        style={{
          top: headerOffset ? `${headerOffset}px` : 0,
          background: scheme.bg,
          color: scheme.heading,
          transform: open ? "translateX(0)" : "translateX(-101%)",
          transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Items — one row per link, no dividers, no duplicate close button.
            The header's own hamburger icon doubles as the close button. */}
        <nav className="flex-1 overflow-y-auto pt-6 pb-4">
          {visibleItems.map(item => (
            <a
              key={item.id}
              href={item.href}
              target={item.openInNew ? "_blank" : undefined}
              rel={item.openInNew ? "noopener noreferrer" : undefined}
              onClick={onClose}
              className="block px-5 py-3 text-[15px] font-medium hover:bg-black/5 transition-colors"
              style={{ color: scheme.nav_link }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
    </>
  )

  return createPortal(drawer, target)
}

function HeaderSection({ section, theme, isEditing, isSelected, onClick, deviceMode, wrapperId }: SectionProps) {
  const s = section.settings
  const [cartOpen, setCartOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Resolve color scheme (falls back to explicit bg/text colors if still set)
  const schemeKey = (str(s.color_scheme, "white") as HeaderColorScheme)
  const scheme = resolveScheme(theme, schemeKey)
  const transparent = bool(s.header_transparent, false)
  // transparent_on_hero only takes effect when this header sits over a hero block.
  // We approximate this by using transparent background only when the toggle is on
  // — the consumer (page renderer) wraps the header above the hero in those cases.
  const bg = (transparent || bool(s.transparent_on_hero, false)) ? "transparent" : scheme.bg
  const textColor = scheme.heading
  const navLinkColor = scheme.nav_link
  const borderColor = scheme.inset_border

  const layout = str(s.header_layout, "logo_left_nav_right")
  const showSearch = s.show_search !== false
  const showCart = s.show_cart !== false
  // Header width — supports new ("full"/"fixed") and legacy ("narrow"/"medium"/"wide"/"full") values
  const headerWidthRaw = str(s.header_width, str(s.max_width, "full"))
  const headerWidthMaxPx: number | null =
    headerWidthRaw === "narrow" ? 960 :
    headerWidthRaw === "medium" ? 1140 :
    headerWidthRaw === "wide"   ? 1280 :
    headerWidthRaw === "fixed"  ? 1280 :
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

  // Scroll-direction aware reveal. Works on both the live site (listens
  // on window) and inside the editor canvas (listens on the closest
  // scrollable ancestor of the header) so the preview mirrors the live
  // behaviour exactly.
  const [stickyVisible, setStickyVisible] = useState(true)
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!headerStickyEnabled || !headerStickyOnScrollUp) {
      setStickyVisible(true)
      return
    }
    const getScrollTarget = (): Window | HTMLElement => {
      if (!isEditing) return window
      // Find the nearest scrollable ancestor inside the editor canvas.
      let el: HTMLElement | null = scrollAnchorRef.current
      while (el) {
        const style = window.getComputedStyle(el)
        const oy = style.overflowY
        if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
          return el
        }
        el = el.parentElement
      }
      return window
    }
    const target = getScrollTarget()
    const getY = () => (target === window ? window.scrollY : (target as HTMLElement).scrollTop)
    let lastY = getY()
    const onScroll = () => {
      const y = getY()
      if (y < 80) {
        setStickyVisible(true)
      } else if (y > lastY + 4) {
        setStickyVisible(false) // scrolling down
      } else if (y < lastY - 4) {
        setStickyVisible(true)  // scrolling up
      }
      lastY = y
    }
    target.addEventListener("scroll", onScroll as EventListener, { passive: true })
    return () => target.removeEventListener("scroll", onScroll as EventListener)
  }, [isEditing, headerStickyEnabled, headerStickyOnScrollUp])
  const transparentOnHero = bool(s.transparent_on_hero, false)
  const navAlignment = str(s.nav_alignment, "right") // legacy field, used by default layout

  const paddingVw = Number.isFinite(Number(s.vertical_padding_vw))
    ? Number(s.vertical_padding_vw)
    : 1.2
  const linkSpacingVw = Number.isFinite(Number(s.link_spacing_vw))
    ? Number(s.link_spacing_vw)
    : 1.4

  const forceMobile = deviceMode === "mobile"
  const hasDeviceMode = !!deviceMode

  const mobileLogoSrc = s.use_mobile_logo && s.mobile_logo_url ? str(s.mobile_logo_url) : str(s.logo_url)
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
    if (!s.logo_url) {
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
          src={forceMobile ? mobileLogoSrc : str(s.logo_url)}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain"
          style={{
            height: `${forceMobile ? mobileLogoH : desktopLogoH}px`,
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
          src={str(s.logo_url)}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain hidden md:block"
          style={{ height: `${desktopLogoH}px`, transform: desktopLogoTransform }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
        <img
          src={mobileLogoSrc}
          alt={str(s.logo_text, theme.brand_name ?? "Logo")}
          className="object-contain md:hidden"
          style={{ height: `${mobileLogoH}px`, transform: mobileLogoTransform }}
          loading="eager"
          decoding="async"
          fetchPriority="high"
        />
      </>
    )
  }

  // Default nav links fallback (Home / Shop / About / Contact)
  const DEFAULT_NAV_BLOCKS = [
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
    if (linkType === "collection" && targetId) return `/collections/${targetId}`
    if (linkType === "page" && targetId) return `/${targetId}`
    if (linkType === "blog" && targetId) return `/blog/${targetId}`
    if (linkType === "blog_post" && targetId) return `/blog/${targetId}`
    return url || "#"
  }

  const renderNavLinks = () => {
    if (!navBlocks.length) return null
    return navBlocks.map(block => {
      const openInNew = bool(block.settings.open_in_new_tab, false)
      return (
        <a
          key={block.id}
          href={resolveHref(block)}
          target={openInNew ? "_blank" : undefined}
          rel={openInNew ? "noopener noreferrer" : undefined}
          className={cn(
            "text-[14px] font-medium whitespace-nowrap hover:opacity-70 transition-opacity",
            hasDeviceMode && forceMobile ? "hidden" : "",
            !hasDeviceMode && "hidden md:inline-block",
          )}
          style={{ color: navLinkColor }}
        >
          {str(block.settings.label)}
        </a>
      )
    })
  }

  const renderIcons = () => (
    <div className="flex items-center gap-2 shrink-0" style={{ color: textColor }}>
      {showSearch && (
        <button
          type="button"
          aria-label="Search"
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          onClick={e => e.preventDefault()}
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      )}
      {showCart && (
        <button
          type="button"
          aria-label="Open cart"
          className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-black/5 transition-colors"
          onClick={e => { e.preventDefault(); setCartOpen(true) }}
        >
          <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      )}
      {!!s.cta_text && (
        <a
          href={str(s.cta_url, "#")}
          className={cn(
            "ml-1 font-semibold text-white px-3 py-1.5 text-[13px] shrink-0",
            hasDeviceMode ? (forceMobile ? "hidden" : "") : "hidden md:inline-block",
          )}
          style={{ background: theme.primary_color ?? "#6366f1", ...buttonRadiusStyle(theme) }}
        >
          {str(s.cta_text)}
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
          className="absolute left-0 h-[2px] w-full rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            background: navLinkColor,
            top: mobileNavOpen ? "7px" : "0px",
            transform: mobileNavOpen ? "rotate(45deg)" : "rotate(0deg)",
          }}
        />
        <span
          aria-hidden
          className="absolute left-0 top-[7px] h-[2px] w-full rounded-full transition-opacity duration-200 ease-out"
          style={{
            background: navLinkColor,
            opacity: mobileNavOpen ? 0 : 1,
          }}
        />
        <span
          aria-hidden
          className="absolute left-0 h-[2px] w-full rounded-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            background: navLinkColor,
            top: mobileNavOpen ? "7px" : "14px",
            transform: mobileNavOpen ? "rotate(-45deg)" : "rotate(0deg)",
          }}
        />
      </span>
    </button>
  )

  // ── Layout variants ──────────────────────────────────────
  const navNode = (
    <nav
      className="flex items-center"
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
            {renderIcons()}
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
          {renderIcons()}
        </div>
      )
    }
    // logo_center_hamburger_left (default) — truly centered logo via 3-col grid
    return (
      <div className="w-full grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-start">{renderHamburger()}</div>
        <div className="flex items-center justify-center min-w-0">{logoNode}</div>
        <div className="flex items-center justify-end">{renderIcons()}</div>
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
  const widthStyle: CSSProperties = isFixedWidth && headerWidthMaxPx ? { maxWidth: `${headerWidthMaxPx}px` } : {}
  const outerPaddingClass = hasDeviceMode
    ? (forceMobile ? "px-4" : "px-[5%]")
    : "px-4 md:px-[5%]"

  const stickyHidden = headerStickyEnabled && headerStickyOnScrollUp && !stickyVisible
  // Sticky behaviour needs to work in BOTH places:
  //  • Live site (`isEditing === false`) — wrapped in a marketing layout
  //    `<main className="[overflow-x:clip]">` which kills `position: sticky`
  //    in most browsers. Use `position: fixed` + a spacer div.
  //  • Editor canvas (`isEditing === true`) — content scrolls inside
  //    `<main className="overflow-y-auto">` (desktop) or
  //    `#wb-preview-root` (mobile phone frame). Use `position: sticky`
  //    there since the scroll ancestor is a simple overflow container.
  const useStickyFixed = !isEditing && headerStickyEnabled
  const useStickyInFlow = isEditing && headerStickyEnabled

  const headerRef = useRef<HTMLDivElement | null>(null)
  const [measuredH, setMeasuredH] = useState(0)
  useLayoutEffect(() => {
    // Measure for both the live fixed header (so the spacer reserves the
    // right height) and the editor sticky header (so the mobile drawer can
    // start just below it).
    if (!headerStickyEnabled) { setMeasuredH(0); return }
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

  // The actual header visual — always identical between editor and live.
  // We put the slide-up/down transform on the OUTERMOST wrapper so the
  // whole header (including its background) hides together instead of
  // leaving an empty bar behind.
  const headerInner = (
    <div className="relative border-b" style={{ background: bg, borderColor }}>
      <div className={cn(widthClass, outerPaddingClass)} style={{ ...innerStyle, ...widthStyle }}>
        {content}
      </div>
    </div>
  )

  const hideTransform = stickyHidden ? "translateY(-100%)" : "translateY(0)"
  const hideTransition = "transform 380ms cubic-bezier(0.22, 1, 0.36, 1)"

  const mobileDrawer = (
    <HeaderMobileNavDrawer
      open={mobileNavOpen}
      onClose={() => setMobileNavOpen(false)}
      scheme={scheme}
      scopedToPreview={isEditing}
      headerOffset={measuredH}
      items={navBlocks.map(b => ({
        id: b.id,
        label: str(b.settings.label),
        href: resolveHref(b),
        openInNew: bool(b.settings.open_in_new_tab, false),
      }))}
    />
  )

  // 1) Live sticky: fixed header + spacer. Transform lives on the fixed
  // wrapper so the whole header (bg + content) slides together.
  if (useStickyFixed) {
    return (
      <>
        {/* In-flow spacer to reserve header height */}
        <div id={wrapperId} style={{ height: measuredH || undefined, background: bg }} />
        <div
          ref={headerRef}
          className="fixed top-0 left-0 right-0 z-40 will-change-transform"
          style={{
            background: bg,
            transform: hideTransform,
            transition: hideTransition,
          }}
        >
          {headerInner}
        </div>
        {cartOpen && (
          <HeaderCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} scheme={schemeKey} />
        )}
        {mobileDrawer}
      </>
    )
  }

  // 2) Editor sticky (inside canvas scroll container). Transform lives on
  // the SectionWrapper's root div, not on an inner wrapper, so when the
  // header slides up the WHOLE thing (background + content) goes with it.
  if (useStickyInFlow) {
    return (
      <SectionWrapper
        id={wrapperId}
        bgColor={bg}
        isEditing={isEditing}
        isSelected={isSelected}
        onClick={onClick}
        disableWrapperTransition
        className={cn(
          "sticky top-0 z-40 will-change-transform",
          // While hidden, drop the selection/hover rings so the translated
          // element doesn't leave a blue/gray stripe peeking into the
          // editor topbar area.
          stickyHidden && "!ring-0 hover:!ring-0",
        )}
        style={{
          transform: hideTransform,
          transition: hideTransition,
          pointerEvents: stickyHidden ? "none" : undefined,
        }}
        forwardRef={(el: HTMLDivElement | null) => {
          headerRef.current = el
          scrollAnchorRef.current = el
        }}
      >
        {headerInner}
        {cartOpen && (
          <HeaderCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} scheme={schemeKey} />
        )}
        {mobileDrawer}
      </SectionWrapper>
    )
  }

  // 3) Plain non-sticky.
  return (
    <SectionWrapper id={wrapperId} bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      {headerInner}
      {cartOpen && (
        <HeaderCartDrawer open={cartOpen} onClose={() => setCartOpen(false)} scheme={schemeKey} />
      )}
      {mobileDrawer}
    </SectionWrapper>
  )
}

function HeroSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const textColor = c.heading
  const paraColor = c.paragraph
  const layout = str(s.layout, "center")
  const fullHeight = bool(s.full_height)
  const ctaStyle = str(s.cta_style, "primary")

  const alignClass = layout === "center" ? "items-center text-center" : layout === "right" ? "items-end text-right" : "items-start text-left"

  const ctaStyles: CSSProperties = ctaStyle === "primary"
    ? { background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }
    : ctaStyle === "outline"
    ? { border: `2px solid ${c.secondary_btn_border}`, color: c.secondary_btn_text, background: c.secondary_btn_bg, ...buttonRadiusStyle(theme) }
    : ctaStyle === "ghost"
    ? { color: textColor, background: "transparent", ...buttonRadiusStyle(theme) }
    : { background: c.secondary_btn_bg, color: c.secondary_btn_text, ...buttonRadiusStyle(theme) }

  return (
    <SectionWrapper
      bgColor={s.image_url ? undefined : bg}
      isEditing={isEditing}
      isSelected={isSelected}
      onClick={onClick}
      className={cn(fullHeight ? "min-h-[80vh]" : "py-20")}
    >
      {!!s.image_url && (
        <div className="absolute inset-0">
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
          <div
            className="absolute inset-0"
            style={{ background: bg, opacity: (Number(s.overlay_opacity ?? 40)) / 100 }}
          />
        </div>
      )}
      <div
        className={cn("relative z-10 flex flex-col gap-5 px-8 justify-center max-w-[1230px] mx-auto w-full", alignClass, fullHeight ? "min-h-[80vh]" : "")}
      >
        {!!s.heading && (
          <h1
            className="text-4xl sm:text-5xl font-bold leading-tight max-w-3xl"
            style={{ color: textColor, fontFamily: theme.font_heading ?? "Inter" }}
          >
            {str(s.heading)}
          </h1>
        )}
        {!!s.subheading && (
          <p className="text-lg max-w-xl" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.cta_text && (
          <div>
            <a
              href={str(s.cta_url, "#")}
              className="inline-block px-6 py-3 text-[15px] font-semibold transition-opacity hover:opacity-90"
              style={ctaStyles}
            >
              {str(s.cta_text)}
            </a>
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function RichTextSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const bodyColor = c.paragraph
  const align = str(s.alignment, "left")
  const maxWidthMap: Record<string, string> = { narrow: "max-w-xl", medium: "max-w-2xl", wide: "max-w-4xl", full: "max-w-none" }
  const mw = maxWidthMap[str(s.max_width, "medium")] ?? "max-w-2xl"

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("px-8 py-16 mx-auto", mw === "max-w-none" ? "max-w-[1230px]" : mw)} style={{ textAlign: align as any }}>
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-4" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.body && (
          <p className="text-lg leading-relaxed" style={{ color: bodyColor }}>
            {str(s.body)}
          </p>
        )}
      </div>
    </SectionWrapper>
  )
}

function ImageBannerSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "3:1": "aspect-[3/1]", "4:3": "aspect-[4/3]", auto: "" }
  const aspect = aspectMap[str(s.aspect_ratio, "16:9")] ?? "aspect-video"
  const textColor = c.image_overlay_text

  return (
    <SectionWrapper isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("relative w-full overflow-hidden bg-neutral-200", aspect)}>
        {s.image_url ? (
          <img src={str(s.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-300 to-neutral-400 flex items-center justify-center">
            <span className="text-neutral-500 text-sm">Add an image</span>
          </div>
        )}
        {!!(s.heading || s.subheading) && (
          <>
            <div className="absolute inset-0" style={{ background: "#000", opacity: (Number(s.overlay_opacity ?? 30)) / 100 }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center">
              {!!s.heading && <h2 className="text-3xl font-bold" style={{ color: textColor }}>{str(s.heading)}</h2>}
              {!!s.subheading && <p className="text-lg opacity-80" style={{ color: textColor }}>{str(s.subheading)}</p>}
            </div>
          </>
        )}
      </div>
    </SectionWrapper>
  )
}

function ProductListSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cardBg = c.bg === "#ffffff" ? "#f8fafc" : c.bg
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }

  // Placeholder products
  const placeholders = Array.from({ length: parseInt(cols, 10) }, (_, i) => ({
    id: i,
    name: ["Digital Template Pack", "Course Bundle", "Icon Set Pro"][i % 3],
    price: ["$29", "$99", "$49"][i % 3],
    img: null,
  }))

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>
            {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        <div className={cn("grid gap-6", colClass[cols] ?? "grid-cols-3")}>
          {placeholders.map(p => (
            <div key={p.id} className="rounded-xl overflow-hidden border" style={{ borderColor: c.inset_border, background: cardBg }}>
              <div className="aspect-[4/3] bg-gradient-to-br from-neutral-200 to-neutral-300 flex items-center justify-center">
                <span className="text-neutral-400 text-xs">Product image</span>
              </div>
              <div className="p-4">
                <div className="font-semibold text-[14px] mb-1" style={{ color: headingColor }}>{p.name}</div>
                {bool(s.show_price) && <div className="text-[13px] font-bold" style={{ color: c.link }}>{p.price}</div>}
                {bool(s.show_button) && (
                  <button
                    className="mt-3 w-full py-1.5 text-[13px] font-semibold"
                    style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
                  >
                    Buy now
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}

function TestimonialsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cardBg = c.bg === "#ffffff" ? "#f8fafc" : c.bg
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add testimonial blocks in the sidebar</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {blocks.map(block => (
              <div key={block.id} className="rounded-xl p-6 border" style={{ background: cardBg, borderColor: c.inset_border }}>
                <p className="text-[14px] leading-relaxed mb-4" style={{ color: paraColor }}>
                  &ldquo;{str(block.settings.quote)}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  {block.settings.avatar_url ? (
                    <img src={str(block.settings.avatar_url)} className="h-8 w-8 rounded-full object-cover" alt="" loading="lazy" decoding="async" />
                  ) : (
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: c.primary_btn_bg, color: c.primary_btn_text }}>
                      {str(block.settings.author).charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-[13px] font-semibold" style={{ color: headingColor }}>{str(block.settings.author)}</div>
                    <div className="text-[11px]" style={{ color: paraColor }}>{str(block.settings.role)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function FaqSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const borderColor = c.inset_border
  const textColor = paraColor
  const blocks = section.blocks ?? []
  const [open, setOpen] = useState<string | null>(null)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="max-w-2xl mx-auto px-8 py-16">
        {!!s.heading && (
          <h2 className="text-3xl font-bold text-center mb-10" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        <div className="space-y-2">
          {blocks.map(block => (
            <div key={block.id} className="border rounded-lg overflow-hidden" style={{ borderColor: borderColor }}>
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left"
                style={{ color: headingColor }}
                onClick={() => setOpen(open === block.id ? null : block.id)}
              >
                <span className="font-medium text-[14px]">{str(block.settings.question)}</span>
                {open === block.id ? <ChevronUp className="h-4 w-4 opacity-50" /> : <ChevronDown className="h-4 w-4 opacity-50" />}
              </button>
              {open === block.id && (
                <div className="px-5 pb-4 text-[14px]" style={{ color: textColor }}>
                  {str(block.settings.answer)}
                </div>
              )}
            </div>
          ))}
          {blocks.length === 0 && (
            <p className="text-center text-sm opacity-40" style={{ color: textColor }}>Add FAQ items in the sidebar</p>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function CtaSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 text-center max-w-[1230px] mx-auto">
        {!!s.heading && (
          <h2 className="text-3xl font-bold mb-3" style={{ color: headingColor, fontFamily: theme.font_heading }}>
            {str(s.heading)}
          </h2>
        )}
        {!!s.subheading && (
          <p className="text-lg mb-7 max-w-xl mx-auto" style={{ color: paraColor }}>
            {str(s.subheading)}
          </p>
        )}
        {!!s.button_text && (
          <a
            href={str(s.button_url, "#")}
            className="inline-block px-8 py-3 text-[15px] font-semibold"
            style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
          >
            {str(s.button_text)}
          </a>
        )}
      </div>
    </SectionWrapper>
  )
}

function StatsSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const textColor = c.paragraph
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-12 max-w-[1230px] mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {blocks.map(block => (
            <div key={block.id}>
              <div className="text-4xl font-bold mb-1" style={{ color: c.heading }}>
                {str(block.settings.value)}
              </div>
              <div className="text-[13px]" style={{ color: textColor }}>
                {str(block.settings.label)}
              </div>
            </div>
          ))}
          {blocks.length === 0 && (
            <div className="col-span-4 text-sm opacity-40 text-center" style={{ color: textColor }}>
              Add stat blocks in the sidebar
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function FeatureGridSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!(s.heading || s.subheading) && (
          <div className="text-center mb-10">
            {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
            {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
          </div>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add feature blocks in the sidebar</p>
        ) : (
          <div className={cn("grid gap-8", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="flex flex-col gap-3">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: c.primary_btn_bg, color: c.primary_btn_text }}>
                  <DynamicIcon name={str(block.settings.icon, "zap")} className="h-5 w-5" />
                </div>
                <div className="font-semibold text-[15px]" style={{ color: headingColor }}>{str(block.settings.title)}</div>
                <div className="text-[13px] leading-relaxed" style={{ color: paraColor }}>{str(block.settings.description)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function PricingSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        <div className="text-center mb-10">
          {!!s.heading && <h2 className="text-3xl font-bold mb-2" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.subheading && <p className="text-base" style={{ color: paraColor }}>{str(s.subheading)}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {blocks.map(block => {
            const featured = bool(block.settings.is_featured)
            return (
              <div
                key={block.id}
                className="rounded-2xl border p-6 flex flex-col gap-4"
                style={{
                  borderColor: featured ? c.primary_btn_bg : c.plan_border,
                  background: featured ? c.primary_btn_bg : c.plan_bg,
                }}
              >
                <div>
                  <div className="font-bold text-[15px]" style={{ color: featured ? c.primary_btn_text : c.plan_heading }}>{str(block.settings.name)}</div>
                  {!!block.settings.description && <div className="text-[12px] mt-0.5" style={{ color: featured ? c.primary_btn_text : c.plan_paragraph }}>{str(block.settings.description)}</div>}
                </div>
                <div>
                  <span className="text-3xl font-bold" style={{ color: featured ? c.primary_btn_text : c.plan_heading }}>{str(block.settings.price)}</span>
                  <span className="text-[12px] ml-1" style={{ color: featured ? c.primary_btn_text : c.plan_paragraph }}>{str(block.settings.period)}</span>
                </div>
                {!!block.settings.cta_text && (
                  <a
                    href={str(block.settings.cta_url, "#")}
                    className="text-center py-2 text-[13px] font-semibold"
                    style={{
                      background: featured ? c.primary_btn_text : c.primary_btn_bg,
                      color: featured ? c.primary_btn_bg : c.primary_btn_text,
                      ...buttonRadiusStyle(theme),
                    }}
                  >
                    {str(block.settings.cta_text)}
                  </a>
                )}
              </div>
            )
          })}
          {blocks.length === 0 && (
            <div className="col-span-3 text-center text-sm opacity-40" style={{ color: paraColor }}>Add pricing plan blocks in the sidebar</div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

function LogoBarSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const paraColor = c.paragraph
  const blocks = section.blocks ?? []
  const grayscale = bool(s.grayscale, true)

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-10 max-w-[1230px] mx-auto">
        {!!s.heading && (
          <p className="text-center text-sm font-medium mb-6 uppercase tracking-widest" style={{ color: paraColor }}>
            {str(s.heading)}
          </p>
        )}
        {blocks.length === 0 ? (
          <p className="text-center text-sm opacity-40" style={{ color: paraColor }}>Add logo blocks in the sidebar</p>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-8">
            {blocks.map(block => (
              <div key={block.id} className={cn("h-8", grayscale && "grayscale opacity-60")}>
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.alt)} className="h-full w-auto object-contain" loading="lazy" decoding="async" />
                ) : (
                  <div className="h-8 w-20 bg-neutral-300 rounded flex items-center justify-center text-[10px] text-neutral-500">Logo</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function GallerySection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const cols = str(s.columns, "3")
  const colClass: Record<string, string> = { "2": "grid-cols-2", "3": "grid-cols-3", "4": "grid-cols-4" }
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-16 max-w-[1230px] mx-auto">
        {!!s.heading && <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: c.heading, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
        {blocks.length === 0 ? (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {Array.from({ length: parseInt(cols, 10) }).map((_, i) => (
              <div key={i} className="aspect-square bg-neutral-100 rounded-xl flex items-center justify-center text-xs text-neutral-400">Photo</div>
            ))}
          </div>
        ) : (
          <div className={cn("grid gap-4", colClass[cols] ?? "grid-cols-3")}>
            {blocks.map(block => (
              <div key={block.id} className="aspect-square rounded-xl overflow-hidden">
                {block.settings.image_url ? (
                  <img src={str(block.settings.image_url)} alt={str(block.settings.caption)} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                ) : (
                  <div className="w-full h-full bg-neutral-200 flex items-center justify-center text-xs text-neutral-400">Image</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

function FooterSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  // Footers default to the "dark" scheme when no scheme is explicitly set
  const schemeKey = typeof s.color_scheme === "string" ? s.color_scheme : "dark"
  const c = resolveScheme(theme, schemeKey)
  const bg = c.bg
  const headingColor = c.heading
  const linkColor = c.footer_link
  const linkUnderlineColor = c.footer_link_underline
  const blocks = section.blocks ?? []

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-[1230px] mx-auto">
        <div>
          <div className="font-bold text-[15px] mb-1" style={{ color: headingColor }}>
            {str(s.logo_text, theme.brand_name ?? "My Store")}
          </div>
          <div className="text-[12px]" style={{ color: c.paragraph }}>
            {str(s.copyright, `© ${new Date().getFullYear()} My Store`)}
          </div>
        </div>
        {blocks.length > 0 && (
          <div className="flex items-center gap-4 flex-wrap">
            {blocks.map(block => (
              <a
                key={block.id}
                href={str(block.settings.url, "#")}
                className="text-[13px] hover:opacity-100 transition-opacity"
                style={{ color: linkColor, textDecorationColor: linkUnderlineColor }}
              >
                {str(block.settings.label)}
              </a>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

// ── Product section (single product page) ────────────────────
function ProductSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const layout = str(s.product_layout, "two_column")
  const imageWidth = str(s.image_width, "55%")
  const colorScheme = str(s.color_scheme, "white")
  const showWishlist = bool(s.show_wishlist, true)
  const showShare = bool(s.show_share_button, true)
  const showWhatsIncluded = bool(s.show_whats_included, true)
  const [showAllFiles, setShowAllFiles] = useState(false)

  // Product data is injected via section.settings._product_data by the editor
  const productData = (s._product_data as Record<string, unknown> | undefined) ?? null

  const title = str(productData?.title as unknown, "Product Title")
  const description = str(productData?.description as unknown, "Product description will appear here. This is where you describe your product in detail, including features, benefits, and what makes it special.")
  const priceCents = typeof productData?.price_cents === "number" ? productData.price_cents : 2999
  const compareAtCents = typeof productData?.compare_at_cents === "number" ? productData.compare_at_cents : null
  const thumbnailUrl = str(productData?.thumbnail_url as unknown, "")
  const galleryUrls: string[] = Array.isArray(productData?.gallery_urls) ? (productData.gallery_urls as string[]) : []
  const whatsIncluded: string[] = Array.isArray(productData?.whats_included) ? (productData.whats_included as string[]) : []
  const files: { file_name: string; file_size: number; mime_type: string }[] = Array.isArray(productData?.files) ? (productData.files as any[]) : []

  const allImages = thumbnailUrl ? [thumbnailUrl, ...galleryUrls] : galleryUrls
  const [activeImage, setActiveImage] = useState(0)

  const formatPrice = (cents: number) => {
    const val = cents / 100
    return val % 1 === 0 ? `$${val}` : `$${val.toFixed(2)}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const getFileExtension = (name: string) => {
    const ext = name.split(".").pop()?.toUpperCase() ?? ""
    return ext
  }

  const isOnSale = compareAtCents && compareAtCents > priceCents
  const discount = isOnSale ? Math.round(((compareAtCents - priceCents) / compareAtCents) * 100) : 0

  // Resolve the full global color scheme so the product section tracks
  // whatever the creator configured in General Settings → Color Schemes.
  const resolved = resolveScheme(theme, colorScheme)
  const scheme = {
    bg: resolved.bg,
    text: resolved.paragraph,
    muted: resolved.paragraph,
    surface: resolved.bg === "#ffffff" ? "#f8fafc" : resolved.bg,
    border: resolved.inset_border,
  }
  const primaryColor = resolved.primary_btn_bg

  const visibleFiles = showAllFiles ? files : files.slice(0, 4)

  return (
    <SectionWrapper bgColor={scheme.bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div
        className={cn("w-full mx-auto", layout === "one_column" ? "max-w-2xl px-6" : "max-w-[1230px] flex flex-col md:flex-row")}
        style={{ color: scheme.text, paddingTop: `${s.padding_top ?? 48}px`, paddingBottom: `${s.padding_bottom ?? 48}px` }}
      >
        {/* Image column */}
        <div
          className={cn(layout === "two_column" ? "px-6 md:px-8" : "mb-8")}
          style={layout === "two_column" ? { width: imageWidth, flexShrink: 0 } : undefined}
        >
          {allImages.length > 0 ? (
            <div>
              {/* Main image */}
              <div className="w-full overflow-hidden rounded-lg" style={{ background: scheme.surface }}>
                <img
                  src={allImages[activeImage] ?? allImages[0]}
                  alt={title}
                  className="w-full h-auto object-contain"
                  style={{ maxHeight: "600px" }}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              {/* Thumbnails */}
              {allImages.length > 1 && (
                <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                  {allImages.map((img, i) => (
                    <button
                      key={i}
                      className={cn(
                        "w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 transition-all",
                        activeImage === i ? "border-current opacity-100" : "opacity-50 hover:opacity-80"
                      )}
                      style={{ borderColor: activeImage === i ? primaryColor : scheme.border }}
                      onClick={e => { e.stopPropagation(); setActiveImage(i) }}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              className="w-full aspect-[4/5] rounded-lg flex items-center justify-center"
              style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}
            >
              <div className="text-center" style={{ color: scheme.muted }}>
                <Package className="h-12 w-12 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Product image</p>
              </div>
            </div>
          )}
        </div>

        {/* Content column */}
        <div className={cn("flex-1 min-w-0", layout === "two_column" ? "px-6 md:px-8 py-4" : "")}>
          {/* Sale badge */}
          {isOnSale && (
            <span
              className="inline-block px-3 py-1 text-xs font-bold text-white rounded-full mb-4"
              style={{ background: "#16a34a" }}
            >
              On Sale
            </span>
          )}

          {/* Title */}
          <h1
            className="text-2xl md:text-3xl font-bold mb-4 leading-tight"
            style={{ fontFamily: theme.font_heading, color: scheme.text }}
          >
            {title}
          </h1>

          {/* Pricing */}
          <div className="flex items-baseline gap-3 mb-6">
            {isOnSale && (
              <span className="text-lg line-through" style={{ color: scheme.muted }}>
                {formatPrice(compareAtCents)}
              </span>
            )}
            {isOnSale && (
              <span className="text-sm" style={{ color: scheme.muted }}>
                ({discount}% off)
              </span>
            )}
            <span className="text-2xl font-bold" style={{ color: scheme.text }}>
              {priceCents === 0 ? "Free" : formatPrice(priceCents)}
            </span>
          </div>

          {/* CTA Buttons */}
          <div className="space-y-3 mb-6">
            <button
              className="w-full py-3.5 text-base font-semibold border-2 rounded-lg transition-colors"
              style={{ borderColor: primaryColor, color: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              Add to Cart
            </button>
            <button
              className="w-full py-3.5 text-base font-semibold text-white rounded-lg transition-colors"
              style={{ background: primaryColor, ...buttonRadiusStyle(theme) }}
            >
              Buy Now
            </button>
          </div>

          {/* Wishlist + Share */}
          <div className="flex items-center gap-4 mb-6" style={{ color: scheme.muted }}>
            {showWishlist && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Heart className="h-4 w-4" />
                <span className="underline">Add to wishlist</span>
              </button>
            )}
            {showShare && (
              <button className="flex items-center gap-1.5 text-sm hover:opacity-80 transition-opacity">
                <Share2 className="h-4 w-4" />
                <span className="underline">Share</span>
              </button>
            )}
          </div>

          {/* Description */}
          <div className="mb-6">
            <div
              className="text-sm leading-relaxed whitespace-pre-wrap"
              style={{ color: scheme.text }}
              dangerouslySetInnerHTML={{ __html: description }}
            />
          </div>

          {/* What you'll get */}
          {showWhatsIncluded && (files.length > 0 || whatsIncluded.length > 0) && (
            <div className="mb-6 p-4 rounded-lg" style={{ background: scheme.surface, border: `1px solid ${scheme.border}` }}>
              {files.length > 0 && (
                <>
                  <p className="text-sm font-semibold mb-1" style={{ color: scheme.text }}>
                    You will get the following files:
                  </p>
                  <div className="space-y-1.5 mb-3">
                    {visibleFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between text-sm" style={{ color: scheme.muted }}>
                        <span className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          {getFileExtension(f.file_name)} ({formatFileSize(f.file_size)})
                        </span>
                      </div>
                    ))}
                  </div>
                  {files.length > 4 && !showAllFiles && (
                    <button
                      className="text-sm font-medium underline"
                      style={{ color: primaryColor }}
                      onClick={e => { e.stopPropagation(); setShowAllFiles(true) }}
                    >
                      Show all ({files.length} files)
                    </button>
                  )}
                  {showAllFiles && files.length > 4 && (
                    <button
                      className="text-sm font-medium underline"
                      style={{ color: primaryColor }}
                      onClick={e => { e.stopPropagation(); setShowAllFiles(false) }}
                    >
                      Show less
                    </button>
                  )}
                </>
              )}

              {whatsIncluded.length > 0 && (
                <div className={files.length > 0 ? "mt-3 pt-3" : ""} style={files.length > 0 ? { borderTop: `1px solid ${scheme.border}` } : undefined}>
                  <p className="text-sm font-semibold mb-2" style={{ color: scheme.text }}>
                    What you&apos;re getting:
                  </p>
                  <ul className="space-y-1.5">
                    {whatsIncluded.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: scheme.muted }}>
                        <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: "#16a34a" }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

// ── Image with Text (split_content) ──────────────────────────
function SplitContentSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const headingColor = c.heading
  const paraColor = c.paragraph
  const imagePos = str(s.image_position, "left")
  const imgUrl = str(s.image_url, "")

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className={cn("flex flex-col md:flex-row items-center gap-8 px-8 max-w-[1230px] mx-auto", imagePos === "right" && "md:flex-row-reverse")} style={{ paddingTop: `${s.padding_top ?? 60}px`, paddingBottom: `${s.padding_bottom ?? 60}px` }}>
        <div className="flex-1 min-w-0">
          {imgUrl ? (
            <img src={imgUrl} alt="" className="w-full h-auto rounded-lg object-cover" style={{ maxHeight: "500px" }} loading="lazy" decoding="async" />
          ) : (
            <div className="w-full aspect-[4/3] rounded-lg bg-neutral-100 flex items-center justify-center">
              <span className="text-neutral-400 text-sm">Image</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {!!s.heading && <h2 className="text-3xl font-bold mb-4" style={{ color: headingColor, fontFamily: theme.font_heading }}>{str(s.heading)}</h2>}
          {!!s.text && <p className="text-base leading-relaxed mb-6" style={{ color: paraColor }}>{str(s.text)}</p>}
          {!!s.button_text && (
            <a
              href={str(s.button_link, "#")}
              className="inline-block px-6 py-3 text-sm font-semibold"
              style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
            >
              {str(s.button_text)}
            </a>
          )}
        </div>
      </div>
    </SectionWrapper>
  )
}

// ── Slideshow ────────────────────────────────────────────────
function SlideshowSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg === "#ffffff" ? "#000000" : c.bg
  const blocks = section.blocks ?? []
  const [activeSlide, setActiveSlide] = useState(0)

  const slides = blocks.length > 0 ? blocks : [
    { id: "1", type: "slide", settings: { image_url: "", heading: "Slide 1", subheading: "Your first slide", button_text: "Shop Now" } },
    { id: "2", type: "slide", settings: { image_url: "", heading: "Slide 2", subheading: "Your second slide", button_text: "Learn More" } },
  ]

  const slide = slides[activeSlide] ?? slides[0]
  const slideSettings = slide?.settings ?? {}

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="relative w-full" style={{ height: `${s.height ?? 500}px` }}>
        {str(slideSettings.image_url as unknown) ? (
          <img src={str(slideSettings.image_url as unknown)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-900" />
        )}
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white">
          <div className="max-w-[1230px] mx-auto w-full px-8 text-center flex flex-col items-center">
            {!!slideSettings.heading && <h2 className="text-4xl md:text-5xl font-bold mb-4" style={{ fontFamily: theme.font_heading }}>{str(slideSettings.heading as unknown)}</h2>}
            {!!slideSettings.subheading && <p className="text-lg opacity-80 max-w-xl mb-6">{str(slideSettings.subheading as unknown)}</p>}
            {!!slideSettings.button_text && (
              <button
                className="px-8 py-3 text-sm font-semibold"
                style={{ background: c.primary_btn_bg, color: c.primary_btn_text, border: `1px solid ${c.primary_btn_border}`, ...buttonRadiusStyle(theme) }}
              >
                {str(slideSettings.button_text as unknown)}
              </button>
            )}
          </div>
        </div>
        {/* Dots */}
        {slides.length > 1 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            {slides.map((_, i) => (
              <button key={i} className={cn("w-2.5 h-2.5 rounded-full transition-all", i === activeSlide ? "bg-white" : "bg-white/40")} onClick={e => { e.stopPropagation(); setActiveSlide(i) }} />
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  )
}

// ── Image Section (single image) ─────────────────────────────
function ImageSection({ section, theme, isEditing, isSelected, onClick }: SectionProps) {
  const s = section.settings
  const c = sectionColors(section, theme)
  const bg = c.bg
  const imgUrl = str(s.image_url, "")
  const caption = str(s.caption, "")
  const aspectRatio = str(s.aspect_ratio, "auto")

  const aspectMap: Record<string, string> = { "16:9": "aspect-video", "4:3": "aspect-[4/3]", "1:1": "aspect-square", "auto": "" }

  return (
    <SectionWrapper bgColor={bg} isEditing={isEditing} isSelected={isSelected} onClick={onClick}>
      <div className="px-8 max-w-[1230px] mx-auto" style={{ paddingTop: `${s.padding_top ?? 40}px`, paddingBottom: `${s.padding_bottom ?? 40}px` }}>
        {imgUrl ? (
          <img src={imgUrl} alt={caption} className={cn("w-full h-auto rounded-lg object-cover", aspectMap[aspectRatio])} loading="lazy" decoding="async" />
        ) : (
          <div className={cn("w-full rounded-lg bg-neutral-100 flex items-center justify-center", aspectMap[aspectRatio] || "aspect-video")}>
            <span className="text-neutral-400 text-sm">Add an image</span>
          </div>
        )}
        {caption && <p className="text-center text-sm text-neutral-500 mt-3">{caption}</p>}
      </div>
    </SectionWrapper>
  )
}

// ── Section registry ─────────────────────────────────────────
const SECTION_COMPONENTS: Record<string, React.ComponentType<SectionProps>> = {
  header: HeaderSection,
  hero: HeroSection,
  rich_text: RichTextSection,
  image_banner: ImageBannerSection,
  split_content: SplitContentSection,
  image_section: ImageSection,
  slideshow: SlideshowSection,
  product: ProductSection,
  product_list: ProductListSection,
  testimonials: TestimonialsSection,
  faq: FaqSection,
  cta: CtaSection,
  stats: StatsSection,
  feature_grid: FeatureGridSection,
  pricing: PricingSection,
  logo_bar: LogoBarSection,
  gallery: GallerySection,
  footer: FooterSection,
}

// ── Public API ────────────────────────────────────────────────
export function renderSection(props: SectionProps) {
  if (props.section.hidden) return null
  const Component = SECTION_COMPONENTS[props.section.type]
  if (!Component) {
    return (
      <div className="p-4 bg-red-50 text-red-500 text-sm text-center border border-red-200">
        Unknown section type: <code>{props.section.type}</code>
      </div>
    )
  }
  return <Component {...props} />
}

export default function SectionRenderer(props: SectionProps) {
  return renderSection(props) ?? null
}
