"use client"

// Phone preview: renders exact same button styles as public-onepage.tsx
// All button styles use theme.button_text_color for text color (no conditional for outline)
import type React from "react"

import { useOnePage } from "@/lib/onepage/context"
import type {
  OnePageBlock,
  OnePageTheme,
  LinkButtonBlockData,
  TextBlockData,
  ImageBlockData,
  DividerBlockData,
  EmailCaptureBlockData,
  HeaderBlockData,
  SocialRowBlockData,
  GroupBlockData,
  ProductBlockData,
  PDFDocumentBlockData,
  FoodMenuBlockData,
  CalendlyBlockData,
} from "@/lib/onepage/types"
import { normalizeSocialUrl } from "@/lib/onepage/types"
import { LinkIcon, SocialIcon, socialPlatformLabel } from "@/components/onepage/brand-icons"
import { resolveLinkIcon } from "@/components/onepage/link-icons"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Bell, X, Send, Check, Link2, ExternalLink, Calendar } from "lucide-react"
import { useState, useRef, useEffect, useLayoutEffect, useCallback, createContext, useContext } from "react"
import { getLinksUrl, getLinksShareUrl } from "@/lib/url-helpers"
import { isNativeApp } from "@/lib/platform-utils"
import { ExtraBlock } from "@/components/onepage/extra-blocks"
import { OnePageFonts } from "@/components/onepage/onepage-fonts"
import { fontStack } from "@/lib/onepage/fonts"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
import { isBlockShown } from "@/lib/onepage/extra-blocks"

const stripHtmlToPlainText = (value?: string | null) => {
  if (!value) return ""
  const raw = value.trim()
  if (!raw) return ""
  if (typeof window === "undefined") {
    return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  }
  const parser = new DOMParser()
  const doc = parser.parseFromString(raw, "text/html")
  const text = doc.body.textContent || ""
  return text.replace(/\s+/g, " ").trim()
}


function SmoothAvatarVideo({
  videoUrl,
  imageUrl,
  alt,
  videoClassName,
  imageClassName,
  videoStyle,
  imageStyle,
}: {
  videoUrl: string
  imageUrl?: string | null
  alt: string
  videoClassName?: string
  imageClassName?: string
  videoStyle?: React.CSSProperties
  imageStyle?: React.CSSProperties
}) {
  const [isReady, setIsReady] = useState(false)
  const [hasError, setHasError] = useState(false)

  const markReady = useCallback(() => {
    setIsReady(true)
  }, [])

  useEffect(() => {
    setIsReady(false)
    setHasError(false)
  }, [videoUrl])

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true)
    }, 1800)

    return () => clearTimeout(timer)
  }, [videoUrl])

  return (
    <>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={alt}
          className={cn(
            "absolute inset-0 w-full h-full object-cover scale-105 transition-all duration-500",
            hasError ? "opacity-100 blur-0" : isReady ? "opacity-0 blur-0" : "opacity-100 blur-[2px]",
            imageClassName,
          )}
          style={imageStyle}
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className={cn("absolute inset-0 bg-white/20 animate-pulse transition-opacity duration-500", isReady ? "opacity-0" : "opacity-100")} />
      )}
      {!hasError && (
        <video
          src={videoUrl}
          className={cn(
            "relative z-[1] w-full h-full object-cover transition-all duration-500",
            isReady ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-[1.5px] scale-[1.03]",
            videoClassName,
          )}
          style={videoStyle}
          onLoadedData={markReady}
          onCanPlay={markReady}
          onPlaying={markReady}
          onError={() => setHasError(true)}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
    </>
  )
}

// Spotify Modal Context - allows modals to render at root level instead of inside blocks
interface SpotifyModalContextType {
  openSpotifyModal: (data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => void
}
const SpotifyModalContext = createContext<SpotifyModalContextType | null>(null)

// Apple Music Modal Context - allows modals to render at root level instead of inside blocks
interface AppleMusicModalContextType {
  openAppleMusicModal: (data: {
    title: string
    embedUrl: string
    appleMusicUrl: string
  }) => void
}
const AppleMusicModalContext = createContext<AppleMusicModalContextType | null>(null)

// PDF Modal Context - allows PDF preview modals to render at root level
interface PDFModalContextType {
  openPDFModal: (data: {
    title: string
    description?: string
    pdfUrl: string
    buttonText?: string
  }) => void
}
const PDFModalContext = createContext<PDFModalContextType | null>(null)

// Calendly Modal Context - allows Calendly embed modals to render at root level
interface CalendlyModalContextType {
  openCalendlyModal: (data: {
    title: string
    calendlyUrl: string
  }) => void
}
const CalendlyModalContext = createContext<CalendlyModalContextType | null>(null)

// Notification Bell Component with Subscribe Form
function NotificationBell({
  sellerName,
  scale = "small",
  style = "glass",
  isVisible = true,
}: { sellerName: string; scale?: "small" | "normal"; style?: "glass" | "white" | "black"; isVisible?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    setIsSubmitting(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 800))
    setIsSubmitting(false)
    setSubmitted(true)
    setTimeout(() => {
      setIsOpen(false)
      setSubmitted(false)
      setEmail("")
    }, 1500)
  }

  const size = scale === "small" ? { bell: 28, icon: 12, panel: 160 } : { bell: 36, icon: 16, panel: 200 }

