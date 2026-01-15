"use client"

import type React from "react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

// Button style presets
export type ButtonStylePreset = "style1" | "style2" | "style3" | "style4"

export const buttonStylePresets: Record<ButtonStylePreset, { default: string; subscribed: string }> = {
  style1: { default: "Subscribe", subscribed: "Subscribed" },
  style2: { default: "Join Now", subscribed: "Joined" },
  style3: { default: "Get It", subscribed: "🔥" },
  style4: { default: "Follow", subscribed: "Followed" },
}

export interface SubscribeBarSettings {
  visible: boolean
  text: string
  placeholder?: string
  buttonText?: string
  dismissible?: boolean
  position?: "top" | "bottom"
  backgroundColor?: string
  textColor?: string
  buttonColor?: string
  buttonTextColor?: string
  buttonBorderRadius?: number
  inputBorderColor?: string
  showAvatar?: boolean
  avatarUrl?: string
  creatorName?: string
  style?: "style1" | "style2" | "style3"
  customCtaText?: string
  enableStickyBar?: boolean
  enableStickyOnScrollUp?: boolean
  buttonStyle?: ButtonStylePreset
  // Allow colors object for compatibility with store builder config
  colors?: {
    backgroundColor?: string
    textColor?: string
    accentColor?: string
  }
}

interface SubscribeBarProps {
  settings: SubscribeBarSettings
  creatorId: string
  onSubmit?: (email: string) => Promise<void>
}

/** Get text based on style */
function getStyleText(style: string | undefined, creatorName?: string): string {
  switch (style) {
    case "style2":
      return "Join our family!"
    case "style3":
      return "Join our community!"
    case "style1":
    default:
      return `Join ${creatorName || "our"}'s newsletter!`
  }
}

/** Get display text considering customCtaText */
function getDisplayText(settings: SubscribeBarSettings, creatorName?: string): string {
  if (settings.customCtaText && settings.customCtaText.trim()) {
    return settings.customCtaText.trim()
  }
  if (settings.style === "style1") {
    return getStyleText("style1", creatorName)
  }
  return settings.text || getStyleText(settings.style, creatorName)
}

