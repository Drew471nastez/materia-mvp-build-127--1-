"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Mail, ArrowRight, Check } from "lucide-react"
import { getStoreUrl } from "@/lib/url-helpers"
import { isDiscoverMode } from "@/lib/isDiscoverMode"
import { isNativeApp } from "@/lib/platform-utils"
import { SmartLink } from "@/components/smart-link"

// Button style presets (same as subscribe bar)
export const creatorBarButtonPresets: Record<string, { default: string; subscribed: string }> = {
  style1: { default: "Subscribe", subscribed: "Subscribed" },
  style2: { default: "Join Now", subscribed: "Joined" },
  style3: { default: "Get It", subscribed: "🔥" },
  style4: { default: "Follow", subscribed: "Followed" },
}

export interface ProductCreatorBarSettings {
  visible: boolean
  backgroundColor: string
  textColor: string
  buttonColor: string
  buttonTextColor: string
  buttonStyle: "style1" | "style2" | "style3" | "style4"
  buttonBorderRadius?: number
}

interface ProductCreatorBarProps {
  settings: ProductCreatorBarSettings
  creatorName: string
  creatorId?: string
  creatorUsername?: string
  avatarUrl?: string
  isEditorPreview?: boolean
  isMobile?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

/** Desktop max width for editor preview */
const EDITOR_DESKTOP_MAX_W = "max-w-[1150px]"
/** Desktop max width for live pages (30px less than before) */
const LIVE_DESKTOP_MAX_W = "max-w-[1170px]"

/** persistence (60+ days) */
const PERSIST_DAYS = 60
const PERSIST_MS = PERSIST_DAYS * 24 * 60 * 60 * 1000

function makePersistKey(prefix: string, creatorId?: string, creatorName?: string) {
  const id = (creatorId || creatorName || "unknown").toString().trim()
  return `productCreatorBar:${id}:${prefix}`
}

function setWithExpiry(key: string, value: unknown, ttlMs: number) {
  try {
    const payload = { value, exp: Date.now() + ttlMs }
    localStorage.setItem(key, JSON.stringify(payload))
  } catch {}
}

function getWithExpiry<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object") return null
    if (typeof parsed.exp !== "number") return null
    if (Date.now() > parsed.exp) {
      localStorage.removeItem(key)
      return null
    }
    return (parsed.value as T) ?? null
  } catch {
    return null
  }
}

function normalizeEmail(v: string) {
  return (v || "").trim().toLowerCase()
}

function isDarkHex(bg?: string): boolean {
  if (!bg) return false
  const hex = bg.trim()
  if (!hex.startsWith("#")) return false

  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean.split("").map((c) => c + c).join("")
      : clean.length === 6
        ? clean
        : null

  if (!full) return false

  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)

  if ([r, g, b].some((n) => Number.isNaN(n))) return false

  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance < 150
}

