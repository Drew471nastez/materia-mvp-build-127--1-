"use client"

import type React from "react"

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
  SpotifyMode,
  StreamingService,
  GroupBlockData,
} from "@/lib/onepage/types"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react"
import { Bell, X, Check, Send, Link2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"

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

// Notification Bell Component with Subscribe Form
function NotificationBell({
  sellerName,
  sellerId,
  onepageId,
  style = "glass",
}: { sellerName: string; sellerId: string | null; onepageId: string; style?: "glass" | "white" | "black" }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isBellVisible, setIsBellVisible] = useState(true)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      const currentY = window.scrollY

      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsBellVisible(currentY < 120)
          ticking = false
        })
        ticking = true
      }
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    if (!sellerId) {
      setError("Unable to subscribe - seller info unavailable")
      return
    }

    setError("")
    setIsSubmitting(true)

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.toLowerCase().trim(),
          source: "onepage",
          source_id: onepageId,
          creator_id: sellerId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to subscribe")
      }

      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setTimeout(() => {
          setSubmitted(false)
          setEmail("")
        }, 300)
      }, 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to subscribe")
    } finally {
      setIsSubmitting(false)
    }
  }

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
      shadow: "0 0 8px rgba(255, 255, 255, 0.6)",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.95)",
      buttonBorder: "1px solid rgba(0, 0, 0, 0.1)",
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
      shadow: "0 0 6px rgba(59, 130, 246, 0.5)",
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
      buttonSubmitBg: "bg-white/20 hover:bg-white/30 text-white",
      dotColor: "bg-white/70",
      shadow: "0 0 8px rgba(255, 255, 255, 0.4)",
    },
  }

  const s = styles[style]
  const bellVisible = isOpen || isBellVisible

  return (
    <div
      className={cn(
        "fixed top-4 right-4 sm:top-6 sm:right-6 z-50 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
        bellVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1 pointer-events-none",
      )}
    >
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-all duration-300 hover:scale-105",
          style === "glass" && "backdrop-blur-md",
        )}
        style={{
          background: s.buttonBg,
          border: s.buttonBorder,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
        }}
      >
        <Bell
          className={cn("w-[18px] h-[18px] sm:w-[17px] sm:h-[17px]", s.iconColor)}
          style={{
            animation: "bellPulse 3s ease-in-out infinite",
          }}
        />
        {/* Subtle glow dot */}
        <span
          className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full", s.dotColor)}
          style={{ boxShadow: s.shadow }}
        />
      </button>

      {/* Subscribe Panel */}
      <div
        className={cn(
          "absolute top-0 right-0 overflow-hidden transition-all duration-300 ease-out rounded-2xl",
          style === "glass" && "backdrop-blur-lg",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
        style={{
          width: isOpen ? 220 : 44,
          background: s.panelBg,
          border: s.panelBorder,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
          transformOrigin: "top right",
          transform: isOpen ? "scale(1)" : "scale(0.5)",
        }}
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className={cn("text-xs font-medium truncate pr-2", s.textColor)}>Subscribe to {sellerName}</span>
            <button
              onClick={() => setIsOpen(false)}
              className={cn(
                "p-1 rounded-full transition-colors",
                style === "white" ? "hover:bg-gray-100" : "hover:bg-white/20",
              )}
            >
              <X className={cn("w-3.5 h-3.5", style === "white" ? "text-gray-500" : "text-white/70")} />
            </button>
          </div>

          {submitted ? (
            <div className="text-center py-3 flex flex-col items-center gap-1">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center mb-1",
                  style === "white" ? "bg-green-100" : "bg-green-500/30",
                )}
              >
                <Check className={cn("w-5 h-5", style === "white" ? "text-green-600" : "text-green-400")} />
              </div>
              <span className={cn("text-sm font-medium", s.textColor)}>Subscribed!</span>
              <span className={cn("text-xs", style === "white" ? "text-gray-500" : "text-white/60")}>
                You&apos;ll receive updates
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-2.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className={cn(
                  "w-full px-3 py-2 text-sm rounded-xl border focus:outline-none",
                  s.inputBg,
                  s.inputBorder,
                  s.inputText,
                  s.inputPlaceholder,
                  style === "white" ? "focus:border-gray-400" : "focus:border-white/50",
                )}
                required
                disabled={isSubmitting}
              />
              {error && (
                <p className={cn("text-xs text-center", style === "white" ? "text-red-600" : "text-red-300")}>
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(
                  "w-full py-2 text-sm font-medium rounded-xl transition-colors disabled:opacity-50",
                  s.buttonSubmitBg,
                )}
              >
                {isSubmitting ? "Subscribing..." : "Subscribe"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Bell animation keyframes */}
      <style>{`
        @keyframes bellPulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  )
}

// Share Button Component with Share Modal
function ShareButton({
  pageUrl,
  pageTitle,
  avatarUrl,
  style = "white",
  showSubscribe = true,
  accentColor,
}: {
  pageUrl: string
  pageTitle: string
  avatarUrl?: string | null
  style?: "glass" | "white" | "black"
  showSubscribe?: boolean
  accentColor?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isShareVisible, setIsShareVisible] = useState(true)

  useEffect(() => {
    let ticking = false

    const handleScroll = () => {
      const currentY = window.scrollY

      if (!ticking) {
        window.requestAnimationFrame(() => {
          setIsShareVisible(currentY < 120)
          ticking = false
        })
        ticking = true
      }
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Generate gradient colors based on accent color or use default
  const getGradientColors = () => {
    if (accentColor) {
      // Create a gradient based on the accent color
      return {
        from: accentColor,
        via: accentColor,
        to: accentColor,
      }
    }
    return {
      from: "#8B5CF6",
      via: "#A855F7",
      to: "#EC4899",
    }
  }

  const gradientColors = getGradientColors()

  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.98)",
      iconColor: "text-white/80",
    },
    white: {
      buttonBg: "rgba(255, 255, 255, 0.95)",
      buttonBorder: "1px solid rgba(0, 0, 0, 0.1)",
      panelBg: "rgba(255, 255, 255, 0.98)",
      iconColor: "text-gray-700",
    },
    black: {
      buttonBg: "rgba(0, 0, 0, 0.75)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.1)",
      panelBg: "rgba(255, 255, 255, 0.98)",
      iconColor: "text-white/90",
    },
  }

  const s = styles[style]

  const copyLink = async () => {
    await navigator.clipboard.writeText(pageUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const shareOptions = [
    {
      name: "Copy link",
      iconType: "copy" as const,
      color: copied ? "#22c55e" : "#6b7280",
      action: copyLink,
    },
    {
      name: "X",
      iconType: "x" as const,
      color: "#000000",
      action: () =>
        window.open(
          `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(pageTitle)}`,
          "_blank",
        ),
    },
    {
      name: "Facebook",
      iconType: "facebook" as const,
      color: "#1877F2",
      action: () =>
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`, "_blank"),
    },
    {
      name: "WhatsApp",
      iconType: "whatsapp" as const,
      color: "#25D366",
      action: () => window.open(`https://wa.me/?text=${encodeURIComponent(`${pageTitle} ${pageUrl}`)}`, "_blank"),
    },
  ]

  // Render icon based on type
  const renderIcon = (iconType: string, color: string) => {
    switch (iconType) {
      case "copy":
        return copied ? <Check className="w-5 h-5" /> : <Link2 className="w-5 h-5" />
      case "x":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        )
      case "facebook":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        )
      case "whatsapp":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        )
      case "linkedin":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
        )
      case "storelib":
        return (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )
      default:
        return null
    }
  }

  // Share icon is always positioned on the TOP LEFT (both mobile and desktop)
  // Subscribe icon stays on TOP RIGHT
  // Desktop (md): top-[22px] to align 2px above the subscribe button which is at top-6 (24px)
  const positionClass = "fixed top-4 left-4 sm:top-6 sm:left-6 md:top-[22px] md:left-8 z-50"
  const shareVisible = isOpen || isShareVisible

  const buttonWrapperClass = cn(
    "transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]",
    shareVisible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-1 pointer-events-none",
  )

  return (
    <>
      <div className={positionClass}>
        <div className={buttonWrapperClass}>
          {/* Share Button - icons 3px smaller on desktop */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className={cn(
              "relative flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-full transition-all duration-300 hover:scale-105",
              style === "glass" && "backdrop-blur-md",
            )}
            style={{
              background: s.buttonBg,
              border: s.buttonBorder,
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* Mobile: 18px (2px smaller than 20), Desktop: 17px (3px smaller than 20) */}
            <Send className={cn("w-[18px] h-[18px] sm:w-[17px] sm:h-[17px]", s.iconColor)} />
          </button>
        </div>
      </div>

      {/* Share Modal */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal - Modern Linktree-style design */}
          <div
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[65] w-[calc(100%-32px)] max-w-[380px] rounded-[28px] overflow-hidden animate-in zoom-in-95 fade-in duration-200"
            style={{
              background: "#ffffff",
              boxShadow: "0 25px 80px rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.1)",
            }}
          >
            {/* Profile preview card with gradient background based on OnePage accent color */}
            <div
              className="relative px-6 pt-8 pb-10"
              style={{
                background: `linear-gradient(135deg, ${gradientColors.from} 0%, ${gradientColors.via} 50%, ${gradientColors.to} 100%)`,
              }}
            >
              {/* Close button */}
              <button
                onClick={() => setIsOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-all"
              >
                <X className="w-4 h-4 text-white" />
              </button>

              <div className="text-center">
                <div className="w-20 h-20 mx-auto mb-4 rounded-full overflow-hidden bg-white/20 flex items-center justify-center ring-4 ring-white/30 shadow-xl">
                  {avatarUrl ? (
                    <img src={avatarUrl || "/placeholder.svg"} alt={pageTitle} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-bold text-white">{pageTitle.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{pageTitle}</h3>
                <p className="text-white/80 text-sm truncate max-w-[200px] mx-auto">
                  {pageUrl.replace(/^https?:\/\//, "")}
                </p>
              </div>
            </div>

            {/* Share options - centered and well-aligned */}
            <div className="flex justify-center items-center gap-4 px-3">
              {shareOptions.map(
                (
                  option,
                  index, // Added key prop and index
                ) => (
                  <button
                    key={option.name} // Added key prop using option.name
                    onClick={option.action}
                    className={cn(
                      "flex flex-col items-center gap-1.5 p-2 rounded-xl transition-opacity duration-200",
                      "opacity-100 hover:opacity-70",
                    )}
                    style={{ animationDelay: `${index * 50}ms` }} // Removed index, replaced with option.name or similar for unique delay if needed
                  >
                    <div
                      className="w-[46px] h-[46px] rounded-full flex items-center justify-center transition-transform"
                      style={{ backgroundColor: `${option.color}15` }}
                    >
                      <span style={{ color: option.color }}>{renderIcon(option.iconType, option.color)}</span>
                    </div>
                    <span className="text-[10px] font-medium text-gray-600">{option.name}</span>
                  </button>
                ),
              )}
            </div>

            {/* Storelib CTA Section */}
            <div className="px-5 pb-6">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                    <svg
                      className="w-5 h-5 text-white"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Create your own page</p>
                    <p className="text-xs text-gray-500 truncate">Build your store with Storelib</p>
                  </div>
                  <button
                    onClick={() => window.open("https://storelib.co", "_blank")}
                    className="px-4 py-2 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-all shadow-sm hover:shadow-md active:scale-95"
                  >
                    Join
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// Dynamic Favicon Component for OnePage
// Priority: 1. avatar_url, 2. video frame, 3. store builder profile image
interface OnePageDynamicFaviconProps {
  avatarUrl?: string | null
  videoUrl?: string | null
  sellerId?: string | null
}

function OnePageDynamicFavicon({ avatarUrl, videoUrl, sellerId }: OnePageDynamicFaviconProps) {
  const [storeAvatarUrl, setStoreAvatarUrl] = useState<string | null>(null)
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null)

  // Fetch store builder profile image if needed
  useEffect(() => {
    if (!avatarUrl && !videoUrl && sellerId) {
      // Fetch the seller's store builder profile image
      fetch(`/api/onepage/seller-avatar?seller_id=${sellerId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.avatar_url) {
            setStoreAvatarUrl(data.avatar_url)
          }
        })
        .catch(() => {
          // Ignore errors
        })
    }
  }, [avatarUrl, videoUrl, sellerId])

  // Extract frame from video if no avatar
  useEffect(() => {
    if (!avatarUrl && videoUrl) {
      const video = document.createElement("video")
      video.crossOrigin = "anonymous"
      video.muted = true
      video.playsInline = true

      video.onloadeddata = () => {
        // Seek to 0.5 second to get a good frame
        video.currentTime = 0.5
      }

      video.onseeked = () => {
        try {
          const canvas = document.createElement("canvas")
          canvas.width = 64
          canvas.height = 64
          const ctx = canvas.getContext("2d")
          if (ctx) {
            // Draw video frame centered and cropped to square
            const size = Math.min(video.videoWidth, video.videoHeight)
            const sx = (video.videoWidth - size) / 2
            const sy = (video.videoHeight - size) / 2
            ctx.drawImage(video, sx, sy, size, size, 0, 0, 64, 64)
            const dataUrl = canvas.toDataURL("image/png")
            setVideoFrameUrl(dataUrl)
          }
        } catch (e) {
          // Canvas might fail due to CORS
          console.error("Failed to extract video frame:", e)
        }
      }

      video.src = videoUrl
      video.load()

      return () => {
        video.src = ""
      }
    }
  }, [avatarUrl, videoUrl])

  // Determine which URL to use for favicon
  const faviconUrl = avatarUrl || videoFrameUrl || storeAvatarUrl

  // Apply favicon
  useEffect(() => {
    if (!faviconUrl) return

    // Find existing favicon links
    const existingLinks = document.querySelectorAll("link[rel*='icon']")

    // Remove existing favicons
    existingLinks.forEach((link) => link.remove())

    // Create new favicon link
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = faviconUrl
    link.type = faviconUrl.startsWith("data:") ? "image/png" : "image/x-icon"
    document.head.appendChild(link)

    // Also add apple-touch-icon for iOS
    const appleLink = document.createElement("link")
    appleLink.rel = "apple-touch-icon"
    appleLink.href = faviconUrl
    document.head.appendChild(appleLink)

    // Cleanup on unmount - restore default favicon
    return () => {
      const addedLinks = document.querySelectorAll("link[rel*='icon']")
      addedLinks.forEach((link) => link.remove())

      // Restore default favicon
      const defaultLink = document.createElement("link")
      defaultLink.rel = "icon"
      defaultLink.href = "/favicon.ico"
      document.head.appendChild(defaultLink)
    }
  }, [faviconUrl])

  return null
}

const SocialIconsSVG: Record<string, React.FC<{ size?: number; color?: string }>> = {
  instagram: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  ),
  tiktok: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
  youtube: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  twitter: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  spotify: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
  linkedin: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  facebook: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  ),
  github: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  ),
  twitch: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
    </svg>
  ),
  threads: ({ size = 20, color = "currentColor" }) => (
    <svg width={size} height={size} viewBox="0 0 192 192" fill={color}>
      <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 125.084 64.8569 132.827 72.0518 138.095C78.0037 142.425 85.7883 144.669 93.8627 144.267C104.67 143.762 113.294 139.372 119.426 131.257C123.968 125.209 126.839 117.661 128.011 108.524C134.151 112.138 138.711 116.852 140.818 122.579C144.283 131.969 144.493 147.389 132.112 159.684C121.329 170.391 108.196 175.168 90.4863 175.313C71.1024 175.146 56.413 169.087 46.743 157.33C37.7196 146.384 33.0206 130.727 32.8218 110.728L32.8218 81.2724C33.0206 61.2734 37.7196 45.6164 46.743 34.6699C56.413 22.9131 71.1024 16.8538 90.4863 16.687C109.996 16.8551 124.983 22.969 135.077 34.8069C139.98 40.5571 143.818 47.559 146.498 55.5601L163.044 50.2802C159.626 40.0171 154.589 31.1436 147.971 23.8628C134.709 9.04939 116.136 1.41406 90.5517 1.18164L90.4209 1.18111C64.9526 1.41299 46.6603 9.0918 33.6384 23.9936C22.3006 36.9827 16.2393 54.9747 16.0037 77.5368V77.5752L16 110.766L16.0037 114.463V114.501C16.2393 137.063 22.3006 155.055 33.6384 168.044C46.6603 182.946 64.9526 190.625 90.4209 190.857L90.5517 190.856C113.049 190.674 129.763 184.282 143.474 170.655C161.387 152.86 160.887 130.625 155.586 117.281C151.64 107.259 143.663 99.0028 132.122 93.3506C131.667 91.8653 131.16 90.3969 130.603 88.9554L141.537 88.9883ZM98.4405 127.461C88.1005 127.987 77.7615 123.461 77.2019 114.047C76.7685 106.846 81.9377 97.7908 99.0178 96.8022C101.279 96.6754 103.499 96.6135 105.678 96.6135C111.478 96.6135 116.931 97.1398 121.955 98.1592C120.066 117.743 109.748 126.885 98.4405 127.461Z" />
    </svg>
  ),
  // Removed Twitch, GitHub, etc.
}

// QR Code component - generates actual scannable QR codes using qrcode library
function QRCode({ url, size = 120 }: { url: string; size?: number; darkColor?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) return

    // Dynamically import qrcode library
    import("qrcode").then((QRCodeLib) => {
      QRCodeLib.toDataURL(url, {
        width: size * 2, // 2x for retina
        margin: 2,
        color: {
          dark: "#000000",
          light: "#ffffff",
        },
        errorCorrectionLevel: "M",
      })
        .then((dataUrl) => {
          setQrDataUrl(dataUrl)
        })
        .catch((err) => {
          console.error("Failed to generate QR code:", err)
        })
    })
  }, [url, size])

  if (!qrDataUrl) {
    return (
      <div className="bg-white rounded-lg p-1 flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="animate-pulse bg-gray-200 rounded" style={{ width: size - 8, height: size - 8 }} />
      </div>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer hover:opacity-90 transition-opacity bg-white rounded-lg p-1"
      title="Scan to open page"
    >
      <img
        src={qrDataUrl || "/placeholder.svg"}
        alt="QR Code"
        style={{ display: "block", width: size, height: size }}
      />
    </a>
  )
}

interface PublicOnePageProps {
  onepage: {
    id: string
    title: string
    bio: string
    slug: string
    avatar_url: string | null
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
    theme: OnePageTheme
    blocks: OnePageBlock[]
    social_links: any
    settings: any
    seller_id: string | null
  }
}

export function PublicOnePage({ onepage }: PublicOnePageProps) {
  const {
    title,
    bio,
    avatar_url,
    avatar_video_url,
    avatar_video_crop,
    theme,
    blocks,
    social_links,
    settings,
    seller_id,
  } = onepage
  const sellerName = title || "Creator"
  
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

  // Safe defaults
  const safeTheme = theme || {
    background_type: "solid" as const,
    background_color: "#ffffff",
    background_gradient: "",
    background_image_url: "",
    text_color: "#000000",
    secondary_text_color: "#666666",
    button_color: "#000000",
    button_text_color: "#ffffff",
    button_style: "filled" as const,
    button_border_radius: 8,
    button_border_width: 0,
    button_border_color: "#000000",
    font_family: "Inter",
    spacing: "normal" as const,
    card_width: "standard" as const,
  }

  const safeBlocks = blocks || []
  // Merge settings with defaults to ensure all fields exist (including verified badge)
  const safeSettings = {
    show_branding: true,
    analytics_enabled: true,
    subscribe_enabled: true,
    subscribe_style: "glass" as const,
    share_enabled: true,
    share_style: "white" as const,
    verified_badge_enabled: false,
    verified_badge_type: "verified_creator" as const,
    ...settings,
  }

  // Animated gradient - only when explicitly enabled
  const isAnimatedGradient = safeTheme.background_type === "gradient" && safeTheme.animated_gradient === true

  // Check if background is dark for footer link color
  const isDarkBackground = (() => {
    const color = safeTheme.background_color || "#ffffff"
    // Parse hex color and calculate luminance
    const hex = color.replace("#", "")
    const r = Number.parseInt(hex.substring(0, 2), 16) || 255
    const g = Number.parseInt(hex.substring(2, 4), 16) || 255
    const b = Number.parseInt(hex.substring(4, 6), 16) || 255
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance < 0.5 || safeTheme.background_type === "image" || safeTheme.background_type === "video"
  })()

  // Get background style
  const getBackgroundStyle = () => {
    if (safeTheme.background_type === "gradient" && safeTheme.background_gradient) {
      return safeTheme.background_gradient
    }
    return safeTheme.background_color
  }

  // Noise overlay SVG for gradient/image backgrounds - opacity controlled by noise_strength
  const noiseStrength = (safeTheme as any).noise_strength || 15
  const noiseOpacity = (noiseStrength / 100) * 2 // Convert 5-50% to 0.1-1.0 range
  const NoiseOverlay = () => (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ mixBlendMode: "overlay", opacity: noiseOpacity }}
    >
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#noise)" />
    </svg>
  )

  // Background pattern overlay component
  const patternColor = (safeTheme as any).pattern_color || "#00000090"
  const patternOpacity = (safeTheme as any).pattern_opacity || "medium"
  const patternOpacityValue =
    patternOpacity === "low" ? 0.4 : patternOpacity === "hard" ? 1 : patternOpacity === "very_hard" ? 1.5 : 0.7
  const BackgroundPatternOverlay = ({ idPrefix = "public" }: { idPrefix?: string }) => {
    const patternType = (safeTheme as any).background_pattern
    if (!patternType || patternType === "none") return null

    const patterns: Record<string, React.ReactNode> = {
      grid: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-grid`} width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke={patternColor} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-grid)`} />
        </svg>
      ),
      dots: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-dots`} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="8" cy="8" r="2" fill={patternColor} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-dots)`} />
        </svg>
      ),
      waves: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-waves`} width="50" height="25" patternUnits="userSpaceOnUse">
              <path d="M0 12.5 Q12.5 0, 25 12.5 T50 12.5" fill="none" stroke={patternColor} strokeWidth="2" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-waves)`} />
        </svg>
      ),
      zigzag: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-zigzag`} width="20" height="12" patternUnits="userSpaceOnUse">
              <path d="M0 6 L5 0 L10 6 L15 0 L20 6" fill="none" stroke={patternColor} strokeWidth="1.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-zigzag)`} />
        </svg>
      ),
      cross: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-cross`} width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M8 0 L8 16 M0 8 L16 8" fill="none" stroke={patternColor} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-cross)`} />
        </svg>
      ),
      diagonal: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id={`${idPrefix}-diagonal`} width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M0 10 L10 0" fill="none" stroke={patternColor} strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-diagonal)`} />
        </svg>
      ),
      morph: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id={`${idPrefix}-morph`} width="200" height="200" patternUnits="userSpaceOnUse">
              <path
                d="M40 20 Q60 40, 40 60 Q20 80, 40 100 Q60 80, 80 100 Q100 120, 80 140 Q60 120, 40 140 Q20 160, 40 180"
                fill="none"
                stroke={patternColor}
                strokeWidth="2"
                opacity="0.5"
              />
              <path
                d="M120 10 Q140 30, 160 20 Q180 40, 160 60 Q180 80, 160 100 Q140 80, 120 100 Q100 80, 120 60"
                fill="none"
                stroke={patternColor}
                strokeWidth="2"
                opacity="0.4"
              />
              <path
                d="M100 140 Q120 160, 140 150 Q160 170, 140 190 Q120 170, 100 180"
                fill="none"
                stroke={patternColor}
                strokeWidth="2"
                opacity="0.45"
              />
              <circle cx="50" cy="50" r="8" fill={patternColor} opacity="0.3" />
              <circle cx="150" cy="70" r="6" fill={patternColor} opacity="0.25" />
              <circle cx="100" cy="160" r="5" fill={patternColor} opacity="0.3" />
              <rect x="170" y="150" width="20" height="2" fill={patternColor} opacity="0.4" rx="1" />
              <rect x="10" y="100" width="15" height="2" fill={patternColor} opacity="0.35" rx="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-morph)`} />
        </svg>
      ),
      organic: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 200 200"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id={`${idPrefix}-organic`} width="200" height="200" patternUnits="userSpaceOnUse">
              <path
                d="M30 40 Q50 20, 70 40 Q90 60, 70 80 Q50 100, 30 80 Q10 60, 30 40"
                fill={patternColor}
                opacity="0.35"
              />
              <path
                d="M120 30 Q150 25, 160 50 Q170 80, 140 90 Q110 95, 100 70 Q95 45, 120 30"
                fill={patternColor}
                opacity="0.3"
              />
              <path
                d="M60 130 Q80 110, 110 125 Q130 140, 115 165 Q95 185, 65 170 Q45 155, 60 130"
                fill={patternColor}
                opacity="0.32"
              />
              <path
                d="M160 140 Q180 145, 185 165 Q188 185, 170 190 Q150 188, 145 170 Q143 152, 160 140"
                fill={patternColor}
                opacity="0.28"
              />
              <path
                d="M20 160 Q35 150, 45 165 Q50 180, 35 190 Q20 185, 15 175 Q12 165, 20 160"
                fill={patternColor}
                opacity="0.25"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-organic)`} />
        </svg>
      ),
    }

    return patterns[patternType] || null
  }

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/l/${onepage.slug}` : `/l/${onepage.slug}`

  // Page content component
  const PageContent = ({ isDesktop = false }: { isDesktop?: boolean }) => (
    <div
      className={cn("relative z-10 w-full flex flex-col min-h-full", isDesktop ? "max-w-full" : "max-w-lg mx-auto")}
      style={{
        paddingLeft: isDesktop ? "28px" : "20px",
        paddingRight: isDesktop ? "28px" : "20px",
        // More top padding on mobile to push avatar/content down
        paddingTop: isDesktop ? "0" : "50px",
        paddingBottom: "20px",
        minHeight: isDesktop ? "100%" : "100vh",
      }}
    >
      <div
        className={cn(
          "flex flex-col items-center",
          safeTheme.spacing === "compact"
            ? "gap-3 sm:gap-4"
            : safeTheme.spacing === "comfortable"
              ? "gap-5 sm:gap-6"
              : "gap-4 sm:gap-5",
        )}
      >
        {safeBlocks
          .filter((b) => b?.enabled)
          .sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0))
          .map((block) => (
            <PublicBlockRenderer
              key={block.id}
              block={block}
              theme={safeTheme}
              profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
              onepageId={onepage.id}
              sellerId={seller_id}
              isDesktop={isDesktop}
              settings={safeSettings}
            />
          ))}
      </div>
      {/* Footer - pushed to bottom */}
      <div className="mt-auto pt-10 pb-4">
        {safeSettings.show_branding && (
          <div className="text-center mb-4">
            <a
              href="https://materia.so"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 py-2 rounded-full text-sm font-medium bg-white text-gray-900 hover:bg-gray-100 transition-colors shadow-sm"
            >
              {sellerName} on Storelib
            </a>
          </div>
        )}
        {/* Footer Links */}
        <div className="flex items-center justify-center gap-4 text-xs">
          <a
            href="https://materiathemes.com/cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
          >
            Cookies
          </a>
          <a
            href="https://materiathemes.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
          >
            Privacy
          </a>
          <a
            href="https://materiathemes.com/report"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
          >
            Report
          </a>
        </div>
      </div>
    </div>
  )

  return (
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
      {/* Dynamic Favicon - uses avatar, video frame, or store builder avatar */}
      <OnePageDynamicFavicon avatarUrl={avatar_url} videoUrl={avatar_video_url} sellerId={seller_id} />

      {/* Animation keyframes for gradient */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes gradientShiftLive {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `,
        }}
      />

      {/* Notification Bell - Subscribe (only show if enabled and seller_id exists) */}
      {safeSettings.subscribe_enabled !== false && seller_id && (
        <NotificationBell
          sellerName={sellerName}
          sellerId={seller_id}
          onepageId={onepage.id}
          style={safeSettings.subscribe_style || "glass"}
        />
      )}

      {/* Share Button (only show if enabled) - positioned on TOP LEFT */}
      {safeSettings.share_enabled !== false && (
        <ShareButton
          pageUrl={pageUrl}
          pageTitle={sellerName}
          avatarUrl={avatar_url}
          style={safeSettings.share_style || "white"}
          showSubscribe={safeSettings.subscribe_enabled !== false}
          accentColor={safeTheme.button_color}
        />
      )}

      {/* Desktop layout - NO internal scrollbar, page scrolls naturally */}
      <div
        className="hidden md:block min-h-screen w-full relative overflow-hidden"
        style={{
          background: getBackgroundStyle(),
          fontFamily: safeTheme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined,
        }}
      >
        {safeTheme.background_type === "image" && safeTheme.background_image_url && (
          <div
            style={{
              position: "fixed",
              top: "-50px",
              left: "-50px",
              right: "-50px",
              bottom: "-50px",
              backgroundImage: `url(${safeTheme.background_image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
            }}
          />
        )}

        {/* Video background for desktop - BLURRED in background outside card */}
        {safeTheme.background_type === "video" && (safeTheme as any).background_video_url && (
          <video
            src={(safeTheme as any).background_video_url}
            style={{
              position: "fixed",
              top: "-50px",
              left: "-50px",
              right: "-50px",
              bottom: "-50px",
              width: "calc(100% + 100px)",
              height: "calc(100% + 100px)",
              objectFit: "cover",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).video_brightness || 100}%) blur(20px)`,
            }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Noise overlay for gradient backgrounds */}
        {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <NoiseOverlay />}
        {/* Noise overlay for image backgrounds */}
        {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <NoiseOverlay />}
        {/* Pattern overlay for solid/gradient backgrounds */}
        {(safeTheme.background_type === "solid" || safeTheme.background_type === "gradient") && (
          <BackgroundPatternOverlay idPrefix="desktop-bg" />
        )}

        {/* Centered card container */}
        <div className="relative z-10 flex justify-center py-8 min-h-screen">
          {/* Phone-like card - wider than before (500px instead of 420px) */}
          <div
            className="w-full max-w-[500px] mx-4 rounded-[40px] overflow-hidden relative"
            style={{
              background: getBackgroundStyle(),
              boxShadow: "0 25px 80px -12px rgba(0, 0, 0, 0.35)",
              backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
              animation: isAnimatedGradient ? "gradientShiftLive 12s ease-in-out infinite" : undefined,
            }}
          >
            {safeTheme.background_type === "image" && safeTheme.background_image_url && (
              <div
                style={{
                  position: "absolute",
                  top: "-30px",
                  left: "-30px",
                  right: "-30px",
                  bottom: "-30px",
                  backgroundImage: `url(${safeTheme.background_image_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  zIndex: 0,
                  filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
                }}
              />
            )}
            {/* Video background inside card - NO blur, cover fit */}
            {safeTheme.background_type === "video" && (safeTheme as any).background_video_url && (
              <video
                src={(safeTheme as any).background_video_url}
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  minWidth: "100%",
                  minHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "cover",
                  zIndex: 0,
                  filter: `brightness(${(safeTheme as any).video_brightness || 100}%)`,
                }}
                autoPlay
                loop
                muted
                playsInline
              />
            )}
            {/* Noise overlay inside card */}
            {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none rounded-[40px]"
                style={{ mixBlendMode: "overlay", opacity: noiseOpacity }}
              >
                <filter id="card-noise">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#card-noise)" />
              </svg>
            )}
            {safeTheme.background_type === "image" && (safeTheme as any).image_noise && (
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none rounded-[40px]"
                style={{ mixBlendMode: "overlay", opacity: noiseOpacity }}
              >
                <filter id="card-noise-img">
                  <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
                </filter>
                <rect width="100%" height="100%" filter="url(#card-noise-img)" />
              </svg>
            )}
            {/* Pattern overlay inside card */}
            {(safeTheme.background_type === "solid" || safeTheme.background_type === "gradient") && (
              <BackgroundPatternOverlay idPrefix="desktop-card" />
            )}
            <PageContent isDesktop={true} />
          </div>
        </div>

        {/* QR Code in bottom right corner - desktop only */}
        <div className="fixed bottom-6 right-6 z-20 flex flex-col items-center gap-2">
          <span className="text-sm font-medium px-2 py-1 bg-black/20 rounded" style={{ color: "#ffffff" }}>
            Scan to view
          </span>
          <QRCode url={pageUrl} size={100} darkColor="#000000" />
        </div>
      </div>

      {/* Mobile layout (full screen) */}
      <div
        className="md:hidden min-h-screen w-full relative"
        style={{
          overflowX: 'clip',
          background: getBackgroundStyle(),
          fontFamily: safeTheme.font_family || "Inter",
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined,
        }}
      >
        {safeTheme.background_type === "image" && safeTheme.background_image_url && (
          <div
            style={{
              position: "fixed",
              top: "-50px",
              left: "-50px",
              right: "-50px",
              bottom: "-50px",
              backgroundImage: `url(${safeTheme.background_image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
            }}
          />
        )}

        {/* Video background for mobile */}
        {safeTheme.background_type === "video" && (safeTheme as any).background_video_url && (
          <video
            src={(safeTheme as any).background_video_url}
            style={{
              position: "fixed",
              top: "0",
              left: "0",
              right: "0",
              bottom: "0",
              width: "100%",
              height: "100%",
              objectFit: "cover",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).video_brightness || 100}%)`,
            }}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Noise overlays for mobile */}
        {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <NoiseOverlay />}
        {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <NoiseOverlay />}
        {/* Pattern overlay for mobile */}
        {(safeTheme.background_type === "solid" || safeTheme.background_type === "gradient") && (
          <BackgroundPatternOverlay idPrefix="mobile" />
        )}
        <PageContent />
      </div>
      
      {/* Spotify Modal - clean, compact, responsive design */}
      {spotifyModalOpen && spotifyModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSpotifyModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[360px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                <span className="text-sm font-medium text-gray-600 truncate max-w-[220px]">
                  {spotifyModalData.title}
                </span>
              </div>
              <button
                onClick={() => setSpotifyModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Spotify Embed - compact height */}
            <div className="p-3">
              <iframe
                src={spotifyModalData.embedUrl}
                width="100%"
                height="152"
                frameBorder="0"
                allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                loading="lazy"
                className="rounded-lg"
              />
            </div>

            {/* Streaming Services - with icons */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-3 pb-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Listen on</p>
                <div className="space-y-1.5">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).map((service) => {
                    const serviceConfig: Record<string, { name: string; icon: React.ReactNode }> = {
                      apple_music: {
                        name: 'Apple Music',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FC3C44">
                            <path d="M23.994 6.124c0-.738-.065-1.477-.192-2.206-.164-.956-.472-1.856-.912-2.692A6.186 6.186 0 0 0 20.392.233C19.557-.206 18.656-.498 17.7-.662 16.972-.789 16.234-.854 15.496-.854H8.506c-.738 0-1.477.065-2.206.192-.956.164-1.856.472-2.692.912A6.186 6.186 0 0 0 .612 2.748C.173 3.584-.12 4.484-.284 5.44-.411 6.168-.476 6.906-.476 7.644v8.99c0 .738.065 1.477.192 2.206.164.956.472 1.856.912 2.692.456.801 1.03 1.518 1.696 2.135.835.439 1.735.731 2.692.896.728.127 1.466.192 2.204.192h8.99c.738 0 1.477-.065 2.206-.192.956-.164 1.856-.472 2.692-.912.801-.456 1.518-1.03 2.135-1.696.439-.835.731-1.735.896-2.692.127-.728.192-1.466.192-2.204V6.124zm-6.287 9.79c-.017.158-.034.316-.066.467-.152.723-.55 1.342-1.105 1.728-.473.329-1.022.496-1.583.496-.12 0-.24-.008-.36-.024-.436-.057-.855-.217-1.218-.467l-3.836-2.652c-.15-.104-.35-.08-.474.057-.125.137-.133.35-.017.497l3.836 2.652c.556.383.66 1.14.233 1.692-.427.553-1.197.658-1.722.235l-4.578-3.163c-.39-.27-.666-.665-.785-1.115-.119-.45-.075-.924.125-1.34.2-.417.528-.752.925-.948l4.578-3.163c.555-.383 1.305-.253 1.678.293.372.546.234 1.285-.308 1.65l-3.836 2.651c-.159.11-.213.32-.127.494.086.173.28.265.465.22l3.836-2.651c.363-.25.782-.41 1.218-.467.12-.016.24-.024.36-.024.561 0 1.11.167 1.583.496.555.386.953 1.005 1.105 1.728.032.151.049.309.066.467z"/>
                          </svg>
                        )
                      },
                      spotify: {
                        name: 'Spotify',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#1DB954">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        )
                      },
                      youtube_music: {
                        name: 'YouTube Music',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF0000">
                            <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 19.104c-3.924 0-7.104-3.18-7.104-7.104S8.076 4.896 12 4.896s7.104 3.18 7.104 7.104-3.18 7.104-7.104 7.104zm0-13.332c-3.432 0-6.228 2.796-6.228 6.228S8.568 18.228 12 18.228s6.228-2.796 6.228-6.228S15.432 5.772 12 5.772zM9.684 15.54V8.46L15.816 12l-6.132 3.54z"/>
                          </svg>
                        )
                      },
                      youtube: {
                        name: 'YouTube',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF0000">
                            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                          </svg>
                        )
                      },
                      itunes: {
                        name: 'iTunes',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FB5BC5">
                            <path d="M11.977 23.999c-2.483-.086-4.832-1.087-6.583-2.903a9.967 9.967 0 0 1-2.667-5.47c-.318-1.884-.129-3.727.566-5.479a9.993 9.993 0 0 1 3.755-4.476c.086-.06.173-.12.26-.177V5.49c0-.015.003-.03.003-.045L7.3.01a.075.075 0 0 1 .088-.01l8.922 2.4a.075.075 0 0 1 .055.072l.002 13.973a3.323 3.323 0 0 1-.672 1.99 3.309 3.309 0 0 1-1.697 1.195c-.453.138-.927.18-1.394.122-.928-.115-1.72-.596-2.212-1.35-.492-.753-.64-1.674-.415-2.59.224-.917.78-1.68 1.564-2.147.784-.467 1.72-.602 2.636-.38.318.077.619.197.897.358V6.318l-6.753-1.81v10.03a3.321 3.321 0 0 1-.676 1.99 3.31 3.31 0 0 1-1.7 1.193c-.453.138-.928.178-1.395.12-.927-.117-1.72-.598-2.21-1.352-.49-.754-.637-1.676-.41-2.592.225-.916.781-1.678 1.566-2.145.784-.466 1.72-.6 2.634-.377.32.078.624.199.902.362V5.498l.001-.045 7.31-1.958-.003-.001-.003 14.955a3.321 3.321 0 0 1-.675 1.988 3.309 3.309 0 0 1-1.698 1.194c-.24.073-.487.116-.734.135a4.066 4.066 0 0 1-.324.034z"/>
                          </svg>
                        )
                      },
                      soundcloud: {
                        name: 'SoundCloud',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FF5500">
                            <path d="M1.175 12.225c-.051 0-.094.046-.101.1l-.233 2.154.233 2.105c.007.058.05.098.101.098.05 0 .09-.04.099-.098l.255-2.105-.27-2.154c-.009-.06-.05-.1-.084-.1zm-.899 1.05c-.05 0-.09.04-.116.1l-.178 1.104.178 1.073c.027.06.066.1.116.1.05 0 .09-.04.099-.1l.21-1.073-.21-1.104c-.01-.06-.05-.1-.099-.1zM2.55 12.017c-.066 0-.116.06-.124.117l-.217 2.358.217 2.257c.008.06.058.117.124.117.067 0 .117-.058.125-.117l.24-2.257-.24-2.358c-.008-.058-.058-.117-.125-.117zm.947-.1c-.082 0-.14.068-.15.133l-.2 2.458.2 2.355c.01.067.068.133.15.133.085 0 .14-.066.15-.133l.226-2.355-.225-2.458c-.01-.066-.066-.133-.15-.133zm.95-.168c-.1 0-.157.08-.166.15l-.183 2.625.183 2.437c.01.075.066.15.166.15.09 0 .156-.075.166-.15l.2-2.437-.2-2.625c-.01-.075-.075-.15-.166-.15zm.948-.158c-.1 0-.174.085-.184.166l-.165 2.783.166 2.52c.01.083.084.167.184.167.1 0 .173-.084.183-.167l.184-2.52-.184-2.783c-.01-.08-.083-.166-.183-.166zm.95-.159c-.116 0-.2.1-.208.183l-.15 2.942.15 2.603c.008.083.092.183.208.183.117 0 .2-.1.208-.183l.167-2.603-.167-2.942c-.008-.083-.092-.183-.208-.183zm.946-.164c-.133 0-.225.1-.233.2l-.134 3.102.134 2.685c.008.1.1.2.233.2.134 0 .225-.1.234-.2l.15-2.685-.15-3.102c-.01-.1-.1-.2-.234-.2zm.951-.015c-.15 0-.25.117-.258.217l-.116 3.117.116 2.768c.008.117.108.217.258.217.15 0 .25-.1.258-.217l.134-2.768-.134-3.117c-.008-.1-.108-.217-.258-.217zm3.788.135c-.1 0-.183.067-.208.167l-.134 2.783.134 2.519c.025.1.108.167.208.167.1 0 .183-.067.2-.167l.158-2.52-.158-2.782c-.017-.1-.1-.167-.2-.167zM9.52 10.27c-.167 0-.283.125-.292.233l-.1 3.183.1 2.77c.009.109.125.234.292.234.167 0 .283-.125.3-.234l.109-2.77-.109-3.183c-.017-.108-.133-.233-.3-.233zm.95-.15c-.183 0-.317.133-.325.25l-.092 3.333.092 2.852c.008.125.142.25.325.25.183 0 .316-.125.333-.25l.1-2.852-.1-3.333c-.017-.117-.15-.25-.333-.25zm.949-.175c-.2 0-.333.142-.342.267l-.075 3.508.075 2.935c.01.133.142.267.342.267.2 0 .333-.134.35-.267l.083-2.935-.083-3.508c-.017-.125-.15-.267-.35-.267zm.95-.2c-.217 0-.367.158-.367.283v.009l-.058 3.683.058 3.01c0 .125.15.283.367.283.216 0 .366-.158.383-.283l.067-3.01-.067-3.692c-.017-.125-.167-.283-.383-.283zm.941-.175c-.233 0-.383.167-.4.3l-.041 3.858.041 3.067c.017.133.167.3.4.3.234 0 .384-.167.4-.3l.05-3.067-.05-3.858c-.016-.133-.166-.3-.4-.3zm3.812.15c-.133 0-.242.108-.267.233l-.166 3.508.166 3.067c.025.125.134.233.267.233.133 0 .25-.108.266-.233l.184-3.067-.184-3.508c-.016-.125-.133-.233-.266-.233zm-.958-.15c-.25 0-.417.183-.434.333l-.033 3.658.033 3.107c.017.15.184.333.434.333.25 0 .416-.183.441-.333l.042-3.108-.042-3.658c-.025-.15-.191-.333-.441-.333zm-.95-.166c-.267 0-.45.191-.467.35l-.016 3.825.016 3.15c.017.158.2.35.467.35.267 0 .45-.192.475-.35l.016-3.15-.016-3.825c-.025-.159-.208-.35-.475-.35zm.95 1.499c-.283 0-.483.208-.508.375l-.008 3.95-.008-.117V18.408c.025.167.225.375.508.375.283 0 .483-.208.517-.375l.008-1.941.016.016-.016-3.967c-.034-.167-.234-.375-.509-.375zm.958-.167c-.3 0-.517.225-.542.392v7.816c.025.167.242.392.542.392.3 0 .516-.225.558-.4V14.092l-.008-.192c-.034-.167-.259-.392-.55-.392zM19.5 9.968c-.317 0-.542.233-.575.408l-.017 3.975-.008-.083V18.25c.025.175.258.408.575.408.175 0 .35-.083.467-.217.075-.083.125-.183.134-.308v-3.942l.008-.117V14.283l-.008-3.907c-.008-.167-.058-.275-.142-.358-.108-.1-.267-.158-.434-.15zm.934-.675c-.35 0-.592.25-.642.442V18.117c.05.192.292.442.642.442.35 0 .608-.25.65-.442V9.733c-.042-.192-.3-.442-.65-.442zm.941-.233c-.367 0-.625.267-.658.458v8.992c.033.192.291.459.658.459.367 0 .633-.267.667-.467V9.058c-.034-.192-.3-.458-.667-.458zm.95 0c-.4 0-.675.283-.7.483v8.967c.025.2.3.483.7.483.4 0 .675-.283.717-.483V9.542c-.042-.2-.317-.483-.717-.483zm.942-.1c-.417 0-.7.3-.734.5v9.1c.034.2.317.5.734.5.416 0 .7-.3.741-.5V9.46c-.041-.2-.325-.5-.741-.5z"/>
                          </svg>
                        )
                      },
                      tidal: {
                        name: 'TIDAL',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#000000">
                            <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004-4.004 4.004 4.004 4.004 4.004-4.004 4.004 4.004 4.004-4.004-4.004-4.004 4.004-4.004 4.004 4.004 4.004-4.004-4.004-4.004L24 3.992 19.996 0 16 3.992l-3.988-3.988z"/>
                          </svg>
                        )
                      },
                      deezer: {
                        name: 'Deezer',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#FEAA2D">
                            <path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38h-5.19zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027h-5.19zm6.271 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03h-5.19zm6.271 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19z"/>
                          </svg>
                        )
                      },
                      amazon_music: {
                        name: 'Amazon Music',
                        icon: (
                          <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#00A8E1">
                            <path d="M19.071 18.898c-.282.155-.691.207-.972.07-.698-.35-1.363-.758-1.994-1.215-.592-.428-1.14-.91-1.634-1.442.576-.485 1.074-1.05 1.476-1.68.254-.393.483-.804.684-1.227.052-.11.1-.222.145-.336.045-.115.087-.232.125-.35.038-.117.073-.236.104-.356.031-.12.058-.242.081-.364.046-.244.08-.49.1-.737.02-.246.028-.494.022-.742-.012-.495-.068-.988-.168-1.474-.1-.485-.243-.961-.43-1.422-.186-.46-.416-.902-.686-1.318-.27-.416-.58-.805-.925-1.16-.345-.355-.723-.676-1.131-.958-.408-.281-.843-.52-1.298-.713-.455-.193-.928-.338-1.41-.434-.482-.095-.971-.14-1.46-.135-.978.01-1.948.18-2.872.502-.924.32-1.794.787-2.574 1.376-.78.59-1.464 1.296-2.028 2.093-.564.798-.999 1.68-1.288 2.61-.289.932-.429 1.905-.414 2.878.015.973.185 1.943.507 2.867.322.924.789 1.794 1.378 2.574.59.78 1.295 1.464 2.092 2.028.798.564 1.68.999 2.61 1.288.932.289 1.905.428 2.878.413.486-.007.972-.051 1.452-.13.48-.079.955-.195 1.42-.347.464-.152.917-.34 1.355-.562.438-.221.86-.477 1.26-.764.198-.143.39-.293.576-.45.186-.156.366-.32.538-.49.043-.042.085-.086.127-.13.042-.044.083-.089.124-.134.082-.091.162-.183.24-.277.078-.094.154-.19.228-.287.147-.194.287-.393.42-.597.133-.203.259-.411.378-.623.119-.212.23-.428.334-.647.104-.22.2-.442.288-.668.044-.113.086-.227.126-.342.04-.115.078-.23.113-.347l-.014-.004c-.064.032-.13.062-.197.09-.067.028-.135.055-.204.079-.138.05-.28.093-.423.13-.143.038-.289.07-.436.095-.147.026-.295.046-.444.06-.149.014-.298.022-.448.024-.3.004-.6-.017-.896-.063-.296-.046-.588-.117-.872-.212-.284-.096-.56-.215-.826-.357-.266-.143-.521-.307-.762-.492-.24-.185-.467-.39-.676-.612-.209-.222-.4-.46-.571-.712-.171-.252-.321-.518-.45-.795-.128-.277-.233-.564-.316-.858-.083-.294-.142-.595-.178-.9-.036-.303-.049-.61-.037-.916.012-.306.048-.611.108-.912.06-.301.143-.598.25-.887.107-.289.236-.57.388-.84.152-.27.325-.529.52-.772.194-.243.408-.47.64-.679.232-.208.481-.397.745-.566.263-.168.54-.316.828-.44.287-.125.586-.227.891-.304.306-.077.618-.13.934-.158.316-.028.634-.031.952-.009.318.022.634.07.945.142.311.072.617.17.914.292.297.122.585.268.86.436.276.169.54.36.789.57.249.21.482.44.698.686.216.247.413.51.59.788.178.277.335.568.47.871.135.303.247.616.337.937.089.32.154.648.195.98.041.332.058.667.051 1.002-.007.335-.038.67-.094 1-.055.33-.134.657-.236.976-.102.319-.227.63-.374.93-.147.3-.315.588-.503.862-.376.55-.815 1.054-1.307 1.498-.491.444-1.032.824-1.61 1.134-.29.155-.59.29-.897.403-.306.113-.62.204-.937.272.092.168.188.334.29.495.101.162.207.32.318.474.111.153.228.302.349.447.121.145.248.285.379.42.065.068.132.134.2.198.068.065.138.128.209.189.07.061.143.12.216.177.074.057.149.112.225.165.153.106.312.204.476.293.164.089.333.17.506.24.087.036.174.068.263.098.089.03.178.056.268.08.09.024.181.045.272.063.091.018.184.033.276.045.185.024.372.036.559.036.187 0 .374-.012.559-.036.185-.024.368-.06.547-.107.179-.047.355-.106.527-.175.172-.07.34-.15.503-.24.163-.09.32-.19.472-.298.152-.108.298-.225.437-.35.07-.062.138-.127.204-.193.066-.067.131-.135.194-.205.126-.14.245-.287.358-.438.112-.151.218-.308.316-.469.098-.161.19-.327.274-.496.084-.169.161-.342.23-.518.023-.058.045-.117.066-.176.021-.06.041-.119.06-.18.038-.12.073-.242.104-.364.031-.122.059-.246.083-.37-.114.052-.231.097-.35.135-.12.038-.241.07-.364.095z"/>
                          </svg>
                        )
                      }
                    }
                    const config = serviceConfig[service.platform] || { name: service.platform, icon: null }
                    return (
                      <a
                        key={service.platform}
                        href={service.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          {config.icon && <span className="shrink-0">{config.icon}</span>}
                          <span className="text-sm font-medium text-gray-900">{config.name}</span>
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Open in Spotify button */}
            <div className="p-3 pt-0">
              <a
                href={spotifyModalData.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 px-4 rounded-full bg-[#1DB954] text-white text-center text-sm font-medium hover:bg-[#1ed760] transition-colors"
              >
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}
    </SpotifyModalContext.Provider>
  )
}