/** Get button text based on buttonStyle preset */
function getButtonText(settings: SubscribeBarSettings, isSubscribed: boolean): string {
  const stylePreset = settings.buttonStyle || "style1"
  const preset = buttonStylePresets[stylePreset]
  return isSubscribed ? preset.subscribed : preset.default
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
function getAdaptiveInputClass(isDarkBackground: boolean, backgroundColor?: string) {
  const isVibrant = isVibrantColor(backgroundColor)

  return cn(
    "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    isDarkBackground || isVibrant
      ? "text-white placeholder:text-white/80 focus:placeholder:text-white/50 border-white/40 focus:border-white/70"
      : "text-gray-900 placeholder:text-gray-500 focus:placeholder:text-gray-400 border-gray-300 focus:border-gray-400",
  )
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

  const isDarkBackground = useMemo(() => isDarkHex(settings.backgroundColor), [settings.backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor), [isDarkBackground, settings.backgroundColor])

  // Sticky on scroll up behavior
  useEffect(() => {
    if (!settings.enableStickyBar || !settings.enableStickyOnScrollUp) {
      setIsVisible(true)
      return
    }

    const handleScroll = () => {
      const currentScrollY = window.scrollY

      // Show when scrolling up or at top
      if (currentScrollY < lastScrollY.current || currentScrollY < 50) {
        setIsVisible(true)
      } else {
        // Hide when scrolling down
        setIsVisible(false)
      }

      lastScrollY.current = currentScrollY
    }

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

  const initials =
    settings.creatorName
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?"

  const displayText = getDisplayText(settings, settings.creatorName)
  const buttonText = loading ? "..." : getButtonText(settings, subscribed)

  const isSticky = settings.enableStickyBar

  // Bar content component
  const BarContent = () => (
    <>
      {/* MOBILE */}
      <div className="sm:hidden flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 justify-center">
          {settings.showAvatar && (
            <Avatar className="h-6 w-6 shrink-0">
              {settings.avatarUrl ? (
                <AvatarImage src={settings.avatarUrl} alt={settings.creatorName || ""} />
              ) : null}
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          )}
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
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs")}
            style={{
              borderColor: settings.inputBorderColor || undefined,
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
              borderRadius: settings.buttonBorderRadius !== undefined ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </form>
      </div>

      {/* DESKTOP */}
      <div className="hidden sm:flex items-center justify-between gap-4 max-w-[1150px] mx-auto">
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
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm")}
            style={{
              borderColor: settings.inputBorderColor || undefined,
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
              borderRadius: settings.buttonBorderRadius !== undefined ? `${settings.buttonBorderRadius}px` : undefined,
            }}
          >
            {buttonText}
          </Button>
        </form>
      </div>
    </>
  )

  // STICKY MODE: Use fixed positioning for live pages
  if (isSticky) {
    return (
      <>
        {/* Fixed bar at top of viewport */}
        <div
          className={cn(
            "fixed top-0 left-0 right-0 z-50 w-full py-2.5 px-3 sm:py-3 sm:px-4 transition-transform duration-300 ease-out",
            isDarkBackground ? "subscribe-bar-border-dark" : "subscribe-bar-border",
            !isVisible && settings.enableStickyOnScrollUp && "-translate-y-full"
          )}
          style={{
            backgroundColor: settings.backgroundColor || "#ffffff",
            color: settings.textColor || "#000000",
          }}
        >
          <BarContent />
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
        backgroundColor: settings.backgroundColor || "#ffffff",
        color: settings.textColor || "#000000",
      }}
    >
      <BarContent />
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

export function EditorSubscribeBar({ settings, creatorId, isEditorPreview, isMobile, isSelected, onSelect, scrollContainerRef }: EditorSubscribeBarProps) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)

  if (!settings.visible) return null

  // Extract colors from either top level or nested colors object
  const backgroundColor = settings.backgroundColor || settings.colors?.backgroundColor || "#ffffff"
  const textColor = settings.textColor || settings.colors?.textColor || "#000000"

  const isDarkBackground = useMemo(() => isDarkHex(backgroundColor), [backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, backgroundColor), [isDarkBackground, backgroundColor])

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

  // Mobile layout content
  const MobileContent = () => (
    <div className="flex flex-col items-center gap-2">
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
          className={cn(adaptiveInputClass, "h-8 flex-1 text-xs")}
          style={{
            borderColor: settings.inputBorderColor || undefined,
          }}
        />
        <Button
          size="sm"
          type="button"
          className="shrink-0 h-8 px-3 text-xs"
          style={{
            backgroundColor: settings.buttonColor || "#2563eb",
            color: settings.buttonTextColor || "#ffffff",
            borderRadius: settings.buttonBorderRadius !== undefined ? `${settings.buttonBorderRadius}px` : undefined,
          }}
        >
          {buttonText}
        </Button>
      </div>
    </div>
  )

  // Desktop layout content
  const DesktopContent = () => (
    <>
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
            className={cn(adaptiveInputClass, "h-8 flex-1 text-xs")}
            style={{
              borderColor: settings.inputBorderColor || undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-8 px-3 text-xs"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius !== undefined ? `${settings.buttonBorderRadius}px` : undefined,
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
            className={cn(adaptiveInputClass, "h-9 w-48 text-sm")}
            style={{
              borderColor: settings.inputBorderColor || undefined,
            }}
          />
          <Button
            size="sm"
            type="button"
            className="shrink-0 h-9 px-4"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: settings.buttonBorderRadius !== undefined ? `${settings.buttonBorderRadius}px` : undefined,
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
        backgroundColor: backgroundColor,
        color: textColor,
      }}
    >
      {isMobile ? <MobileContent /> : <DesktopContent />}
    </div>
  )
}
