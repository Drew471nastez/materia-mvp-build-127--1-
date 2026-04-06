"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Search, ShoppingBag, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type {
  ShopHeaderSettings,
  HeaderColorScheme,
  NavLink,
} from "@/lib/store-builder/types"
import { defaultNavLinks } from "@/lib/store-builder/defaults"

// ─── Color schemes ─────────────────────────────────────────────────────────
// Each scheme is a flat token map so the renderer can swap palettes without
// touching markup. Mirrors the editor preview swatches (White / Light / Dark
// / Black / Highlight).
const COLOR_SCHEMES: Record<
  HeaderColorScheme,
  { background: string; text: string; mutedText: string; border: string; iconHover: string }
> = {
  white:     { background: "#ffffff", text: "#111111", mutedText: "#4b5563", border: "#e5e7eb", iconHover: "rgba(0,0,0,0.06)" },
  light:     { background: "#f8f9fb", text: "#111111", mutedText: "#4b5563", border: "#e5e7eb", iconHover: "rgba(0,0,0,0.06)" },
  dark:      { background: "#1f2937", text: "#ffffff", mutedText: "#cbd5e1", border: "rgba(255,255,255,0.12)", iconHover: "rgba(255,255,255,0.10)" },
  black:     { background: "#000000", text: "#ffffff", mutedText: "#cbd5e1", border: "rgba(255,255,255,0.12)", iconHover: "rgba(255,255,255,0.10)" },
  highlight: { background: "#fde7e0", text: "#1a1a1a", mutedText: "#4b5563", border: "#f4cdc0", iconHover: "rgba(0,0,0,0.06)" },
}

interface StoreHeaderBarProps {
  settings: ShopHeaderSettings
  username: string
  storeDisplayName?: string
  // Optional override — used by editor preview to render even when the user
  // hasn't customised anything yet.
  forceVisible?: boolean
}

/**
 * Storefront top header bar.
 *
 * Renders the configurable logo / store title, navigation links, and the
 * built-in search + cart utility icons. Clicking the cart icon opens a
 * smooth slide-in drawer from the right edge of the viewport.
 *
 * All visual settings (layout, color scheme, spacing, transparency, fixed
 * position) come straight off the ShopHeaderSettings stored on the page
 * config — see lib/store-builder/types.ts.
 */