interface PublicBlockRendererProps {
  block: OnePageBlock
  theme: OnePageTheme
  profile: {
    title: string
    bio: string
    avatar_url: string | null
    avatar_video_url?: string | null
    avatar_video_crop?: { x: number; y: number; width: number; height: number } | null
    social_links: any
  }
  onepageId: string
  sellerId: string | null
  isDesktop?: boolean
  settings?: any
  isInsideCarousel?: boolean
  isInsideGroup?: boolean
}

// Verified Badge Component with tooltip
function VerifiedBadge({ isDesktop = false, badgeType }: { isDesktop?: boolean; badgeType?: string }) {
  // 10% bigger: desktop 22 -> 24, mobile 18 -> 20
  const size = isDesktop ? 24 : 20
  const badgeLabels: Record<string, string> = {
    verified_creator: "Verified Creator",
    verified_brand: "Verified Brand",
    verified_business: "Verified Business",
    official_page: "Official Page",
    verified_artist: "Verified Artist",
  }
  const label = badgeLabels[badgeType || "verified_creator"] || "Verified"

  return (
    <span className="group relative inline-flex items-center ml-1.5">
      <svg viewBox="0 0 22 22" width={size} height={size}>
        {/* Blue badge background */}
        <path
          fill="#3b82f6"
          d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"
        />
        {/* White checkmark */}
        <path
          fill="#ffffff"
          d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"
        />
      </svg>
      <span
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50"
        style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}
      >
        {label}
      </span>
    </span>
  )
}