  // Style configurations
  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.2)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.3)",
      iconColor: "text-white/80",
      textColor: "text-white/90",
      inputBg: "bg-white/20",
      inputBorder: "border-white/30",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/50",
      buttonSubmitBg: "bg-white/30 hover:bg-white/40",
      dotColor: "bg-white/60",
    },
    // glassmorphism maps to glass style
    glassmorphism: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.2)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.3)",
      iconColor: "text-white/80",
      textColor: "text-white/90",
      inputBg: "bg-white/20",
      inputBorder: "border-white/30",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/50",
      buttonSubmitBg: "bg-white/30 hover:bg-white/40",
      dotColor: "bg-white/60",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.9)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.95)",
      panelBg: "rgba(255, 255, 255, 0.95)",
      panelBorder: "1px solid rgba(0, 0, 0, 0.1)",
      iconColor: "text-gray-700",
      textColor: "text-gray-900",
      inputBg: "bg-gray-100",
      inputBorder: "border-gray-200",
      inputText: "text-gray-900",
      inputPlaceholder: "placeholder-gray-400",
      buttonSubmitBg: "bg-gray-900 hover:bg-gray-800 text-white",
      dotColor: "bg-blue-500",
    },
    black: {
      buttonBg: "rgba(0, 0, 0, 0.75)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.1)",
      panelBg: "rgba(0, 0, 0, 0.85)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.15)",
      iconColor: "text-white/90",
      textColor: "text-white/90",
      inputBg: "bg-white/10",
      inputBorder: "border-white/20",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/40",
      buttonSubmitBg: "bg-white/20 hover:bg-white/30",
      dotColor: "bg-white/70",
    },
  }

  // Fallback to glass if style is not defined
  const s = styles[style as keyof typeof styles] || styles.glass

  // Keep visible when modal is open
  const shouldShow = isVisible || isOpen

  return (
    <div
      className="absolute top-6 right-3 z-30 transition-all duration-500 ease-out"
      style={{
        opacity: shouldShow ? 1 : 0,
        transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
        pointerEvents: shouldShow ? "auto" : "none",
      }}
    >
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all duration-300 hover:scale-105",
          style === "glass" && "backdrop-blur-md",
        )}
        style={{
          width: size.bell,
          height: size.bell,
          background: s.buttonBg,
          border: s.buttonBorder,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Bell
          size={size.icon}
          className={cn(s.iconColor, "animate-pulse")}
          style={{
            animationDuration: "3s",
            animationIterationCount: "infinite",
          }}
        />
        {/* Subtle glow dot */}
        <span
          className={cn("absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full", s.dotColor)}
          style={{ boxShadow: style === "glass" ? "0 0 6px rgba(255, 255, 255, 0.5)" : "0 0 6px rgba(0, 0, 0, 0.2)" }}
        />
      </button>

      {/* Subscribe Panel - Slides from bell */}
      <div
        className={cn(
          "absolute top-0 right-0 overflow-hidden transition-all duration-300 ease-out rounded-xl",
          style === "glass" && "backdrop-blur-lg",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{
          width: isOpen ? size.panel : size.bell,
          background: s.panelBg,
          border: s.panelBorder,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
          transformOrigin: "top right",
          transform: isOpen ? "scale(1)" : "scale(0.5)",
        }}
      >
        <div className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-[10px] font-medium truncate pr-2", s.textColor)}>Subscribe to {sellerName}</span>
            <button
              onClick={() => setIsOpen(false)}
              className={cn(
                "p-0.5 rounded-full transition-colors",
                style === "white" ? "hover:bg-gray-100" : "hover:bg-white/20",
              )}
            >
              <X size={12} className={style === "white" ? "text-gray-500" : "text-white/70"} />
            </button>
          </div>

          {submitted ? (
            <div className="text-center py-2">
              <span className={cn("text-[10px]", s.textColor)}>✓ Subscribed!</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={cn(
                  "w-full px-2 py-1.5 text-[10px] rounded-lg border focus:outline-none",
                  s.inputBg,
                  s.inputBorder,
                  s.inputText,
                  s.inputPlaceholder,
                )}
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "w-full py-1.5 text-[10px] font-medium rounded-lg transition-colors disabled:opacity-50",
                  s.buttonSubmitBg,
                  style !== "white" && "text-white",
                )}
              >
                {isSubmitting ? "..." : "Submit"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// Share Button Component for Phone Preview
function ShareButtonPreview({
  sellerName,
  avatarUrl,
  avatarVideoUrl,
  pageUrl,
  scale = "small",
  style = "white",
  showSubscribe = true,
  accentColor,
  isVisible = true,
  themeBackgroundType,
  themeBackgroundColor,
  themeBackgroundGradient,
}: {
  sellerName: string
  avatarUrl?: string | null
  avatarVideoUrl?: string | null
  pageUrl: string
  scale?: "small" | "normal"
  style?: "glass" | "white" | "black"
  showSubscribe?: boolean
  accentColor?: string
  isVisible?: boolean
  themeBackgroundType?: "solid" | "gradient" | "image" | "video"
  themeBackgroundColor?: string
  themeBackgroundGradient?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  // Keep visible when modal is open
  const shouldShow = isVisible || isOpen

  const size = scale === "small" ? { btn: 28, icon: 10, panel: 180 } : { btn: 36, icon: 14, panel: 220 }

  // Returns true if a hex color is near-white (all channels > 200)
  const isNearWhite = (hex: string): boolean => {
    const m = hex.match(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/)
    if (!m) return false
    let h = m[1]
    if (h.length === 3) h = h.split("").map((c) => c + c).join("")
    return parseInt(h.slice(0, 2), 16) > 200 && parseInt(h.slice(2, 4), 16) > 200 && parseInt(h.slice(4, 6), 16) > 200
  }

  // Compute contrast text color (white or dark) for a given background
  const getContrastTextColor = (bg: string): "white" | "dark" => {
    const hexMatch = bg.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/)
    if (!hexMatch) return "dark"
    let hex = hexMatch[1]
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("")
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const toLinear = (c: number) => {
      const s = c / 255
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    const L = 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    return L > 0.35 ? "dark" : "white"
  }

  // Adapt popup header background to theme - prioritize gradient, then solid color, then accent
  const getPopupHeaderBackground = () => {
    if (themeBackgroundType === "gradient" && themeBackgroundGradient) {
      return themeBackgroundGradient
    }
    if (themeBackgroundType === "solid" && themeBackgroundColor && themeBackgroundColor !== "#ffffff") {
      return themeBackgroundColor
    }
    // Use accent color only if it's not near-white
    if (accentColor && !isNearWhite(accentColor)) {
      return accentColor
    }
    return "#8B5CF6"
  }

  const popupHeaderBackground = getPopupHeaderBackground()
  const headerTextColor = getContrastTextColor(popupHeaderBackground)
  const headerTextClass = headerTextColor === "white" ? "text-white" : "text-gray-900"
  const headerSubTextClass = headerTextColor === "white" ? "text-white/80" : "text-gray-600"
  const headerCloseClass = headerTextColor === "white" ? "bg-white/20 hover:bg-white/30" : "bg-black/10 hover:bg-black/20"
  const headerCloseIconClass = headerTextColor === "white" ? "text-white" : "text-gray-700"

  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      iconColor: "text-white/80",
    },
    // glassmorphism maps to glass style
    glassmorphism: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      iconColor: "text-white/80",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.9)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.95)",
      iconColor: "text-gray-700",
    },
    black: {
      buttonBg: "rgba(0, 0, 0, 0.75)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.1)",
      iconColor: "text-white/90",
    },
  }

  // Fallback to glass if style is not defined
  const s = styles[style as keyof typeof styles] || styles.glass

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(pageUrl)
    } catch {
      const el = document.createElement("textarea")
      el.value = pageUrl
      el.style.position = "fixed"
      el.style.opacity = "0"
      document.body.appendChild(el)
      el.select()
      document.execCommand("copy")
      document.body.removeChild(el)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const openExternalUrl = async (url: string) => {
    if (isNativeApp()) {
      const { Browser } = await import("@capacitor/browser")
      await Browser.open({ url })
    } else {
      window.open(url, "_blank")
    }
  }

  /**
   * Open a share target.
   *
   * Native (Capacitor iOS / Android):
   *   window.open(scheme, '_system') is called SYNCHRONOUSLY while we are
   *   still inside the user-gesture. Capacitor intercepts '_system' and
   *   routes custom schemes (whatsapp://, twitter://, …) straight to
   *   UIApplication.shared.open() on iOS and Intent.ACTION_VIEW on Android —
   *   the target app opens instantly with no in-app browser.
   *   If no native scheme exists (e.g. Facebook) we fall back to Browser.open
   *   so the web URL opens in the Capacitor in-app browser.
   *
   * Web (mobile / desktop browser):
   *   window.location.href = nativeScheme lets the OS intercept the custom
   *   URL scheme and open the app without creating a new browser tab.
   *   A visibilitychange listener detects a successful hand-off; if the page
   *   stays visible after 1.5 s (app not installed) we open the wa.me web
   *   fallback in a new tab instead.
   */
  /**
   * Open a share target — app-first with browser fallback.
   *
   * @param nativeScheme  Custom URL scheme (twitter://, whatsapp://, etc.)
   *                      Pass null to skip app-scheme and go straight to web.
   * @param webUrl        HTTPS fallback URL (opens if app is not installed).
   * @param preferSystem  If true, open webUrl via system browser (_system) on
   *                      Capacitor instead of the in-app browser.  This lets
   *                      iOS Universal Links / Android App Links redirect to
   *                      the native app (e.g. Facebook, whose custom scheme
   *                      is unreliable but whose Universal Links work).
   */
  const openShareTarget = async (
    nativeScheme: string | null,
    webUrl: string,
    preferSystem = false,
  ) => {
    if (isNativeApp()) {
      if (nativeScheme) {
        // Synchronous — keeps user-gesture context so the OS accepts the call.
        window.open(nativeScheme, "_system")
      } else if (preferSystem) {
        // Open via the system browser so Universal Links / App Links can
        // redirect to the native app (e.g. Facebook).  Falls back to the
        // browser if the app is not installed.
        window.open(webUrl, "_system")
      } else {
        const { Browser } = await import("@capacitor/browser")
        await Browser.open({ url: webUrl })
      }
    } else {
      // Web: always open the web URL directly in a new tab.
      // (Skipping native scheme on web to avoid navigating the editor page away.)
      window.open(webUrl, "_blank")
    }
  }

  const shareText = `${sellerName} ${pageUrl}`
  const fbShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}&quote=${encodeURIComponent(sellerName)}`

  // REMOVED: LinkedIn from share options - only 4 icons in a row
  const shareOptions = [
    { name: "Copy", icon: copied ? "✓" : "🔗", color: copied ? "#22c55e" : "#6b7280", action: copyLink },
    {
      name: "X",
      icon: "𝕏",
      color: "#000000",
      action: () => openShareTarget(
        `twitter://post?message=${encodeURIComponent(shareText)}`,
        `https://x.com/intent/post?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(sellerName)}`,
      ),
    },
    {
      name: "Facebook",
      icon: "f",
      color: "#1877F2",
      // Use system browser on Capacitor so iOS Universal Links / Android App
      // Links redirect to the Facebook app.  Falls back to browser if not
      // installed.  The fb:// scheme is unreliable on modern iOS/Android.
      action: () => openShareTarget(null, fbShareUrl, true),
    },
    {
      name: "WhatsApp",
      icon: "💬",
      color: "#25D366",
      action: () => openShareTarget(
        `whatsapp://send?text=${encodeURIComponent(shareText)}`,
        `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      ),
    },
  ]

  return (
    <>
      {/* Share Button - positioned top left with scroll visibility */}
      <div
        className="absolute top-6 left-3 z-30 transition-all duration-500 ease-out"
        style={{
          opacity: shouldShow ? 1 : 0,
          transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
          pointerEvents: shouldShow ? "auto" : "none",
        }}
      >
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-center rounded-full transition-all duration-300 hover:scale-105",
            style === "glass" && "backdrop-blur-md",
          )}
          style={{
            width: size.btn,
            height: size.btn,
            background: s.buttonBg,
            border: s.buttonBorder,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
          }}
        >
          <Send size={size.icon} className={cn(s.iconColor, "transition-transform duration-300", isOpen ? "rotate-45 scale-90" : "")} />
        </button>
      </div>

      {/* Share Modal - positioned within phone preview */}
      <div
        className={cn(
          "absolute inset-0 z-40 flex items-center justify-center",
          isOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* Backdrop */}
        <div
          className={cn(
            "absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-250 ease-out will-change-[opacity]",
            isOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setIsOpen(false)}
        />

        {/* Modal - centered within phone preview */}
        <div
          className={cn(
            "relative z-10 rounded-2xl overflow-hidden transform-gpu transition-[opacity,translate,scale] duration-250 ease-out will-change-[opacity,translate]",
            isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-[0.985] translate-y-1",
          )}
          style={{
            width: scale === "small" ? 200 : 260,
            maxHeight: "90%",
            overflowY: "auto",
            background: "#ffffff",
            boxShadow: isOpen ? "0 20px 60px rgba(0, 0, 0, 0.2)" : "none",
          }}
        >
            {/* Profile preview card with background adapted to OnePage theme */}
            <div
              className="relative px-3 pt-4 pb-5"
              style={{
                background: popupHeaderBackground.includes('gradient') || popupHeaderBackground.includes('linear')
                  ? popupHeaderBackground
                  : `linear-gradient(135deg, ${popupHeaderBackground} 0%, ${popupHeaderBackground} 100%)`,
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className={cn("absolute top-2 right-2 p-1 rounded-full backdrop-blur-sm transition-all cursor-pointer z-10", headerCloseClass)}
              >
                <X size={scale === "small" ? 8 : 10} className={headerCloseIconClass} />
              </button>

              <div className="text-center">
                <div
                  className={cn(
                    "mx-auto mb-2 rounded-full overflow-hidden bg-white/20 flex items-center justify-center shadow-lg ring-2 ring-white/30 relative",
                    scale === "small" ? "w-10 h-10" : "w-12 h-12",
                  )}
                >
                  {avatarVideoUrl ? (
                    <SmoothAvatarVideo videoUrl={avatarVideoUrl} imageUrl={avatarUrl} alt={sellerName} />
                  ) : avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={sellerName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className={cn("font-bold", headerTextClass, scale === "small" ? "text-sm" : "text-base")}>
                      {sellerName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <h3 className={cn("font-bold mb-0.5", headerTextClass, scale === "small" ? "text-[10px]" : "text-xs")}>
                  {sellerName}
                </h3>
                <p
                  className={cn(
                    "truncate max-w-[140px] mx-auto",
                    headerSubTextClass,
                    scale === "small" ? "text-[7px]" : "text-[8px]",
                  )}
                >
                  {pageUrl.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>

            {/* Share options - centered and aligned */}
            <div className="px-2 py-2">
              <div className="flex justify-center items-center gap-2 px-2">
                {shareOptions.map((option) => (
                  <button
                    key={option.name}
                    onClick={option.action}
                    className="flex flex-col items-center gap-1 p-1.5 rounded-lg opacity-90 hover:opacity-100 transition-all duration-200 cursor-pointer hover:scale-105 active:scale-95"
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center",
                        scale === "small" ? "w-7 h-7" : "w-8 h-8",
                      )}
                    >
                      {option.icon === "✓" ? (
                        <Check size={scale === "small" ? 14 : 16} className="text-green-600" />
                      ) : option.icon === "🔗" ? (
                        <Link2 size={scale === "small" ? 14 : 16} className="text-gray-700" />
                      ) : option.name === "X" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#000000"
                        >
                          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                        </svg>
                      ) : option.name === "Facebook" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#1877F2"
                        >
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                      ) : option.name === "WhatsApp" ? (
                        <svg
                          className={scale === "small" ? "w-3.5 h-3.5" : "w-4 h-4"}
                          viewBox="0 0 24 24"
                          fill="#25D366"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                        </svg>
                      ) : (
                        <ExternalLink size={scale === "small" ? 14 : 16} className="text-gray-600" />
                      )}
                    </div>
                    <span className={cn("font-medium text-gray-600", scale === "small" ? "text-[6px]" : "text-[7px]")}>
                      {option.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Storelib CTA Section */}
            <div className="px-2 pb-2">
              <div
                className="bg-gray-50 rounded-xl p-2 border border-gray-100 cursor-pointer"
                onClick={() => openExternalUrl("https://storelib.com")}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 overflow-hidden",
                      scale === "small" ? "w-6 h-6" : "w-7 h-7",
                    )}
                  >
                    <img
                      src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib.svg"
                      alt="Storelib"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-semibold text-gray-900", scale === "small" ? "text-[7px]" : "text-[8px]")}>
                      Create your own page
                    </p>
                    <p className={cn("text-gray-500 truncate", scale === "small" ? "text-[6px]" : "text-[7px]")}>
                      Build with Storelib
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); openExternalUrl("https://storelib.com") }}
                    className={cn(
                      "bg-black text-white font-semibold rounded-lg hover:bg-gray-800 transition-all cursor-pointer",
                      scale === "small" ? "px-2 py-1 text-[6px]" : "px-2.5 py-1.5 text-[7px]",
                    )}
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
    </>
  )
}


interface PhonePreviewProps {
  className?: string
}

export function PhonePreview({ className }: PhonePreviewProps) {
  const { onepage } = useOnePage()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const lastScrollY = useRef(0)
  
  // Spotify modal state - lifted to root level to prevent clipping in groups
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false)
  const [spotifyModalData, setSpotifyModalData] = useState<{
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  } | null>(null)
  
  const openSpotifyModal = useCallback((data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => {
    setSpotifyModalData(data)
    setSpotifyModalOpen(true)
  }, [])
  
  const spotifyModalContextValue = { openSpotifyModal }

  // Apple Music modal state
  const [appleMusicModalOpen, setAppleMusicModalOpen] = useState(false)
  const [appleMusicModalData, setAppleMusicModalData] = useState<{
    title: string
    embedUrl: string
    appleMusicUrl: string
  } | null>(null)

  const openAppleMusicModal = useCallback((data: {
    title: string
    embedUrl: string
    appleMusicUrl: string
  }) => {
    setAppleMusicModalData(data)
    setAppleMusicModalOpen(true)
  }, [])

  const appleMusicModalContextValue = { openAppleMusicModal }

  // Prevent pull-to-refresh when Spotify/Apple Music modals are open
  useEffect(() => {
    if (spotifyModalOpen || appleMusicModalOpen) {
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
    } else {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
    return () => {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [spotifyModalOpen, appleMusicModalOpen])

  // PDF modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfModalData, setPdfModalData] = useState<{
    title: string
    description?: string
    pdfUrl: string
    buttonText?: string
  } | null>(null)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  // Load PDF.js and render pages when modal opens
  useEffect(() => {
    if (pdfModalOpen && pdfModalData?.pdfUrl) {
      setPdfLoading(true)
      setPdfTotalPages(1)
      setPdfCurrentPage(1)
      setPdfPages([])

      const loadPdfJs = async () => {
        try {
          if (!(window as any).pdfjsLib) {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            script.async = true
            await new Promise((resolve, reject) => {
              script.onload = resolve
              script.onerror = reject
              document.head.appendChild(script)
            })
          }

          const pdfjsLib = (window as any).pdfjsLib
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

          const loadingTask = pdfjsLib.getDocument(pdfModalData.pdfUrl)
          const pdf = await loadingTask.promise
          setPdfTotalPages(pdf.numPages)

          const pageImages: string[] = []
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const scale = 2
            const viewport = page.getViewport({ scale })

            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise

            pageImages.push(canvas.toDataURL('image/jpeg', 0.9))
          }

          setPdfPages(pageImages)
          setPdfLoading(false)
        } catch (error) {
          console.error('PDF loading error:', error)
          setPdfLoading(false)
          try {
            const response = await fetch(pdfModalData.pdfUrl)
            const buffer = await response.arrayBuffer()
            const bytes = new Uint8Array(buffer)
            const text = new TextDecoder('latin1').decode(bytes)
            const countMatch = text.match(/\/Count\s+(\d+)/g)
            if (countMatch) {
              const counts = countMatch.map(m => parseInt(m.match(/\d+/)?.[0] || '1'))
              setPdfTotalPages(Math.max(...counts))
            }
          } catch {
            setPdfTotalPages(1)
          }
        }
      }

      loadPdfJs()
    }
  }, [pdfModalOpen, pdfModalData?.pdfUrl])

  // Handle scroll to update current page
  const handlePdfScroll = useCallback(() => {
    const container = pdfScrollRef.current
    if (!container || pdfTotalPages <= 1 || pdfPages.length === 0) return

    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const pageHeight = container.scrollHeight / pdfTotalPages

    const currentPageIndex = Math.floor((scrollTop + containerHeight / 2) / pageHeight)
    const newPage = Math.min(pdfTotalPages, Math.max(1, currentPageIndex + 1))

    if (newPage !== pdfCurrentPage) {
      setPdfCurrentPage(newPage)
    }
  }, [pdfTotalPages, pdfPages.length, pdfCurrentPage])

  const openPDFModal = useCallback((data: {
    title: string
    description?: string
    pdfUrl: string
    buttonText?: string
  }) => {
    setPdfModalData(data)
    setPdfCurrentPage(1)
    setPdfTotalPages(1)
    setPdfModalOpen(true)
  }, [])

  const pdfModalContextValue = { openPDFModal }

  // Calendly modal state
  const [calendlyModalOpen, setCalendlyModalOpen] = useState(false)
  const [calendlyModalData, setCalendlyModalData] = useState<{
    title: string
    calendlyUrl: string
  } | null>(null)

  const openCalendlyModal = useCallback((data: {
    title: string
    calendlyUrl: string
  }) => {
    setCalendlyModalData(data)
    setCalendlyModalOpen(true)
  }, [])

  const calendlyModalContextValue = { openCalendlyModal }

  // Handle scroll for button visibility
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollY = container.scrollTop
    const nearTop = currentScrollY < 50
    const scrollingUp = currentScrollY < lastScrollY.current - 5

    setButtonsVisible(nearTop || scrollingUp)
    lastScrollY.current = currentScrollY
  }, [])

  if (!onepage) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings: rawSettings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  // Merge settings with defaults to ensure all fields exist (including verified badge)
  const settings = {
    show_branding: true,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "glass" as const,
    share_enabled: true,
    share_style: "white" as const,
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator" as const,
    ...rawSettings,
  }
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || "none"}`

  // Check if background is dark for footer link color
  const isDarkBackground = (() => {
    const color = theme.background_color || "#ffffff"
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16) || 255
    const g = Number.parseInt(hex.substring(2, 4), 16) || 255
    const b = Number.parseInt(hex.substring(4, 6), 16) || 255
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5 || theme.background_type === "image" || theme.background_type === "video"
  })()

  return (
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
    <AppleMusicModalContext.Provider value={appleMusicModalContextValue}>
    <PDFModalContext.Provider value={pdfModalContextValue}>
    <CalendlyModalContext.Provider value={calendlyModalContextValue}>
      <OnePageFonts theme={theme} />
      <div
        className={cn("relative flex-shrink-0", className)}
        style={{
          width: "307px",
          minWidth: "307px",
          maxWidth: "307px",
          height: "627px",
          minHeight: "627px",
          maxHeight: "627px",
          overflow: "hidden",
          borderRadius: "48px",
        }}
      >
        {/* Animation keyframes - subtle animation */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
        @keyframes gradientShiftPreview {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes laserGlowRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        /* Prevent image copying and dragging */
        .onepage-preview img {
          -webkit-user-drag: none;
          -khtml-user-drag: none;
          -moz-user-drag: none;
          -o-user-drag: none;
          user-drag: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          pointer-events: none;
        }
        .onepage-preview video {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
      `,
          }}
        />
      <div
        className="onepage-preview"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "307px",
          height: "627px",
          backgroundColor: "#1a1a1a",
          borderRadius: "46px",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          padding: "10px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "85px",
            width: "3px",
            height: "28px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "125px",
            width: "3px",
            height: "44px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "-2px",
            top: "180px",
            width: "3px",
            height: "44px",
            backgroundColor: "#1a1a1a",
            borderRadius: "2px 0 0 2px",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: "-2px",
            top: "145px",
            width: "3px",
            height: "55px",
            backgroundColor: "#1a1a1a",
            borderRadius: "0 2px 2px 0",
          }}
        />

        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "34px",
            overflow: "hidden",
            position: "relative",
            backgroundColor: "#000",
          }}
        >

          {/* Background base layer - stays fixed while content scrolls */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                theme.background_type === "gradient" && theme.background_gradient
                  ? theme.background_gradient
                  : theme.background_color,
              backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
              animation: isAnimatedGradient ? "gradientShiftPreview 10s ease-in-out infinite" : undefined,
              zIndex: 0,
            }}
          />

          {/* Background image - fixed position covering entire phone screen */}
          {theme.background_type === "image" && theme.background_image_url && (
            <div
              style={{
                position: "absolute",
                top: "-30px",
                left: "-30px",
                right: "-30px",
                bottom: "-30px",
                backgroundImage: `url(${theme.background_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "scroll",
                zIndex: 1,
                filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`,
              }}
            />
          )}

          {/* Video background - fixed position covering entire phone screen */}
          {theme.background_type === "video" && (theme as any).background_video_url && (
            <video
              src={(theme as any).background_video_url}
              style={{
                position: "absolute",
                top: "-30px",
                left: "-30px",
                right: "-30px",
                bottom: "-30px",
                width: "calc(100% + 60px)",
                height: "calc(100% + 60px)",
                objectFit: "cover",
                zIndex: 1,
                filter: `brightness(${(theme as any).video_brightness || 100}%)`,
              }}
              autoPlay
              loop
              muted
              playsInline
            />
          )}

          {/* Noise overlay for gradient backgrounds - fixed position */}
          {theme.background_type === "gradient" && (theme as any).gradient_noise && <WallpaperNoise strength={(theme as any).noise_strength} style={{ zIndex: 2 }} />}

          {/* Noise overlay for image backgrounds - fixed position */}
          {theme.background_type === "image" && (theme as any).image_noise && <WallpaperNoise strength={(theme as any).noise_strength} style={{ zIndex: 2 }} />}

          {/* Pattern overlay - fixed position */}
          <WallpaperPattern theme={theme} style={{ zIndex: 2 }} />

          {/* Scrollable content container */}
          <div
            key={animationKey}
            className="phone-screen-scroll"
            style={{
              position: "absolute",
              top: "0",
              left: "0",
              right: "0",
              bottom: "0",
              overflowY: "auto",
              overflowX: "hidden",
              fontFamily: fontStack(theme.font_family),
              scrollbarWidth: "thin",
              scrollbarColor: `${theme.text_color}30 transparent`,
              zIndex: 10,
            }}
          >
            <style>{`.phone-screen-scroll::-webkit-scrollbar { width: 3px; } .phone-screen-scroll::-webkit-scrollbar-track { background: transparent; margin: 10px 0; } .phone-screen-scroll::-webkit-scrollbar-thumb { background: ${theme.text_color}30; border-radius: 3px; } .phone-screen-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.text_color}50; }`}</style>

            {/* Share Button - conditionally rendered based on share settings */}
            {settings?.share_enabled !== false && (
              <ShareButtonPreview
                sellerName={sellerName}
                avatarUrl={avatar_url}
                avatarVideoUrl={avatar_video_url}
                pageUrl={getLinksShareUrl((onepage as any).slug || "preview")}
                scale="small"
                style={(settings as any)?.share_style || "white"}
                showSubscribe={settings?.subscribe_enabled !== false}
                accentColor={theme.button_color}
                isVisible={buttonsVisible}
                themeBackgroundType={theme.background_type}
                themeBackgroundColor={theme.background_color}
                themeBackgroundGradient={theme.background_gradient}
              />
            )}

            {/* Notification Bell - conditionally rendered based on subscribe settings */}
            {settings?.subscribe_enabled !== false && (
              <NotificationBell
                sellerName={sellerName}
                scale="small"
                style={(settings as any)?.subscribe_style || "glass"}
                isVisible={buttonsVisible}
              />
            )}

            <div
              style={{
                position: "relative",
                zIndex: 1,
                paddingTop: (theme as any).header_layout === "hero" ? "0px" : "45px",
                paddingBottom: "12px",
                paddingLeft: "16px",
                paddingRight: "16px",
                minHeight: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className={cn(
                  "flex flex-col items-center",
                  theme.spacing === "compact"
                    ? "gap-[10px]"
                    : theme.spacing === "comfortable"
                      ? "gap-[14px]"
                      : "gap-[12px]",
                )}
              >
                {draft_blocks
                  .filter((b) => isBlockShown(b))
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((block, index) => (
                    <div
                      key={block.id}
                      className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <BlockRenderer
                        block={block}
                        theme={theme}
                        profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                        scale="small"
                        settings={settings}
                      />
                    </div>
                  ))}
              </div>
              {/* Footer - pushed to bottom */}
              <div style={{ marginTop: "auto", paddingTop: "20px" }}>
                {settings.show_branding && (
                  <div className="text-center mb-2">
                    <span className="inline-flex items-center justify-center px-3 pt-1.5 pb-[8px] rounded-full text-[9px] font-medium bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
                      {sellerName} on Storelib
                    </span>
                  </div>
                )}
                {/* Footer Links */}
                <div className="flex items-center justify-center gap-2 text-[8px]">
                  <a
                    href="https://storelib.com/legal/privacy#cookies"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Cookies
                  </a>
                  <a
                    href="https://storelib.com/legal/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Privacy
                  </a>
                  <a
                    href="https://storelib.com/legal/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
                  >
                    Report
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Spotify Modal - Popup style inside phone preview */}
      {spotifyModalOpen && spotifyModalData && (
        <div
          className="absolute inset-0 z-[40] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSpotifyModalOpen(false); }}
        >
          <div
            className="bg-white w-[92%] max-h-[90%] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in zoom-in-95 fade-in duration-[350ms] ease-out rounded-2xl"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="text-[11px] font-medium text-gray-600 truncate max-w-[180px]">
                  {spotifyModalData.title}
                </span>
              </div>
              <button
                onClick={() => setSpotifyModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {/* Spotify Embed */}
            <div className="p-2.5">
              <div className="w-full overflow-hidden rounded-lg bg-black/5" style={{ aspectRatio: '1 / 1.15', maxHeight: '352px' }}>
                <iframe
                  src={spotifyModalData.embedUrl}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  scrolling="no"
                  className="block w-full h-full"
                />
              </div>
            </div>

            {/* Streaming Services - if show_streaming mode */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-2.5 pb-2.5">
                <p className="text-[10px] font-medium text-gray-700 mb-1.5">Listen on</p>
                <div className="space-y-1">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).map((service) => {
                    const names: Record<string, string> = {
                      apple_music: 'Apple Music',
                      spotify: 'Spotify',
                      youtube_music: 'YouTube Music',
                      youtube: 'YouTube',
                      itunes: 'iTunes',
                      soundcloud: 'SoundCloud',
                      tidal: 'TIDAL',
                      deezer: 'Deezer',
                      amazon_music: 'Amazon Music'
                    }
                    return (
                      <a
                        key={service.platform}
                        href={service.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between py-2 px-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-[11px] font-medium text-gray-900">{names[service.platform] || service.platform}</span>
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer - Open in Spotify button */}
            <div className="px-2.5 pb-2.5 pt-0">
              <a
                href={spotifyModalData.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-2 rounded-full bg-black text-white text-[11px] font-medium hover:bg-gray-800 transition-colors"
              >
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Apple Music Modal - Popup style inside phone preview */}
      {appleMusicModalOpen && appleMusicModalData && (
        <div
          className="absolute inset-0 z-[40] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAppleMusicModalOpen(false); }}
        >
          <div
            className="bg-white w-[92%] max-h-[90%] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in zoom-in-95 fade-in duration-[350ms] ease-out rounded-2xl"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="am-modal-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                      <stop offset="0" stopColor="#FA233B"/>
                      <stop offset="1" stopColor="#FB5C74"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#am-modal-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                </svg>
                <span className="text-[11px] font-medium text-gray-600 truncate max-w-[180px]">
                  {appleMusicModalData.title}
                </span>
              </div>
              <button
                onClick={() => setAppleMusicModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {/* Apple Music Embed */}
            <div className="p-2.5">
              <div className="w-full overflow-hidden rounded-lg bg-black/5" style={{ aspectRatio: '1 / 1.25', maxHeight: '370px' }}>
                <iframe
                  src={appleMusicModalData.embedUrl}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                  loading="lazy"
                  className="block w-full h-full bg-transparent"
                  style={{ overflow: 'hidden', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Footer - Open in Apple Music button */}
            <div className="px-2.5 pb-2.5 pt-0">
              <a
                href={appleMusicModalData.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-2 rounded-full bg-black text-white text-[11px] font-medium hover:bg-gray-800 transition-colors"
              >
                Open in Apple Music
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfModalOpen && pdfModalData && (
        <div
          className="absolute inset-[10px] z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          style={{ borderRadius: "34px" }}
          onClick={() => setPdfModalOpen(false)}
        >
          <div
            className="relative w-[230px] max-h-[440px] bg-white rounded-2xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-2.5 py-2 border-b shrink-0">
              <button
                onClick={() => setPdfModalOpen(false)}
                className="p-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[11px] font-semibold text-gray-900 truncate flex-1 text-center px-1">
                {pdfModalData.title || "PDF Document"}
              </h3>
              <button
                onClick={() => setPdfModalOpen(false)}
                className="p-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-2 overflow-hidden min-h-0">
              {/* PDF Preview Frame */}
              <div className="relative w-full max-w-[160px] bg-gray-50 rounded-lg border border-gray-200 overflow-hidden shadow-sm">
                {/* Page Counter */}
                <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 bg-white/95 backdrop-blur-sm rounded text-[8px] font-medium text-gray-600 shadow-sm">
                  {pdfLoading ? "..." : `${pdfCurrentPage} of ${pdfTotalPages}`}
                </div>
                <div
                  ref={pdfScrollRef}
                  className="aspect-[3/4] w-full bg-white overflow-y-auto overflow-x-hidden"
                  onScroll={handlePdfScroll}
                >
                  {pdfLoading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                    </div>
                  ) : pdfPages.length > 0 ? (
                    <div className="flex flex-col">
                      {pdfPages.map((pageImg, index) => (
                        <img
                          key={index}
                          src={pageImg}
                          alt={`Page ${index + 1}`}
                          className="w-full h-auto"
                        />
                      ))}
                    </div>
                  ) : (
                    <iframe
                      src={`${pdfModalData.pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-full border-0"
                      title={pdfModalData.title || "PDF Document"}
                    />
                  )}
                </div>
              </div>
              {pdfModalData.description && (
                <p className="mt-1.5 text-[8px] text-gray-500 text-center max-w-[150px] line-clamp-2">{pdfModalData.description}</p>
              )}
            </div>

            {/* Bottom View Button */}
            <div className="px-2 pb-2 pt-1 shrink-0">
              <a
                href={pdfModalData.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-1.5 bg-gray-900 hover:bg-gray-800 text-white text-[10px] font-semibold rounded-lg transition-colors"
              >
                {pdfModalData.buttonText || "View full PDF"}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Calendly Modal */}
      {calendlyModalOpen && calendlyModalData && (
        <div
          className="absolute inset-0 z-[100] flex items-center justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={() => setCalendlyModalOpen(false)}
        >
          <div
            className="relative w-full h-full max-w-[260px] max-h-[520px] bg-white rounded-2xl flex flex-col shadow-xl animate-in slide-in-from-bottom-2 duration-200 mx-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-2 py-2 border-b shrink-0">
              <button
                onClick={() => setCalendlyModalOpen(false)}
                className="p-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-[11px] font-semibold text-gray-900 truncate flex-1 text-center px-1">
                {calendlyModalData.title || "Book a Meeting"}
              </h3>
              <button
                onClick={() => setCalendlyModalOpen(false)}
                className="p-1 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Calendly Embed Area */}
            <div className="flex-1 overflow-hidden">
              <iframe
                src={calendlyModalData.calendlyUrl}
                className="w-full h-full border-0"
                title={calendlyModalData.title || "Calendly"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
    </CalendlyModalContext.Provider>
    </PDFModalContext.Provider>
    </AppleMusicModalContext.Provider>
    </SpotifyModalContext.Provider>
  )
}

export function MobilePreviewContent() {
  const { onepage } = useOnePage()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const lastScrollY = useRef(0)
  
  // Spotify modal state - lifted to root level to prevent clipping in groups
  const [spotifyModalOpen, setSpotifyModalOpen] = useState(false)
  const [spotifyModalData, setSpotifyModalData] = useState<{
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  } | null>(null)
  
  const openSpotifyModal = useCallback((data: {
    title: string
    embedUrl: string
    spotifyUrl: string
    streamingServices?: { platform: string; url: string | null; found: boolean }[]
    spotifyMode?: string
  }) => {
    setSpotifyModalData(data)
    setSpotifyModalOpen(true)
  }, [])
  
  const spotifyModalContextValue = { openSpotifyModal }

  // Apple Music modal state
  const [appleMusicModalOpen, setAppleMusicModalOpen] = useState(false)
  const [appleMusicModalData, setAppleMusicModalData] = useState<{
    title: string
    embedUrl: string
    appleMusicUrl: string
  } | null>(null)

  const openAppleMusicModal = useCallback((data: {
    title: string
    embedUrl: string
    appleMusicUrl: string
  }) => {
    setAppleMusicModalData(data)
    setAppleMusicModalOpen(true)
  }, [])

  const appleMusicModalContextValue = { openAppleMusicModal }

  // Prevent pull-to-refresh when Spotify/Apple Music modals are open
  useEffect(() => {
    if (spotifyModalOpen || appleMusicModalOpen) {
      document.documentElement.style.overscrollBehavior = 'none'
      document.body.style.overscrollBehavior = 'none'
    } else {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
    return () => {
      document.documentElement.style.overscrollBehavior = ''
      document.body.style.overscrollBehavior = ''
    }
  }, [spotifyModalOpen, appleMusicModalOpen])

  // PDF modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfModalData, setPdfModalData] = useState<{
    title: string
    description?: string
    pdfUrl: string
    buttonText?: string
  } | null>(null)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  // Load PDF.js and render pages when modal opens
  useEffect(() => {
    if (pdfModalOpen && pdfModalData?.pdfUrl) {
      setPdfLoading(true)
      setPdfTotalPages(1)
      setPdfCurrentPage(1)
      setPdfPages([])

      const loadPdfJs = async () => {
        try {
          if (!(window as any).pdfjsLib) {
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
            script.async = true
            await new Promise((resolve, reject) => {
              script.onload = resolve
              script.onerror = reject
              document.head.appendChild(script)
            })
          }

          const pdfjsLib = (window as any).pdfjsLib
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

          const loadingTask = pdfjsLib.getDocument(pdfModalData.pdfUrl)
          const pdf = await loadingTask.promise
          setPdfTotalPages(pdf.numPages)

          const pageImages: string[] = []
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const scale = 2
            const viewport = page.getViewport({ scale })

            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise

            pageImages.push(canvas.toDataURL('image/jpeg', 0.9))
          }

          setPdfPages(pageImages)
          setPdfLoading(false)
        } catch (error) {
          console.error('PDF loading error:', error)
          setPdfLoading(false)
          try {
            const response = await fetch(pdfModalData.pdfUrl)
            const buffer = await response.arrayBuffer()
            const bytes = new Uint8Array(buffer)
            const text = new TextDecoder('latin1').decode(bytes)
            const countMatch = text.match(/\/Count\s+(\d+)/g)
            if (countMatch) {
              const counts = countMatch.map(m => parseInt(m.match(/\d+/)?.[0] || '1'))
              setPdfTotalPages(Math.max(...counts))
            }
          } catch {
            setPdfTotalPages(1)
          }
        }
      }

      loadPdfJs()
    }
  }, [pdfModalOpen, pdfModalData?.pdfUrl])

  // Handle scroll to update current page
  const handlePdfScroll = useCallback(() => {
    const container = pdfScrollRef.current
    if (!container || pdfTotalPages <= 1 || pdfPages.length === 0) return

    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const pageHeight = container.scrollHeight / pdfTotalPages

    const currentPageIndex = Math.floor((scrollTop + containerHeight / 2) / pageHeight)
    const newPage = Math.min(pdfTotalPages, Math.max(1, currentPageIndex + 1))

    if (newPage !== pdfCurrentPage) {
      setPdfCurrentPage(newPage)
    }
  }, [pdfTotalPages, pdfPages.length, pdfCurrentPage])

  const openPDFModal = useCallback((data: {
    title: string
    description?: string
    pdfUrl: string
    buttonText?: string
  }) => {
    setPdfModalData(data)
    setPdfCurrentPage(1)
    setPdfTotalPages(1)
    setPdfModalOpen(true)
  }, [])

  const pdfModalContextValue = { openPDFModal }

  // Calendly modal state
  const [calendlyModalOpen, setCalendlyModalOpen] = useState(false)
  const [calendlyModalData, setCalendlyModalData] = useState<{
    title: string
    calendlyUrl: string
  } | null>(null)

  const openCalendlyModal = useCallback((data: {
    title: string
    calendlyUrl: string
  }) => {
    setCalendlyModalData(data)
    setCalendlyModalOpen(true)
  }, [])

  const calendlyModalContextValue = { openCalendlyModal }

  // Handle scroll for button visibility
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const currentScrollY = container.scrollTop
    const nearTop = currentScrollY < 50
    const scrollingUp = currentScrollY < lastScrollY.current - 5

    setButtonsVisible(nearTop || scrollingUp)
    lastScrollY.current = currentScrollY
  }, [])

  if (!onepage) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  const { title, bio, avatar_url, theme, draft_blocks, social_links, settings: rawSettings } = onepage
  const avatar_video_url = (onepage as any).avatar_video_url
  // Merge settings with defaults to ensure all fields exist (including verified badge)
  const settings = {
    show_branding: true,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "glass" as const,
    share_enabled: true,
    share_style: "white" as const,
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator" as const,
    ...rawSettings,
  }
  const avatar_video_crop = (settings as any)?.avatar_video_crop || null
  const sellerName = title || "Creator"

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = theme.background_type === "gradient" && theme.animated_gradient === true
  // Use animation toggle state in key to force re-render and restart animation
  const animationKey = `gradient-${String(theme.animated_gradient)}-${theme.background_gradient || "none"}`

  // Check if background is dark for footer link color
  const isDarkBackground = (() => {
    const color = theme.background_color || "#ffffff"
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16) || 255
    const g = Number.parseInt(hex.substring(2, 4), 16) || 255
    const b = Number.parseInt(hex.substring(4, 6), 16) || 255
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5 || theme.background_type === "image" || theme.background_type === "video"
  })()

  return (
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
    <AppleMusicModalContext.Provider value={appleMusicModalContextValue}>
    <PDFModalContext.Provider value={pdfModalContextValue}>
    <CalendlyModalContext.Provider value={calendlyModalContextValue}>
      <OnePageFonts theme={theme} />
      {/* Animation keyframes */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes gradientShiftFrame {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        /* Prevent image copying and dragging */
        .onepage-preview img {
          -webkit-user-drag: none;
          -khtml-user-drag: none;
          -moz-user-drag: none;
          -o-user-drag: none;
          user-drag: none;
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
          pointer-events: none;
        }
        .onepage-preview video {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
      `,
        }}
      />
      <div
        key={animationKey}
        className="onepage-preview flex-1 relative overflow-hidden"
        style={{
          background:
            theme.background_type === "gradient" && theme.background_gradient
              ? theme.background_gradient
              : theme.background_color,
          fontFamily: fontStack(theme.font_family),
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftFrame 10s ease-in-out infinite" : undefined,
        }}
      >
        {/* Share Button - absolute, stays above scroll, doesn't scroll with content */}
        {settings?.share_enabled !== false && (
          <ShareButtonPreview
            sellerName={sellerName}
            avatarUrl={avatar_url}
            avatarVideoUrl={avatar_video_url}
            pageUrl={getLinksShareUrl((onepage as any).slug || "preview")}
            scale="normal"
            style={(settings as any)?.share_style || "white"}
            showSubscribe={settings?.subscribe_enabled !== false}
            accentColor={theme.button_color}
            isVisible={buttonsVisible}
            themeBackgroundType={theme.background_type}
            themeBackgroundColor={theme.background_color}
            themeBackgroundGradient={theme.background_gradient}
          />
        )}

        {/* Notification Bell - absolute, stays above scroll, doesn't scroll with content */}
        {settings?.subscribe_enabled !== false && (
          <NotificationBell
            sellerName={sellerName}
            scale="normal"
            style={(settings as any)?.subscribe_style || "glass"}
            isVisible={buttonsVisible}
          />
        )}

        {/* Scrollable content container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="absolute inset-0 overflow-y-auto overflow-x-hidden"
          style={{ zIndex: 2 }}
        >
        <div className="relative" style={{ minHeight: "100vh" }}>
          {theme.background_type === "image" && theme.background_image_url && (
            <div
              style={{
                position: "absolute",
                top: "-50px",
                left: "-50px",
                right: "-50px",
                bottom: "-50px",
                backgroundImage: `url(${theme.background_image_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                zIndex: 0,
                pointerEvents: "none",
                filter: `brightness(${(theme as any).image_brightness || 100}%) blur(${(theme as any).image_blur || 0}px)`,
              }}
            />
          )}

          {theme.background_type === "video" && (theme as any).background_video_url && (
            <video
              src={(theme as any).background_video_url}
              style={{
                position: "absolute",
                top: "-50px",
                left: "-50px",
                right: "-50px",
                bottom: "-50px",
                width: "calc(100% + 100px)",
                height: "calc(100% + 100px)",
                objectFit: "cover",
                zIndex: 0,
                pointerEvents: "none",
                filter: `brightness(${(theme as any).video_brightness || 100}%)`,
              }}
              autoPlay
              loop
              muted
              playsInline
            />
          )}

          {theme.background_type === "gradient" && (theme as any).gradient_noise && <WallpaperNoise strength={(theme as any).noise_strength} style={{ zIndex: 1 }} />}

          {theme.background_type === "image" && (theme as any).image_noise && <WallpaperNoise strength={(theme as any).noise_strength} style={{ zIndex: 1 }} />}

          <WallpaperPattern theme={theme} style={{ zIndex: 1 }} />

        <div
          className="relative z-10 w-full max-w-md mx-auto px-5 py-8 pb-5 flex flex-col"
          style={{ minHeight: "100vh" }}
        >
          <div
            className={cn(
              "flex flex-col items-center",
              theme.spacing === "compact" ? "gap-3" : theme.spacing === "comfortable" ? "gap-5" : "gap-4",
            )}
          >
            {draft_blocks
              .filter((b) => isBlockShown(b))
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((block, index) => (
                <div
                  key={block.id}
                  className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <BlockRenderer
                    block={block}
                    theme={theme}
                    profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                    scale="normal"
                    settings={settings}
                  />
                </div>
              ))}
          </div>
          {/* Footer - pushed to bottom */}
          <div className="mt-auto pt-8">
            {settings.show_branding && (
              <div className="text-center mb-4">
                <span className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
                  {sellerName} on Storelib
                </span>
              </div>
            )}
            {/* Footer Links */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <a
                href="https://storelib.com/legal/privacy#cookies"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Cookies
              </a>
              <a
                href="https://storelib.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Privacy
              </a>
              <a
                href="https://storelib.com/legal/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
              >
                Report
              </a>
            </div>
          </div>
          </div>
        </div>
        {/* Close inner scroll container */}
        </div>
      </div>

      {/* Spotify Modal - Popup style inside phone preview */}
      {spotifyModalOpen && spotifyModalData && (
        <div
          className="absolute inset-0 z-[40] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSpotifyModalOpen(false); }}
        >
          <div
            className="bg-white w-[92%] max-h-[90%] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in zoom-in-95 fade-in duration-[350ms] ease-out rounded-2xl"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="text-[11px] font-medium text-gray-600 truncate max-w-[180px]">
                  {spotifyModalData.title}
                </span>
              </div>
              <button
                onClick={() => setSpotifyModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {/* Spotify Embed */}
            <div className="p-2.5">
              <div className="w-full overflow-hidden rounded-lg bg-black/5">
                <iframe
                  src={spotifyModalData.embedUrl}
                  width="100%"
                  height="300"
                  frameBorder="0"
                  scrolling="no"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className="block w-full"
                />
              </div>
            </div>

            {/* Streaming Services - if show_streaming mode */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-2.5 pb-2.5">
                <p className="text-[10px] font-medium text-gray-700 mb-1.5">Listen on</p>
                <div className="space-y-1">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).map((service) => {
                    const names: Record<string, string> = {
                      apple_music: 'Apple Music',
                      spotify: 'Spotify',
                      youtube_music: 'YouTube Music',
                      youtube: 'YouTube',
                      itunes: 'iTunes',
                      soundcloud: 'SoundCloud',
                      tidal: 'TIDAL',
                      deezer: 'Deezer',
                      amazon_music: 'Amazon Music'
                    }
                    return (
                      <a key={service.platform} href={service.url || '#'} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between py-2 px-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                        <span className="text-[11px] font-medium text-gray-900">{names[service.platform] || service.platform}</span>
                        <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer - Open in Spotify button */}
            <div className="px-2.5 pb-2.5 pt-0">
              <a href={spotifyModalData.spotifyUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center w-full py-2 rounded-full bg-black text-white text-[11px] font-medium hover:bg-gray-800 transition-colors">
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Apple Music Modal - Popup style inside phone preview */}
      {appleMusicModalOpen && appleMusicModalData && (
        <div
          className="absolute inset-0 z-[40] flex items-center justify-center bg-black/65 backdrop-blur-sm"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAppleMusicModalOpen(false); }}
        >
          <div
            className="bg-white w-[92%] max-h-[90%] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in zoom-in-95 fade-in duration-[350ms] ease-out rounded-2xl"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-2.5 border-b">
              <div className="flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="am-modal-grad2" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                      <stop offset="0" stopColor="#FA233B"/>
                      <stop offset="1" stopColor="#FB5C74"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#am-modal-grad2)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                </svg>
                <span className="text-[11px] font-medium text-gray-600 truncate max-w-[180px]">
                  {appleMusicModalData.title}
                </span>
              </div>
              <button
                onClick={() => setAppleMusicModalOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-3.5 h-3.5 text-gray-500" />
              </button>
            </div>

            {/* Apple Music Embed */}
            <div className="p-2.5">
              <div className="w-full overflow-hidden rounded-lg bg-black/5" style={{ aspectRatio: '1 / 1.25', maxHeight: '370px' }}>
                <iframe
                  src={appleMusicModalData.embedUrl}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                  sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                  loading="lazy"
                  className="block w-full h-full bg-transparent"
                  style={{ overflow: 'hidden', background: 'transparent' }}
                />
              </div>
            </div>

            {/* Footer - Open in Apple Music button */}
            <div className="px-2.5 pb-2.5 pt-0">
              <a
                href={appleMusicModalData.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-2 rounded-full bg-black text-white text-[11px] font-medium hover:bg-gray-800 transition-colors"
              >
                Open in Apple Music
              </a>
            </div>
          </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {pdfModalOpen && pdfModalData && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-in fade-in duration-200"
          onClick={() => setPdfModalOpen(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-t-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ maxHeight: "90vh", minHeight: "70vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
              <button
                onClick={() => setPdfModalOpen(false)}
                className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-base font-semibold text-gray-900 truncate flex-1 text-center px-2">
                {pdfModalData.title || "PDF Document"}
              </h3>
              <button
                onClick={() => setPdfModalOpen(false)}
                className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Preview Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden min-h-0">
              {/* PDF Preview Frame */}
              <div className="relative w-full max-w-xs bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
                {/* Page Counter */}
                <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-white/95 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-600 shadow-sm">
                  {pdfLoading ? "Loading..." : `${pdfCurrentPage} of ${pdfTotalPages}`}
                </div>
                <div
                  ref={pdfScrollRef}
                  className="aspect-[3/4] w-full bg-white overflow-y-auto overflow-x-hidden"
                  onScroll={handlePdfScroll}
                >
                  {pdfLoading ? (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="animate-spin w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                    </div>
                  ) : pdfPages.length > 0 ? (
                    <div className="flex flex-col">
                      {pdfPages.map((pageImg, index) => (
                        <img
                          key={index}
                          src={pageImg}
                          alt={`Page ${index + 1}`}
                          className="w-full h-auto"
                        />
                      ))}
                    </div>
                  ) : (
                    <iframe
                      src={`${pdfModalData.pdfUrl}#view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
                      className="w-full h-full border-0"
                      title={pdfModalData.title || "PDF Document"}
                    />
                  )}
                </div>
              </div>
              {pdfModalData.description && (
                <p className="mt-4 text-sm text-gray-500 text-center max-w-xs">{pdfModalData.description}</p>
              )}
            </div>

            {/* Bottom View Button */}
            <div className="px-6 pb-6 sm:pb-8 pt-4 shrink-0">
              <a
                href={pdfModalData.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-full py-4 bg-gray-900 hover:bg-gray-800 text-white text-base font-semibold rounded-2xl transition-colors"
              >
                {pdfModalData.buttonText || "View full PDF"}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Calendly Modal */}
      {calendlyModalOpen && calendlyModalData && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 bg-black/60 sm:bg-black/50 animate-in fade-in duration-300 ease-out"
          onClick={() => setCalendlyModalOpen(false)}
        >
          <div
            className="relative w-full h-full sm:h-[85vh] sm:max-h-[720px] max-w-lg bg-white sm:rounded-3xl flex flex-col shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-3 sm:py-4 border-b shrink-0">
              <button
                onClick={() => setCalendlyModalOpen(false)}
                className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-base font-semibold text-gray-900 truncate flex-1 text-center px-2">
                {calendlyModalData.title || "Book a Meeting"}
              </h3>
              <button
                onClick={() => setCalendlyModalOpen(false)}
                className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Calendly Embed Area */}
            <div className="flex-1 overflow-hidden min-h-0">
              <iframe
                src={calendlyModalData.calendlyUrl}
                className="w-full h-full border-0"
                style={{ minHeight: '500px' }}
                title={calendlyModalData.title || "Calendly"}
              />
            </div>
          </div>
        </div>
      )}
    </CalendlyModalContext.Provider>
    </PDFModalContext.Provider>
    </AppleMusicModalContext.Provider>
    </SpotifyModalContext.Provider>
  )
}

interface BlockRendererProps {
  block: OnePageBlock
  theme: OnePageTheme
  profile: {
    title: string
    bio: string
    avatar_url: string | null | undefined
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
    social_links: any
  }
  scale?: "small" | "normal"
  settings?: any
  isInsideCarousel?: boolean
  isInsideGroup?: boolean
}

// Verified Badge Component with tooltip
function VerifiedBadge({
  scale = "small",
  badgeType,
  textColor,
}: { scale?: "small" | "normal"; badgeType?: string; textColor?: string }) {
  // 10% bigger: small 14 -> 15, normal 18 -> 20
  const size = scale === "small" ? 15 : 20
  const badgeLabels: Record<string, string> = {
    verified_creator: "Verified Creator",
    verified_brand: "Verified Brand",
    verified_business: "Verified Business",
    official_page: "Official Page",
    verified_artist: "Verified Artist",
  }
  const label = badgeLabels[badgeType || "verified_creator"] || "Verified"

  return (
    <span className="group relative inline-flex items-center ml-1">
      <svg viewBox="0 0 22 22" width={size} height={size}>
        {/* Blue badge background */}
        <path
          fill="#3b82f6"
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.68.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
        />
        {/* White checkmark */}
        <path
          fill="#ffffff"
          d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
        />
      </svg>
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
      >
        {label}
      </span>
    </span>
  )
}

// Group Block Preview Component with scroll-tracking dots
function GroupBlockPreview({
  data,
  theme,
  profile,
  scale,
  settings,
  BlockRenderer,
}: {
  data: GroupBlockData
  theme: OnePageTheme
  profile: BlockRendererProps['profile']
  scale: BlockRendererProps['scale']
  settings?: { filled_icons?: boolean }
  BlockRenderer: React.ComponentType<BlockRendererProps>
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollStart, setScrollStart] = useState(0)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const enabledChildren = data.children.filter(c => c.enabled)
  const gap = 8 // gap-2 = 8px

  // Calculate carousel item width based on view setting
  const getCarouselItemWidth = () => {
    const view = data.carousel_view || "1"
    switch (view) {
      case "1.5": return 67
      case "1.2": return 85
      case "1":
      default: return 100
    }
  }

  const itemWidthPercent = getCarouselItemWidth()

  // Handle scroll to update current index with requestAnimationFrame for smoothness
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return
      const container = scrollContainerRef.current
      const scrollPosition = container.scrollLeft
      const containerWidth = container.clientWidth
      const itemWidth = (containerWidth * itemWidthPercent) / 100
      const newIndex = Math.round(scrollPosition / (itemWidth + gap))
      setCurrentIndex(Math.min(Math.max(0, newIndex), enabledChildren.length - 1))
    })
  }, [itemWidthPercent, enabledChildren.length])

  // Scroll to specific index
  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const itemWidth = (containerWidth * itemWidthPercent) / 100
    const targetScroll = index * (itemWidth + gap)
    container.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return
    setIsDragging(true)
    setStartX(e.pageX)
    setScrollStart(scrollContainerRef.current.scrollLeft)
    scrollContainerRef.current.style.scrollBehavior = 'auto'
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return
    e.preventDefault()
    const diff = e.pageX - startX
    scrollContainerRef.current.scrollLeft = scrollStart - diff
  }

  const handleMouseUp = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.style.scrollBehavior = 'smooth'
    }
    setIsDragging(false)
  }

  // Render carousel layout
  const renderCarousel = () => {
    const itemStyle = {
      width: `calc(${itemWidthPercent}% - ${gap}px)`,
      minWidth: `calc(${itemWidthPercent}% - ${gap}px)`,
    }

    return (
      <div className="w-full relative" style={{ overflow: 'visible' }}>
        {/* Fade on left edge */}
        {data.carousel_fade_edges && (
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "w-full scrollbar-hide snap-x snap-mandatory touch-pan-x",
            isDragging ? "cursor-grabbing select-none" : "cursor-grab"
          )}
          style={{ 
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            overflowX: 'auto',
            overflowY: 'visible',
          }}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="flex"
            style={{
              gap: `${gap}px`,
              padding: '4px 10px 12px 10px',
            }}
          >
            {enabledChildren.map((child) => (
              <div
                key={child.id}
                className="shrink-0 snap-start"
                style={itemStyle}
              >
                <div className="w-full">
                  <BlockRenderer block={child} theme={theme} profile={profile} scale={scale} settings={settings} isInsideCarousel={true} isInsideGroup={true} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fade on right edge */}
        {data.carousel_fade_edges && (
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Dots navigation - updates based on scroll position */}
        {enabledChildren.length > 1 && (
          <div className="flex justify-center gap-1.5 mt-1 pt-1">
            {enabledChildren.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  index === currentIndex ? "w-3" : "w-1.5"
                )}
                style={{
                  backgroundColor: index === currentIndex ? theme.text_color : `${theme.text_color}40`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // Render stack layout
  const renderStack = () => (
    <div className="w-full flex flex-col gap-2 px-1">
      {enabledChildren.map((child) => (
        <div key={child.id} className="w-full py-0.5">
          <BlockRenderer block={child} theme={theme} profile={profile} scale={scale} settings={settings} isInsideGroup={true} />
        </div>
      ))}
    </div>
  )

  return (
    <div className="w-full flex flex-col gap-2">
      {data.title && (
        <h3 
          className="text-xs font-medium text-center opacity-70 px-2" 
          style={{ 
            color: theme.text_color,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.title}
        </h3>
      )}
      {data.layout === "carousel" ? renderCarousel() : renderStack()}
    </div>
  )
}

// Image Carousel Component with transform-based positioning for smooth, reliable swiping
/**
 * ===========================================================================
 *  THE SLIDER, ON A PHONE — THE EDITOR'S COPY OF IT
 * ===========================================================================
 * The same component as PublicImageCarousel in public-onepage.tsx, drawn at
 * preview scale. The three fixes below were written for the published page
 * and belong here for the same reason the file exists: what the creator drags
 * in the editor has to be what a visitor gets.
 *
 * Three separate things were making it blink and fight the finger, and all
 * three are measured in scripts/check-onepage-stability.mjs.
 *
 * 1. The swipe could not stop the page scrolling. React attaches touchmove
 *    passively at the root, so the preventDefault() this used to call inside
 *    an onTouchMove was discarded with a console warning: the page scrolled
 *    vertically at the same time as the track moved sideways. The listeners
 *    are native and { passive: false } now, which is the only way to get a
 *    cancellable touchmove in React.
 *
 * 2. Every dragged frame was a React render. setDragOffset re-rendered the
 *    whole track and every slide in it, sixty times a second, to change one
 *    number in one transform. The drag writes that transform straight to the
 *    node instead; React owns where the track RESTS, the finger owns where it
 *    is right now, and the two never disagree because both read restOffset().
 *
 * 3. A slide's width waited for JavaScript. It was measured with a
 *    ResizeObserver and until that arrived every slide was laid out at 100%,
 *    so the first painted frame showed one full-width picture that then
 *    snapped to the 1.2-up view. The width is the same arithmetic expressed
 *    in calc(), so it is correct on the first frame with nothing measured.
 *    The measurement stays, because the translate still needs a real number,
 *    but at index 0 that number is 0 and nothing moves while it arrives.
 */
/*
  ═══════════════════════════════════════════════════════════════════════════
   THE DOTS FOLLOW THE ROW, THEY DO NOT WAIT FOR IT TO ARRIVE
  ═══════════════════════════════════════════════════════════════════════════
  Reported as the dot filling "too direct, not smooth": the active pill used
  to be `idx === currentIndex`, so it snapped from one dot to the next the
  instant the nearest slide changed — at the halfway point of a scroll, in one
  step, however slowly the finger was moving.

  A dot's width and opacity are now a function of where the row actually is:
  at 40% between two slides the pill is 40% grown into the second one and 60%
  still in the first. Scrolling by hand, by arrow or by autoplay all produce
  the same continuous movement, because all three move the same scrollLeft.

  Written straight to the nodes rather than through state, because this runs
  on every animation frame of a scroll and re-rendering React that often to
  change two numbers on five small elements is the cost the drag used to pay.
*/
const DOT_MIN = 6
const DOT_MAX = 16

/**
 * ===========================================================================
 *  THE SLIDER IS A SCROLLER — THE EDITOR'S COPY OF IT
 * ===========================================================================
 * The same component as PublicImageCarousel in public-onepage.tsx, drawn at
 * preview scale. What a creator drags in the editor has to be what a visitor
 * gets, so the rebuild below belongs here too.
 *
 * Reported twice, the second time after a round of fixes that measured well
 * and still did not work: "sliding smoothly with my finger left and right to
 * move the image gallery doesn't work at all".
 *
 * IT WAS MEASURED WRONG. The check that passed dispatched TouchEvent objects
 * at the element, which proves the handler runs and nothing else. A finger
 * goes through the browser's input pipeline first — touch-action, the
 * compositor deciding whether this gesture belongs to the page's own scroll,
 * and whether the touchmove is still cancellable by the time JavaScript sees
 * it. Driving real touch input through that pipeline instead
 * (scripts/check-onepage-drag.mjs) showed every touchmove arriving with
 * cancelable false, so the preventDefault() the old code depended on was a
 * no-op and the page was free to move under the finger.
 *
 * SO THE HAND-ROLLED DRAG IS GONE. It rested on two guesses that have to be
 * right every time:
 *
 *   - a direction lock decided from the first touchmove that cleared 6px. A
 *     real swipe starts with a few pixels of wobble, and one sample that is
 *     slightly more vertical than horizontal threw the whole gesture away,
 *     however flat the finger travelled afterwards.
 *   - preventDefault() on a touchmove, to stop the page scrolling. Measured
 *     on the deployed page, it never had the chance.
 *
 * A native scroller has neither problem, because none of it is a guess: the
 * browser moves the row, on the compositor, with momentum and snapping, and
 * it follows a finger by construction. It is also what the group carousel in
 * this same file has always been, and nobody has ever reported that one not
 * moving.
 *
 * What is left in JavaScript is only what a scroller cannot do by itself:
 * which dot is filled, what the arrows do, and autoplay. All three read and
 * write scrollLeft, so they agree with the finger instead of competing with
 * it.
 */
function ImageCarousel({
  images,
  renderImage,
  borderRadius,
  autoplay,
  theme,
  carouselView = "1",
}: {
  images: { id: string; image_url: string; alt_text?: string; title?: string; link_url?: string | null }[]
  renderImage: (img: typeof images[0], index: number) => React.ReactNode
  borderRadius: string
  autoplay?: boolean
  theme: OnePageTheme
  carouselView?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  /* Autoplay stands back for a few seconds after a finger has been on it. */
  const heldUntilRef = useRef(0)

  const view = parseFloat(carouselView) || 1
  const gap = view > 1 ? 6 : 4 // Always have a small gap between images
  const maxIndex = Math.max(0, images.length - Math.ceil(view))

  /*
    The width of one slide, said once, in CSS.

    It used to be measured with a ResizeObserver, which meant every slide was
    laid out at 100% on the first painted frame and rewritten to a pixel
    width about 135ms later: one full-width picture that snapped to the
    1.2-up view on every load.
  */
  const slideWidth = `calc((100% - ${gap * (Math.ceil(view) - 1)}px) / ${view})`

  /* Where a slide begins, asked of the slide rather than recomputed from a
     measured width and a gap. The browser already knows. */
  const goToSlide = useCallback((index: number) => {
    const el = scrollerRef.current
    if (!el) return
    const target = el.children[Math.max(0, Math.min(index, images.length - 1))] as HTMLElement | undefined
    if (!target) return
    el.scrollTo({ left: target.offsetLeft, behavior: "smooth" })
  }, [images.length])

  /*
    WHICH SLIDE IS SHOWING IS A QUESTION FOR THE SCROLLER.

    Read once per frame rather than per scroll event, because a touch scroll
    on a phone fires far more of those than there are frames to draw.
  */
  const dotsRef = useRef<HTMLDivElement>(null)

  /*
    How far one slide is from the next. Held rather than asked for on every
    scroll event, because reading offsetLeft straight after writing a style
    forces the browser to lay the page out again, and a touch scroll fires
    these by the hundred.
  */
  const stepRef = useRef(0)
  const measureStep = useCallback(() => {
    const el = scrollerRef.current
    if (!el || el.children.length < 2) return
    stepRef.current = (el.children[1] as HTMLElement).offsetLeft - (el.children[0] as HTMLElement).offsetLeft
  }, [])

  /* Where the row is, as a fraction of a slide, and the dots drawn from it. */
  const paintDots = useCallback(() => {
    const el = scrollerRef.current
    const dots = dotsRef.current
    if (!el || !dots) return
    const step = stepRef.current
    const progress = step > 0 ? Math.max(0, Math.min(el.scrollLeft / step, maxIndex)) : 0
    for (let i = 0; i < dots.children.length; i++) {
      const dot = dots.children[i] as HTMLElement
      const nearness = Math.max(0, 1 - Math.abs(progress - i))
      dot.style.width = `${DOT_MIN + (DOT_MAX - DOT_MIN) * nearness}px`
      dot.style.opacity = String(0.4 + 0.6 * nearness)
    }
  }, [maxIndex])

  const rafRef = useRef<number | null>(null)
  const handleScroll = useCallback(() => {
    /*
      THE DOTS ARE PAINTED HERE, NOT INSIDE THE FRAME CALLBACK.

      They were, and in a headless measurement of this component the frame
      callback never ran: the row moved and the dots did not. Four width and
      opacity writes do not need a frame of their own, and the thing the eye
      is following should not be the thing waiting in a queue. The frame is
      still used for the React state below, which only changes when the
      nearest slide changes and can afford to be late.
    */
    paintDots()
    if (rafRef.current !== null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = scrollerRef.current
      if (!el) return
      let nearest = 0
      let shortest = Infinity
      for (let i = 0; i < el.children.length; i++) {
        const distance = Math.abs((el.children[i] as HTMLElement).offsetLeft - el.scrollLeft)
        if (distance < shortest) { shortest = distance; nearest = i }
      }
      /* The last slide is right-aligned by the scroller clamping itself, so
         several indexes share that final position. The dots only ever count
         the positions you can actually stop at. */
      setCurrentIndex(Math.min(nearest, maxIndex))
    })
  }, [maxIndex, paintDots])

  /*
    A NATIVE SCROLL LISTENER, NOT REACT'S onScroll.

    scroll does not bubble, so React delegates it specially, and in a headless
    measurement of this very component the handler never ran at all: the row
    moved, and the dots and the current index stayed where they were. That is
    the "dots don't update" bug in miniature, and there is nothing to gain by
    routing this one event through React. Passive, because nothing here ever
    wants to cancel a scroll.
  */
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [handleScroll])

  /* Before the first paint, so no dot is ever drawn at the wrong size. */
  useLayoutEffect(() => {
    measureStep()
    paintDots()
  }, [measureStep, paintDots, images.length])

  /* A narrower window is a shorter slide. */
  useEffect(() => {
    const onResize = () => { measureStep(); paintDots() }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [measureStep, paintDots])

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }, [])

  // Auto-advance slides
  useEffect(() => {
    if (!autoplay || isHovered || images.length <= 1) return
    const interval = setInterval(() => {
      if (Date.now() < heldUntilRef.current) return
      const el = scrollerRef.current
      if (!el) return
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
      goToSlide(atEnd ? 0 : currentIndex + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [autoplay, isHovered, images.length, currentIndex, goToSlide])

  const hold = useCallback(() => { heldUntilRef.current = Date.now() + 3000 }, [])

  const goToPrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    hold()
    goToSlide(currentIndex === 0 ? maxIndex : currentIndex - 1)
  }, [currentIndex, maxIndex, goToSlide, hold])

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    hold()
    goToSlide(currentIndex >= maxIndex ? 0 : currentIndex + 1)
  }, [currentIndex, maxIndex, goToSlide, hold])

  if (images.length === 0) return null

  const dotCount = maxIndex + 1

  return (
    <div
      className="relative w-full group"
      /*
        HOVER IS A MOUSE, AND A PHONE HAS NO MOUSE.

        These were onMouseEnter/onMouseLeave. A tap on a phone fires the
        compatibility mouse events, so the first touch anywhere on the slider
        set isHovered — and mouseleave often never arrives, so it stayed set,
        and the autoplay effect above returned early for the rest of the
        visit. That is "autoplay doesn't even work on mobile": it does, until
        you touch the page once.
      */
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setIsHovered(true) }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setIsHovered(false) }}
    >
      {/* The row itself: a scroller, snapping, with its scrollbar hidden. */}
      <div
        ref={scrollerRef}
        onTouchStart={hold}
        className="w-full scrollbar-hide"
        style={{
          display: 'flex',
          gap: `${gap}px`,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          /* A swipe past the last slide belongs to the slider, not to the
             page behind it and not to the browser's back gesture. */
          overscrollBehaviorX: 'contain',
        }}
      >
        {images.map((img, idx) => (
          <div
            key={img.id || idx}
            style={{
              width: slideWidth,
              flexShrink: 0,
              scrollSnapAlign: 'start',
            }}
          >
            {renderImage(img, idx)}
          </div>
        ))}
      </div>
      {/* Navigation Arrows - visible on hover */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goToPrev}
            className="absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm hover:bg-black/60 z-10"
            aria-label="Previous image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToNext}
            className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 backdrop-blur-sm hover:bg-black/60 z-10"
            aria-label="Next image"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Navigation Dots */}
      {images.length > 1 && (
        <div ref={dotsRef} className="flex justify-center gap-1.5 mt-2.5 pb-0.5">
          {Array.from({ length: dotCount }, (_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); hold(); goToSlide(idx) }}
              /* paintDots owns the width and the opacity; see the note on
                 DOT_MIN above. What is left is the size before first paint. */
              className="w-1.5 h-1.5 rounded-full bg-current opacity-40"
              style={{ color: theme.text_color }}
              aria-label={`Go to slide ${idx + 1}`}
              aria-current={idx === currentIndex}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BlockRenderer({ block, theme, profile, scale = "small", settings, isInsideCarousel = false, isInsideGroup = false }: BlockRendererProps) {
  const [emailSubmitted, setEmailSubmitted] = useState(false)

  // Use context for Spotify modal - renders at root level to prevent clipping
  const spotifyModalContext = useContext(SpotifyModalContext)

  // Use context for Apple Music modal - renders at root level to prevent clipping
  const appleMusicModalContext = useContext(AppleMusicModalContext)

  // Use context for PDF modal - renders at root level to prevent clipping
  const pdfModalContext = useContext(PDFModalContext)

  // Button hover animation - based on theme setting, disabled inside carousel
  const buttonHoverAnimation = (theme as any).button_hover_animation || "default"
  const getHoverEffect = () => {
    if (isInsideCarousel) return ""
    switch (buttonHoverAnimation) {
      case "fade":
        return "hover:opacity-80 transition-opacity duration-200"
      case "zoom":
        return "hover:scale-[1.03] transition-transform duration-200"
      case "default":
      default:
        return "hover:scale-[1.01] hover:opacity-95 transition-all duration-200"
    }
  }
  const hoverEffect = getHoverEffect()

  // Spotify URL helper
  const isSpotifyUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('spotify.com') || url.includes('open.spotify.com')
  }

  // SoundCloud URL helper
  const isSoundCloudUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('soundcloud.com')
  }

  // Apple Music URL helper
  const isAppleMusicUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('music.apple.com')
  }

  // TikTok video URL helper
  const isTikTokVideoUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('tiktok.com') && (url.includes('/video/') || url.includes('vm.tiktok.com'))
  }

  // Extract TikTok video ID from URL
  const getTikTokVideoId = (url: string): string | null => {
    if (!url) return null
    const match = url.match(/video\/(\d+)/)
    return match ? match[1] : null
  }

  // Get Apple Music embed URL
  const getAppleMusicEmbedUrl = (url: string): string | null => {
    if (!url.includes('music.apple.com')) return null
    // Convert regular URL to embed URL
    // Format: https://embed.music.apple.com/{country}/{type}/{name}/{id}
    return url.replace('music.apple.com', 'embed.music.apple.com')
  }

  // Extract Spotify ID and type from URL
  const getSpotifyInfo = (url: string): { type: string; id: string; embedUrl: string } | null => {
    try {
      const patterns = [
        /spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/,
        /open\.spotify\.com\/(track|album|artist|playlist)\/([a-zA-Z0-9]+)/
      ]
      for (const pattern of patterns) {
        const match = url.match(pattern)
        if (match) {
          const type = match[1]
          const id = match[2]
          return {
            type,
            id,
            embedUrl: `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`
          }
        }
      }
    } catch {
      return null
    }
    return null
  }

  const s =
    scale === "small"
      ? {
          avatar: "h-[62px] w-[62px]",
          avatarFallback: "text-[16px]",
          title: "text-[16px]",
          bio: "text-[11px] max-w-[180px]",
          button: "py-[14.5px] px-[12px] text-[12px]",
          buttonThumb: "w-[30px] h-[30px]",
          buttonIcon: 20,
          buttonIconLeft: "12px",
          buttonTextPadding: "pl-[46px] pr-[46px]",
          text: "text-[11px]",
          input: "px-[10px] py-[8px] text-[11px]",
          inputBtn: "px-[12px] py-[8px] text-[11px]",
          headline: "text-[13px]",
          description: "text-[10px]",
          social: "w-[38px] h-[38px]",
          socialIcon: 16,
          socialGap: "gap-[10px]",
          socialMarginBottom: "mb-[8px]",
        }
      : {
          avatar: "h-[88px] w-[88px]",
          avatarFallback: "text-2xl",
          title: "text-xl",
          bio: "text-sm max-w-xs",
          button: "py-[16.5px] px-4 text-[15px]",
          buttonThumb: "w-[35px] h-[35px]",
          buttonIcon: 34,
          buttonIconLeft: "16px",
          buttonTextPadding: "pl-[58px] pr-[58px]",
          text: "text-sm",
          input: "px-4 py-3 text-base",
          inputBtn: "px-5 py-3 text-base",
          headline: "text-lg",
          description: "text-sm",
          social: "w-[42px] h-[42px]",
          socialIcon: 20,
          socialGap: "gap-3.5",
          socialMarginBottom: "mb-4",
        }

  const buttonShadow = (theme as any).button_shadow || "none"
  const shadowColor = (theme as any).button_shadow_color || "#000000"
  // Convert hex to rgba for shadow
  const hexToRgba = (hex: string, alpha: number) => {
    const r = Number.parseInt(hex.slice(1, 3), 16) || 0
    const g = Number.parseInt(hex.slice(3, 5), 16) || 0
    const b = Number.parseInt(hex.slice(5, 7), 16) || 0
    return `rgba(${r},${g},${b},${alpha})`
  }
  const shadowStyles: Record<string, string> = {
    none: "none",
    subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
    strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
    hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
  }

  const buttonStyles = {
    backgroundColor:
      theme.button_style === "outline"
        ? "transparent"
        : theme.button_style === "glass"
          ? "rgba(255, 255, 255, 0.15)"
          : theme.button_color,
    color: theme.button_text_color,
    borderRadius: `${theme.button_border_radius}px`,
    borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
    borderStyle: "solid" as const,
    borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
    backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
    boxShadow: shadowStyles[buttonShadow] || "none",
  }

  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  switch (block.type) {
    case "header": {
      const data = block.data as HeaderBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const hasVideo = !!profile.avatar_video_url

      // Helper to get gradient bottom color
      const getGradientBottomColor = () => {
        if (theme.background_type === "gradient" && theme.background_gradient) {
          const colorMatches = theme.background_gradient.match(
            /#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g,
          )
          if (colorMatches && colorMatches.length > 0) {
            return colorMatches[colorMatches.length - 1]
          }
        }
        return theme.background_color
      }

      // Hero layout with SMOOTH fade using mask
      if (headerLayout === "hero" && (profile.avatar_url || hasVideo)) {
        const isGradientBg = theme.background_type === "gradient"
        const fadeColor = getGradientBottomColor()

        const heroMargin = scale === "small" ? "-mx-4 -mt-[45px]" : "-mx-5 -mt-8"
        const heroWidth = scale === "small" ? "w-[calc(100%+32px)]" : "w-[calc(100%+40px)]"
        // Desktop/preview: ~10% taller (1/1 vs old 11/10), Mobile: ~20% taller (10/9 vs old 4/3)
        const heroAspect = scale === "small" ? "1/1" : "10/9"

        return (
          <div className={cn(heroWidth, "relative mb-2", heroMargin)}>
            <div className="relative w-full" style={{ aspectRatio: heroAspect, backgroundColor: theme.background_color || '#e5e7eb' }}>
              {hasVideo ? (
                <SmoothAvatarVideo
                  videoUrl={profile.avatar_video_url!}
                  imageUrl={profile.avatar_url}
                  alt={profile.title || "Avatar"}
                                    videoStyle={{ objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                  imageStyle={{ objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                />
              ) : (
                <img
                  src={profile.avatar_url! || "/placeholder.svg"}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{ imageRendering: "auto", objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              )}
              {/* Smooth gradient fade overlay using CSS mask for gradient backgrounds */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: isGradientBg ? theme.background_gradient : fadeColor,
                  maskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 40%, black 100%)",
                }}
              />
              {/* Additional soft fade for non-gradient backgrounds */}
              {!isGradientBg && (
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: `linear-gradient(to bottom, 
                      transparent 0%, 
                      transparent 50%,
                      ${fadeColor}33 60%,
                      ${fadeColor}66 70%,
                      ${fadeColor}99 80%,
                      ${fadeColor}cc 90%,
                      ${fadeColor} 100%
                    )`,
                  }}
                />
              )}
            </div>
            <div className="absolute bottom-3 left-0 right-0 text-center px-4">
              {data.show_name &&
                ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
                  <img
                    src={(theme as any).title_logo_url || "/placeholder.svg"}
                    alt={profile.title || "Logo"}
                    className="mx-auto w-auto"
                    style={{
                      maxHeight:
                        (theme as any).title_size === "large"
                          ? scale === "small"
                            ? "59px"
                            : "67px"
                          : scale === "small"
                            ? "50px"
                            : "59px",
                      maxWidth:
                        (theme as any).title_size === "large"
                          ? scale === "small"
                            ? "194px"
                            : "238px"
                          : scale === "small"
                            ? "173px"
                            : "216px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))",
                      marginTop: (theme as any).logo_position === "more_up" ? "-10px" : undefined,
                    }}
                  />
                ) : (
                  profile.title && (
                    <h1
                      className={cn(
                        s.title,
                        "font-bold inline-flex items-center justify-center",
                        (theme as any).title_size === "large" && (scale === "small" ? "text-[21px]" : "text-[26px]"),
                      )}
                      style={{
                        color: (theme as any).title_color || theme.text_color,
                        fontFamily: fontStack((theme as any).title_font || theme.font_family),
                        textShadow: "0 1px 4px rgba(0,0,0,0.3)",
                      }}
                    >
                      {profile.title}
                      {settings?.verified_badge_enabled && (
                        <VerifiedBadge scale={scale} badgeType={settings?.verified_badge_type} />
                      )}
                    </h1>
                  )
                ))}
              {data.show_bio && profile.bio && (
                <p
                  className={cn(s.bio, "text-center mt-1 mx-auto")}
                  style={{
                    color: theme.secondary_text_color || theme.text_color,
                    textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                >
                  {profile.bio}
                </p>
              )}
            </div>
          </div>
        )
      }

      // Classic layout
      // Laser glow settings - glow travels along the avatar border
      const laserGlowEnabled = (theme as any).laser_glow_enabled
      const laserGlowColor = (theme as any).laser_glow_color || "#3b82f6"
      const laserGlowIntensity = (theme as any).laser_glow_intensity || "medium"
      // Glow intensity settings - reduced spread by 40%
      const glowSpread = laserGlowIntensity === "low" ? 4 : laserGlowIntensity === "hard" ? 8 : 6
      const glowOpacity = laserGlowIntensity === "low" ? 0.7 : laserGlowIntensity === "hard" ? 1 : 0.85
      // Avatar size increased by 3px
      const avatarSize = scale === "small" ? 75 : 91

      return (
        <div className="flex flex-col items-center gap-2 w-full text-center">
          {data.show_avatar && (
            <div className="relative" style={{ width: avatarSize, height: avatarSize, marginTop: 6 }}>
              {/* Laser Glow Effect - rotating gradient on border with trail */}
              {laserGlowEnabled && (
                <>
                  {/* Trail layer 3 - farthest behind */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 200deg, ${laserGlowColor}22 260deg, ${laserGlowColor}44 300deg, ${laserGlowColor}66 340deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread + 4}px)`,
                      opacity: glowOpacity * 0.4,
                    }}
                  />
                  {/* Trail layer 2 */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 260deg, ${laserGlowColor}44 300deg, ${laserGlowColor}88 340deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread + 2}px)`,
                      opacity: glowOpacity * 0.6,
                    }}
                  />
                  {/* Main glow layer - brightest point */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      inset: 0,
                      background: `conic-gradient(from 0deg, transparent 0deg, transparent 320deg, ${laserGlowColor}88 345deg, ${laserGlowColor} 360deg)`,
                      animation: "laserGlowRotate 3.25s linear infinite",
                      filter: `blur(${glowSpread}px)`,
                      opacity: glowOpacity,
                      boxShadow: `0 0 ${glowSpread * 2}px ${laserGlowColor}`,
                    }}
                  />
                </>
              )}
              {/* Avatar container */}
              <div className="absolute inset-0">
                {hasVideo ? (
                  <div
                    className={cn(s.avatar, "rounded-full overflow-hidden border-2 shadow-lg w-full h-full relative")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <SmoothAvatarVideo
                      videoUrl={profile.avatar_video_url!}
                      imageUrl={profile.avatar_url}
                      alt={profile.title || "Avatar"}
                                            videoStyle={
                        profile.avatar_video_crop
                          ? {
                              transformOrigin: '0 0',
                              transform: `scale(${100 / profile.avatar_video_crop.width}) translate(-${profile.avatar_video_crop.x}%, -${profile.avatar_video_crop.y}%)`,
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : (
                  <Avatar
                    className={cn(s.avatar, "border-2 shadow-lg w-full h-full")}
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <AvatarImage
                      src={profile.avatar_url || undefined}
                      className="object-cover"
                      style={{
                        imageRendering: "auto",
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      }}
                    />
                    <AvatarFallback
                      className={cn(s.avatarFallback, "font-semibold")}
                      style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
                    >
                      {profile.title?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
          {data.show_name &&
            ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
              <img
                src={(theme as any).title_logo_url || "/placeholder.svg"}
                alt={profile.title || "Logo"}
                className="mx-auto w-auto my-1"
                style={{
                  maxHeight:
                    (theme as any).title_size === "large"
                      ? scale === "small"
                        ? "59px"
                        : "67px"
                      : scale === "small"
                        ? "50px"
                        : "59px",
                  maxWidth:
                    (theme as any).title_size === "large"
                      ? scale === "small"
                        ? "194px"
                        : "238px"
                      : scale === "small"
                        ? "173px"
                        : "216px",
                  objectFit: "contain",
                  marginTop: (theme as any).logo_position === "more_up" ? "-5px" : undefined,
                }}
              />
            ) : (
              profile.title && (
                <h1
                  className={cn(
                    s.title,
                    "font-bold text-center inline-flex items-center justify-center",
                    (theme as any).title_size === "large" && (scale === "small" ? "text-[21px]" : "text-[26px]"),
                  )}
                  style={{
                    color: (theme as any).title_color || theme.text_color,
                    fontFamily: fontStack((theme as any).title_font || theme.font_family),
                  }}
                >
                  {profile.title}
                  {settings?.verified_badge_enabled && (
                    <VerifiedBadge scale={scale} badgeType={settings?.verified_badge_type} />
                  )}
                </h1>
              )
            ))}
          {data.show_bio && profile.bio && (
            <p
              className={cn(s.bio, "text-center leading-relaxed mx-auto")}
              style={{ color: theme.secondary_text_color || `${theme.text_color}cc` }}
            >
              {profile.bio}
            </p>
          )}
        </div>
      )
    }

    case "link_button": {
      const data = block.data as LinkButtonBlockData
      // The button's icon, from the same set the editor's picker offers and the
      // published page draws (components/onepage/link-icons.ts): the one picked,
      // else the platform's mark read from the address.
      const linkIcon = resolveLinkIcon(data.icon, data.url)
      // Icon color should match button text color
      const iconColor = theme.button_text_color

      // Pro Layout - Featured display with larger thumbnail
      if (data.layout_type === 'pro') {
        const displayMode = data.display_mode || 'cover'
        // Full mode: no fixed aspect ratio, image displays at natural size
        // Cover mode: 2:1 aspect ratio with object-cover
        // Contain mode: 2:1 aspect ratio with object-contain

        // Check if this is a YouTube URL and extract video ID
        const getYouTubeVideoId = (url: string): string | null => {
          if (!url) return null
          try {
            if (url.includes('youtube.com/watch')) {
              const urlObj = new URL(url)
              return urlObj.searchParams.get('v')
            } else if (url.includes('youtu.be/')) {
              const match = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/)
              return match ? match[1] : null
            }
          } catch {
            return null
          }
          return null
        }

        const youtubeVideoId = getYouTubeVideoId(data.url)
        const youtubeMode = data.youtube_mode || 'embed_video'
        const youtubeShowPlayButton = data.youtube_show_play_button === true

        // Determine which video ID to use based on mode
        const effectiveVideoId = youtubeMode === 'embed_latest' && data.youtube_latest_video_id
          ? data.youtube_latest_video_id
          : youtubeVideoId

        // Check if we should show embed (only for embed_video or embed_latest modes)
        const shouldEmbed = (youtubeMode === 'embed_video' || youtubeMode === 'embed_latest') && effectiveVideoId

        // Get animation class based on animation_type
        const getAnimationClass = (animationType: string | undefined) => {
          switch (animationType) {
            case 'pulse': return 'animate-onepage-pulse'
            case 'bounce': return 'animate-onepage-bounce'
            case 'shake': return 'animate-onepage-shake'
            case 'glow': return 'animate-onepage-glow'
            case 'swipe': return 'animate-onepage-swipe'
            default: return ''
          }
        }

        // Check if Pro layout should open Spotify modal
        const proSpotifyMode = data.spotify_mode || 'go_to_url'
        const proShouldOpenSpotifyModal = isSpotifyUrl(data.url) && (proSpotifyMode === 'audio_preview' || proSpotifyMode === 'show_streaming') && spotifyModalContext
        const proSpotifyInfo = proShouldOpenSpotifyModal ? getSpotifyInfo(data.url) : null

        // TikTok embed handling
        const tiktokVideoId = getTikTokVideoId(data.url) || data.tiktok_video_id
        const shouldEmbedTikTok = isTikTokVideoUrl(data.url) && data.tiktok_show_embed !== false && tiktokVideoId
        const tiktokEmbedUrl = data.tiktok_embed_url || (tiktokVideoId ? `https://www.tiktok.com/embed/v2/${tiktokVideoId}` : null)

        // Pro layout content (shared between button and div)
        const proLayoutContent = (
          <>
            {/* Featured content area - TikTok embed, YouTube embed or thumbnail */}
            {shouldEmbedTikTok && tiktokEmbedUrl ? (
              <div
                className="w-full relative overflow-hidden flex justify-center"
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                  backgroundColor: '#000',
                }}
              >
                <div
                  className="relative w-full"
                  style={{
                    aspectRatio: '9/16',
                    maxHeight: 'min(500px, 70vh)',
                    width: 'auto',
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    src={tiktokEmbedUrl}
                    title="TikTok video player"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                  />
                </div>
              </div>
            ) : shouldEmbed ? (
              <div
                className="w-full aspect-video relative overflow-hidden"
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                }}
              >
                <iframe
                  src={`https://www.youtube.com/embed/${effectiveVideoId}?rel=0&modestbranding=1`}
                  title="YouTube video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                />
              </div>
            ) : (data.thumbnail_url || linkIcon) && (
              <div
                className={cn(
                  "w-full relative overflow-hidden",
                  displayMode !== 'full' && "aspect-[2/1]"
                )}
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                  backgroundColor: displayMode === 'contain' ? (
                    theme.button_style === "outline" ? `${theme.button_color}10` : `${theme.button_text_color}10`
                  ) : undefined,
                }}
              >
                {data.thumbnail_url ? (
                  <>
                    <img
                      src={data.thumbnail_url}
                      alt=""
                      className={cn(
                        "w-full",
                        displayMode === 'cover' && "h-full object-cover",
                        displayMode === 'contain' && "h-full object-contain",
                        displayMode === 'full' && "h-auto object-none"
                      )}
                      style={{ imageRendering: "auto" }}
                    />
                    {/* Play button overlay for YouTube open_video mode */}
                    {youtubeVideoId && youtubeMode === 'open_video' && youtubeShowPlayButton && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm"
                          style={{
                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                          }}
                        >
                          <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    )}
                  </>
                ) : linkIcon ? (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      backgroundColor: theme.button_style === "outline"
                        ? `${theme.button_color}10`
                        : `${theme.button_text_color}10`,
                    }}
                  >
                    <LinkIcon name={linkIcon} size={48} strokeWidth={1.5} style={{ color: iconColor, opacity: 0.6 }} />
                  </div>
                ) : null}
                {/* Play button overlay for YouTube open_video mode (default layout) */}
                {youtubeMode === 'open_video' && youtubeShowPlayButton && data.url && (data.url.includes('youtube.com') || data.url.includes('youtu.be')) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm"
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.55)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-4 h-4 ml-0.5"
                        fill="white"
                      >
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Title area */}
            <div
              className="w-full px-4 py-3 flex flex-col items-center justify-center overflow-hidden"
              style={{
                backgroundColor: theme.button_style === "filled" ? theme.button_color : 'transparent',
              }}
            >
              <span className="truncate font-medium max-w-full block" style={{ color: theme.button_text_color }}>
                {data.label || "My Link"}
              </span>
              {/* Spotify metadata display for Pro Layout */}
              {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  <span className="truncate">
                    {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                    {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                    {data.spotify_type === 'artist' && (data.spotify_artist || data.spotify_title)}
                    {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                    {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                  </span>
                </span>
              )}
              {/* SoundCloud metadata display for Pro Layout */}
              {isSoundCloudUrl(data.url) && data.soundcloud_show_metadata !== false && (data.soundcloud_title || data.soundcloud_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="-143 145 512 512" fill="currentColor">
                    <path d="M113,145c-141.4,0-256,114.6-256,256s114.6,256,256,256s256-114.6,256-256S254.4,145,113,145z M209.5,448.4c-0.6,0-87.2,0-87.3,0c-1.9-0.2-3.4-1.8-3.4-3.7v-99.9c0-1.8,0.7-2.8,3-3.7c6.1-2.4,13-3.8,20.1-3.8c29,0,52.8,22.3,55.3,50.6c3.7-1.6,7.9-2.4,12.2-2.4c17.4,0,31.5,14.1,31.5,31.5C241,434.3,226.9,448.4,209.5,448.4z"/>
                  </svg>
                  <span className="truncate">
                    {data.soundcloud_type === 'track' && `Track · ${data.soundcloud_artist || data.soundcloud_title}`}
                    {data.soundcloud_type === 'playlist' && `Playlist · ${data.soundcloud_title || data.soundcloud_artist}`}
                    {data.soundcloud_type === 'artist' && (data.soundcloud_artist || data.soundcloud_title)}
                    {!data.soundcloud_type && (data.soundcloud_title || data.soundcloud_artist)}
                  </span>
                </span>
              )}
              {/* Apple Music metadata display for Pro Layout */}
              {isAppleMusicUrl(data.url) && data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 512 512">
                    <defs>
                      <linearGradient id="am-meta-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                        <stop offset="0" stopColor="#FA233B"/>
                        <stop offset="1" stopColor="#FB5C74"/>
                      </linearGradient>
                    </defs>
                    <path fill="url(#am-meta-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                  </svg>
                  <span className="truncate">
                    {data.apple_music_type === 'song' && `Song · ${data.apple_music_artist || data.apple_music_title}`}
                    {data.apple_music_type === 'album' && `Album · ${data.apple_music_title || data.apple_music_artist}`}
                    {data.apple_music_type === 'artist' && (data.apple_music_artist || data.apple_music_title)}
                    {data.apple_music_type === 'playlist' && `Playlist · ${data.apple_music_title || data.apple_music_artist}`}
                    {!data.apple_music_type && (data.apple_music_title || data.apple_music_artist)}
                  </span>
                </span>
              )}
            </div>
          </>
        )

        // Check if we should open Apple Music modal
        const appleMusicMode = data.apple_music_mode || 'go_to_url'
        const shouldOpenAppleMusicModal = isAppleMusicUrl(data.url) && appleMusicMode === 'audio_preview'
        const appleMusicEmbedUrl = getAppleMusicEmbedUrl(data.url)

        // If Apple Music should open modal, render as button
        if (shouldOpenAppleMusicModal && appleMusicEmbedUrl && appleMusicModalContext) {
          return (
            <button
              type="button"
              onClick={() => {
                appleMusicModalContext.openAppleMusicModal({
                  title: data.label || 'Listen on Apple Music',
                  embedUrl: appleMusicEmbedUrl,
                  appleMusicUrl: data.url
                })
              }}
              className={cn(
                s.button,
                "w-full font-medium overflow-hidden",
                !shouldEmbed && hoverEffect,
                getAnimationClass(data.animation_type),
              )}
              style={{
                ...buttonStyles,
                padding: 0,
              }}
            >
              {proLayoutContent}
            </button>
          )
        }

        // If Pro layout should open Spotify modal, render as button
        if (proShouldOpenSpotifyModal && proSpotifyInfo) {
          return (
            <button
              type="button"
              onClick={() => {
                if (spotifyModalContext) {
                  spotifyModalContext.openSpotifyModal({
                    title: data.label || 'Listen on Spotify',
                    embedUrl: proSpotifyInfo.embedUrl,
                    spotifyUrl: data.url,
                    streamingServices: data.streaming_services,
                    spotifyMode: proSpotifyMode
                  })
                }
              }}
              className={cn(
                s.button,
                "w-full font-medium overflow-hidden",
                !shouldEmbed && hoverEffect,
                getAnimationClass(data.animation_type),
              )}
              style={{
                ...buttonStyles,
                padding: 0,
              }}
            >
              {proLayoutContent}
            </button>
          )
        }

        return (
          <div
            className={cn(
              s.button,
              "w-full font-medium overflow-hidden",
              !shouldEmbed && hoverEffect,
              getAnimationClass(data.animation_type),
            )}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            {proLayoutContent}
          </div>
        )
      }

      // Default Layout
      const hasThumbnailOrIcon = data.thumbnail_url || linkIcon

      // Get animation class based on animation_type (for default layout)
      const getDefaultAnimationClass = (animationType: string | undefined) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Check if this is a Spotify link with modal mode
      const spotifyMode = data.spotify_mode || 'go_to_url'
      const shouldOpenSpotifyModal = isSpotifyUrl(data.url) && (spotifyMode === 'audio_preview' || spotifyMode === 'show_streaming') && spotifyModalContext

      if (shouldOpenSpotifyModal) {
        const spotifyInfo = getSpotifyInfo(data.url)
        return (
          <button
            type="button"
            onClick={() => {
              if (spotifyInfo && spotifyModalContext) {
                spotifyModalContext.openSpotifyModal({
                  title: data.label || 'Listen on Spotify',
                  embedUrl: spotifyInfo.embedUrl,
                  spotifyUrl: data.url,
                  streamingServices: data.streaming_services,
                  spotifyMode
                })
              }
            }}
            className={cn(
              s.button,
              "w-full font-medium flex items-center",
              hoverEffect,
              hasThumbnailOrIcon ? "relative justify-center" : "justify-center",
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className={cn(s.buttonThumb, "rounded-lg object-cover shrink-0 absolute")}
                style={{ imageRendering: "auto", left: s.buttonIconLeft }}
              />
            ) : linkIcon ? (
              <LinkIcon name={linkIcon} size={s.buttonIcon} className="shrink-0 absolute" style={{ color: iconColor, left: s.buttonIconLeft }} />
            ) : null}
            <div className={cn("flex flex-col min-w-0", hasThumbnailOrIcon ? `w-full text-center ${s.buttonTextPadding}` : "")}>
              <span className="text-center break-words whitespace-normal leading-tight" style={{ color: theme.button_text_color }}>{data.label || "My Link"}</span>
              {/* Spotify info display */}
              {data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.7
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                  </svg>
                  <span className="truncate">
                    {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                    {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                    {data.spotify_type === 'artist' && (data.spotify_artist || data.spotify_title)}
                    {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                    {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                  </span>
                </span>
              )}
            </div>
          </button>
        )
      }

      // Check if this is an Apple Music link with modal mode (default layout)
      const defaultAppleMusicMode = data.apple_music_mode || 'go_to_url'
      const defaultShouldOpenAppleMusicModal = isAppleMusicUrl(data.url) && defaultAppleMusicMode === 'audio_preview' && appleMusicModalContext
      const defaultAppleMusicEmbedUrl = getAppleMusicEmbedUrl(data.url)

      if (defaultShouldOpenAppleMusicModal && defaultAppleMusicEmbedUrl) {
        return (
          <button
            type="button"
            onClick={() => {
              appleMusicModalContext.openAppleMusicModal({
                title: data.label || 'Listen on Apple Music',
                embedUrl: defaultAppleMusicEmbedUrl,
                appleMusicUrl: data.url
              })
            }}
            className={cn(
              s.button,
              "w-full font-medium relative flex items-center justify-center",
              hoverEffect,
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {/* Thumbnail positioned absolutely on left */}
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className={cn(s.buttonThumb, "rounded-lg object-cover shrink-0 absolute")}
                style={{ imageRendering: "auto", left: s.buttonIconLeft }}
              />
            ) : linkIcon ? (
              <LinkIcon name={linkIcon} size={s.buttonIcon} className="shrink-0 absolute" style={{ color: iconColor, left: s.buttonIconLeft }} />
            ) : null}
            <div className={cn("flex flex-col min-w-0 w-full text-center", s.buttonTextPadding)}>
              <span className="text-center break-words whitespace-normal leading-tight" style={{ color: theme.button_text_color }}>{data.label || "My Link"}</span>
              {/* Apple Music info display */}
              {data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
                <span
                  className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.75
                  }}
                >
                  <svg className="w-3 h-3 shrink-0" viewBox="0 0 512 512">
                    <defs>
                      <linearGradient id="am-def-modal-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                        <stop offset="0" stopColor="#FA233B"/>
                        <stop offset="1" stopColor="#FB5C74"/>
                      </linearGradient>
                    </defs>
                    <path fill="url(#am-def-modal-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                  </svg>
                  <span className="truncate">
                    {data.apple_music_type === 'song' && `Song · ${data.apple_music_artist || data.apple_music_title}`}
                    {data.apple_music_type === 'album' && `Album · ${data.apple_music_title || data.apple_music_artist}`}
                    {data.apple_music_type === 'artist' && (data.apple_music_artist || data.apple_music_title)}
                    {data.apple_music_type === 'playlist' && `Playlist · ${data.apple_music_title || data.apple_music_artist}`}
                    {!data.apple_music_type && (data.apple_music_title || data.apple_music_artist)}
                  </span>
                </span>
              )}
            </div>
          </button>
        )
      }

      // Check if this is an Apple Music URL for special centering
      const isAppleMusic = isAppleMusicUrl(data.url)
      // Use centered layout for both icons and thumbnails
      const hasIconOnly = linkIcon && !data.thumbnail_url
      const hasThumbnail = !!data.thumbnail_url

      return (
        <button
          className={cn(
            s.button,
            "w-full font-medium flex items-center",
            hoverEffect,
            // Both icons and thumbnails use centered layout with absolute positioning
            (hasIconOnly || hasThumbnail) ? "relative justify-center" : "justify-center",
            getDefaultAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {data.thumbnail_url ? (
            <img
              src={data.thumbnail_url}
              alt=""
              className={cn(s.buttonThumb, "rounded-lg object-cover shrink-0 absolute")}
              style={{ imageRendering: "auto", left: s.buttonIconLeft }}
            />
          ) : linkIcon ? (
            <LinkIcon name={linkIcon} size={s.buttonIcon} className="shrink-0 absolute" style={{ color: iconColor, left: s.buttonIconLeft }} />
          ) : null}
          <div className={cn("flex flex-col min-w-0", (hasIconOnly || hasThumbnail) ? `w-full text-center ${s.buttonTextPadding}` : "")}>
            <span className="text-center break-words whitespace-normal leading-tight" style={{ color: theme.button_text_color }}>{data.label || "My Link"}</span>
            {/* Spotify info display */}
            {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
              <span
                className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_text_color,
                  opacity: 0.75
                }}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="truncate">
                  {data.spotify_type === 'track' && `Song · ${data.spotify_artist || data.spotify_title}`}
                  {data.spotify_type === 'album' && `Album · ${data.spotify_title || data.spotify_artist}`}
                  {data.spotify_type === 'artist' && `Profile · ${data.spotify_artist || data.spotify_title}`}
                  {data.spotify_type === 'playlist' && `Playlist · ${data.spotify_title || data.spotify_artist}`}
                  {!data.spotify_type && (data.spotify_title || data.spotify_artist)}
                </span>
              </span>
            )}
            {/* Apple Music info display for default layout */}
            {isAppleMusic && data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
              <span
                className="text-[10px] flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_text_color,
                  opacity: 0.75
                }}
              >
                <svg className="w-3 h-3 shrink-0" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="am-def-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                      <stop offset="0" stopColor="#FA233B"/>
                      <stop offset="1" stopColor="#FB5C74"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#am-def-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                </svg>
                <span className="truncate">
                  {data.apple_music_type === 'song' && `Song · ${data.apple_music_artist || data.apple_music_title}`}
                  {data.apple_music_type === 'album' && `Album · ${data.apple_music_title || data.apple_music_artist}`}
                  {data.apple_music_type === 'artist' && (data.apple_music_artist || data.apple_music_title)}
                  {data.apple_music_type === 'playlist' && `Playlist · ${data.apple_music_title || data.apple_music_artist}`}
                  {!data.apple_music_type && (data.apple_music_title || data.apple_music_artist)}
                </span>
              </span>
            )}
          </div>
        </button>
      )
    }

    case "text": {
      const data = block.data as TextBlockData
      return (
        <div
          className={cn(s.text, "w-full whitespace-pre-line leading-relaxed")}
          style={{ color: (theme as any).secondary_text_color || theme.text_color, textAlign: data.alignment || "center" }}
        >
          {data.content}
        </div>
      )
    }

    case "image": {
      const data = block.data as ImageBlockData
      // Get images array (support both legacy single image and new multi-image)
      const images = data.images || (data.image_url ? [{ id: '1', image_url: data.image_url, alt_text: data.alt_text, title: '', link_url: data.link_url }] : [])
      if (images.length === 0 || !images[0]?.image_url) return null

      // Get border radius value
      const borderRadiusMap: Record<string, string> = {
        'none': '0',
        'sm': '4px',
        'md': '8px',
        'lg': '16px',
        'full': '9999px',
      }
      const borderRadius = borderRadiusMap[data.border_radius || 'md'] || `${theme.button_border_radius}px`

      // Get aspect ratio class
      const aspectClass =
        data.aspect_ratio === "square" ? "aspect-square" :
        data.aspect_ratio === "portrait" ? "aspect-[3/4]" :
        data.aspect_ratio === "landscape" ? "aspect-[4/3]" :
        data.aspect_ratio === "video" ? "aspect-video" :
        data.aspect_ratio === "wide" ? "aspect-[2/1]" : ""

      // Render single image
      const renderImage = (img: typeof images[0], index: number) => {
        const imageContent = (
          <div className="relative w-full">
            <img
              src={img.image_url || "/placeholder.svg"}
              alt={img.alt_text || ""}
              className={cn(
                "w-full",
                aspectClass,
                data.image_fit === 'contain' ? 'object-contain' : 'object-cover'
              )}
              style={{ borderRadius, imageRendering: "auto" }}
            />
            {data.show_captions && img.title && (
              <p
                className="text-center text-xs mt-2 opacity-70"
                style={{ color: theme.text_color }}
              >
                {img.title}
              </p>
            )}
          </div>
        )

        if (data.clickable && img.link_url) {
          return (
            <a key={img.id || index} href={img.link_url} target="_blank" rel="noopener noreferrer" className="block w-full">
              {imageContent}
            </a>
          )
        }
        return <div key={img.id || index} className="w-full">{imageContent}</div>
      }

      // Single display or only one image
      if (data.display_style === 'single' || images.length === 1) {
        return <div className="w-full py-1">{renderImage(images[0], 0)}</div>
      }

      // Grid display
      if (data.display_style === 'grid') {
        const cols = data.grid_columns || 2
        return (
          <div
            className="w-full grid gap-2 py-1"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {images.map((img, idx) => renderImage(img, idx))}
          </div>
        )
      }

      // Carousel display with navigation dots and smooth scroll (disabled inside group blocks)
      if (data.display_style === 'carousel' && !isInsideGroup) {
        return (
          <div className="w-full pt-1 pb-[6px]">
            <ImageCarousel
              images={images}
              renderImage={renderImage}
              borderRadius={borderRadius}
              autoplay={data.carousel_autoplay}
              theme={theme}
              carouselView={data.carousel_view}
            />
          </div>
        )
      }

      // If carousel is requested but inside group, show single image instead
      if (data.display_style === 'carousel' && isInsideGroup) {
        return <div className="w-full py-1">{renderImage(images[0], 0)}</div>
      }

      // Default: single image
      return <div className="w-full py-1">{renderImage(images[0], 0)}</div>
    }

    case "divider": {
      const data = block.data as DividerBlockData
      const height = data.height || 24
      const dividerColor = `${theme.text_color}30`

      if (data.style === "space") return <div className="w-full" style={{ height: `${height}px` }} />
      if (data.style === "dotted" || data.style === "dots")
        return (
          <div className="w-full flex justify-center items-center gap-1" style={{ height: `${height}px` }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${theme.text_color}40` }} />
            ))}
          </div>
        )
      if (data.style === "dashed")
        return (
          <div className="w-full flex items-center" style={{ height: `${height}px` }}>
            <div className="w-full border-t-[1px] border-dashed" style={{ borderColor: dividerColor }} />
          </div>
        )
      if (data.style === "double")
        return (
          <div className="w-full flex flex-col justify-center gap-[3px]" style={{ height: `${height}px` }}>
            <div className="w-full h-px" style={{ backgroundColor: dividerColor }} />
            <div className="w-full h-px" style={{ backgroundColor: dividerColor }} />
          </div>
        )
      if (data.style === "wave")
        return (
          <div className="w-full flex items-center overflow-hidden" style={{ height: `${height}px` }}>
            <svg width="100%" height="12" viewBox="0 0 200 12" preserveAspectRatio="none" style={{ opacity: 0.4 }}>
              <path d="M0 6 Q 12.5 0, 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6" fill="none" stroke={theme.text_color} strokeWidth="1.5" />
            </svg>
          </div>
        )
      if (data.style === "zigzag")
        return (
          <div className="w-full flex items-center overflow-hidden" style={{ height: `${height}px` }}>
            <svg width="100%" height="10" viewBox="0 0 200 10" preserveAspectRatio="none" style={{ opacity: 0.4 }}>
              <path d="M0 5 L 10 0 L 20 10 L 30 0 L 40 10 L 50 0 L 60 10 L 70 0 L 80 10 L 90 0 L 100 10 L 110 0 L 120 10 L 130 0 L 140 10 L 150 0 L 160 10 L 170 0 L 180 10 L 190 0 L 200 5" fill="none" stroke={theme.text_color} strokeWidth="1.5" />
            </svg>
          </div>
        )
      if (data.style === "gradient")
        return (
          <div className="w-full flex items-center" style={{ height: `${height}px` }}>
            <div className="w-full h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${theme.text_color}40 20%, ${theme.text_color}40 80%, transparent 100%)` }} />
          </div>
        )
      return (
        <div className="w-full flex items-center" style={{ height: `${height}px` }}>
          <div className="w-full h-px" style={{ backgroundColor: `${theme.text_color}20` }} />
        </div>
      )
    }

    case "email_capture": {
      const data = block.data as EmailCaptureBlockData
      const isPro = data.layout_type === "pro"
      const hasDigitalProduct = data.enable_digital_product && data.digital_product_file_url
      // Pro layout shows thumbnail from product_image or digital_product_thumbnail
      const layoutImage = data.product_image || data.digital_product_thumbnail
      const showThumbnail = isPro && layoutImage

      // Get animation class for email capture blocks
      const getEmailAnimationClass = (animationType?: string) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Get button text from custom or preset
      const getButtonText = () => {
        if (emailSubmitted) {
          return hasDigitalProduct ? "Download" : "Subscribed!"
        }
        // Check for custom preset with custom_button_text
        if (data.button_preset === 'custom' && data.custom_button_text) {
          return data.custom_button_text
        }
        const presetLabels: Record<string, string> = {
          subscribe: 'Subscribe',
          join: 'Join Now',
          get_access: 'Get Access',
          download: 'Download',
          sign_up: 'Sign Up',
          unlock: 'Unlock Now',
        }
        return presetLabels[data.button_preset || 'subscribe'] || data.button_text || "Subscribe"
      }

      // Pro layout with thumbnail
      if (isPro && showThumbnail) {
        const buttonText = getButtonText()
        const isShortButton = buttonText.length <= 12

        return (
          <div
            className={cn("w-full rounded-xl overflow-hidden", getEmailAnimationClass(data.animation_type))}
            style={{ backgroundColor: `${theme.text_color}08` }}
          >
            <div className="p-3 space-y-2">
              {/* Product row */}
              <div className="flex gap-2.5 items-start">
                <img
                  src={layoutImage || ""}
                  alt=""
                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  {data.headline && (
                    <h3 className={cn(s.headline, "font-semibold")} style={{ color: theme.text_color }}>
                      {data.headline}
                    </h3>
                  )}
                  {data.description && (
                    <p
                      className="text-[9px] line-clamp-1"
                      style={{ color: theme.secondary_text_color || `${theme.text_color}aa` }}
                    >
                      {data.description}
                    </p>
                  )}
                </div>
              </div>
              {/* Input row - responsive layout */}
              {isShortButton ? (
                <div className="flex flex-row gap-1.5 items-stretch">
                  <input
                    type="email"
                    placeholder={data.placeholder || "Enter your email"}
                    className={cn(
                      s.input,
                      "rounded-lg bg-white/90 border-0 outline-none flex-1 min-w-0",
                      emailSubmitted && "opacity-70"
                    )}
                    style={{ color: "#000", width: '60%' }}
                    disabled={emailSubmitted}
                  />
                  <button
                    onClick={() => setEmailSubmitted(true)}
                    disabled={emailSubmitted}
                    className={cn(
                      s.inputBtn,
                      "font-medium whitespace-nowrap rounded-lg shrink-0",
                      emailSubmitted && "opacity-70"
                    )}
                    style={buttonStyles}
                  >
                    {buttonText}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <input
                    type="email"
                    placeholder={data.placeholder || "Enter your email"}
                    className={cn(
                      s.input,
                      "rounded-lg bg-white/90 border-0 outline-none w-full",
                      emailSubmitted && "opacity-70"
                    )}
                    style={{ color: "#000" }}
                    disabled={emailSubmitted}
                  />
                  <button
                    onClick={() => setEmailSubmitted(true)}
                    disabled={emailSubmitted}
                    className={cn(
                      s.inputBtn,
                      "font-medium whitespace-nowrap rounded-lg w-full",
                      emailSubmitted && "opacity-70"
                    )}
                    style={buttonStyles}
                  >
                    {buttonText}
                  </button>
                </div>
              )}
            </div>
            {emailSubmitted && (
              <div className="px-3 pb-2">
                <p className="text-[9px] text-center opacity-70" style={{ color: theme.text_color }}>
                  {data.success_message || "Thanks for subscribing!"}
                </p>
              </div>
            )}
          </div>
        )
      }

      // Default layout
      const buttonText = getButtonText()
      const isShortButton = buttonText.length <= 12

      return (
        <div className={cn("w-full space-y-2", getEmailAnimationClass(data.animation_type))}>
          {data.headline && (
            <h3 className={cn(s.headline, "font-semibold text-center")} style={{ color: theme.text_color }}>
              {data.headline}
            </h3>
          )}
          {data.description && (
            <p
              className={cn(s.description, "text-center")}
              style={{ color: theme.secondary_text_color || `${theme.text_color}aa` }}
            >
              {data.description}
            </p>
          )}
          {/* Responsive layout based on button text length */}
          {isShortButton ? (
            <div className="flex flex-row gap-1.5 items-stretch">
              <input
                type="email"
                placeholder={data.placeholder || "Enter your email"}
                className={cn(
                  s.input,
                  "rounded-lg bg-white/10 border-0 outline-none flex-1 min-w-0",
                  emailSubmitted && "opacity-70"
                )}
                style={{ color: theme.text_color, backgroundColor: `${theme.text_color}10`, width: '60%' }}
                disabled={emailSubmitted}
              />
              <button
                onClick={() => setEmailSubmitted(true)}
                disabled={emailSubmitted}
                className={cn(
                  s.inputBtn,
                  "font-medium whitespace-nowrap rounded-lg shrink-0",
                  emailSubmitted && "opacity-70"
                )}
                style={buttonStyles}
              >
                {buttonText}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <input
                type="email"
                placeholder={data.placeholder || "Enter your email"}
                className={cn(
                  s.input,
                  "rounded-lg bg-white/10 border-0 outline-none w-full",
                  emailSubmitted && "opacity-70"
                )}
                style={{ color: theme.text_color, backgroundColor: `${theme.text_color}10` }}
                disabled={emailSubmitted}
              />
              <button
                onClick={() => setEmailSubmitted(true)}
                disabled={emailSubmitted}
                className={cn(
                  s.inputBtn,
                  "font-medium whitespace-nowrap rounded-lg w-full",
                  emailSubmitted && "opacity-70"
                )}
                style={buttonStyles}
              >
                {buttonText}
              </button>
            </div>
          )}
          {emailSubmitted && (
            <p className="text-[9px] text-center opacity-70" style={{ color: theme.text_color }}>
              {data.success_message || "Thanks for subscribing!"}
            </p>
          )}
        </div>
      )
    }

    case "product": {
      const data = block.data as ProductBlockData
      if (!data.product_id && !data.product_title) {
        return (
          <div className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center opacity-60">
            <p className="text-xs" style={{ color: theme.text_color }}>Select a product</p>
          </div>
        )
      }

      const productUrl = data.product_slug ? `/p/${data.product_slug}` : '#'
      const priceDisplay = data.product_price_cents && data.product_price_cents > 0
        ? `$${(data.product_price_cents / 100).toFixed(2)}`
        : 'Free'

      // Get animation class for product blocks
      const getProductAnimationClass = (animationType?: string) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Get product-specific colors with fallbacks to theme
      // block_background_color: entire block container background
      // text_color: for title, description, price text
      // button_color: CTA button background (only for preview style)
      // button_text_color: CTA button text (only for preview style)
      const productBorderRadius = theme.button_border_radius
      const blockBackgroundColor = data.block_background_color || theme.button_color
      const textColor = data.text_color || theme.button_text_color

      // Helper to darken a hex color by a percentage (for callout button)
      const darkenHex = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16)
        const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)))
        const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)))
        const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)))
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
      }

      // For callout style: use slightly darkened block background for button
      // For preview style: use custom button_color if set, otherwise use light textColor
      const isPreviewStyle = data.style === 'preview'
      const ctaButtonColor = isPreviewStyle
        ? (data.button_color || `${textColor}15`)
        : darkenHex(blockBackgroundColor, 0.08)
      const ctaButtonTextColor = isPreviewStyle
        ? (data.button_text_color || textColor)
        : textColor

      // Button styles for product block (mirrors link_button styles)
      const productButtonShadow = (theme as any).button_shadow || "none"
      const productShadowColor = (theme as any).button_shadow_color || "#000000"
      const productHexToRgba = (hex: string, alpha: number) => {
        const r = Number.parseInt(hex.slice(1, 3), 16) || 0
        const g = Number.parseInt(hex.slice(3, 5), 16) || 0
        const b = Number.parseInt(hex.slice(5, 7), 16) || 0
        return `rgba(${r},${g},${b},${alpha})`
      }
      const productShadowStyles: Record<string, string> = {
        none: "none",
        subtle: `0 2px 4px ${productHexToRgba(productShadowColor, 0.15)}`,
        strong: `0 4px 12px ${productHexToRgba(productShadowColor, 0.3)}`,
        hard: `4px 4px 0px ${productHexToRgba(productShadowColor, 0.9)}`,
      }
      const productButtonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "outline"
            ? "transparent"
            : theme.button_style === "glass"
              ? "rgba(255, 255, 255, 0.15)"
              : theme.button_color,
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
        borderStyle: "solid" as const,
        borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
        boxShadow: productShadowStyles[productButtonShadow] || "none",
      }

      // Button style
      if (data.style === 'button') {
        return (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              s.button,
              "w-full font-medium flex items-center justify-center gap-2 transition-all cursor-pointer",
              getProductAnimationClass(data.animation_type),
            )}
            style={productButtonStyles}
          >
            {data.product_thumbnail && (
              <img
                src={data.product_thumbnail}
                alt=""
                className="w-5 h-5 rounded object-cover shrink-0"
              />
            )}
            <span className="truncate">{data.cta_text || 'Get My Guide'}</span>
            {data.show_price !== false && (
              <span className="text-xs opacity-75">{priceDisplay}</span>
            )}
          </a>
        )
      }

      // Preview style - full card with image
      // Preview style - larger card with full-width thumbnail
      if (data.style === 'preview') {
        return (
          <a
            href={productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full block overflow-hidden transition-all cursor-pointer",
              getProductAnimationClass(data.animation_type),
            )}
            style={{
              borderRadius: `${productBorderRadius}px`,
              backgroundColor: blockBackgroundColor,
              border: "none",
            }}
          >
            {(data.custom_thumbnail || data.product_thumbnail) && (
              <div className="w-full aspect-[2/1] overflow-hidden">
                <img
                  src={data.custom_thumbnail || data.product_thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-3 space-y-1">
              <p
                className={cn(s.text, "font-medium")}
                style={{ color: textColor, fontSize: scale === 'small' ? '12px' : '15px' }}
              >
                {data.product_title || 'Product'}
              </p>
              {data.show_description !== false && stripHtmlToPlainText(data.product_description) && (
                <p
                  className="text-[10px] opacity-75"
                  style={{ color: textColor }}
                >
                  {stripHtmlToPlainText(data.product_description)}
                </p>
              )}
              {data.show_price !== false && (
                <p
                  className={cn(s.text, "font-semibold")}
                  style={{ color: textColor }}
                >
                  {priceDisplay}
                </p>
              )}
              {/* CTA Button */}
              <div
                className="w-full py-2 mt-2 text-center font-medium text-sm transition-all"
                style={{
                  borderRadius: `${Math.max(0, productBorderRadius - 4)}px`,
                  backgroundColor: ctaButtonColor,
                  color: ctaButtonTextColor,
                  boxShadow: productShadowStyles[productButtonShadow] || "none",
                }}
              >
                {data.cta_text || 'Get My Guide'}
              </div>
            </div>
          </a>
        )
      }

      // Callout style (default) - compact card with thumbnail
      return (
        <a
          href={productUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "w-full block overflow-hidden transition-all cursor-pointer",
            getProductAnimationClass(data.animation_type),
          )}
          style={{
            borderRadius: `${productBorderRadius}px`,
            backgroundColor: blockBackgroundColor,
            border: "none",
          }}
        >
          <div className="p-3 flex gap-3">
            {(data.custom_thumbnail || data.product_thumbnail) && (
              <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-gray-100">
                <img
                  src={data.custom_thumbnail || data.product_thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-0.5">
              <p
                className={cn(s.text, "font-medium truncate")}
                style={{ color: textColor, fontSize: scale === 'small' ? '12px' : '15px' }}
              >
                {data.product_title || 'Product'}
              </p>
              {data.show_description !== false && stripHtmlToPlainText(data.product_description) && (
                <p
                  className="text-[10px] opacity-75 line-clamp-1"
                  style={{ color: textColor }}
                >
                  {stripHtmlToPlainText(data.product_description)}
                </p>
              )}
              {data.show_price !== false && (
                <p
                  className="text-xs font-semibold"
                  style={{ color: textColor }}
                >
                  {priceDisplay}
                </p>
              )}
            </div>
          </div>
          {/* CTA Button */}
          <div
            className="w-full py-2.5 text-center font-medium text-sm transition-all"
            style={{
              borderRadius: `0 0 ${productBorderRadius}px ${productBorderRadius}px`,
              backgroundColor: ctaButtonColor,
              color: ctaButtonTextColor,
              boxShadow: productShadowStyles[productButtonShadow] || "none",
            }}
          >
            {data.cta_text || 'Get My Guide'}
          </div>
        </a>
      )
    }

    case "social_row": {
      const data = block.data as SocialRowBlockData
      let platforms = data.platforms || []

      // Fallback to profile.social_links if platforms is empty (auto-sync for instant preview)
      if (platforms.length === 0 && profile.social_links) {
        const defaultLinks: Array<{ platform: string; url: string }> = []
        if (profile.social_links.instagram) defaultLinks.push({ platform: "instagram", url: profile.social_links.instagram })
        if (profile.social_links.tiktok) defaultLinks.push({ platform: "tiktok", url: profile.social_links.tiktok })
        if (profile.social_links.youtube) defaultLinks.push({ platform: "youtube", url: profile.social_links.youtube })
        if (profile.social_links.twitter) defaultLinks.push({ platform: "twitter", url: profile.social_links.twitter })
        if (profile.social_links.spotify) defaultLinks.push({ platform: "spotify", url: profile.social_links.spotify })
        if (profile.social_links.threads) defaultLinks.push({ platform: "threads", url: profile.social_links.threads })
        if (profile.social_links.facebook) defaultLinks.push({ platform: "facebook", url: profile.social_links.facebook })
        if (profile.social_links.linkedin) defaultLinks.push({ platform: "linkedin", url: profile.social_links.linkedin })
        if (profile.social_links.github) defaultLinks.push({ platform: "github", url: profile.social_links.github })
        if (profile.social_links.twitch) defaultLinks.push({ platform: "twitch", url: profile.social_links.twitch })
        if (profile.social_links.discord) defaultLinks.push({ platform: "discord", url: profile.social_links.discord })
        if (profile.social_links.whatsapp) defaultLinks.push({ platform: "whatsapp", url: profile.social_links.whatsapp })
        if (profile.social_links.snapchat) defaultLinks.push({ platform: "snapchat", url: profile.social_links.snapchat })
        if (profile.social_links.telegram) defaultLinks.push({ platform: "telegram", url: profile.social_links.telegram })
        if (profile.social_links.pinterest) defaultLinks.push({ platform: "pinterest", url: profile.social_links.pinterest })
        if (profile.social_links.soundcloud) defaultLinks.push({ platform: "soundcloud", url: profile.social_links.soundcloud })
        if (profile.social_links.kick) defaultLinks.push({ platform: "kick", url: profile.social_links.kick })
        if (profile.social_links.patreon) defaultLinks.push({ platform: "patreon", url: profile.social_links.patreon })
        if (profile.social_links.website) defaultLinks.push({ platform: "website", url: profile.social_links.website })
        if (profile.social_links.email) defaultLinks.push({ platform: "email", url: profile.social_links.email })
        platforms = defaultLinks
      }

      if (platforms.length === 0) return null

      const headerLayout = (theme as any).header_layout || "classic"
      const isHeroLayout = headerLayout === "hero"
      // Hero layout: move icons up, Classic: add 4px top and 3px bottom padding
      // Apply custom padding if set, otherwise use default layout styles
      const paddingTop = data.padding_top ?? (isHeroLayout ? -4 : 4)
      const paddingBottom = data.padding_bottom ?? (isHeroLayout ? 2 : 3)

      return (
        <div
          className={cn("w-full flex justify-center flex-wrap", s.socialGap)}
          style={{
            marginTop: `${paddingTop}px`,
            marginBottom: `${paddingBottom}px`
          }}
        >
          {platforms.map((platform, idx) => {
            return (
              <a
                key={`${platform.platform}-${idx}`}
                href={normalizeSocialUrl(platform.platform, platform.url)}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  s.social,
                  "rounded-full flex items-center justify-center transition-transform hover:scale-110",
                )}
                style={{
                  backgroundColor: socialStyle === "filled" ? `${socialColor}15` : "transparent",
                  borderWidth: socialStyle === "outline" ? 2 : 0,
                  borderColor: socialColor,
                  borderStyle: "solid",
                }}
              >
                {/* The live page's mark for every platform, not a globe for the eleven it used to lack. */}
                <SocialIcon platform={platform.platform} size={s.socialIcon} color={socialColor} title={socialPlatformLabel(platform.platform)} />
              </a>
            )
          })}
        </div>
      )
    }

    case "group": {
      const data = block.data as GroupBlockData
      if (!data.children || data.children.length === 0) {
        return (
          <div className="w-full border-2 border-dashed border-gray-300 rounded-xl p-4 text-center opacity-60">
            <p className="text-xs" style={{ color: theme.text_color }}>Empty group</p>
          </div>
        )
      }

      return (
        <GroupBlockPreview
          data={data}
          theme={theme}
          profile={profile}
          scale={scale}
          settings={settings}
          BlockRenderer={BlockRenderer}
        />
      )
    }

    case "pdf_document": {
      const data = block.data as PDFDocumentBlockData
      const isPro = data.layout_type === "pro"
      const thumbnailUrl = data.thumbnail_url
      const pdfUrl = data.pdf_file_url

      // Get animation class
      const getAnimationClass = (animationType?: string) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Handle click based on settings
      const handlePDFClick = () => {
        if (!pdfUrl) return

        // If open_directly is enabled, open PDF in new tab
        if (data.open_directly) {
          window.open(pdfUrl, '_blank')
          return
        }

        // If enable_preview is enabled (or default), show modal
        if (data.enable_preview !== false && pdfModalContext) {
          pdfModalContext.openPDFModal({
            title: data.title || "PDF Document",
            description: data.description,
            pdfUrl: pdfUrl,
            buttonText: data.preview_button_text || "View full PDF",
          })
        }
      }

      // Featured (Pro) layout with thumbnail
      if (isPro) {
        return (
          <button
            onClick={handlePDFClick}
            className={cn(
              "w-full overflow-hidden font-medium transition-all cursor-pointer",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            <div className="flex items-center gap-3 p-2.5">
              {/* Thumbnail/Preview */}
              <div
                className="shrink-0 flex items-center justify-center bg-gray-100"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: Math.max(0, theme.button_border_radius - 4),
                }}
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ borderRadius: Math.max(0, theme.button_border_radius - 4) }}
                  />
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-red-500"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                )}
              </div>
              {/* Content - Title and Description vertically aligned */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span
                  className="text-[11px] font-semibold leading-tight truncate block"
                  style={{ color: theme.button_text_color }}
                >
                  {data.title || "PDF Document"}
                </span>
                {data.description && (
                  <span
                    className="text-[9px] leading-tight mt-0.5 opacity-70 truncate block"
                    style={{ color: theme.button_text_color }}
                  >
                    {data.description}
                  </span>
                )}
              </div>
              {/* Arrow icon - properly aligned */}
              <div className="shrink-0 flex items-center justify-center pr-1">
                <ExternalLink className="w-4 h-4 opacity-50" style={{ color: theme.button_text_color }} />
              </div>
            </div>
          </button>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <button
          onClick={handlePDFClick}
          className={cn(
            "w-full flex flex-col items-center justify-center font-medium transition-all cursor-pointer py-2.5 px-3",
            hoverEffect,
            getAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {/* Title */}
          <span
            className="text-[11px] font-semibold truncate w-full text-center"
            style={{ color: theme.button_text_color }}
          >
            {data.title || "PDF Document"}
          </span>
          {/* Button text with PDF icon */}
          <div className="flex items-center justify-center gap-1 opacity-70">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
              style={{ color: theme.button_text_color }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            <span
              className="text-[10px] truncate"
              style={{ color: theme.button_text_color }}
            >
              {data.button_text || "View PDF"}
            </span>
          </div>
        </button>
      )
    }

    case "food_menu": {
      const data = block.data as FoodMenuBlockData
      const isPro = data.layout_type === "pro"
      const thumbnailUrl = data.thumbnail_url
      const pdfUrl = data.pdf_file_url

      // Get animation class
      const getAnimationClass = (animationType?: string) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Handle click based on settings
      const handleMenuClick = () => {
        if (!pdfUrl) return

        // If open_directly is enabled, open PDF in new tab
        if (data.open_directly) {
          window.open(pdfUrl, '_blank')
          return
        }

        // If enable_preview is enabled (or default), show modal
        if (data.enable_preview !== false && pdfModalContext) {
          pdfModalContext.openPDFModal({
            title: data.title || "Menu",
            description: data.description,
            pdfUrl: pdfUrl,
            buttonText: data.preview_button_text || "View Menu",
          })
        }
      }

      // Featured (Pro) layout with thumbnail
      if (isPro) {
        return (
          <button
            onClick={handleMenuClick}
            className={cn(
              "w-full overflow-hidden font-medium transition-all cursor-pointer",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            <div className="flex items-center gap-3 p-2.5">
              {/* Thumbnail/Preview */}
              <div
                className="shrink-0 flex items-center justify-center bg-gray-100"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: Math.max(0, theme.button_border_radius - 4),
                }}
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ borderRadius: Math.max(0, theme.button_border_radius - 4) }}
                  />
                ) : (
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-orange-500"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14,2 14,8 20,8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <line x1="10" y1="9" x2="8" y2="9" />
                  </svg>
                )}
              </div>
              {/* Content - Title and Description vertically aligned */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span
                  className="text-[11px] font-semibold leading-tight truncate block"
                  style={{ color: theme.button_text_color }}
                >
                  {data.title || "Menu"}
                </span>
                {data.description && (
                  <span
                    className="text-[9px] leading-tight mt-0.5 opacity-70 truncate block"
                    style={{ color: theme.button_text_color }}
                  >
                    {data.description}
                  </span>
                )}
              </div>
              {/* Arrow icon - properly aligned */}
              <div className="shrink-0 flex items-center justify-center pr-1">
                <ExternalLink className="w-4 h-4 opacity-50" style={{ color: theme.button_text_color }} />
              </div>
            </div>
          </button>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <button
          onClick={handleMenuClick}
          className={cn(
            "w-full flex flex-col items-center justify-center font-medium transition-all cursor-pointer py-2.5 px-3",
            hoverEffect,
            getAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {/* Title */}
          <span
            className="text-[11px] font-semibold truncate w-full text-center"
            style={{ color: theme.button_text_color }}
          >
            {data.title || "Menu"}
          </span>
          {/* Button text with menu icon */}
          <div className="flex items-center justify-center gap-1 opacity-70">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
              style={{ color: theme.button_text_color }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            <span
              className="text-[10px] truncate"
              style={{ color: theme.button_text_color }}
            >
              {data.button_text || "View Menu"}
            </span>
          </div>
        </button>
      )
    }

    case "calendly": {
      const data = block.data as CalendlyBlockData
      const isPro = data.layout_type === "pro"
      const thumbnailUrl = data.thumbnail_url
      const calendlyUrl = data.calendly_url
      const calendlyModalContext = useContext(CalendlyModalContext)

      // Get animation class
      const getAnimationClass = (animationType?: string) => {
        switch (animationType) {
          case 'pulse': return 'animate-onepage-pulse'
          case 'bounce': return 'animate-onepage-bounce'
          case 'shake': return 'animate-onepage-shake'
          case 'glow': return 'animate-onepage-glow'
          case 'swipe': return 'animate-onepage-swipe'
          default: return ''
        }
      }

      // Handle click based on settings
      const handleCalendlyClick = () => {
        if (!calendlyUrl) return

        // If direct_link mode, open in new tab
        if (data.embed_mode === 'direct_link') {
          window.open(calendlyUrl, '_blank')
          return
        }

        // If embedded mode with modal, open modal
        if (data.embed_mode === 'embedded' && (data.embed_type === 'modal' || !data.embed_type)) {
          if (calendlyModalContext) {
            calendlyModalContext.openCalendlyModal({
              title: data.title || "Book a Meeting",
              calendlyUrl: calendlyUrl,
            })
          }
          return
        }

        // If embedded mode with inline, the embed is shown directly (no click action needed)
        // But for preview, we can open in new tab
        window.open(calendlyUrl, '_blank')
      }

      // For inline embed mode, show the embed directly
      if (data.embed_mode === 'embedded' && data.embed_type === 'inline' && calendlyUrl) {
        return (
          <div className="w-full rounded-lg overflow-hidden" style={{ minHeight: 300 }}>
            <iframe
              src={calendlyUrl}
              className="w-full h-full border-0"
              style={{ minHeight: 300 }}
              title={data.title || "Calendly"}
            />
          </div>
        )
      }

      // Featured (Pro) layout with thumbnail
      if (isPro) {
        return (
          <button
            onClick={handleCalendlyClick}
            className={cn(
              "w-full overflow-hidden font-medium transition-all cursor-pointer",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            <div className="flex items-center gap-3 p-2.5">
              {/* Thumbnail/Preview */}
              <div
                className="shrink-0 flex items-center justify-center bg-gray-100"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: Math.max(0, theme.button_border_radius - 4),
                }}
              >
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    style={{ borderRadius: Math.max(0, theme.button_border_radius - 4) }}
                  />
                ) : (
                  <Calendar className="w-5 h-5 text-blue-500" />
                )}
              </div>
              {/* Content - Title and Description vertically aligned */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span
                  className="text-[11px] font-semibold leading-tight truncate block"
                  style={{ color: theme.button_text_color }}
                >
                  {data.title || "Book a Meeting"}
                </span>
                {data.description && (
                  <span
                    className="text-[9px] leading-tight mt-0.5 opacity-70 truncate block"
                    style={{ color: theme.button_text_color }}
                  >
                    {data.description}
                  </span>
                )}
              </div>
              {/* Arrow icon - properly aligned */}
              <div className="shrink-0 flex items-center justify-center pr-1">
                <ExternalLink className="w-4 h-4 opacity-50" style={{ color: theme.button_text_color }} />
              </div>
            </div>
          </button>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <button
          onClick={handleCalendlyClick}
          className={cn(
            "w-full flex flex-col items-center justify-center font-medium transition-all cursor-pointer py-2.5 px-3",
            hoverEffect,
            getAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {/* Title */}
          <span
            className="text-[11px] font-semibold truncate w-full text-center"
            style={{ color: theme.button_text_color }}
          >
            {data.title || "Book a Meeting"}
          </span>
          {/* Button text with calendar icon */}
          <div className="flex items-center justify-center gap-1 opacity-70">
            <Calendar className="w-3 h-3 shrink-0" style={{ color: theme.button_text_color }} />
            <span
              className="text-[10px] truncate"
              style={{ color: theme.button_text_color }}
            >
              {data.button_text || "Schedule Now"}
            </span>
          </div>
        </button>
      )
    }

    case "heading":
    case "faq":
    case "countdown":
    case "map":
    case "video":
      return <ExtraBlock block={block} look={{ theme, scale: scale === "small" ? "small" : "normal", preview: true }} />

    default:
      return null
  }
}