export function StoreHeaderBar({
  settings,
  username,
  storeDisplayName,
}: StoreHeaderBarProps) {
  const [cartOpen, setCartOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  const scheme = COLOR_SCHEMES[settings.headerColorScheme || "white"]
  const transparent = settings.headerTransparent === true
  const fixed = settings.headerFixed === true
  const widthFixed = settings.headerWidth === "fixed"
  const layout = settings.headerLayout || "logo-left-nav-right"

  const navLinks: NavLink[] =
    settings.navLinks && settings.navLinks.length > 0 ? settings.navLinks : defaultNavLinks

  const linkColor = settings.navLinkColor || scheme.text
  const verticalPaddingVw = settings.headerVerticalPaddingVw ?? 1.2
  const linkSpacingVw = settings.headerLinkSpacingVw ?? 1.4
  const logoHeight = settings.logoHeight ?? 64

  // Lock body scroll when the cart drawer is open
  useEffect(() => {
    if (cartOpen) {
      const prev = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = prev
      }
    }
  }, [cartOpen])

  // Close on escape
  useEffect(() => {
    if (!cartOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCartOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [cartOpen])

  // ─── Logo / store title ────────────────────────────────────────────────
  const renderBrand = () => (
    <Link
      href={`/u/${username}`}
      className="flex items-center shrink-0"
      style={{ color: scheme.text }}
      aria-label={settings.storeTitle || storeDisplayName || username}
    >
      {settings.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.logoUrl}
          alt={settings.storeTitle || storeDisplayName || username}
          className={cn("w-auto object-contain select-none", settings.useMobileLogo && settings.mobileLogoUrl && "hidden md:block")}
          style={{ height: `${logoHeight}px`, maxHeight: `${logoHeight}px` }}
          draggable={false}
        />
      ) : (
        <span
          className="text-lg sm:text-xl font-semibold tracking-tight"
          style={{ color: scheme.text }}
        >
          {settings.storeTitle || storeDisplayName || username}
        </span>
      )}
      {settings.useMobileLogo && settings.mobileLogoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={settings.mobileLogoUrl}
          alt={settings.storeTitle || storeDisplayName || username}
          className="md:hidden w-auto object-contain select-none"
          style={{ height: `${Math.min(logoHeight, 40)}px` }}
          draggable={false}
        />
      )}
    </Link>
  )

  // ─── Navigation list ────────────────────────────────────────────────────
  const renderNav = (extraClass?: string) => (
    <nav
      className={cn("hidden md:flex items-center", extraClass)}
      style={{ columnGap: `${linkSpacingVw}vw` }}
    >
      {navLinks.map((link) => (
        <Link
          key={link.id}
          href={link.url || "#"}
          target={link.openInNewTab ? "_blank" : undefined}
          rel={link.openInNewTab ? "noopener noreferrer" : undefined}
          className="text-[14px] font-medium tracking-tight transition-opacity hover:opacity-70 whitespace-nowrap"
          style={{ color: linkColor }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  )

  // ─── Utility icons (search + cart) ──────────────────────────────────────
  const renderUtilityIcons = () => (
    <div className="flex items-center gap-1 shrink-0">
      {settings.headerShowSearch !== false && (
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          aria-label="Search"
          className="w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors"
          style={{ color: scheme.text }}
          onMouseEnter={(e) => (e.currentTarget.style.background = scheme.iconHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Search className="w-[18px] h-[18px]" />
        </button>
      )}
      {settings.headerShowCart !== false && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          aria-label="Open cart"
          className="w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors"
          style={{ color: scheme.text }}
          onMouseEnter={(e) => (e.currentTarget.style.background = scheme.iconHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <ShoppingBag className="w-[18px] h-[18px]" />
        </button>
      )}
    </div>
  )

  // ─── Layout assembly ────────────────────────────────────────────────────
  // The five layout variants from the editor's "Header Layout" picker.
  let bodyContent: ReactNode
  switch (layout) {
    case "logo-left-nav-inline":
      bodyContent = (
        <>
          <div className="flex items-center gap-6">
            {renderBrand()}
            {renderNav()}
          </div>
          {renderUtilityIcons()}
        </>
      )
      break
    case "logo-left-nav-center":
      bodyContent = (
        <>
          {renderBrand()}
          {renderNav("absolute left-1/2 -translate-x-1/2")}
          {renderUtilityIcons()}
        </>
      )
      break
    case "nav-left-logo-center":
      bodyContent = (
        <>
          {renderNav()}
          <div className="absolute left-1/2 -translate-x-1/2">{renderBrand()}</div>
          {renderUtilityIcons()}
        </>
      )
      break
    case "logo-center-nav-below":
      bodyContent = (
        <div className="w-full flex flex-col items-center gap-2">
          <div className="w-full flex items-center justify-between">
            <span className="w-9" />
            {renderBrand()}
            {renderUtilityIcons()}
          </div>
          {renderNav("justify-center")}
        </div>
      )
      break
    case "logo-left-nav-right":
    default:
      bodyContent = (
        <>
          {renderBrand()}
          <div className="flex items-center gap-6">
            {renderNav()}
            {renderUtilityIcons()}
          </div>
        </>
      )
  }

  return (
    <>
      <header
        className={cn(
          "w-full z-40",
          fixed && "sticky top-0",
          transparent ? "bg-transparent" : undefined,
        )}
        style={{
          background: transparent ? "transparent" : scheme.background,
          color: scheme.text,
          borderBottom: transparent ? undefined : `1px solid ${scheme.border}`,
        }}
      >
        <div
          className={cn(
            "mx-auto px-4 sm:px-6 flex items-center justify-between relative",
            widthFixed ? "max-w-6xl" : "w-full",
          )}
          style={{
            paddingTop: `${verticalPaddingVw}vw`,
            paddingBottom: `${verticalPaddingVw}vw`,
            minHeight: `${Math.max(logoHeight + 16, 64)}px`,
          }}
        >
          {bodyContent}
        </div>

        {/* Inline search bar — slides down when search icon is tapped */}
        {searchOpen && (
          <div
            className="border-t"
            style={{ borderColor: scheme.border, background: scheme.background }}
          >
            <div className={cn("mx-auto px-4 sm:px-6 py-3", widthFixed ? "max-w-6xl" : "w-full")}>
              <input
                autoFocus
                type="search"
                placeholder="Search products..."
                className="w-full bg-transparent outline-none text-[15px] py-2"
                style={{ color: scheme.text, caretColor: scheme.text }}
              />
            </div>
          </div>
        )}
      </header>

      {/* ─── Cart drawer ───────────────────────────────────────────────── */}
      <div
        aria-hidden={!cartOpen}
        className={cn(
          "fixed inset-0 z-[80] transition-opacity duration-300",
          cartOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={() => setCartOpen(false)}
      />
      <aside
        role="dialog"
        aria-label="Shopping cart"
        aria-hidden={!cartOpen}
        className={cn(
          "fixed top-0 right-0 bottom-0 z-[81] w-full sm:w-[420px] bg-white shadow-2xl flex flex-col",
          "transform transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          cartOpen ? "translate-x-0" : "translate-x-full",
        )}
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900">Your cart</h2>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            aria-label="Close cart"
            className="w-9 h-9 inline-flex items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center justify-center text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <ShoppingBag className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-[15px] font-medium text-gray-900">Your cart is empty</p>
          <p className="text-[13px] text-gray-500 mt-1">Add products to get started.</p>
        </div>

        <div className="border-t border-gray-100 p-5">
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold hover:bg-black transition-colors"
          >
            Continue shopping
          </button>
        </div>
      </aside>
    </>
  )
}
