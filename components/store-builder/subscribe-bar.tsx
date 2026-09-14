"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { isNativeApp } from "@/lib/platform-utils"

// Button style presets
export type { ButtonStylePreset, SubscribeBarSettings } from "@/lib/store-builder/subscribe-text"
export { buttonStylePresets, getButtonText, getDisplayText } from "@/lib/store-builder/subscribe-text"

import type { ButtonStylePreset, SubscribeBarSettings } from "@/lib/store-builder/subscribe-text"
import { buttonStylePresets, getButtonText, getDisplayText } from "@/lib/store-builder/subscribe-text"

interface SubscribeBarProps {
  settings: SubscribeBarSettings
  creatorId: string
  onSubmit?: (email: string) => Promise<void>
}

/** Compute if a hex background is "dark" */
function isDarkHex(bg?: string): boolean {
  if (!bg) return true
  const hex = bg.trim()
  if (!hex.startsWith("#")) return true

  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.length === 6
        ? clean
        : null

  if (!full) return true

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return true

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 150
}

/**
 * Check if color is vibrant (saturated and not too dark/light)
 */
function isVibrantColor(hex?: string): boolean {
  if (!hex) return false
  const clean = hex.replace("#", "")
  if (clean.length !== 6 && clean.length !== 3) return false

  const full = clean.length === 3
    ? clean.split("").map((c) => c + c).join("")
    : clean

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return false

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) / 255

  return saturation > 0.4 && lightness > 0.2 && lightness < 0.8
}