// Group Block Carousel Component with full interactivity
function GroupBlockRenderer({
  data,
  theme,
  profile,
  onepageId,
  sellerId,
  isDesktop,
  settings,
}: {
  data: GroupBlockData
  theme: OnePageTheme
  profile: { display_name?: string; profile_image_url?: string | null } | null
  onepageId: string
  sellerId: string | null
  isDesktop: boolean
  settings?: { filled_icons?: boolean }
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [scrollStart, setScrollStart] = useState(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const enabledChildren = data.children.filter(c => c.enabled)
  const gap = isDesktop ? 16 : 12 // gap-3 = 12px, sm:gap-4 = 16px

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

  // Handle scroll to update current index - use requestAnimationFrame for smooth updates
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return
    requestAnimationFrame(() => {
      if (!scrollContainerRef.current) return
      const container = scrollContainerRef.current
      const scrollPosition = container.scrollLeft
      const containerWidth = container.clientWidth
      const scrollWidth = container.scrollWidth
      const itemWidth = (containerWidth * itemWidthPercent) / 100
      const newIndex = Math.round(scrollPosition / (itemWidth + gap))
      
      setCurrentIndex(Math.min(Math.max(0, newIndex), enabledChildren.length - 1))
      setCanScrollLeft(scrollPosition > 5)
      setCanScrollRight(scrollPosition < scrollWidth - containerWidth - 5)
    })
  }, [itemWidthPercent, gap, enabledChildren.length])

  // Initial scroll state check
  useEffect(() => {
    handleScroll()
  }, [handleScroll])

  // Scroll to specific index
  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) return
    const container = scrollContainerRef.current
    const containerWidth = container.clientWidth
    const itemWidth = (containerWidth * itemWidthPercent) / 100
    const targetScroll = index * (itemWidth + gap)
    container.scrollTo({ left: targetScroll, behavior: 'smooth' })
  }

  // Navigate to previous slide
  const goToPrev = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newIndex = Math.max(0, currentIndex - 1)
    scrollToIndex(newIndex)
  }

  // Navigate to next slide
  const goToNext = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newIndex = Math.min(enabledChildren.length - 1, currentIndex + 1)
    scrollToIndex(newIndex)
  }

  // Mouse drag handlers for desktop
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

  const handleMouseLeave = () => {
    handleMouseUp()
    setIsHovering(false)
  }

  // Touch handlers for mobile swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return
    setStartX(e.touches[0].pageX)
    setScrollStart(scrollContainerRef.current.scrollLeft)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!scrollContainerRef.current) return
    const diff = e.touches[0].pageX - startX
    scrollContainerRef.current.scrollLeft = scrollStart - diff
  }

  // Render carousel layout
  const renderCarousel = () => {
    const itemStyle = {
      width: `calc(${itemWidthPercent}% - ${gap}px)`,
      minWidth: `calc(${itemWidthPercent}% - ${gap}px)`,
    }

    return (
      <div
        className="w-full relative"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={handleMouseLeave}
      >
        {/* Fade on left edge */}
        {data.carousel_fade_edges && (
          <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-r from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Left Arrow Navigation - Desktop only, smooth fade in */}
        {isDesktop && canScrollLeft && (
          <button
            onClick={goToPrev}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 z-20",
              "w-10 h-10 rounded-full",
              "bg-white/95 shadow-lg",
              "flex items-center justify-center",
              "transition-all duration-300 ease-out",
              "hover:opacity-80",
              isHovering ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2 pointer-events-none"
            )}
            style={{ color: theme.button_color }}
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* Scrollable Container - use negative margins to allow shadow overflow */}
        <div
          ref={scrollContainerRef}
          className={cn(
            "w-full scrollbar-hide snap-x snap-mandatory",
            isDragging ? "cursor-grabbing select-none" : "cursor-grab"
          )}
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
            overflowX: 'auto',
            marginTop: '-8px',
            marginBottom: '-8px',
            paddingTop: '8px',
            paddingBottom: '8px',
          }}
          onScroll={handleScroll}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
        >
          <div
            className="flex"
            style={{
              gap: `${gap}px`,
              padding: '12px 5px 20px 5px',
            }}
          >
            {enabledChildren.map((child) => (
              <div
                key={child.id}
                className="shrink-0 snap-start"
                style={itemStyle}
              >
                <div className="w-full" style={{ overflow: 'visible' }}>
                  <PublicBlockRenderer
                    block={child}
                    theme={theme}
                    profile={profile}
                    onepageId={onepageId}
                    sellerId={sellerId}
                    isDesktop={isDesktop}
                    settings={settings}
                    isInsideCarousel={true}
                    isInsideGroup={true}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Arrow Navigation - Desktop only, smooth fade in */}
        {isDesktop && canScrollRight && (
          <button
            onClick={goToNext}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 z-20",
              "w-10 h-10 rounded-full",
              "bg-white/95 shadow-lg",
              "flex items-center justify-center",
              "transition-all duration-300 ease-out",
              "hover:opacity-80",
              isHovering ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
            )}
            style={{ color: theme.button_color }}
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}

        {/* Fade on right edge */}
        {data.carousel_fade_edges && (
          <div className="absolute right-0 top-0 bottom-0 w-6 sm:w-8 bg-gradient-to-l from-black/20 to-transparent z-10 pointer-events-none" />
        )}

        {/* Dots navigation - clickable, updates based on scroll position */}
        {enabledChildren.length > 1 && (
          <div className="flex justify-center gap-2 mt-3">
            {enabledChildren.map((_, index) => (
              <button
                key={index}
                onClick={() => scrollToIndex(index)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  index === currentIndex ? "w-5" : "w-2"
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
    <div 
      className="w-full flex flex-col gap-3 sm:gap-4"
      style={{
        padding: '8px 12px 12px 12px',
        overflow: 'visible',
      }}
    >
      {enabledChildren.map((child) => (
        <div key={child.id} className="w-full" style={{ overflow: 'visible' }}>
          <PublicBlockRenderer
            block={child}
            theme={theme}
            profile={profile}
            onepageId={onepageId}
            sellerId={sellerId}
            isDesktop={isDesktop}
            settings={settings}
            isInsideGroup={true}
          />
        </div>
      ))}
    </div>
  )

  return (
    <div 
      className="w-full flex flex-col gap-3"
      style={{
        marginLeft: '-8px',
        marginRight: '-8px',
        width: 'calc(100% + 16px)',
        overflow: 'visible',
      }}
    >
      {data.title && (
        <h3 
          className="text-sm font-medium text-center opacity-70 px-4" 
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

function PublicBlockRenderer({
  block,
  theme,
  profile,
  onepageId,
  sellerId,
  isDesktop = false,
  settings,
  isInsideCarousel = false,
  isInsideGroup = false,
}: PublicBlockRendererProps) {
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // Use context for Spotify modal - renders at root level to prevent clipping
  const spotifyModalContext = useContext(SpotifyModalContext)

  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  // Subtle opacity fade on hover - disabled inside carousel or group (no hover animation in carousel/group)
  const hoverEffect = (isInsideCarousel || isInsideGroup) ? "" : "hover:opacity-90 transition-opacity"

  const trackClick = async (blockId: string, url: string) => {
    try {
      await fetch("/api/onepage/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onepage_id: onepageId, block_id: block.id, event_type: "click", url }),
      })
    } catch (e) {
      console.error("Track error:", e)
    }
  }

  // Spotify URL helper
  const isSpotifyUrl = (url: string): boolean => {
    if (!url) return false
    return url.includes('spotify.com') || url.includes('open.spotify.com')
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

  // Open Spotify modal via context
  const openSpotifyModal = (data: LinkButtonBlockData) => {
    const spotifyInfo = getSpotifyInfo(data.url)
    if (spotifyInfo && spotifyModalContext) {
      spotifyModalContext.openSpotifyModal({
        title: data.label || 'Listen on Spotify',
        spotifyUrl: data.url,
        embedUrl: spotifyInfo.embedUrl,
        streamingServices: data.streaming_services,
        spotifyMode: data.spotify_mode || 'audio_preview'
      })
    }
  }

  // Parse gradient to get colors for fade
  const getGradientBottomColor = () => {
    if (theme.background_type === "gradient" && theme.background_gradient) {
      const colorMatches = theme.background_gradient.match(
        /#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb$$[^)]+$$|rgba$$[^)]+$$/g,
      )
      if (colorMatches && colorMatches.length > 0) {
        return colorMatches[colorMatches.length - 1]
      }
    }
    return theme.background_color
  }

  if (!block || !block.type) return null

  switch (block.type) {
    case "header": {
      const data = (block.data || {}) as HeaderBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const hasVideo = !!profile.avatar_video_url

      // Hero layout with SMOOTH fade using mask
      if (headerLayout === "hero" && (profile.avatar_url || hasVideo)) {
        // For gradient backgrounds, use mask-image for seamless fade
        const isGradientBg = theme.background_type === "gradient"
        const fadeColor = getGradientBottomColor()

        // MOBILE: 30% taller hero (aspect ratio 4/3 instead of 16/9)
        // DESKTOP: 15% shorter than before (aspect ratio 7/5 instead of 6/5)
        const aspectRatio = isDesktop ? "7/5" : "4/3"
        const heroMargin = isDesktop ? "-mx-7 -mt-0" : "-mx-5 -mt-8"
        const heroWidth = isDesktop ? "w-[calc(100%+56px)]" : "w-[calc(100%+40px)]"

        return (
          <div className={cn(heroWidth, "relative mb-2 md:mb-1", heroMargin)}>
            <div className="relative w-full" style={{ aspectRatio }}>
              {hasVideo ? (
                <div className="w-full h-full overflow-hidden">
                  <video
                    ref={videoRef}
                    src={profile.avatar_video_url!}
                    className="w-full h-full object-cover"
                    style={
                      profile.avatar_video_crop
                        ? {
                            width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                            height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                            marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                            marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                          }
                        : { objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }
                    }
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
                </div>
              ) : (
                <img
                  src={profile.avatar_url! || "/placeholder.svg"}
                  alt=""
                  className="w-full h-full object-cover"
                  style={{
                    imageRendering: "auto",
                    objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%`,
                  }}
                  loading="eager"
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
            <div
              className={cn(
                "absolute left-0 right-0 text-center px-6",
                isDesktop ? "bottom-8" : "bottom-4 sm:bottom-6",
              )}
            >
              {data.show_name !== false &&
                ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
                  <img
                    src={(theme as any).title_logo_url || "/placeholder.svg"}
                    alt={profile.title || "Logo"}
                    className="mx-auto w-auto"
                    style={{
                      maxHeight:
                        (theme as any).title_size === "large"
                          ? isDesktop
                            ? "70px"
                            : "60px"
                          : isDesktop
                            ? "60px"
                            : "52px",
                      maxWidth:
                        (theme as any).title_size === "large"
                          ? isDesktop
                            ? "260px"
                            : "230px"
                          : isDesktop
                            ? "230px"
                            : "200px",
                      objectFit: "contain",
                      filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
                      marginTop: (theme as any).logo_position === "more_up" ? "-10px" : undefined,
                    }}
                  />
                ) : (
                  profile.title && (
                    <h1
                      className={cn(
                        "font-bold inline-flex items-center justify-center",
                        (theme as any).title_size === "large"
                          ? isDesktop
                            ? "text-[36px]"
                            : "text-[33px] sm:text-[37px]"
                          : isDesktop
                            ? "text-[31px]"
                            : "text-[27px] sm:text-[31px]",
                      )}
                      style={{
                        color: (theme as any).title_color || theme.text_color,
                        fontFamily: (theme as any).title_font || theme.font_family,
                        textShadow: "0 2px 8px rgba(0,0,0,0.4)",
                      }}
                    >
                      {profile.title}
                      {settings?.verified_badge_enabled && (
                        <VerifiedBadge isDesktop={isDesktop} badgeType={settings?.verified_badge_type} />
                      )}
                    </h1>
                  )
                ))}
              {data.show_bio !== false && profile.bio && (
                <p
                  className={cn("mt-2 max-w-sm mx-auto", isDesktop ? "text-base" : "text-sm sm:text-base")}
                  style={{
                    color: theme.secondary_text_color || theme.text_color,
                    textShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }}
                >
                  {profile.bio}
                </p>
              )}
            </div>
          </div>
        )
      }

      // Classic layout - AVATAR 10px BIGGER mobile, 5px BIGGER desktop, TITLE 5px BIGGER
      // Laser glow settings - glow travels along the avatar border
      const laserGlowEnabled = (theme as any).laser_glow_enabled
      const laserGlowColor = (theme as any).laser_glow_color || "#3b82f6"
      const laserGlowIntensity = (theme as any).laser_glow_intensity || "medium"
      // Glow intensity settings - reduced spread by 40%
      const glowSpread = laserGlowIntensity === "low" ? 4 : laserGlowIntensity === "hard" ? 8 : 6
      const glowOpacity = laserGlowIntensity === "low" ? 0.7 : laserGlowIntensity === "hard" ? 1 : 0.85
      // Avatar size increased by 3px
      const avatarSize = isDesktop ? 110 : 103

      return (
        <div className={cn("flex flex-col items-center gap-3 sm:gap-4 w-full text-center")}>
          {data.show_avatar !== false && (
            <div className="relative" style={{ width: avatarSize, height: avatarSize, marginTop: isDesktop ? 25 : 0 }}>
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
                    className="rounded-full overflow-hidden border-2 shadow-lg w-full h-full"
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <video
                      ref={videoRef}
                      src={profile.avatar_video_url!}
                      className="object-cover"
                      style={
                        profile.avatar_video_crop
                          ? {
                              width: `${100 / (profile.avatar_video_crop.width / 100)}%`,
                              height: `${100 / (profile.avatar_video_crop.height / 100)}%`,
                              marginLeft: `-${profile.avatar_video_crop.x / (profile.avatar_video_crop.width / 100)}%`,
                              marginTop: `-${profile.avatar_video_crop.y / (profile.avatar_video_crop.height / 100)}%`,
                              transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                            }
                          : {
                              width: "100%",
                              height: "100%",
                              transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                            }
                      }
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  </div>
                ) : (
                  <Avatar
                    className="border-2 shadow-lg w-full h-full"
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
                      className="text-2xl sm:text-3xl font-semibold"
                      style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
                    >
                      {profile.title?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
          {data.show_name !== false &&
            ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
              <img
                src={(theme as any).title_logo_url || "/placeholder.svg"}
                alt={profile.title || "Logo"}
                className="mx-auto w-auto my-2"
                style={{
                  maxHeight:
                    (theme as any).title_size === "large" ? (isDesktop ? "70px" : "60px") : isDesktop ? "60px" : "52px",
                  maxWidth:
                    (theme as any).title_size === "large"
                      ? isDesktop
                        ? "260px"
                        : "230px"
                      : isDesktop
                        ? "230px"
                        : "200px",
                  objectFit: "contain",
                  marginTop: (theme as any).logo_position === "more_up" ? "-5px" : undefined,
                }}
              />
            ) : (
              profile.title && (
                <h1
                  className={cn(
                    "font-bold text-center inline-flex items-center justify-center",
                    (theme as any).title_size === "large"
                      ? isDesktop
                        ? "text-[36px]"
                        : "text-[33px] sm:text-[37px]"
                      : isDesktop
                        ? "text-[31px]"
                        : "text-[27px] sm:text-[31px]",
                  )}
                  style={{
                    color: (theme as any).title_color || theme.text_color,
                    fontFamily: (theme as any).title_font || theme.font_family,
                  }}
                >
                  {profile.title}
                  {settings?.verified_badge_enabled && (
                    <VerifiedBadge isDesktop={isDesktop} badgeType={settings?.verified_badge_type} />
                  )}
                </h1>
              )
            ))}
          {data.show_bio !== false && profile.bio && (
            <p
              className="text-sm sm:text-base text-center leading-relaxed max-w-sm mx-auto"
              style={{ color: theme.secondary_text_color || `${theme.text_color}cc` }}
            >
              {profile.bio}
            </p>
          )}
        </div>
      )
    }

    case "social_row": {
      const data = (block.data || { platforms: [], style: "icons" }) as SocialRowBlockData
      const headerLayout = (theme as any).header_layout || "classic"
      const isHeroLayout = headerLayout === "hero"

      if (!data.platforms || data.platforms.length === 0) {
        const defaultLinks = []
        if (profile.social_links?.instagram)
          defaultLinks.push({ platform: "instagram" as const, url: profile.social_links.instagram })
        if (profile.social_links?.tiktok)
          defaultLinks.push({ platform: "tiktok" as const, url: profile.social_links.tiktok })
        if (profile.social_links?.youtube)
          defaultLinks.push({ platform: "youtube" as const, url: profile.social_links.youtube })
        if (profile.social_links?.twitter)
          defaultLinks.push({ platform: "twitter" as const, url: profile.social_links.twitter })
        if (profile.social_links?.spotify)
          defaultLinks.push({ platform: "spotify" as const, url: profile.social_links.spotify })
        if (defaultLinks.length === 0) return null
        data.platforms = defaultLinks
      }

      // Hero layout: move icons up more, Classic: add 2px padding top/bottom
      const layoutStyles = isHeroLayout ? "mt-[-18px] md:mt-[-22px] mb-4 md:mb-6" : "mt-[2px] mb-[2px]"

      return (
        <div className={cn("flex items-center justify-center gap-2.5 flex-wrap", layoutStyles)}>
          {data.platforms.map(({ platform, url }) => {
            const Icon = SocialIconsSVG[platform]
            if (!Icon || !url) return null
            return (
              <a
                key={platform} // Added key prop
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(block.id, url)}
                className={cn(
                  "flex items-center justify-center transition-all",
                  !isInsideCarousel && "hover:scale-110",
                  socialStyle === "filled" && "w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full",
                  socialStyle === "outline" && "w-[42px] h-[42px] sm:w-[46px] sm:h-[46px] rounded-full border-2",
                  socialStyle === "minimal" && "p-2.5",
                )}
                style={{
                  backgroundColor: socialStyle === "filled" ? `${socialColor}20` : "transparent",
                  borderColor: socialStyle === "outline" ? `${socialColor}40` : "transparent",
                }}
              >
                {/* Mobile: 20px (+2px), Desktop: 19px (+2px) */}
                <span className="w-[20px] h-[20px] sm:w-[19px] sm:h-[19px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
                  <Icon size={20} color={socialColor} />
                </span>
              </a>
            )
          })}
        </div>
      )
    }

    case "link_button": {
      const data = (block.data || { label: "", url: "" }) as LinkButtonBlockData
      if (!data.url) return null

      // Icon paths for thumbnails
      const ICON_PATHS: Record<string, string> = {
        'link': 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
        'external': 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
        'star': 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        'heart': 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
        'music': 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
        'video': 'M23 7l-7 5 7 5V7zM14 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z',
        'camera': 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
        'shopping': 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
        'gift': 'M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
        'book': 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
        'calendar': 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6zM16 2v4M8 2v4M3 10h18',
        'mail': 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
        'phone': 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
        'globe': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
        'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
        'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
        'file': 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
        'image': 'M3 3h18a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
        'coffee': 'M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3',
        'zap': 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
        // Platform icons
        'instagram': 'M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4H7.6m9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8 1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5 5 5 0 0 1-5 5 5 5 0 0 1-5-5 5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
        'twitter': 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
        'youtube': 'M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z',
        'tiktok': 'M16.8218 5.1344C16.0887 4.29394 15.648 3.19805 15.648 2H14.7293C14.9659 3.3095 15.7454 4.43326 16.8218 5.1344ZM8.3218 11.9048C6.73038 11.9048 5.43591 13.2004 5.43591 14.7931C5.43591 15.903 6.06691 16.8688 6.98556 17.3517C6.64223 16.8781 6.43808 16.2977 6.43808 15.6661C6.43808 14.0734 7.73255 12.7778 9.324 12.7778C9.62093 12.7778 9.90856 12.8288 10.1777 12.9124V9.40192C9.89927 9.36473 9.61628 9.34149 9.324 9.34149C9.27294 9.34149 9.22654 9.34614 9.1755 9.34614V12.0394C8.90176 11.9558 8.61873 11.9048 8.3218 11.9048ZM19.4245 6.67608V9.34614C17.6429 9.34614 15.9912 8.77501 14.6456 7.80911V14.7977C14.6456 18.2851 11.8108 21.127 8.32172 21.127C6.97621 21.127 5.7235 20.6998 4.69812 19.98C5.8534 21.2198 7.50049 22 9.32392 22C12.8083 22 15.6478 19.1627 15.6478 15.6707V8.68211C16.9933 9.64801 18.645 10.2191 20.4267 10.2191V6.78293C20.0787 6.78293 19.7446 6.74574 19.4245 6.67608ZM14.6456 14.7977V7.80911C15.9912 8.77501 17.6429 9.34614 19.4245 9.34614V6.67608C18.3945 6.45788 17.4899 5.90063 16.8218 5.1344C15.7454 4.43326 14.9704 3.3095 14.7245 2H12.2098L12.2051 15.7775C12.1495 17.3192 10.8782 18.5591 9.32393 18.5591C8.35884 18.5591 7.50977 18.0808 6.98085 17.3564C6.06219 16.8688 5.4312 15.9076 5.4312 14.7977C5.4312 13.205 6.72567 11.9094 8.31708 11.9094C8.61402 11.9094 8.90168 11.9605 9.17079 12.0441V9.35079C5.75598 9.42509 3 12.2298 3 15.6707C3 17.3331 3.64492 18.847 4.69812 19.98C5.7235 20.6998 6.97621 21.127 8.32172 21.127C11.8061 21.127 14.6456 18.2851 14.6456 14.7977Z',
        'spotify': 'M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 0 1-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 0 1-.277-1.215c3.809-.87 7.076-.496 9.712 1.115a.623.623 0 0 1 .207.857zm1.223-2.722a.78.78 0 0 1-1.072.257c-2.687-1.652-6.786-2.131-9.965-1.166a.78.78 0 0 1-.452-1.493c3.632-1.102 8.147-.568 11.232 1.329a.78.78 0 0 1 .257 1.073zm.105-2.835c-3.223-1.914-8.54-2.09-11.618-1.156a.935.935 0 0 1-.542-1.79c3.533-1.072 9.404-.865 13.115 1.338a.935.935 0 0 1-1.014 1.567l.059.041z',
        'facebook': 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
        'linkedin': 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
        'twitch': 'M21 2H3v16h5v4l4-4h5l4-4V2zm-10 9V7m5 4V7',
        'discord': 'M20.317 4.492c-1.53-.69-3.17-1.2-4.885-1.49a.075.075 0 0 0-.079.036c-.21.369-.444.85-.608 1.23a18.566 18.566 0 0 0-5.487 0 12.36 12.36 0 0 0-.617-1.23A.077.077 0 0 0 8.562 3c-1.714.29-3.354.8-4.885 1.491a.07.07 0 0 0-.032.027C.533 9.093-.32 13.555.099 17.961a.08.08 0 0 0 .031.055 20.03 20.03 0 0 0 5.993 2.98.078.078 0 0 0 .084-.026c.462-.62.874-1.275 1.226-1.963.021-.04.001-.088-.041-.104a13.201 13.201 0 0 1-1.872-.878.075.075 0 0 1-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 0 1 .078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 0 1 .079.009c.12.098.245.195.372.288a.075.075 0 0 1-.006.125c-.598.344-1.22.635-1.873.877a.075.075 0 0 0-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 0 0 .084.028 19.963 19.963 0 0 0 6.002-2.981.076.076 0 0 0 .032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 0 0-.031-.028zM8.02 15.278c-1.182 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.312-.946 2.38-2.157 2.38z',
        'telegram': 'M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-16.5 7.5a2.25 2.25 0 0 0 .126 4.303l3.2 1.067 1.493 4.8a1.5 1.5 0 0 0 2.368.671l2.441-1.953 4.195 3.209a2.25 2.25 0 0 0 3.541-1.332l3-15A2.25 2.25 0 0 0 21.198 2.433zM6.988 13.678l7.25-4.812-5.5 5.562-.75 3z',
        'whatsapp': 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
        'pinterest': 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
        'snapchat': 'M11.99 2.75c-1.494-.011-3.017.567-4.003 1.714-.874.926-1.204 2.238-1.16 3.483-.004.64.004 1.28.006 1.92-.613-.152-1.234-.578-1.882-.367-.553.164-.783.886-.45 1.349.36.47.918.738 1.385 1.089.229.188.538.321.71.562 0 .577-.303 1.112-.59 1.599-.7 1.099-1.786 1.93-2.956 2.509-.3.129-.572.518-.309.812.485.453 1.167.598 1.77.811.256.08.635.168.608.507.042.365.276.758.687.76.982.114 2.036.065 2.918.59.868.501 1.756 1.059 2.777 1.117 1.02.1 2.08-.111 2.958-.663.654-.36 1.292-.81 2.06-.883.645-.15 1.338-.015 1.96-.26.4-.17.35-.66.51-.984.32-.22.72-.243 1.07-.388.46-.183 1.04-.332 1.27-.802.14-.38-.29-.586-.56-.734-1.42-.734-2.7-1.87-3.27-3.4-.06-.24-.29-.6.01-.78.62-.52 1.43-.82 1.94-1.46.39-.488.12-1.318-.52-1.418-.618-.098-1.19.24-1.77.391-.051-1.068.063-2.152-.102-3.218-.304-1.726-1.69-3.145-3.35-3.64-.565-.18-1.158-.25-1.746-.25z',
        'github': 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
        'apple-music': 'M8.5 7.5l10-1.75m-10 1.75v11.375m0-11.375V5.09a1 1 0 0 1 .83-.99l8-1.4a1.17 1.17 0 0 1 1.17.99V5.75m0 0v11.125m-12.31.154l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94zm10-2l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94z',
      }
      // Icons that should be rendered with fill instead of stroke
      const FILLED_ICONS = new Set([
        'instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin',
        'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat',
        'github', 'apple-music'
      ])
      const iconPath = data.icon ? ICON_PATHS[data.icon] : null
      const isFilledIcon = data.icon ? FILLED_ICONS.has(data.icon) : false

      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
      // Convert hex to rgba for shadow
      const hexToRgba = (hex: string, alpha: number) => {
        const r = Number.parseInt(hex.slice(1, 3), 16)
        const g = Number.parseInt(hex.slice(3, 5), 16)
        const b = Number.parseInt(hex.slice(5, 7), 16)
        return `rgba(${r},${g},${b},${alpha})`
      }
      const shadowStyles: Record<string, string> = {
        none: "none",
        subtle: `0 2px 4px ${hexToRgba(shadowColor, 0.15)}`,
        strong: `0 4px 12px ${hexToRgba(shadowColor, 0.3)}`,
        hard: `4px 4px 0px ${hexToRgba(shadowColor, 0.9)}`,
      }

      const buttonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "filled"
            ? theme.button_color
            : theme.button_style === "glass"
              ? `${theme.button_color}`
              : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth:
          theme.button_style === "outline"
            ? `${theme.button_border_width || 2}px`
            : theme.button_style === "glass"
              ? "1px"
              : "0",
        borderColor:
          theme.button_style === "outline"
            ? theme.button_border_color
            : theme.button_style === "glass"
              ? `${theme.button_text_color}30`
              : "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
        boxShadow: shadowStyles[buttonShadow] || "none",
      }

      const hasThumbnail = !!data.thumbnail_url || !!iconPath

      // Pro Layout - Featured display with larger thumbnail
      if (data.layout_type === 'pro') {
        const displayMode = data.display_mode || 'cover'

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

        // Determine target URL based on mode
        const getTargetUrl = () => {
          switch (youtubeMode) {
            case 'open_profile':
              return data.youtube_channel_id
                ? `https://www.youtube.com/channel/${data.youtube_channel_id}`
                : data.url
            case 'open_latest':
              return data.youtube_latest_video_id
                ? `https://www.youtube.com/watch?v=${data.youtube_latest_video_id}`
                : data.url
            default:
              return data.url
          }
        }

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

        // For YouTube embeds (embed_video or embed_latest modes with valid video ID), render embed
        const shouldEmbed = (youtubeMode === 'embed_video' || youtubeMode === 'embed_latest') && effectiveVideoId
        if (shouldEmbed) {
          return (
            <div
              className={cn("w-full overflow-hidden font-medium text-sm sm:text-base", getAnimationClass(data.animation_type))}
              style={{
                ...buttonStyles,
                padding: 0,
              }}
            >
              {/* YouTube embed area */}
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
              {/* Title area */}
              <a
                href={getTargetUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(block.id, getTargetUrl())}
                className={cn("block w-full px-5 py-3.5 sm:py-4 text-center transition-opacity", !isInsideCarousel && "hover:opacity-80")}
                style={{
                  backgroundColor: theme.button_style === "filled" ? theme.button_color : 'transparent',
                }}
              >
                <span className="truncate font-medium" style={{ color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color }}>
                  {data.label || "Watch on YouTube"}
                </span>
              </a>
            </div>
          )
        }

        // For non-embed modes (open_profile, open_latest) or Pro Layout links, use target URL
        const targetUrl = getTargetUrl()
        
        // Check if Pro layout should open Spotify modal
        const proSpotifyMode = data.spotify_mode || 'go_to_url'
        const proShouldOpenSpotifyModal = isSpotifyUrl(data.url) && (proSpotifyMode === 'audio_preview' || proSpotifyMode === 'show_streaming') && spotifyModalContext

        // Pro layout content (shared between button and link)
        const proLayoutContent = (
          <>
            {/* Featured thumbnail area */}
            {data.thumbnail_url && (
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
                <img
                  src={data.thumbnail_url}
                  alt=""
                  className={cn(
                    "w-full",
                    displayMode === 'cover' && "h-full object-cover",
                    displayMode === 'contain' && "h-full object-contain",
                    displayMode === 'full' && "h-auto"
                  )}
                />
                {/* Play button overlay for YouTube open_video mode */}
                {youtubeVideoId && youtubeMode === 'open_video' && youtubeShowPlayButton && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className={cn(
                        "w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center backdrop-blur-sm transition-transform",
                        !isInsideCarousel && "group-hover:scale-110"
                      )}
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.55)',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                      }}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="w-5 h-5 sm:w-5 sm:h-5 ml-0.5"
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
              className="w-full px-5 py-3.5 sm:py-4 flex flex-col items-center justify-center overflow-hidden"
              style={{
                backgroundColor: theme.button_style === "filled" ? theme.button_color : 'transparent',
              }}
            >
              <span className="truncate font-medium max-w-full block" style={{ color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color }}>
                {data.label || "Link"}
              </span>
              {/* Spotify metadata display for Pro Layout */}
              {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                    opacity: 0.75
                  }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
            </div>
          </>
        )

        // If Pro layout should open Spotify modal, render as button
        if (proShouldOpenSpotifyModal) {
          return (
            <button
              type="button"
              onClick={() => {
                trackClick(block.id, data.url)
                openSpotifyModal(data)
              }}
              className={cn("w-full overflow-hidden font-medium text-sm sm:text-base transition-all cursor-pointer", hoverEffect, getAnimationClass(data.animation_type))}
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
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick(block.id, targetUrl)}
            className={cn("w-full overflow-hidden font-medium text-sm sm:text-base transition-all", hoverEffect, getAnimationClass(data.animation_type))}
            style={{
              ...buttonStyles,
              padding: 0,
            }}
          >
            {proLayoutContent}
          </a>
        )
      }

      // Default Layout - thumbnail on left
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
        return (
          <button
            type="button"
            onClick={() => {
              trackClick(block.id, data.url)
              openSpotifyModal(data)
            }}
            className={cn(
              "w-full flex items-center gap-3 py-3.5 sm:py-4 px-5 sm:px-6 font-medium text-sm sm:text-base transition-all cursor-pointer text-left",
              hoverEffect,
              hasThumbnail ? "justify-start" : "justify-center",
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className="w-10 h-10 sm:w-11 sm:h-11 rounded object-cover shrink-0"
              />
            ) : iconPath ? (
              <svg
                className="w-10 h-10 sm:w-11 sm:h-11 shrink-0"
                viewBox="0 0 24 24"
                fill={isFilledIcon ? "currentColor" : "none"}
                stroke={isFilledIcon ? "none" : "currentColor"}
                strokeWidth={isFilledIcon ? "0" : "2"}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={iconPath} />
              </svg>
            ) : null}
            <div className={cn("flex flex-col min-w-0", hasThumbnail ? "flex-1 text-center" : "")}>
              <span className="truncate">{data.label || "Link"}</span>
              {/* Spotify info display */}
              {data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                    className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                    style={{
                      color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                      opacity: 0.75
                    }}
                  >
                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
              </div>
            </button>
          )
        }

      return (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(block.id, data.url)}
          className={cn(
            "w-full flex items-center gap-3 py-3.5 sm:py-4 px-5 sm:px-6 font-medium text-sm sm:text-base transition-all",
            hoverEffect,
            hasThumbnail ? "justify-start" : "justify-center",
            getDefaultAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {data.thumbnail_url ? (
            <img
              src={data.thumbnail_url}
              alt=""
              className="w-10 h-10 sm:w-11 sm:h-11 rounded object-cover shrink-0"
            />
          ) : iconPath ? (
            <svg
              className="w-10 h-10 sm:w-11 sm:h-11 shrink-0"
              viewBox="0 0 24 24"
              fill={isFilledIcon ? "currentColor" : "none"}
              stroke={isFilledIcon ? "none" : "currentColor"}
              strokeWidth={isFilledIcon ? "0" : "2"}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={iconPath} />
            </svg>
          ) : null}
          <div className={cn("flex flex-col min-w-0", hasThumbnail ? "flex-1 text-center" : "")}>
            <span className="truncate">{data.label || "Link"}</span>
            {/* Spotify info display */}
            {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
              <span
                className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_style === "outline" ? theme.text_color : theme.button_text_color,
                  opacity: 0.75
                }}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
          </div>
        </a>
      )
    }

    case "text": {
      const data = (block.data || { content: "", alignment: "center" }) as TextBlockData
      return (
        <p
          className={cn(
            "text-sm sm:text-base leading-relaxed w-full",
            data.alignment === "left" ? "text-left" : data.alignment === "right" ? "text-right" : "text-center",
          )}
          style={{ color: theme.secondary_text_color || theme.text_color }}
        >
          {data.content}
        </p>
      )
    }

    case "divider": {
      const data = (block.data || { style: "space", height: 24 }) as DividerBlockData
      const height = data.height || 24
      if (data.style === "line") {
        return (
          <div className="w-full flex items-center" style={{ height: `${height}px` }}>
            <div className="w-full h-px" style={{ backgroundColor: `${theme.text_color}20` }} />
          </div>
        )
      }
      if (data.style === "dots") {
        return (
          <div className="w-full flex items-center justify-center gap-2" style={{ height: `${height}px` }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: `${theme.text_color}40` }} />
            ))}
          </div>
        )
      }
      return <div className="w-full" style={{ height: `${height}px` }} />
    }

    case "image": {
      const data = (block.data || { image_url: "" }) as ImageBlockData
      if (!data.image_url) return null

      const aspectRatioClass =
        data.aspect_ratio === "square"
          ? "aspect-square"
          : data.aspect_ratio === "video"
            ? "aspect-video"
            : data.aspect_ratio === "wide"
              ? "aspect-[2/1]"
              : ""

      const imageContent = (
        <div className={cn("w-full overflow-hidden rounded-xl sm:rounded-2xl", aspectRatioClass)}>
          <img
            src={data.image_url || "/placeholder.svg"}
            alt={data.alt_text || ""}
            className={cn("w-full", aspectRatioClass ? "h-full object-cover" : "h-auto")}
            loading="lazy"
          />
        </div>
      )

      if (data.link_url) {
        return (
          <a
            href={data.link_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackClick(block.id, data.link_url!)}
            className={cn("w-full block transition-opacity", !isInsideCarousel && "hover:opacity-90")}
          >
            {imageContent}
          </a>
        )
      }
      return imageContent
    }

    case "email_capture": {
      const data = (block.data || {
        headline: "Subscribe",
        placeholder: "Email",
        button_text: "Join",
        success_message: "Thanks!",
      }) as EmailCaptureBlockData

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || isSubmitting || emailSubmitted) return
        setIsSubmitting(true)

        try {
          const response = await fetch("/api/onepage/leads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              onepage_id: onepageId,
              email,
              block_id: block.id,
              lead_magnet_id: data.lead_magnet_id,
            }),
          })
          if (response.ok) setEmailSubmitted(true)
        } catch (error) {
          console.error("Submit error:", error)
        } finally {
          setIsSubmitting(false)
        }
      }

      // Handle email input change - reactivate button if modified after submission
      const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEmail(e.target.value)
        if (emailSubmitted) {
          setEmailSubmitted(false)
        }
      }

      return (
        <div
          className="w-full p-5 sm:p-6 rounded-xl sm:rounded-2xl"
          style={{ backgroundColor: `${theme.button_color}10` }}
        >
          <h3 className="text-base sm:text-lg font-semibold text-center mb-1" style={{ color: theme.text_color }}>
            {data.headline}
          </h3>
          {data.description && (
            <p
              className="text-xs sm:text-sm text-center mb-4"
              style={{ color: theme.secondary_text_color || theme.text_color }}
            >
              {data.description}
            </p>
          )}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder={data.placeholder || "Enter your email"}
              required
              disabled={isSubmitting}
              className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70"
              style={{ color: "#000" }}
            />
            <button
              type="submit"
              disabled={isSubmitting || emailSubmitted}
              className={cn("px-4 sm:px-5 py-2.5 sm:py-3 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed", !isInsideCarousel && "hover:opacity-90")}
              style={{ backgroundColor: theme.button_color, color: theme.button_text_color }}
            >
              {isSubmitting ? "..." : emailSubmitted ? "Subscribed!" : data.button_text || "Subscribe"}
            </button>
          </form>
          {emailSubmitted && (
            <p className="text-xs text-center mt-2 opacity-70" style={{ color: theme.text_color }}>
              {data.success_message || "Thanks for subscribing!"}
            </p>
          )}
        </div>
      )
    }

    case "group": {
      const data = (block.data || { layout: "stack", children: [] }) as GroupBlockData
      if (!data.children || data.children.length === 0) {
        return null
      }

      const enabledChildren = data.children.filter((child) => child.enabled !== false)
      if (enabledChildren.length === 0) {
        return null
      }

      const layout = data.layout || "stack"
      const isCarousel = layout === "carousel"

      // For carousel, we still use the GroupBlockRenderer for swipe functionality
      if (isCarousel) {
        return (
          <GroupBlockRenderer
            data={data}
            theme={theme}
            profile={profile}
            onepageId={onepageId}
            sellerId={sellerId}
            isDesktop={isDesktop}
            settings={settings}
          />
        )
      }

      // Stack layout: add padding around blocks so shadows have room to render
      return (
        <div className="w-full flex flex-col gap-3">
          {data.title && (
            <h3
              className="text-sm font-medium text-center opacity-70 px-4"
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
          <div className="w-full flex flex-col gap-4 sm:gap-5 py-3">
            {enabledChildren.map((child, index) => {
              const isFirst = index === 0
              const isLast = index === enabledChildren.length - 1

              return (
                <div
                  key={child.id}
                  className="w-full px-3"
                >
                  <PublicBlockRenderer
                    block={child}
                    theme={theme}
                    profile={profile}
                    onepageId={onepageId}
                    sellerId={sellerId}
                    isDesktop={isDesktop}
                    settings={settings}
                    isInsideGroup={true}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    default:
      return null
  }
}