/**
 * Get adaptive input styling based on background color
 * - Dark backgrounds: white/light borders and text
 * - Vibrant/powerful colors (purple, blue, orange, etc.): light white/gray borders
 * - Light/white backgrounds: gray borders
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

  // Calculate saturation - vibrant colors have high saturation
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2 / 255

  // Saturation calculation
  const delta = max - min
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1)) / 255

  // Vibrant = saturated and not too dark/light
  return saturation > 0.4 && lightness > 0.2 && lightness < 0.8
}

function getAdaptiveInputClass(isDarkBackground: boolean, backgroundColor?: string) {
  const isVibrant = isVibrantColor(backgroundColor)

  return cn(
    "w-full rounded-md border outline-none transition-colors bg-transparent px-3",
    isDarkBackground || isVibrant
      ? "text-white placeholder:text-white/80 focus:placeholder:text-white/50 border-white/40 focus:border-white/70"
      : "text-gray-900 placeholder:text-gray-500 focus:placeholder:text-gray-400 border-gray-300 focus:border-gray-400",
  )
}

function getButtonText(buttonStyle: string, isSubscribed: boolean): string {
  const preset = creatorBarButtonPresets[buttonStyle] || creatorBarButtonPresets.style4
  return isSubscribed ? preset.subscribed : preset.default
}

function getButtonOpacityClass(opts: { isSubscribed: boolean; hasEmail: boolean; isFocused: boolean }) {
  const { isSubscribed, hasEmail, isFocused } = opts
  if (isSubscribed) return "opacity-70"
  if (!hasEmail) return "opacity-70"
  if (isFocused) return "opacity-100"
  return "opacity-[0.95]"
}

function getInputOpacityClass(isSubscribed: boolean, isFocused: boolean) {
  if (isFocused) return "opacity-100"
  return isSubscribed ? "opacity-[0.85]" : "opacity-[0.95]"
}

function getCreatorHref(creatorUsername?: string, creatorId?: string, creatorName?: string) {
  // IMPORTANT: Only use creatorUsername (the actual DB username, e.g. "johndoe").
  // Never use creatorId (UUID) — creates URLs like /u/d06724e5-… that always 404.
  // Never use creatorName (display name, e.g. "John Smith") — sanitisation turns
  // it into /u/john-smith which may not match the real username and gets "lost".
  if (!creatorUsername) return "#"
  const raw = creatorUsername.toString().trim()
  if (!raw) return "#"
  return getStoreUrl(raw)
}

/**
 * ProductCreatorBar - Used in store builder editor preview
 * isMobile prop determines if we're in the 375px mobile preview canvas (on desktop)
 * 
 * When isMobile=true (mobile preview toggle on desktop): show ORIGINAL mobile layout with normal sizes
 * When on actual small viewport (real phone): use CSS to show COMPACT layout to prevent overflow
 */