/** Shared input classes - adaptive to background color */
function getAdaptiveInputClass(isDarkBackground: boolean, backgroundColor?: string, hasCustomColors?: boolean) {
  const isVibrant = isVibrantColor(backgroundColor)

  // If custom colors are provided via theme, use minimal styling and let inline styles take over
  if (hasCustomColors) {
    return cn(
      "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    )
  }

  return cn(
    "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    isDarkBackground || isVibrant
      ? "text-white placeholder:text-white/80 focus:placeholder:text-white/50 border-white/40 focus:border-white/70"
      : "text-gray-900 placeholder:text-gray-500 focus:placeholder:text-gray-400 border-gray-300 focus:border-gray-400",
  )
}

/** Generate input style object with theme colors */
function getInputStyle(settings: SubscribeBarSettings) {
  const style: React.CSSProperties = {}

  if (settings.inputBorderColor) {
    style.borderColor = settings.inputBorderColor
  }
  if (settings.inputTextColor) {
    style.color = settings.inputTextColor
  }
  if (settings.inputBackgroundColor) {
    style.backgroundColor = settings.inputBackgroundColor
  }

  return style
}

/** Check if custom input colors are provided by theme */
function hasThemeInputColors(settings: SubscribeBarSettings): boolean {
  return Boolean(
    settings.inputTextColor ||
    settings.inputPlaceholderColor ||
    settings.inputBorderColor ||
    settings.inputBackgroundColor
  )
}

/** Generate placeholder CSS for themed inputs */
function getPlaceholderStyle(placeholderColor?: string): string {
  if (!placeholderColor) return ''
  return `
    .subscribe-input-themed::placeholder {
      color: ${placeholderColor} !important;
    }
    .subscribe-input-themed:focus::placeholder {
      opacity: 0.7;
    }
  `
}

/**
 * Live subscribe bar component used on public pages
 * Uses FIXED positioning when sticky is enabled
 */
export function SubscribeBar({ settings, creatorId, onSubmit }: SubscribeBarProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [subscribed, setSubscribed] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string>("")
  const [isHydrated, setIsHydrated] = useState(false)
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)

  // Extract solid color first, then check if dark
  const computedSolidBgColor = useMemo(() => extractSolidColor(settings.backgroundColor), [settings.backgroundColor])
  const isDarkBackground = useMemo(() => isDarkHex(computedSolidBgColor), [computedSolidBgColor])
  const hasCustomInputColors = useMemo(() => hasThemeInputColors(settings), [settings.inputTextColor, settings.inputPlaceholderColor, settings.inputBorderColor, settings.inputBackgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor, hasCustomInputColors), [isDarkBackground, settings.backgroundColor, hasCustomInputColors])
  const inputStyle = useMemo(() => getInputStyle(settings), [settings.inputBorderColor, settings.inputTextColor, settings.inputBackgroundColor])
  const placeholderStyleCSS = useMemo(() => getPlaceholderStyle(settings.inputPlaceholderColor), [settings.inputPlaceholderColor])

  // Sticky on scroll up behavior
  useEffect(() => {
    if (!settings.enableStickyBar || !settings.enableStickyOnScrollUp) {
      setIsVisible(true)
      return
    }

    /**
     * Smoothed on purpose. The previous version called setIsVisible() on EVERY
     * scroll event — a React re-render per scroll frame even when the answer had
     * not changed — and flipped on a single pixel of movement, so the bar
     * flickered in and out during the small jitter of a touch scroll or a
     * trackpad's momentum.
     *
     * Three things fix that: the work is read once per animation frame rather
     * than per event, a direction only counts once it exceeds a few pixels, and
     * state is only set when the answer actually changes.
     */
    const DELTA = 6      // ignore jitter smaller than this
    const TOP_ZONE = 50  // always visible near the top of the page
    let ticking = false

    const evaluate = () => {
      ticking = false
      const y = Math.max(window.scrollY, 0)
      const moved = y - lastScrollY.current

      if (y < TOP_ZONE) {
        setIsVisible((v) => (v ? v : true))
        lastScrollY.current = y
        return
      }
      if (Math.abs(moved) < DELTA) return   // too small to mean anything

      const next = moved < 0                // moving up → show
      setIsVisible((v) => (v === next ? v : next))
      lastScrollY.current = y
    }

    const handleScroll = () => {
      if (ticking) return
      ticking = true
      window.requestAnimationFrame(evaluate)
    }

    lastScrollY.current = Math.max(window.scrollY, 0)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [settings.enableStickyBar, settings.enableStickyOnScrollUp])

  /**
   * FIX: prevent “type 1 character then input blurs” on some pages where
   * a parent re-render / layout shift steals focus.
   *
   * We track whether the user is focused in the email input, and if a re-render
   * steals focus while they’re typing, we immediately restore focus.
   */
  const activeInputRef = useRef<HTMLInputElement | null>(null)
  const shouldRestoreFocusRef = useRef(false)

  const setSmartInputRef = (node: HTMLInputElement | null) => {
    if (!node) return
    // Prefer the actually visible input (desktop vs mobile) if both exist in DOM
    const isVisible = !!(node.offsetParent || node.getClientRects().length)
    if (isVisible) activeInputRef.current = node
  }

  const handleInputFocus = () => {
    shouldRestoreFocusRef.current = true
  }

  const handleInputBlur = () => {
    shouldRestoreFocusRef.current = false
  }

  useLayoutEffect(() => {
    if (!shouldRestoreFocusRef.current) return
    const el = activeInputRef.current
    if (!el) return
    if (document.activeElement === el) return

    // Only restore if user is still on the page (avoid weirdness on navigation)
    if (typeof document !== "undefined" && document.hasFocus()) {
      el.focus({ preventScroll: true })
    }
  }, [email, loading, subscribed, successMessage])

  useEffect(() => {
    const storageKey = `subscriber_${creatorId}`
    const saved = localStorage.getItem(storageKey)

    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { email?: string; subscribed?: boolean }
        setEmail(parsed.email || "")
        setSubscribed(Boolean(parsed.subscribed))
      } catch {
        // ignore
      }
    }

    setIsHydrated(true)
  }, [creatorId])

  useEffect(() => {
    if (!isHydrated) return
    const storageKey = `subscriber_${creatorId}`

    // Write after paint to avoid any chance of janky sync work during typing
    const write = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ email, subscribed }))
      } catch {
        // ignore
      }
    }

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      ;(window as any).requestIdleCallback(write, { timeout: 250 })
    } else {
      setTimeout(write, 0)
    }
  }, [email, subscribed, creatorId, isHydrated])

  useEffect(() => {
    if (!successMessage) return
    const timer = setTimeout(() => setSuccessMessage(""), 3000)
    return () => clearTimeout(timer)
  }, [successMessage])

  // IMPORTANT: All useMemo hooks must be called BEFORE any early returns to avoid React error #310
  const initials = useMemo(() =>
    settings.creatorName
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?",
    [settings.creatorName]
  )

  // Memoize avatar elements to prevent re-renders when email changes
  const mobileAvatar = useMemo(() => (
    settings.showAvatar ? (
      <Avatar className="h-6 w-6 shrink-0">
        {settings.avatarUrl ? (
          <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
        ) : null}
        <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
      </Avatar>
    ) : null
  ), [settings.showAvatar, settings.avatarUrl, settings.creatorName, initials])

  const desktopAvatar = useMemo(() => (
    settings.showAvatar ? (
      <Avatar className="h-8 w-8 shrink-0">
        {settings.avatarUrl ? (
          <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
        ) : null}
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>
    ) : null
  ), [settings.showAvatar, settings.avatarUrl, settings.creatorName, initials])

  // Early return AFTER all hooks
  if (!settings.visible || !isHydrated) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || loading) return

    setLoading(true)
    try {
      if (onSubmit) {
        await onSubmit(email)
      } else {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, creatorId }),
        })
      }

      /**
       * SUBSCRIBING ALSO FOLLOWS, when we know who is subscribing.
       *
       * The bar's job is "keep me posted about this creator", and a newsletter
       * row alone cannot answer "who follows them" — a follow points at an auth
       * user and an emailed address is not one. So a SIGNED-IN visitor gets
       * both: the email list and the follow graph.
       *
       * Deliberately best-effort and not awaited into the success path. A
       * signed-out visitor gets a 401 here and that is correct — they still
       * subscribed, and telling them their subscription failed because they do
       * not have an account would be a lie.
       */
      if (settings.creatorUserId) {
        void fetch("/api/follow", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorUserId: settings.creatorUserId, follow: true }),
        }).catch(() => {})
      }

      setSubscribed(true)
      setSuccessMessage(`You subscribed to ${settings.creatorName || "this creator"}`)
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleEmailChange = (newEmail: string) => {
    setEmail(newEmail)
    if (subscribed) setSubscribed(false)
  }

  const displayText = getDisplayText(settings, settings.creatorName)
  const buttonText = loading ? "..." : getButtonText(settings, subscribed)

  // In Capacitor native apps, disable sticky/fixed mode so the subscribe bar
  // sits in normal document flow — avoids overlapping the platform header.
  const isSticky = settings.enableStickyBar && !isNativeApp()

  // Always use solid color for live subscriber bar (no gradients)
  const solidBackgroundColor = extractSolidColor(settings.backgroundColor)

  // Render bar content directly (not as a component) to prevent remounting
  // Avatar elements are memoized separately to prevent re-renders
  const barContent = (
    <>
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      {/* MOBILE */}
      <div className="sm:hidden flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 justify-center">
          {mobileAvatar}
          <p className="text-xs font-medium">{displayText}</p>
        </div>

        {successMessage && <p className={cn("text-xs", isDarkBackground ? "text-white/80" : "text-green-600")}>{successMessage}</p>}

        <form onSubmit={handleSubmit} className="flex gap-2 items-center w-full">
          <Input
            ref={setSmartInputRef}
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="submit"
            disabled={loading || subscribed}
            className="shrink-0 h-8 px-3 text-xs"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </form>
      </div>

      {/* DESKTOP */}
      <div className="hidden sm:flex items-center justify-between gap-4 max-w-[1150px] mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          {desktopAvatar}
          <p className="text-sm font-medium">{displayText}</p>
          {successMessage && (
            <p className={cn("text-xs ml-2", isDarkBackground ? "text-white/80" : "text-green-600")}>{successMessage}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 items-center">
          <Input
            ref={setSmartInputRef}
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="submit"
            disabled={loading || subscribed}
            className="shrink-0 h-9 px-4"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </form>
      </div>
    </>
  )

  // STICKY MODE: Use fixed positioning for live pages
  // In Capacitor apps, offset below the platform header and use lower z-index
  // so the subscribe bar sits visually under the header, not on top of it.
  if (isSticky) {
    const inNativeApp = isNativeApp()
    const stickyTop = inNativeApp ? "calc(env(safe-area-inset-top, 0px) + 68px)" : "0px"
    // z-30 in native app (below header z-40), z-50 on web (above everything)
    const stickyZ = inNativeApp ? "z-30" : "z-50"
    return (
      <>
        {/* Fixed bar at top of viewport (below header in native apps) */}
        <div
          className={cn(
            "fixed left-0 right-0 w-full py-2.5 px-3 sm:py-3 sm:px-4 transition-transform duration-300 ease-out",
            stickyZ,
            isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border",
            !isVisible && settings.enableStickyOnScrollUp && "-translate-y-full"
          )}
          style={{
            top: stickyTop,
            // Always use solid background color (no gradients) on live published pages
            backgroundColor: solidBackgroundColor,
            color: settings.textColor || "#000000",
          }}
        >
          {barContent}
        </div>
        {/* Spacer to prevent content from hiding behind fixed bar */}
        <div className="h-[76px] sm:h-[52px]" />
      </>
    )
  }

  // NON-STICKY: Normal document flow
  return (
    <div
      className={cn(
        "w-full py-2.5 px-3 sm:py-3 sm:px-4",
        isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border"
      )}
      style={{
        // Always use solid background color (no gradients) on live published pages
        backgroundColor: solidBackgroundColor,
        color: settings.textColor || "#000000",
      }}
    >
      {barContent}
    </div>
  )
}

/** Editor preview version of subscribe bar */
interface EditorSubscribeBarProps {
  settings: SubscribeBarSettings
  creatorId: string
  isEditorPreview?: boolean
  isMobile?: boolean
  isSelected?: boolean
  onSelect?: () => void
  scrollContainerRef?: React.RefObject<HTMLElement | null>
}

/**
 * Extract solid color from gradient or return the color as-is
 * This ensures subscriber bar only uses solid background colors (no gradients)
 */
function extractSolidColor(color: string | undefined): string {
  if (!color) return "#ffffff"

  // If it's a gradient, extract the first color
  if (color.includes("gradient")) {
    // Match hex colors in gradient like "#ffffff" or "#e2e8f0"
    const hexMatch = color.match(/#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}/)
    if (hexMatch) {
      return hexMatch[0]
    }
    // Fallback to white if no hex found
    return "#ffffff"
  }

  return color
}

export function EditorSubscribeBar({ settings, creatorId, isEditorPreview, isMobile, isSelected, onSelect, scrollContainerRef }: EditorSubscribeBarProps) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)

  // Extract colors from either top level or nested colors object
  // IMPORTANT: Always use solid colors for subscriber bar (no gradients)
  const rawBackgroundColor = settings.backgroundColor || settings.colors?.backgroundColor || "#ffffff"
  const backgroundColor = extractSolidColor(rawBackgroundColor)
  const textColor = settings.textColor || settings.colors?.textColor || "#000000"

  // Hooks must be called before early return to avoid React error #300
  const isDarkBackground = useMemo(() => isDarkHex(backgroundColor), [backgroundColor])
  const hasCustomInputColors = useMemo(() => hasThemeInputColors(settings), [settings.inputTextColor, settings.inputPlaceholderColor, settings.inputBorderColor, settings.inputBackgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, backgroundColor, hasCustomInputColors), [isDarkBackground, backgroundColor, hasCustomInputColors])
  const inputStyle = useMemo(() => getInputStyle(settings), [settings.inputBorderColor, settings.inputTextColor, settings.inputBackgroundColor])
  const placeholderStyleCSS = useMemo(() => getPlaceholderStyle(settings.inputPlaceholderColor), [settings.inputPlaceholderColor])

  // Scroll up sticky behavior for editor preview
  useEffect(() => {
    if (!settings.enableStickyBar || !settings.enableStickyOnScrollUp) {
      setIsVisible(true)
      return
    }

    const scrollContainer = scrollContainerRef?.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const currentScrollY = scrollContainer.scrollTop

      // Show when scrolling up or at top
      if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
        setIsVisible(true)
      } else {
        // Hide when scrolling down
        setIsVisible(false)
      }

      lastScrollY.current = currentScrollY
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [settings.enableStickyBar, settings.enableStickyOnScrollUp, scrollContainerRef])

  // Early return AFTER all hooks have been called
  if (!settings.visible) return null

  const initials =
    settings.creatorName
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?"

  const displayText = getDisplayText(settings, settings.creatorName)
  const buttonText = getButtonText(settings, false)

  // Stop propagation to prevent parent onClick from stealing focus
  const handleInteractiveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  // Handle wrapper click for selection (only on non-interactive areas)
  const handleWrapperClick = () => {
    if (onSelect) {
      onSelect()
    }
  }

  /*
    THESE ARE ELEMENTS, NOT COMPONENTS. DO NOT TURN THEM BACK INTO `() => (...)`.

    They used to be declared as arrow components in this render body and
    rendered as `<... />`. A function declared inside a render body is a NEW
    component type on every render, and React reconciles by type — so every
    single re-render of this bar unmounted the whole subtree and mounted a
    fresh one. The avatar's <img> was destroyed and recreated each time, which
    is why the profile picture in the store-builder canvas flashed and
    "glitched randomly when I click things": every click re-renders the canvas.

    Someone had already noticed the symptom and memoised the avatar ELEMENTS
    further up to stop it. That could never work — a memoised element is still
    thrown away when the component it sits inside is remounted.

    As plain values the element type stays `div`, so React updates in place.
  */
  // Mobile layout content
  const mobileContent = (
    <div className="flex flex-col items-center gap-2">
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      <div className="flex items-center gap-2 justify-center">
        {settings.showAvatar && (
          <Avatar className="h-6 w-6 shrink-0">
            {settings.avatarUrl ? (
              <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
            ) : null}
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        )}
        <p className="text-xs font-medium text-center">{displayText}</p>
      </div>

      <div className="flex gap-2 items-center w-full" onClick={handleInteractiveClick}>
        <Input
          type="email"
          placeholder={settings.placeholder || "Enter your email"}
          className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
          style={{
            ...inputStyle,
            borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
          }}
        />
        <Button
          size="sm"
          type="button"
          className="shrink-0 h-8 px-3 text-xs"
          style={{
            backgroundColor: settings.buttonColor || "#2563eb",
            color: settings.buttonTextColor || "#ffffff",
            borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
          }}
        >
          {buttonText}
        </Button>
      </div>
    </div>
  )

  // Desktop layout content
  const desktopContent = (
    <>
      {/* Custom placeholder color styles */}
      {placeholderStyleCSS && <style dangerouslySetInnerHTML={{ __html: placeholderStyleCSS }} />}

      <div className="flex sm:hidden flex-col items-center gap-2">
        <div className="flex items-center gap-2 justify-center">
          {settings.showAvatar && (
            <Avatar className="h-6 w-6 shrink-0">
              {settings.avatarUrl ? (
                <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
              ) : null}
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          )}
          <p className="text-xs font-medium text-center">{displayText}</p>
        </div>

        <div className="flex gap-2 items-center w-full" onClick={handleInteractiveClick}>
          <Input
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-8 px-3 text-xs"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </div>
      </div>

      <div className="hidden sm:flex items-center justify-between gap-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 shrink-0">
          {settings.showAvatar && (
            <Avatar className="h-8 w-8 shrink-0">
              {settings.avatarUrl ? (
                <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
              ) : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          )}
          <p className="text-sm font-medium">{displayText}</p>
        </div>

        <div className="flex gap-2 items-center" onClick={handleInteractiveClick}>
          <Input
            type="email"
            placeholder={settings.placeholder || "Enter your email"}
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm", hasCustomInputColors && "subscribe-input-themed")}
            style={{
              ...inputStyle,
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-9 px-4"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius != null ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </div>
      </div>
    </>
  )

  // CSS sticky works when parent scrolls
  return (
    <div
      onClick={handleWrapperClick}
      className={cn(
        "w-full py-2.5 px-3 sm:py-3 sm:px-4 transition-all duration-300 ease-out",
        settings.enableStickyBar && "sticky top-0 z-20",
        settings.enableStickyBar && settings.enableStickyOnScrollUp && !isVisible && "-translate-y-full opacity-0",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-purple-500 ring-inset",
        isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border",
      )}
      style={{
        // Always use solid backgroundColor - gradients are converted to solid colors
        backgroundColor: backgroundColor,
        color: textColor,
      }}
    >
      {isMobile ? mobileContent : desktopContent}
    </div>
  )
}