export function ProductCreatorBar({
  settings,
  creatorName,
  creatorId,
  creatorUsername,
  avatarUrl,
  isEditorPreview,
  isMobile,
  isSelected,
  onSelect,
}: ProductCreatorBarProps) {
  // IMPORTANT: All hooks must be called BEFORE any early returns to avoid React error #310
  const [subscribed, setSubscribed] = useState(false)
  const [subscribedEmail, setSubscribedEmail] = useState<string>("")
  const [email, setEmail] = useState("")
  const [inputFocus, setInputFocus] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [loading, setLoading] = useState(false)

  const isDarkBackground = useMemo(() => isDarkHex(settings.backgroundColor), [settings.backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor), [isDarkBackground, settings.backgroundColor])

  const creatorHref = useMemo(
    () => getCreatorHref(creatorUsername, creatorId, creatorName),
    [creatorUsername, creatorId, creatorName],
  )

  useEffect(() => {
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)

    const savedEmail = getWithExpiry<string>(emailKey)
    const savedSubEmail = getWithExpiry<string>(subEmailKey)

    if (savedEmail) setEmail(savedEmail)
    if (savedSubEmail) {
      setSubscribedEmail(savedSubEmail)
      setSubscribed(normalizeEmail(savedEmail || "") === savedSubEmail)
    }
  }, [creatorId, creatorName])

  useEffect(() => {
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    if (email) setWithExpiry(emailKey, email, PERSIST_MS)
  }, [email, creatorId, creatorName])

  useEffect(() => {
    if (!subscribedEmail) return
    const norm = normalizeEmail(email)
    if (norm !== subscribedEmail) {
      setSubscribed(false)
    } else if (norm === subscribedEmail) {
      setSubscribed(true)
    }
  }, [email, subscribedEmail])

  // Early return AFTER all hooks
  if (!settings.visible) return null

  const initials =
    creatorName
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?"

  const isCurrentEmailSubscribed = subscribed && normalizeEmail(email) === subscribedEmail
  const buttonText = getButtonText(settings.buttonStyle, isCurrentEmailSubscribed)

  const buttonOpacityClass = getButtonOpacityClass({
    isSubscribed: isCurrentEmailSubscribed,
    hasEmail: !!email,
    isFocused: inputFocus,
  })

  const inputOpacityClass = getInputOpacityClass(isCurrentEmailSubscribed, inputFocus)

  const triggerAnim = () => {
    setPulse(true)
    window.setTimeout(() => setPulse(false), 520)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeEmail(email)
    if (!norm || loading) return
    if (isCurrentEmailSubscribed) return

    setLoading(true)
    try {
      if (creatorId) {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: norm, creatorId }),
        })
      }
      setSubscribedEmail(norm)
      setSubscribed(true)

      const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)
      setWithExpiry(subEmailKey, norm, PERSIST_MS)

      triggerAnim()
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  const wrapperClass = cn(
    "w-full transition-all relative",
    // Use clip-path instead of overflow-hidden to prevent avatar clipping during scroll
    // while still containing the selection ring
    isSelected && "ring-2 ring-sky-500 ring-inset",
  )

  const handleWrapperClick = () => {
    if (isEditorPreview && onSelect) {
      onSelect()
    }
  }

  // Mobile layout for store builder preview (375px canvas on desktop)
  // Fits within 375px without overflow
  const EditorMobileLayout = () => (
    <div className="w-full py-4 px-3">
      <div className="flex items-center gap-2 w-full">
        <a
          href={creatorHref}
          className="flex items-center gap-1.5 shrink-0"
          aria-label={`Go to ${creatorName}'s shop`}
          onClick={(e) => {
            if (isEditorPreview) {
              e.preventDefault()
            }
          }}
        >
          {/* Avatar wrapper with explicit sizing to prevent clipping during scroll */}
          <div className="relative h-7 w-7 shrink-0">
            <Avatar className="h-7 w-7 shrink-0 absolute inset-0">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={creatorName} className="object-cover" /> : null}
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          </div>
          <span className="text-[13px] font-medium truncate max-w-[70px]" style={{ color: settings.textColor || "#ffffff" }}>
            {creatorName}
          </span>
        </a>

        <form onSubmit={handleSubmit} className="flex gap-1.5 items-center flex-1 min-w-0">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setInputFocus(false)}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-8 text-[13px] flex-1 min-w-0", inputOpacityClass)}
            style={{ textOverflow: "ellipsis" }}
          />
          <Button
            type="submit"
            disabled={loading || !email || isCurrentEmailSubscribed}
            onClick={() => {
              if (!loading && email && !isCurrentEmailSubscribed) triggerAnim()
            }}
            className={cn(
              "shrink-0 h-8 px-2.5 text-[13px] flex items-center gap-1.5",
              buttonOpacityClass,
              pulse && "animate-[btnPop_520ms_ease-out]",
            )}
            style={{
              backgroundColor: settings.buttonColor || "#4b5563",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
            }}
          >
            {isCurrentEmailSubscribed ? <Check size={14} /> : <Mail size={14} />}
            <span>{loading ? "..." : buttonText}</span>
          </Button>
        </form>
      </div>
    </div>
  )

  // COMPACT Mobile layout - for actual phone viewing store builder
  // Matches the desktop mobile preview style but fits on real phone screens
  // No seller name (no space), just avatar + input + full button
  const CompactMobileLayout = () => (
    <form onSubmit={handleSubmit} className="w-full px-3 py-3.5">
      <div className="flex items-center gap-2 w-full justify-center">
        <a
          href={creatorHref}
          className="shrink-0 flex items-center justify-center"
          aria-label={`Go to ${creatorName}'s shop`}
          onClick={(e) => {
            if (isEditorPreview) {
              e.preventDefault()
            }
          }}
        >
          {/* Avatar wrapper with explicit sizing to prevent clipping during scroll */}
          <div className="relative h-7 w-7 shrink-0">
            <Avatar className="h-7 w-7 shrink-0 absolute inset-0">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={creatorName} className="object-cover" /> : null}
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          </div>
        </a>

        {/* Input fits remaining space */}
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setInputFocus(true)}
          onBlur={() => setInputFocus(false)}
          required
          disabled={loading}
          className={cn(
            adaptiveInputClass,
            "h-9 text-sm flex-1 min-w-0 px-3",
            inputOpacityClass
          )}
          style={{ textOverflow: "ellipsis" }}
        />

        <Button
          type="submit"
          disabled={loading || !email || isCurrentEmailSubscribed}
          onClick={() => {
            if (!loading && email && !isCurrentEmailSubscribed) triggerAnim()
          }}
          className={cn(
            "h-9 px-3 shrink-0 text-sm flex items-center justify-center gap-1.5",
            buttonOpacityClass,
            pulse && "animate-[btnPop_520ms_ease-out]",
          )}
          style={{
            backgroundColor: settings.buttonColor || "#4b5563",
            color: settings.buttonTextColor || "#ffffff",
            borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
          }}
        >
          {isCurrentEmailSubscribed ? <Check size={16} /> : <Mail size={16} />}
          <span>{loading ? "..." : buttonText}</span>
        </Button>
      </div>
    </form>
  )

  // Desktop layout for store builder preview
  const DesktopLayout = () => (
    <div className={cn("py-[calc(0.625rem+5px)] px-4 sm:px-5")}>
      <div className={cn("mx-auto w-full", EDITOR_DESKTOP_MAX_W)}>
        <div className="w-full flex items-center justify-between gap-4">
          <a
            href={creatorHref}
            className="flex items-center gap-2 shrink-0 group"
            aria-label={`Go to ${creatorName}'s shop`}
            onClick={(e) => {
              if (isEditorPreview) {
                e.preventDefault()
              }
            }}
          >
            <Avatar className="h-8 w-8 shrink-0 cursor-pointer">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={creatorName} /> : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <p className="text-sm md:text-[calc(0.875rem+3px)] font-medium cursor-pointer group-hover:opacity-90">
              {creatorName}
            </p>
          </a>

          <form onSubmit={handleSubmit} className="flex gap-2 items-center shrink-0">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setInputFocus(true)}
              onBlur={() => setInputFocus(false)}
              required
              disabled={loading}
              className={cn(adaptiveInputClass, "h-9 w-48 text-sm", inputOpacityClass)}
            />
            <Button
              size="sm"
              type="submit"
              disabled={loading || !email || isCurrentEmailSubscribed}
              className={cn(
                "shrink-0 h-9 px-4 text-sm md:text-[calc(0.875rem+2px)] flex items-center gap-2 relative overflow-hidden",
                buttonOpacityClass,
                pulse && "animate-[btnPop_520ms_ease-out]",
              )}
              style={{
                backgroundColor: settings.buttonColor || "#4b5563",
                color: settings.buttonTextColor || "#ffffff",
                borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
              }}
            >
              {buttonText === "🔥" ? null : isCurrentEmailSubscribed ? (
                <Check size={16} className="text-current relative z-10" />
              ) : (
                <Mail size={16} className="text-current relative z-10" />
              )}
              <span className="relative z-10">{loading ? "..." : buttonText}</span>
            </Button>
          </form>
        </div>
      </div>
    </div>
  )

  return (
    <div
      onClick={handleWrapperClick}
      className={wrapperClass}
      style={{
        backgroundColor: settings.backgroundColor || "#1a1a1a",
        color: settings.textColor || "#ffffff",
        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      {isMobile ? (
        // When isMobile prop is true (store builder mobile preview toggle on desktop):
        // Show ORIGINAL layout, but if actual viewport is tiny (real phone), show compact
        <>
          {/* On actual small screens (real phone), show compact layout */}
          <div className="block sm:hidden">
            <CompactMobileLayout />
          </div>
          {/* On actual large screens (desktop with mobile preview), show original mobile layout */}
          <div className="hidden sm:block">
            <EditorMobileLayout />
          </div>
        </>
      ) : (
        // When isMobile prop is false (desktop preview):
        // But if actual viewport is small (real phone editing desktop view), show compact
        <>
          <div className="block sm:hidden">
            <CompactMobileLayout />
          </div>
          <div className="hidden sm:block">
            <DesktopLayout />
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes btnPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

/**
 * LiveProductCreatorBar - Used on actual live product pages
 * Responsive using CSS breakpoints (sm:, md:, etc.)
 */
interface LiveProductCreatorBarProps {
  settings: ProductCreatorBarSettings
  creatorName: string
  creatorId?: string
  creatorUsername?: string
  avatarUrl?: string
}

export function LiveProductCreatorBar({
  settings,
  creatorName,
  creatorId,
  creatorUsername,
  avatarUrl,
}: LiveProductCreatorBarProps) {
  // IMPORTANT: All hooks must be called BEFORE any early returns to avoid React error #310
  const [subscribed, setSubscribed] = useState(false)
  const [subscribedEmail, setSubscribedEmail] = useState<string>("")
  const [email, setEmail] = useState("")
  const [inputFocus, setInputFocus] = useState(false)
  const [pulse, setPulse] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [hideOnMobileDiscover, setHideOnMobileDiscover] = useState(false)

  const isDarkBackground = useMemo(() => isDarkHex(settings.backgroundColor), [settings.backgroundColor])
  const adaptiveInputClass = useMemo(() => getAdaptiveInputClass(isDarkBackground, settings.backgroundColor), [isDarkBackground, settings.backgroundColor])

  const creatorHref = useMemo(
    () => getCreatorHref(creatorUsername, creatorId, creatorName),
    [creatorUsername, creatorId, creatorName],
  )

  useEffect(() => {
    setIsHydrated(true)
    if (typeof window === "undefined") return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)

    const savedEmail = getWithExpiry<string>(emailKey)
    const savedSubEmail = getWithExpiry<string>(subEmailKey)

    if (savedEmail) setEmail(savedEmail)
    if (savedSubEmail) {
      setSubscribedEmail(savedSubEmail)
      setSubscribed(normalizeEmail(savedEmail || "") === savedSubEmail)
    }
  }, [creatorId, creatorName])

  useEffect(() => {
    if (typeof window === "undefined") return
    const checkDiscoverContext = () => {
      const params = new URLSearchParams(window.location.search)
      // Only hide on WEB discover mode (query-param based).
      // In Capacitor native app, always SHOW the creator bar (it sits below the header).
      const isWebDiscover =
        (params.get("layout") === "discover" || params.has("recommended")) && !isNativeApp()
      setHideOnMobileDiscover(isWebDiscover)
    }
    checkDiscoverContext()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !isHydrated) return
    const emailKey = makePersistKey("email", creatorId, creatorName)
    if (email) setWithExpiry(emailKey, email, PERSIST_MS)
  }, [email, creatorId, creatorName, isHydrated])

  useEffect(() => {
    if (!subscribedEmail) return
    const norm = normalizeEmail(email)
    if (norm !== subscribedEmail) {
      setSubscribed(false)
    } else if (norm === subscribedEmail) {
      setSubscribed(true)
    }
  }, [email, subscribedEmail])

  // Early return AFTER all hooks
  if (!settings.visible) return null

  const initials =
    creatorName
      ?.split(" ")
      .filter(Boolean)
      .map((n) => n[0])
      .join("")
      .toUpperCase() || "?"

  const isCurrentEmailSubscribed = subscribed && normalizeEmail(email) === subscribedEmail
  const buttonText = getButtonText(settings.buttonStyle, isCurrentEmailSubscribed)

  const buttonOpacityClass = getButtonOpacityClass({
    isSubscribed: isCurrentEmailSubscribed,
    hasEmail: !!email,
    isFocused: inputFocus,
  })

  const inputOpacityClass = getInputOpacityClass(isCurrentEmailSubscribed, inputFocus)

  const triggerAnim = () => {
    setPulse(true)
    window.setTimeout(() => setPulse(false), 520)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const norm = normalizeEmail(email)
    if (!norm || loading) return
    if (isCurrentEmailSubscribed) return

    setLoading(true)
    try {
      if (creatorId) {
        await fetch("/api/subscribers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: norm, creatorId }),
        })
      }
      setSubscribedEmail(norm)
      setSubscribed(true)

      const subEmailKey = makePersistKey("subscribedEmail", creatorId, creatorName)
      setWithExpiry(subEmailKey, norm, PERSIST_MS)

      triggerAnim()
    } catch (error) {
      console.error("Subscribe error:", error)
    } finally {
      setLoading(false)
    }
  }

  if (!isHydrated) return null

  return (
    <div
      className={cn("w-full overflow-hidden", hideOnMobileDiscover && "hidden")}
      style={{
        backgroundColor: settings.backgroundColor || "#1a1a1a",
        color: settings.textColor || "#ffffff",
        borderBottom: "1px solid rgba(0, 0, 0, 0.06)",
      }}
    >
      {/* Mobile: Responsive layout using CSS */}
      <form onSubmit={handleSubmit} className="sm:hidden w-full px-4 py-2.5">
        <div className="flex items-center gap-2 w-full">
          <SmartLink href={creatorHref} className="shrink-0" aria-label={`Go to ${creatorName}'s shop`}>
            <Avatar className="h-7 w-7 shrink-0">
              {avatarUrl ? <AvatarImage src={avatarUrl} alt={creatorName} /> : null}
              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
            </Avatar>
          </SmartLink>

          <Input
            type="email"
            placeholder="Your email…"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onFocus={() => setInputFocus(true)}
            onBlur={() => setInputFocus(false)}
            required
            disabled={loading}
            className={cn(adaptiveInputClass, "h-10 text-sm flex-1 min-w-0", inputOpacityClass)}
          />

          <Button
            type="submit"
            disabled={loading || !email || isCurrentEmailSubscribed}
            onClick={() => {
              if (!loading && email && !isCurrentEmailSubscribed) triggerAnim()
            }}
            className={cn(
              "h-10 shrink-0 px-3 text-sm flex items-center gap-2 relative overflow-hidden",
              buttonOpacityClass,
              pulse && "animate-[btnPop_520ms_ease-out]",
            )}
            style={{
              backgroundColor: settings.buttonColor || "#4b5563",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
            }}
          >
            {buttonText === "🔥" ? null : isCurrentEmailSubscribed ? (
              <Check size={16} className="text-current" />
            ) : (
              <Mail size={16} className="text-current" />
            )}
            <span>{loading ? "..." : buttonText}</span>
            {!isCurrentEmailSubscribed && !loading && buttonText !== "🔥" && (
              <ArrowRight size={16} className="text-current" />
            )}
          </Button>
        </div>
      </form>

      {/* Desktop - with reduced width (1170px instead of 1200px) */}
      <div className={cn("hidden sm:block py-[calc(0.625rem+5px)] px-4 sm:px-5")}>
        <div className={cn("mx-auto w-full", LIVE_DESKTOP_MAX_W)}>
          <div className="w-full flex items-center justify-between gap-4">
            <SmartLink
              href={creatorHref}
              className="flex items-center gap-2 shrink-0 group"
              aria-label={`Go to ${creatorName}'s shop`}
            >
              <Avatar className="h-8 w-8 shrink-0 cursor-pointer">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={creatorName} /> : null}
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <p className="text-sm md:text-[calc(0.875rem+3px)] font-medium cursor-pointer group-hover:opacity-90">
                {creatorName}
              </p>
            </SmartLink>

            <form onSubmit={handleSubmit} className="flex gap-2 items-center shrink-0">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setInputFocus(true)}
                onBlur={() => setInputFocus(false)}
                required
                disabled={loading}
                className={cn(adaptiveInputClass, "h-9 w-48 text-sm", inputOpacityClass)}
              />
              <Button
                size="sm"
                type="submit"
                disabled={loading || !email || isCurrentEmailSubscribed}
                onClick={() => {
                  if (!loading && email && !isCurrentEmailSubscribed) triggerAnim()
                }}
                className={cn(
                  "shrink-0 h-9 px-4 text-sm md:text-[calc(0.875rem+2px)] flex items-center gap-2 relative overflow-hidden",
                  buttonOpacityClass,
                  pulse && "animate-[btnPop_520ms_ease-out]",
                )}
                style={{
                  backgroundColor: settings.buttonColor || "#4b5563",
                  color: settings.buttonTextColor || "#ffffff",
                  borderRadius: `${settings.buttonBorderRadius ?? 8}px`,
                }}
              >
                {buttonText === "🔥" ? null : isCurrentEmailSubscribed ? (
                  <Check size={16} className="text-current relative z-10" />
                ) : (
                  <Mail size={16} className="text-current relative z-10" />
                )}
                <span className="relative z-10">{loading ? "..." : buttonText}</span>
              </Button>
            </form>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes btnPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}

// Default export for backward compatibility
export default ProductCreatorBar
