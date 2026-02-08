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
  ProductBlockData,
  PDFDocumentBlockData,
  FoodMenuBlockData,
  CalendlyBlockData,
} from "@/lib/onepage/types"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useState, useRef, useEffect, useCallback, createContext, useContext } from "react"
import { Bell, X, Check, Send, Link2, ChevronLeft, ChevronRight, ExternalLink, Loader2, Download, ShoppingBag, Calendar } from "lucide-react"
import { getLinksUrl } from "@/lib/url-helpers"

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

// Quick Checkout Modal Context - for free products with quick checkout enabled
interface QuickCheckoutModalContextType {
  openQuickCheckoutModal: (data: {
    productId: string
    productTitle: string
    productThumbnail?: string | null
    productSlug?: string | null
    ctaText: string
    blockBackgroundColor: string
    textColor: string
    buttonBorderRadius: number
  }) => void
  purchasedProducts: Record<string, { receiptToken: string; assets: DigitalAsset[] }>
  downloadPurchasedAsset: (productId: string) => void
}
const QuickCheckoutModalContext = createContext<QuickCheckoutModalContextType | null>(null)

// PDF Modal Context - allows PDF modals to render at root level instead of inside blocks
interface PDFModalContextType {
  openPdfModal: (data: {
    title: string
    description?: string
    pdfUrl: string
    previewButtonText?: string
  }) => void
}
const PDFModalContext = createContext<PDFModalContextType | null>(null)

// Modal visibility context - to hide buttons when fullscreen modals are open
interface ModalVisibilityContextType {
  isAnyModalOpen: boolean
  setIsAnyModalOpen: (open: boolean) => void
}
const ModalVisibilityContext = createContext<ModalVisibilityContextType>({ isAnyModalOpen: false, setIsAnyModalOpen: () => {} })

// Digital asset interface for downloads
interface DigitalAsset {
  id: string
  file_name: string
  file_path: string
}

// Quick Checkout Form Component - isolated to prevent parent re-renders on input changes
function QuickCheckoutFormContent({
  ctaText,
  error,
  onSubmit,
}: {
  ctaText: string
  error: string | null
  onSubmit: (data: { firstName: string; lastName: string; email: string }) => void
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  const handleSubmit = () => {
    if (firstName && lastName && email) {
      onSubmit({ firstName, lastName, email })
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 text-center mb-4">
        Enter your details to get instant access
      </p>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          required
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
          required
        />
      </div>
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all"
        required
      />

      <button
        onClick={handleSubmit}
        disabled={!firstName || !lastName || !email}
        className="w-full py-3.5 sm:py-3.5 px-4 rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-[0.98] text-base"
        style={{
          backgroundColor: '#000000',
          color: '#ffffff'
        }}
      >
        {ctaText || 'Get it Now'}
      </button>

      <p className="text-xs text-gray-400 text-center pb-4 sm:pb-0">
        You'll receive a confirmation email with your download link
      </p>
    </div>
  )
}

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
      panelBg: "rgba(255, 255, 255, 0.08)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.2)",
      iconColor: "text-white/80",
      textColor: "text-white/90",
      inputBg: "bg-white/10",
      inputBorder: "border-white/20",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/50",
      buttonSubmitBg: "bg-white/20 hover:bg-white/30",
      dotColor: "bg-white/60",
      shadow: "0 0 8px rgba(255, 255, 255, 0.6)",
    },
    // glassmorphism maps to glass style
    glassmorphism: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.08)",
      panelBorder: "1px solid rgba(255, 255, 255, 0.2)",
      iconColor: "text-white/80",
      textColor: "text-white/90",
      inputBg: "bg-white/10",
      inputBorder: "border-white/20",
      inputText: "text-white",
      inputPlaceholder: "placeholder-white/50",
      buttonSubmitBg: "bg-white/20 hover:bg-white/30",
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

  // Fallback to glass if style is not defined
  const s = styles[style as keyof typeof styles] || styles.glass
  const bellVisible = isOpen || isBellVisible
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Listen for PDF modal state changes
  useEffect(() => {
    const handlePdfModal = (e: CustomEvent<{ isOpen: boolean }>) => {
      setPdfModalOpen(e.detail.isOpen)
    }
    window.addEventListener('pdfModalStateChange', handlePdfModal as EventListener)
    return () => window.removeEventListener('pdfModalStateChange', handlePdfModal as EventListener)
  }, [])

  // On mobile, hide smoothly when PDF modal is open
  const hideForModal = pdfModalOpen && isMobile

  return (
    <div
      className={cn(
        "fixed top-4 right-4 sm:top-6 sm:right-6 z-[20] transition-[opacity,transform] duration-300 ease-out",
        bellVisible && !hideForModal ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none",
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
  themeBackgroundType,
  themeBackgroundColor,
  themeBackgroundGradient,
}: {
  pageUrl: string
  pageTitle: string
  avatarUrl?: string | null
  style?: "glass" | "white" | "black"
  showSubscribe?: boolean
  accentColor?: string
  themeBackgroundType?: "solid" | "gradient" | "image" | "video"
  themeBackgroundColor?: string
  themeBackgroundGradient?: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isShareVisible, setIsShareVisible] = useState(true)
  const [isShareContentReady, setIsShareContentReady] = useState(false)

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

  useEffect(() => {
    if (!isOpen) {
      setIsShareContentReady(false)
      return
    }
    const timer = window.setTimeout(() => setIsShareContentReady(true), 140)
    return () => window.clearTimeout(timer)
  }, [isOpen])

  // Adapt popup header background to theme - prioritize gradient, then solid color, then accent
  const getPopupHeaderBackground = () => {
    if (themeBackgroundType === "gradient" && themeBackgroundGradient) {
      return themeBackgroundGradient
    }
    if (themeBackgroundType === "solid" && themeBackgroundColor && themeBackgroundColor !== "#ffffff") {
      return themeBackgroundColor
    }
    // For image/video or white backgrounds, use accent color or default
    return accentColor || "#8B5CF6"
  }

  const popupHeaderBackground = getPopupHeaderBackground()

  const styles = {
    glass: {
      buttonBg: "rgba(255, 255, 255, 0.15)",
      buttonBorder: "1px solid rgba(255, 255, 255, 0.2)",
      panelBg: "rgba(255, 255, 255, 0.98)",
      iconColor: "text-white/80",
    },
    // glassmorphism maps to glass style
    glassmorphism: {
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

  // Fallback to glass if style is not defined
  const s = styles[style as keyof typeof styles] || styles.glass

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
  const positionClass = "fixed top-4 left-4 sm:top-6 sm:left-6 md:top-[22px] md:left-8 z-[20]"
  const shareVisible = isOpen || isShareVisible
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Listen for PDF modal state changes
  useEffect(() => {
    const handlePdfModal = (e: CustomEvent<{ isOpen: boolean }>) => {
      setPdfModalOpen(e.detail.isOpen)
    }
    window.addEventListener('pdfModalStateChange', handlePdfModal as EventListener)
    return () => window.removeEventListener('pdfModalStateChange', handlePdfModal as EventListener)
  }, [])

  // On mobile, hide smoothly when PDF modal is open
  const hideForModal = pdfModalOpen && isMobile

  const buttonWrapperClass = cn(
    "transition-[opacity,transform] duration-300 ease-out",
    shareVisible && !hideForModal ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none",
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
            {/* Profile preview card with background adapted to OnePage theme */}
            <div
              className="relative px-6 pt-8 pb-10"
              style={{
                background: popupHeaderBackground.includes('gradient') || popupHeaderBackground.includes('linear')
                  ? popupHeaderBackground
                  : `linear-gradient(135deg, ${popupHeaderBackground} 0%, ${popupHeaderBackground} 100%)`,
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

            {!isShareContentReady ? (
              <div className="px-5 pb-6 pt-2 animate-pulse">
                <div className="h-12 rounded-xl bg-gray-100 mb-4" />
                <div className="grid grid-cols-4 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <div className="w-[46px] h-[46px] rounded-full bg-gray-100" />
                      <div className="w-10 h-2.5 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <>
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
            </>
            )}
            <div className="px-5 pb-6">
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 overflow-hidden">
                    <img
                      src="https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/logostorelib.svg"
                      alt="Storelib"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">Create your own page</p>
                    <p className="text-xs text-gray-500 truncate">Build your store with Storelib</p>
                  </div>
                  <button
                    onClick={() => window.open("https://storelib.com", "_blank")}
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

  // Modal visibility state - to hide buttons when fullscreen modals are open
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)
  const modalVisibilityContextValue = { isAnyModalOpen, setIsAnyModalOpen }

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

  // Apple Music modal state - lifted to root level to prevent clipping in groups
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

  // PDF modal state - lifted to root level to ensure proper z-index stacking
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const [pdfModalData, setPdfModalData] = useState<{
    title: string
    description?: string
    pdfUrl: string
    previewButtonText?: string
  } | null>(null)
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfTotalPages, setPdfTotalPages] = useState(1)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfPages, setPdfPages] = useState<string[]>([])
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  const openPdfModal = useCallback((data: {
    title: string
    description?: string
    pdfUrl: string
    previewButtonText?: string
  }) => {
    setPdfModalData(data)
    setPdfModalOpen(true)
    setPdfLoading(true)
    setPdfCurrentPage(1)
    setPdfTotalPages(1)
    setPdfPages([])
  }, [])

  const closePdfModal = useCallback(() => {
    setPdfModalOpen(false)
  }, [])

  const pdfModalContextValue = { openPdfModal }

  // Load PDF.js and render pages when PDF modal opens
  useEffect(() => {
    if (pdfModalOpen && pdfModalData?.pdfUrl) {
      const loadPdfJs = async () => {
        try {
          // Check if already loaded
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

          // Load the PDF
          const loadingTask = pdfjsLib.getDocument(pdfModalData.pdfUrl)
          const pdf = await loadingTask.promise
          setPdfTotalPages(pdf.numPages)

          // Render each page to canvas and convert to image
          const pageImages: string[] = []
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i)
            const scale = 2 // Higher scale for better quality
            const viewport = page.getViewport({ scale })

            const canvas = document.createElement('canvas')
            const context = canvas.getContext('2d')
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({
              canvasContext: context,
              viewport: viewport
            }).promise

            pageImages.push(canvas.toDataURL('image/png'))
          }

          setPdfPages(pageImages)
          setPdfLoading(false)
        } catch (error) {
          console.error('PDF loading error:', error)
          setPdfLoading(false)
          // Fallback: just count pages from PDF structure
          try {
            const response = await fetch(pdfModalData.pdfUrl)
            const text = await response.text()
            const pageMatches = text.match(/\/Type\s*\/Page[^s]/g)
            if (pageMatches) {
              setPdfTotalPages(pageMatches.length)
            }
          } catch {
            // Ignore fallback errors
          }
        }
      }
      loadPdfJs()
    }
  }, [pdfModalOpen, pdfModalData?.pdfUrl])

  // Handle PDF scroll to track current page
  const handlePdfScroll = useCallback(() => {
    if (!pdfScrollRef.current || pdfPages.length === 0) return
    const container = pdfScrollRef.current
    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const pageHeight = container.scrollHeight / pdfTotalPages

    const currentPageIndex = Math.floor((scrollTop + containerHeight / 2) / pageHeight)
    setPdfCurrentPage(Math.min(Math.max(currentPageIndex + 1, 1), pdfTotalPages))
  }, [pdfPages.length, pdfTotalPages])

  // Quick Checkout modal state - for free products
  const [quickCheckoutModalOpen, setQuickCheckoutModalOpen] = useState(false)
  const [quickCheckoutModalData, setQuickCheckoutModalData] = useState<{
    productId: string
    productTitle: string
    productThumbnail?: string | null
    productSlug?: string | null
    ctaText: string
    blockBackgroundColor: string
    textColor: string
    buttonBorderRadius: number
  } | null>(null)
  const [quickCheckoutStep, setQuickCheckoutStep] = useState<'form' | 'loading' | 'success'>('form')
  const [quickCheckoutFormData, setQuickCheckoutFormData] = useState({ firstName: '', lastName: '', email: '' })
  const [quickCheckoutAssets, setQuickCheckoutAssets] = useState<DigitalAsset[]>([])
  const [quickCheckoutReceiptToken, setQuickCheckoutReceiptToken] = useState<string | null>(null)
  const [quickCheckoutError, setQuickCheckoutError] = useState<string | null>(null)

  // Purchased products tracking - persisted in localStorage
  const [purchasedProducts, setPurchasedProducts] = useState<Record<string, { receiptToken: string; assets: DigitalAsset[] }>>({})

  // Load purchased products from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('materia_purchased_products')
      if (stored) {
        setPurchasedProducts(JSON.parse(stored))
      }
    } catch (e) {
      console.error('Failed to load purchased products from localStorage:', e)
    }
  }, [])

  const openQuickCheckoutModal = useCallback((data: {
    productId: string
    productTitle: string
    productThumbnail?: string | null
    productSlug?: string | null
    ctaText: string
    blockBackgroundColor: string
    textColor: string
    buttonBorderRadius: number
  }) => {
    setQuickCheckoutModalData(data)
    setQuickCheckoutStep('form')
    setQuickCheckoutFormData({ firstName: '', lastName: '', email: '' })
    setQuickCheckoutAssets([])
    setQuickCheckoutReceiptToken(null)
    setQuickCheckoutError(null)
    setQuickCheckoutModalOpen(true)
  }, [])

  const handleQuickCheckoutSubmit = useCallback(async (formData: { firstName: string; lastName: string; email: string }) => {
    if (!quickCheckoutModalData || !formData.firstName || !formData.lastName || !formData.email) {
      return
    }

    setQuickCheckoutStep('loading')
    setQuickCheckoutError(null)
    // Store form data for success page email display
    setQuickCheckoutFormData(formData)

    try {
      const response = await fetch('/api/checkout/quick-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: quickCheckoutModalData.productId,
          first_name: formData.firstName,
          last_name: formData.lastName,
          email: formData.email,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Checkout failed')
      }

      setQuickCheckoutAssets(result.assets || [])
      setQuickCheckoutReceiptToken(result.receipt_token || null)
      setQuickCheckoutStep('success')

      // Save to localStorage for persistence
      if (quickCheckoutModalData?.productId && result.receipt_token) {
        try {
          const stored = localStorage.getItem('materia_purchased_products')
          const existing = stored ? JSON.parse(stored) : {}
          existing[quickCheckoutModalData.productId] = {
            receiptToken: result.receipt_token,
            assets: result.assets || [],
          }
          localStorage.setItem('materia_purchased_products', JSON.stringify(existing))
          setPurchasedProducts(existing)
        } catch (e) {
          console.error('Failed to save purchase to localStorage:', e)
        }
      }
    } catch (error: any) {
      setQuickCheckoutError(error.message || 'Something went wrong. Please try again.')
      setQuickCheckoutStep('form')
    }
  }, [quickCheckoutModalData])

  const handleQuickCheckoutDownload = useCallback(async (asset: DigitalAsset) => {
    if (!quickCheckoutReceiptToken) return

    try {
      const response = await fetch(`/api/download/${asset.id}?receipt=${quickCheckoutReceiptToken}`)
      const result = await response.json()

      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank')
      }
    } catch (error) {
      console.error('Download failed:', error)
    }
  }, [quickCheckoutReceiptToken])

  // Download function for already purchased products
  const downloadPurchasedAsset = useCallback(async (productId: string) => {
    const purchase = purchasedProducts[productId]
    if (!purchase || !purchase.receiptToken || !purchase.assets?.length) return

    // Download the first asset
    const asset = purchase.assets[0]
    try {
      const response = await fetch(`/api/download/${asset.id}?receipt=${purchase.receiptToken}`)
      const result = await response.json()
      if (result.downloadUrl) {
        window.open(result.downloadUrl, '_blank')
      }
    } catch (error) {
      console.error('Download failed:', error)
    }
  }, [purchasedProducts])

  const quickCheckoutModalContextValue = { openQuickCheckoutModal, purchasedProducts, downloadPurchasedAsset }

  // Safe defaults - MERGE theme with defaults to ensure all properties exist
  const safeTheme = {
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
    title_color: "#000000",
    title_font: "Inter",
    social_icon_color: "#000000",
    header_layout: "classic" as const,
    ...theme, // Spread theme to override defaults with actual values
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
      flowmaze: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 400 400"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id={`${idPrefix}-flowmaze`} width="400" height="400" patternUnits="userSpaceOnUse">
              <path d="M20 50 Q60 20, 100 50 Q140 80, 120 130 Q100 180, 60 170 Q20 160, 30 120 Q40 80, 80 90 Q120 100, 140 140 Q160 180, 130 220 Q100 260, 60 240 Q20 220, 40 180" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.5" />
              <path d="M180 30 Q220 10, 260 40 Q300 70, 280 120 Q260 170, 220 150 Q180 130, 200 90 Q220 50, 260 70 Q300 90, 320 140 Q340 190, 300 230 Q260 270, 220 250 Q180 230, 200 190 Q220 150, 270 170 Q320 190, 340 240" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.45" />
              <path d="M350 50 Q390 30, 400 80 Q395 130, 360 120 Q320 110, 340 70 Q360 30, 400 50" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
              <path d="M30 280 Q70 250, 110 280 Q150 310, 130 360 Q110 400, 70 380 Q30 360, 50 320 Q70 280, 110 300 Q150 320, 160 370" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.48" />
              <path d="M200 290 Q240 260, 280 290 Q320 320, 300 370 Q280 400, 240 385 Q200 370, 220 330 Q240 290, 290 310 Q340 330, 360 380 Q380 400, 370 400" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.42" />
              <path d="M60 350 Q100 370, 90 400 M160 260 Q200 240, 180 200 Q160 160, 120 180 Q80 200, 100 240" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.38" />
              <path d="M320 10 Q360 30, 350 70 Q340 110, 300 100 Q260 90, 280 50 Q300 10, 340 20" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.35" />
              <path d="M380 280 Q400 320, 380 360 Q360 400, 320 380 Q280 360, 310 320 Q340 280, 380 300" fill="none" stroke={patternColor} strokeWidth="8" strokeLinecap="round" opacity="0.4" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-flowmaze)`} />
        </svg>
      ),
      topographic: (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 1, opacity: patternOpacityValue }}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 300 300"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id={`${idPrefix}-topographic`} width="300" height="300" patternUnits="userSpaceOnUse">
              <ellipse cx="100" cy="100" rx="90" ry="80" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.3" />
              <ellipse cx="100" cy="100" rx="70" ry="62" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.35" />
              <ellipse cx="100" cy="100" rx="50" ry="44" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.4" />
              <ellipse cx="100" cy="100" rx="30" ry="26" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.45" />
              <ellipse cx="100" cy="100" rx="12" ry="10" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.5" />
              <ellipse cx="220" cy="200" rx="75" ry="90" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.28" />
              <ellipse cx="220" cy="200" rx="55" ry="70" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.33" />
              <ellipse cx="220" cy="200" rx="35" ry="50" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.38" />
              <ellipse cx="220" cy="200" rx="18" ry="30" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.43" />
              <ellipse cx="50" cy="250" rx="45" ry="40" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.3" />
              <ellipse cx="50" cy="250" rx="28" ry="25" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.38" />
              <ellipse cx="50" cy="250" rx="12" ry="10" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.45" />
              <ellipse cx="250" cy="50" rx="40" ry="45" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.32" />
              <ellipse cx="250" cy="50" rx="22" ry="28" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.4" />
              <ellipse cx="250" cy="50" rx="8" ry="12" fill="none" stroke={patternColor} strokeWidth="1.5" opacity="0.48" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${idPrefix}-topographic)`} />
        </svg>
      ),
      stars: (
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          style={{ zIndex: 1, opacity: patternOpacityValue * 0.8 }}
        >
          <style>{`
            @keyframes starTwinkle1 {
              0%, 100% { opacity: 0.2; }
              50% { opacity: 0.8; }
            }
            @keyframes starTwinkle2 {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 1; }
            }
            @keyframes starTwinkle3 {
              0%, 100% { opacity: 0.3; }
              50% { opacity: 0.7; }
            }
            .star-dot {
              position: absolute;
              border-radius: 50%;
              background: ${patternColor};
            }
            .star-1 { animation: starTwinkle1 3s ease-in-out infinite; }
            .star-2 { animation: starTwinkle2 4s ease-in-out infinite; animation-delay: 0.5s; }
            .star-3 { animation: starTwinkle3 5s ease-in-out infinite; animation-delay: 1s; }
            .star-4 { animation: starTwinkle1 4.5s ease-in-out infinite; animation-delay: 1.5s; }
            .star-5 { animation: starTwinkle2 3.5s ease-in-out infinite; animation-delay: 2s; }
          `}</style>
          {/* Generate subtle star dots across the screen */}
          <div className="star-dot star-1" style={{ width: '2px', height: '2px', top: '5%', left: '10%' }} />
          <div className="star-dot star-2" style={{ width: '1.5px', height: '1.5px', top: '12%', left: '25%' }} />
          <div className="star-dot star-3" style={{ width: '2px', height: '2px', top: '8%', left: '45%' }} />
          <div className="star-dot star-4" style={{ width: '1px', height: '1px', top: '15%', left: '60%' }} />
          <div className="star-dot star-5" style={{ width: '2px', height: '2px', top: '3%', left: '75%' }} />
          <div className="star-dot star-1" style={{ width: '1.5px', height: '1.5px', top: '18%', left: '88%' }} />
          <div className="star-dot star-2" style={{ width: '1px', height: '1px', top: '25%', left: '5%' }} />
          <div className="star-dot star-3" style={{ width: '2px', height: '2px', top: '22%', left: '35%' }} />
          <div className="star-dot star-4" style={{ width: '1.5px', height: '1.5px', top: '28%', left: '55%' }} />
          <div className="star-dot star-5" style={{ width: '1px', height: '1px', top: '20%', left: '70%' }} />
          <div className="star-dot star-1" style={{ width: '2px', height: '2px', top: '30%', left: '92%' }} />
          <div className="star-dot star-2" style={{ width: '1.5px', height: '1.5px', top: '35%', left: '15%' }} />
          <div className="star-dot star-3" style={{ width: '1px', height: '1px', top: '38%', left: '40%' }} />
          <div className="star-dot star-4" style={{ width: '2px', height: '2px', top: '32%', left: '65%' }} />
          <div className="star-dot star-5" style={{ width: '1.5px', height: '1.5px', top: '40%', left: '82%' }} />
          <div className="star-dot star-1" style={{ width: '1px', height: '1px', top: '45%', left: '8%' }} />
          <div className="star-dot star-2" style={{ width: '2px', height: '2px', top: '42%', left: '28%' }} />
          <div className="star-dot star-3" style={{ width: '1.5px', height: '1.5px', top: '48%', left: '50%' }} />
          <div className="star-dot star-4" style={{ width: '1px', height: '1px', top: '50%', left: '72%' }} />
          <div className="star-dot star-5" style={{ width: '2px', height: '2px', top: '44%', left: '95%' }} />
          <div className="star-dot star-1" style={{ width: '1.5px', height: '1.5px', top: '55%', left: '18%' }} />
          <div className="star-dot star-2" style={{ width: '1px', height: '1px', top: '58%', left: '38%' }} />
          <div className="star-dot star-3" style={{ width: '2px', height: '2px', top: '52%', left: '58%' }} />
          <div className="star-dot star-4" style={{ width: '1.5px', height: '1.5px', top: '60%', left: '78%' }} />
          <div className="star-dot star-5" style={{ width: '1px', height: '1px', top: '56%', left: '3%' }} />
          <div className="star-dot star-1" style={{ width: '2px', height: '2px', top: '65%', left: '22%' }} />
          <div className="star-dot star-2" style={{ width: '1.5px', height: '1.5px', top: '68%', left: '48%' }} />
          <div className="star-dot star-3" style={{ width: '1px', height: '1px', top: '62%', left: '68%' }} />
          <div className="star-dot star-4" style={{ width: '2px', height: '2px', top: '70%', left: '85%' }} />
          <div className="star-dot star-5" style={{ width: '1.5px', height: '1.5px', top: '66%', left: '12%' }} />
          <div className="star-dot star-1" style={{ width: '1px', height: '1px', top: '75%', left: '32%' }} />
          <div className="star-dot star-2" style={{ width: '2px', height: '2px', top: '78%', left: '52%' }} />
          <div className="star-dot star-3" style={{ width: '1.5px', height: '1.5px', top: '72%', left: '75%' }} />
          <div className="star-dot star-4" style={{ width: '1px', height: '1px', top: '80%', left: '90%' }} />
          <div className="star-dot star-5" style={{ width: '2px', height: '2px', top: '76%', left: '6%' }} />
          <div className="star-dot star-1" style={{ width: '1.5px', height: '1.5px', top: '85%', left: '42%' }} />
          <div className="star-dot star-2" style={{ width: '1px', height: '1px', top: '88%', left: '62%' }} />
          <div className="star-dot star-3" style={{ width: '2px', height: '2px', top: '82%', left: '80%' }} />
          <div className="star-dot star-4" style={{ width: '1.5px', height: '1.5px', top: '90%', left: '20%' }} />
          <div className="star-dot star-5" style={{ width: '1px', height: '1px', top: '92%', left: '55%' }} />
          <div className="star-dot star-1" style={{ width: '2px', height: '2px', top: '95%', left: '35%' }} />
          <div className="star-dot star-2" style={{ width: '1.5px', height: '1.5px', top: '97%', left: '70%' }} />
        </div>
      ),
    }

    return patterns[patternType] || null
  }

  const pageUrl = getLinksUrl(onepage.slug)

  // Page content component
  const PageContent = ({ isDesktop = false }: { isDesktop?: boolean }) => (
    <div
      className={cn("relative z-10 w-full flex flex-col min-h-full", isDesktop ? "max-w-full" : "max-w-lg mx-auto")}
      style={{
        paddingLeft: isDesktop ? "28px" : "20px",
        paddingRight: isDesktop ? "28px" : "20px",
        // More top padding on mobile to push avatar/content down
        paddingTop: isDesktop ? "0" : ((safeTheme as any).header_layout === "hero" ? "0" : "50px"),
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
          .map((block, index) => (
            <div
              key={block.id}
              className="w-full animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <PublicBlockRenderer
                block={block}
                theme={safeTheme}
                profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                onepageId={onepage.id}
                sellerId={seller_id}
                isDesktop={isDesktop}
                settings={safeSettings}
              />
            </div>
          ))}
      </div>
      {/* Footer - pushed to bottom */}
      <div className="mt-auto pt-10 pb-4">
        {safeSettings.show_branding && (
          <div className="text-center mb-4">
            <a
              href="https://storelib.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-4 pt-2 pb-[10px] rounded-full text-sm font-medium bg-white text-gray-900 hover:bg-gray-100 transition-colors shadow-[0_2px_8px_rgba(0,0,0,0.12)]"
            >
              {sellerName} on Storelib
            </a>
          </div>
        )}
        {/* Footer Links */}
        <div className="flex items-center justify-center gap-4 text-xs">
          <a
            href="https://storelib.com/legal/privacy#cookies"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
          >
            Cookies
          </a>
          <a
            href="https://storelib.com/legal/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: isDarkBackground ? "#9ca3af" : "#1f2937" }}
          >
            Privacy
          </a>
          <a
            href="https://storelib.com/legal/terms"
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
    <ModalVisibilityContext.Provider value={modalVisibilityContextValue}>
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
    <AppleMusicModalContext.Provider value={appleMusicModalContextValue}>
    <QuickCheckoutModalContext.Provider value={quickCheckoutModalContextValue}>
    <PDFModalContext.Provider value={pdfModalContextValue}>
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
          themeBackgroundType={safeTheme.background_type}
          themeBackgroundColor={safeTheme.background_color}
          themeBackgroundGradient={safeTheme.background_gradient}
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
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              backgroundImage: `url(${safeTheme.background_image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
              transform: "translateZ(0)",
              willChange: "transform",
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
            {/* Video background inside card - NO blur, cover fit */}
            {safeTheme.background_type === "video" && (safeTheme as any).background_video_url && (
              <video
                src={(safeTheme as any).background_video_url}
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
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              backgroundImage: `url(${safeTheme.background_image_url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "fixed",
              zIndex: 0,
              filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
              transform: "translateZ(0)",
              willChange: "transform",
            }}
          />
        )}

        {/* Video background for mobile */}
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

            {/* Streaming Services - text only, no icons */}
            {spotifyModalData.spotifyMode === 'show_streaming' && spotifyModalData.streamingServices && spotifyModalData.streamingServices.filter(s => s.found && s.url).length > 0 && (
              <div className="px-3 pb-3">
                <p className="text-xs font-medium text-gray-700 mb-2">Listen on</p>
                <div className="space-y-1.5">
                  {spotifyModalData.streamingServices.filter(s => s.found && s.url).map((service) => {
                    const names: Record<string, string> = {
                      apple_music: 'Apple Music',
                      youtube_music: 'YouTube Music',
                      spotify: 'Spotify',
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
                        className="flex items-center justify-between p-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-sm font-medium text-gray-900">{names[service.platform] || service.platform}</span>
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
                className="block w-full py-2.5 px-4 rounded-full bg-black text-white text-center text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Open in Spotify
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Apple Music Modal - clean, compact, responsive design */}
      {appleMusicModalOpen && appleMusicModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setAppleMusicModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-[360px] overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="am-public-modal-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                      <stop offset="0" stopColor="#FA233B"/>
                      <stop offset="1" stopColor="#FB5C74"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#am-public-modal-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
                </svg>
                <span className="text-sm font-medium text-gray-600 truncate max-w-[220px]">
                  {appleMusicModalData.title}
                </span>
              </div>
              <button
                onClick={() => setAppleMusicModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Apple Music Embed - compact height */}
            <div className="p-3">
              <iframe
                src={appleMusicModalData.embedUrl}
                width="100%"
                height="175"
                frameBorder="0"
                allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
                sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
                loading="lazy"
                className="rounded-lg"
                style={{ overflow: 'hidden', background: 'transparent' }}
              />
            </div>

            {/* Open in Apple Music button */}
            <div className="p-3 pt-0">
              <a
                href={appleMusicModalData.appleMusicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2.5 px-4 rounded-full bg-gradient-to-r from-[#FA233B] to-[#FB5C74] text-white text-center text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Open in Apple Music
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Quick Checkout Modal */}
      {quickCheckoutModalOpen && quickCheckoutModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQuickCheckoutModalOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* Modal */}
          <div
            className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setQuickCheckoutModalOpen(false)}
              className="absolute top-3 right-3 z-10 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>

            {/* Product Header */}
            <div className="p-5 pb-4 border-b bg-gradient-to-b from-gray-50 to-white shrink-0">
              <div className="flex items-center gap-3">
                {quickCheckoutModalData.productThumbnail && (
                  <img
                    src={quickCheckoutModalData.productThumbnail}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate text-lg">
                    {quickCheckoutModalData.productTitle}
                  </h3>
                  <p className="text-sm text-green-600 font-medium">Free</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-5 overflow-y-auto flex-1">
              {quickCheckoutStep === 'form' && (
                <QuickCheckoutFormContent
                  ctaText={quickCheckoutModalData.ctaText}
                  error={quickCheckoutError}
                  onSubmit={handleQuickCheckoutSubmit}
                />
              )}

              {quickCheckoutStep === 'loading' && (
                <div className="py-12 flex flex-col items-center justify-center animate-in fade-in duration-200">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-violet-500 animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <ShoppingBag className="w-5 h-5 text-violet-600" />
                    </div>
                  </div>
                  <p className="mt-4 text-sm text-gray-600 font-medium">Processing your order...</p>
                  <p className="mt-1 text-xs text-gray-400">This will only take a moment</p>
                </div>
              )}

              {quickCheckoutStep === 'success' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                  {/* Success Header */}
                  <div className="text-center mb-5">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Check className="w-7 h-7 text-green-600" />
                    </div>
                    <h4 className="font-semibold text-gray-900 text-lg">You're all set!</h4>
                    <p className="text-sm text-gray-500 mt-1">Your download is ready</p>
                  </div>

                  {/* Downloads */}
                  {quickCheckoutAssets.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {quickCheckoutAssets.map((asset) => (
                        <button
                          key={asset.id}
                          onClick={() => handleQuickCheckoutDownload(asset)}
                          className="w-full flex items-center gap-3 p-3.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                        >
                          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center group-hover:bg-violet-200 transition-colors">
                            <Download className="w-5 h-5 text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0 text-left">
                            <p className="font-medium text-gray-900 text-sm truncate">{asset.file_name}</p>
                            <p className="text-xs text-gray-500">Click to download</p>
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors" />
                        </button>
                      ))}
                    </div>
                  )}

                  {quickCheckoutAssets.length === 0 && (
                    <div className="text-center py-4 mb-4 bg-gray-50 rounded-xl">
                      <p className="text-sm text-gray-500">Check your email for download instructions</p>
                    </div>
                  )}

                  <p className="text-xs text-gray-400 text-center">
                    A confirmation email has been sent to {quickCheckoutFormData.email}
                  </p>

                  <button
                    onClick={() => setQuickCheckoutModalOpen(false)}
                    className="w-full mt-4 py-3 sm:py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors mb-4 sm:mb-0"
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PDF Modal - rendered at root level for proper z-index stacking */}
      {pdfModalOpen && pdfModalData && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 sm:bg-black/50 animate-in fade-in duration-200"
          onClick={closePdfModal}
        >
          <div
            className="relative w-full h-full sm:h-auto sm:max-h-[90vh] max-w-md sm:mx-4 bg-white sm:rounded-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Bar */}
            <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
              <button
                onClick={closePdfModal}
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
                onClick={closePdfModal}
                className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Area */}
            <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 overflow-hidden min-h-0">
              {/* PDF Preview Frame */}
              <div
                ref={pdfContainerRef}
                className="relative w-full max-w-xs bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden shadow-sm"
              >
                {/* Page Counter */}
                <div className="absolute top-3 left-3 z-10 px-2.5 py-1 bg-white/95 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-600 shadow-sm">
                  {pdfLoading ? "Loading..." : `${pdfCurrentPage} of ${pdfTotalPages}`}
                </div>

                {/* PDF Pages - Scrollable container */}
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

              {/* Description under preview */}
              {pdfModalData.description && (
                <p className="mt-4 text-sm text-gray-500 text-center max-w-xs">
                  {pdfModalData.description}
                </p>
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
                {pdfModalData.previewButtonText || "View full PDF"}
              </a>
            </div>
          </div>
        </div>
      )}
    </PDFModalContext.Provider>
    </QuickCheckoutModalContext.Provider>
    </AppleMusicModalContext.Provider>
    </SpotifyModalContext.Provider>
    </ModalVisibilityContext.Provider>
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

// Public Image Carousel Component with navigation dots and smooth scroll
function PublicImageCarousel({
  images,
  renderImage,
  autoplay,
  theme,
  isDesktop,
}: {
  images: { id: string; image_url: string; alt_text?: string; title?: string; link_url?: string | null }[]
  renderImage: (img: typeof images[0], index: number) => React.ReactNode
  autoplay?: boolean
  theme: OnePageTheme
  isDesktop?: boolean
}) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  const isScrollingRef = useRef(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)
  const autoplayPausedRef = useRef(false)

  // Auto-advance slides if autoplay is enabled
  useEffect(() => {
    if (!autoplay || isHovered || autoplayPausedRef.current || images.length <= 1) return
    const interval = setInterval(() => {
      if (!autoplayPausedRef.current) {
        goToSlide((currentIndex + 1) % images.length)
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [autoplay, isHovered, images.length, currentIndex])

  // Scroll to specific index with smooth animation
  const scrollToIndex = useCallback((index: number) => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const itemWidth = container.scrollWidth / images.length
    isScrollingRef.current = true

    container.scrollTo({
      left: itemWidth * index,
      behavior: 'smooth'
    })

    // Clear any existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    // Reset scrolling flag after animation completes
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false
    }, 400)
  }, [images.length])

  // Handle scroll events to update currentIndex (only when user is manually scrolling)
  const handleScroll = useCallback(() => {
    // Don't update index if we're doing a programmatic scroll
    if (isScrollingRef.current) return

    if (scrollRef.current) {
      const container = scrollRef.current
      const itemWidth = container.scrollWidth / images.length
      const newIndex = Math.round(container.scrollLeft / itemWidth)
      if (newIndex >= 0 && newIndex < images.length && newIndex !== currentIndex) {
        setCurrentIndex(newIndex)
      }
    }
  }, [images.length, currentIndex])

  // Touch event handlers for smooth swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      time: Date.now()
    }
    autoplayPausedRef.current = true
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current || !scrollRef.current) {
      autoplayPausedRef.current = false
      return
    }

    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
      time: Date.now()
    }

    const deltaX = touchEnd.x - touchStartRef.current.x
    const deltaY = touchEnd.y - touchStartRef.current.y
    const deltaTime = touchEnd.time - touchStartRef.current.time

    // Only handle horizontal swipes
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 30) {
      const velocity = Math.abs(deltaX) / deltaTime

      // Fast swipe or significant distance
      if (velocity > 0.3 || Math.abs(deltaX) > 80) {
        if (deltaX > 0 && currentIndex > 0) {
          // Swipe right - go to previous
          goToSlide(currentIndex - 1)
        } else if (deltaX < 0 && currentIndex < images.length - 1) {
          // Swipe left - go to next
          goToSlide(currentIndex + 1)
        } else {
          // Snap back to current
          scrollToIndex(currentIndex)
        }
      } else {
        // Snap back to current
        scrollToIndex(currentIndex)
      }
    }

    touchStartRef.current = null
    // Resume autoplay after a short delay
    setTimeout(() => {
      autoplayPausedRef.current = false
    }, 500)
  }, [currentIndex, images.length, scrollToIndex])

  const goToSlide = useCallback((index: number) => {
    const clampedIndex = Math.max(0, Math.min(index, images.length - 1))
    setCurrentIndex(clampedIndex)
    scrollToIndex(clampedIndex)
  }, [images.length, scrollToIndex])

  const goToPrev = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newIndex = currentIndex === 0 ? images.length - 1 : currentIndex - 1
    goToSlide(newIndex)
  }, [currentIndex, images.length, goToSlide])

  const goToNext = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const newIndex = currentIndex === images.length - 1 ? 0 : currentIndex + 1
    goToSlide(newIndex)
  }, [currentIndex, images.length, goToSlide])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  if (images.length === 0) return null

  return (
    <div
      className="relative w-full group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Carousel Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="w-full overflow-x-auto scrollbar-hide snap-x snap-mandatory"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          scrollBehavior: 'smooth'
        }}
      >
        <div className="flex" style={{ width: `${images.length * 100}%` }}>
          {images.map((img, idx) => (
            <div
              key={img.id || idx}
              className="w-full shrink-0 snap-center px-1"
              style={{ width: `${100 / images.length}%` }}
            >
              {renderImage(img, idx)}
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Arrows - visible on hover (especially for desktop) */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={goToPrev}
            className={cn(
              "absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-black/60 z-10",
              isDesktop ? "opacity-0 group-hover:opacity-100" : "opacity-70"
            )}
            aria-label="Previous image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goToNext}
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/40 text-white flex items-center justify-center transition-all duration-200 backdrop-blur-sm hover:bg-black/60 z-10",
              isDesktop ? "opacity-0 group-hover:opacity-100" : "opacity-70"
            )}
            aria-label="Next image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Navigation Dots */}
      {images.length > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); goToSlide(idx) }}
              className={cn(
                "h-2 rounded-full transition-all duration-200",
                idx === currentIndex
                  ? "w-6 bg-current"
                  : "w-2 bg-current opacity-40 hover:opacity-60"
              )}
              style={{ color: theme.text_color }}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
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
  const [downloadLink, setDownloadLink] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  // Load email subscription state from localStorage on mount
  useEffect(() => {
    if (block.type === 'email_capture' && onepageId) {
      const storageKey = `onepage_subscribed_${onepageId}_${block.id}`
      const storedData = localStorage.getItem(storageKey)
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData)
          if (parsed.subscribed) {
            setEmailSubmitted(true)
            setEmail(parsed.email || '')
            if (parsed.downloadLink) {
              setDownloadLink(parsed.downloadLink)
            }
          }
        } catch (e) {
          // Invalid JSON, ignore
        }
      }
    }
  }, [block.type, block.id, onepageId])

  // Use context for Spotify modal - renders at root level to prevent clipping
  const spotifyModalContext = useContext(SpotifyModalContext)
  // Use context for Apple Music modal - renders at root level to prevent clipping
  const appleMusicModalContext = useContext(AppleMusicModalContext)

  const socialStyle = (theme as any).social_icon_style || "filled"
  const socialColor = (theme as any).social_icon_color || theme.text_color

  // Button hover animation - based on theme setting, disabled inside carousel or group
  const buttonHoverAnimation = (theme as any).button_hover_animation || "default"
  const getHoverEffect = () => {
    if (isInsideCarousel || isInsideGroup) return ""
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
    try {
      if (!url.includes('music.apple.com')) return null
      // Convert Apple Music URL to embed URL
      // Example: https://music.apple.com/us/album/song-name/1234567890?i=1234567891
      // To: https://embed.music.apple.com/us/album/song-name/1234567890?i=1234567891
      return url.replace('music.apple.com', 'embed.music.apple.com')
    } catch {
      return null
    }
  }

  // Open Apple Music modal via context
  const openAppleMusicModal = (data: LinkButtonBlockData) => {
    const embedUrl = getAppleMusicEmbedUrl(data.url)
    if (embedUrl && appleMusicModalContext) {
      appleMusicModalContext.openAppleMusicModal({
        title: data.label || 'Listen on Apple Music',
        appleMusicUrl: data.url,
        embedUrl: embedUrl
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
                <video
                    ref={videoRef}
                    src={profile.avatar_video_url!}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }}
                    autoPlay
                    loop
                    muted
                    playsInline
                  />
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
                      className="w-full h-full object-cover"
                      style={
                        profile.avatar_video_crop
                          ? {
                              transformOrigin: '0 0',
                              transform: `scale(${100 / profile.avatar_video_crop.width}) translate(-${profile.avatar_video_crop.x}%, -${profile.avatar_video_crop.y}%)`,
                            }
                          : undefined
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

      // Hero layout: move icons up more, Classic: add 4px top and 3px bottom padding
      // Apply custom padding if set, otherwise use default layout styles
      const hasCustomPadding = data.padding_top !== undefined || data.padding_bottom !== undefined
      const paddingTop = data.padding_top ?? (isHeroLayout ? -16 : 4)
      const paddingBottom = data.padding_bottom ?? (isHeroLayout ? 20 : 3)

      return (
        <div
          className={cn(
            "flex items-center justify-center gap-2.5 flex-wrap",
            !hasCustomPadding && isHeroLayout && "md:mt-[-20px] md:mb-7"
          )}
          style={{
            marginTop: `${paddingTop}px`,
            marginBottom: `${paddingBottom}px`
          }}
        >
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
        'telegram': 'M23.1117 4.49449C23.4296 2.94472 21.9074 1.65683 20.4317 2.227L2.3425 9.21601C0.694517 9.85273 0.621087 12.1572 2.22518 12.8975L6.1645 14.7157L8.03849 21.2746C8.13583 21.6153 8.40618 21.8791 8.74917 21.968C9.09216 22.0568 9.45658 21.9576 9.70712 21.707L12.5938 18.8203L16.6375 21.8531C17.8113 22.7334 19.5019 22.0922 19.7967 20.6549L23.1117 4.49449ZM3.0633 11.0816L21.1525 4.0926L17.8375 20.2531L13.1 16.6999C12.7019 16.4013 12.1448 16.4409 11.7929 16.7928L10.5565 18.0292L10.928 15.9861L18.2071 8.70703C18.5614 8.35278 18.5988 7.79106 18.2947 7.39293C17.9906 6.99479 17.4389 6.88312 17.0039 7.13168L6.95124 12.876L3.0633 11.0816ZM8.17695 14.4791L8.78333 16.6015L9.01614 15.321C9.05253 15.1209 9.14908 14.9366 9.29291 14.7928L11.5128 12.573L8.17695 14.4791Z',
        'whatsapp': 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z',
        'pinterest': 'M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z',
        'snapchat': 'M11.99 2.75c-1.494-.011-3.017.567-4.003 1.714-.874.926-1.204 2.238-1.16 3.483-.004.64.004 1.28.006 1.92-.613-.152-1.234-.578-1.882-.367-.553.164-.783.886-.45 1.349.36.47.918.738 1.385 1.089.229.188.538.321.71.562 0 .577-.303 1.112-.59 1.599-.7 1.099-1.786 1.93-2.956 2.509-.3.129-.572.518-.309.812.485.453 1.167.598 1.77.811.256.08.635.168.608.507.042.365.276.758.687.76.982.114 2.036.065 2.918.59.868.501 1.756 1.059 2.777 1.117 1.02.1 2.08-.111 2.958-.663.654-.36 1.292-.81 2.06-.883.645-.15 1.338-.015 1.96-.26.4-.17.35-.66.51-.984.32-.22.72-.243 1.07-.388.46-.183 1.04-.332 1.27-.802.14-.38-.29-.586-.56-.734-1.42-.734-2.7-1.87-3.27-3.4-.06-.24-.29-.6.01-.78.62-.52 1.43-.82 1.94-1.46.39-.488.12-1.318-.52-1.418-.618-.098-1.19.24-1.77.391-.051-1.068.063-2.152-.102-3.218-.304-1.726-1.69-3.145-3.35-3.64-.565-.18-1.158-.25-1.746-.25z',
        'github': 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
        'apple-music': 'M8.5 7.5l10-1.75m-10 1.75v11.375m0-11.375V5.09a1 1 0 0 1 .83-.99l8-1.4a1.17 1.17 0 0 1 1.17.99V5.75m0 0v11.125m-12.31.154l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94zm10-2l-1.06.19a1.97 1.97 0 0 0-1.63 1.81c0 1.22 1.1 2.15 2.31 1.94l1.06-.19a1.97 1.97 0 0 0 1.63-1.81c0-1.22-1.1-2.15-2.31-1.94z',
        'notion': 'M16.5749 7.25003C16.6367 7.59473 16.5568 7.93086 16.2367 7.96109L15.7054 8.05698L15.4846 16.374C15.0168 16.6242 14.5911 16.7615 14.2397 16.7493C13.673 16.7296 13.5363 16.5344 13.1293 15.9535L9.82408 10.0074L9.6745 15.6431L10.7624 15.9474C10.7624 15.9474 10.7444 16.6282 9.8619 16.5975L7.42244 16.6648C7.35563 16.5103 7.43656 16.1329 7.68674 16.0686L8.32658 15.9004L8.52431 8.45081L7.64386 8.34411C7.5821 7.99941 7.77252 7.51503 8.26605 7.49448L10.8834 7.39512L14.328 13.4217L14.4666 8.20066L13.5514 8.05443C13.4916 7.63739 13.7802 7.34321 14.1354 7.32029L16.5749 7.25003Z M17.2583 2.83306C13.7917 2.44562 10.2083 2.44562 6.74177 2.83306C4.72971 3.05794 3.10538 4.64295 2.86883 6.66548C2.45429 10.2098 2.45429 13.7903 2.86883 17.3346C3.10538 19.3571 4.72971 20.9422 6.74177 21.167C10.2083 21.5545 13.7917 21.5545 17.2583 21.167C19.2703 20.9422 20.8946 19.3571 21.1312 17.3346C21.5457 13.7903 21.5457 10.2098 21.1312 6.66548C20.8946 4.64295 19.2703 3.05794 17.2583 2.83306ZM6.90838 4.32378C10.2642 3.94871 13.7358 3.94871 17.0916 4.32378C18.4218 4.47244 19.4872 5.52205 19.6414 6.83973C20.0424 10.2683 20.0424 13.7318 19.6414 17.1604C19.4872 18.478 18.4218 19.5277 17.0916 19.6763C13.7358 20.0514 10.2642 20.0514 6.90838 19.6763C5.57827 19.5277 4.51278 18.478 4.35867 17.1604C3.95767 13.7318 3.95767 10.2683 4.35867 6.83973C4.51278 5.52205 5.57827 4.47244 6.90838 4.32378Z',
        'vimeo': 'M22.396 7.164c-.093 2.026-1.507 4.799-4.245 8.32C15.322 19.161 12.928 21 10.97 21c-1.214 0-2.24-1.119-3.08-3.357L6.16 11.088c-.56-2.238-1.16-3.357-1.8-3.357-.14 0-.628.294-1.464.88l-.88-1.132c.92-.809 1.83-1.618 2.72-2.428 1.226-1.06 2.146-1.618 2.76-1.672 1.45-.14 2.342.852 2.675 2.976.36 2.292.612 3.719.754 4.28.42 1.906.88 2.858 1.38 2.858.39 0 .976-.617 1.76-1.85.783-1.232 1.203-2.17 1.26-2.813.112-1.06-.307-1.591-1.26-1.591-.448 0-.91.103-1.386.307.92-3.015 2.68-4.48 5.282-4.4 1.93.053 2.841 1.307 2.735 3.762z',
      }
      // Icons that should be rendered with fill instead of stroke
      const FILLED_ICONS = new Set([
        'instagram', 'twitter', 'youtube', 'tiktok', 'spotify', 'facebook', 'linkedin',
        'twitch', 'discord', 'telegram', 'whatsapp', 'pinterest', 'snapchat',
        'github', 'vimeo', 'notion'
      ])

      // Auto-detect icon from URL for WhatsApp, Telegram, Vimeo, and Notion
      const getIconFromUrl = (url: string): string | null => {
        const lowerUrl = url.toLowerCase()
        if (lowerUrl.includes('wa.me') || lowerUrl.includes('whatsapp.com') || lowerUrl.includes('api.whatsapp.com')) {
          return 'whatsapp'
        }
        if (lowerUrl.includes('t.me') || lowerUrl.includes('telegram.me') || lowerUrl.includes('telegram.org')) {
          return 'telegram'
        }
        if (lowerUrl.includes('vimeo.com')) {
          return 'vimeo'
        }
        if (lowerUrl.includes('notion.so') || lowerUrl.includes('notion.site')) {
          return 'notion'
        }
        return null
      }

      const detectedIcon = data.icon || getIconFromUrl(data.url)
      const iconPath = detectedIcon ? ICON_PATHS[detectedIcon] : null
      const isFilledIcon = detectedIcon ? FILLED_ICONS.has(detectedIcon) : false

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
            ? `${Math.max(1, theme.button_border_width || 2)}px`
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
                <span className="truncate font-medium" style={{ color: theme.button_text_color }}>
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

        // Check if Pro layout should open Apple Music modal
        const proAppleMusicMode = data.apple_music_mode || 'go_to_url'
        const proShouldOpenAppleMusicModal = isAppleMusicUrl(data.url) && proAppleMusicMode === 'audio_preview' && appleMusicModalContext

        // TikTok embed handling
        const tiktokVideoId = getTikTokVideoId(data.url) || data.tiktok_video_id
        const shouldEmbedTikTok = isTikTokVideoUrl(data.url) && data.tiktok_show_embed !== false && tiktokVideoId
        const tiktokEmbedUrl = data.tiktok_embed_url || (tiktokVideoId ? `https://www.tiktok.com/embed/v2/${tiktokVideoId}` : null)

        // Pro layout content (shared between button and link)
        const proLayoutContent = (
          <>
            {/* TikTok embed for Pro layout */}
            {shouldEmbedTikTok && tiktokEmbedUrl ? (
              <div
                className="w-full relative overflow-hidden"
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                  aspectRatio: '9/16',
                  maxHeight: '500px',
                }}
              >
                <iframe
                  src={tiktokEmbedUrl}
                  title="TikTok video player"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full border-0"
                  style={{ minHeight: '400px' }}
                />
              </div>
            ) : null}
            {/* Featured thumbnail area */}
            {!shouldEmbedTikTok && (data.thumbnail_url || iconPath) && (
              <div
                className={cn(
                  "w-full relative overflow-hidden",
                  displayMode !== 'full' && "aspect-[2/1]"
                )}
                style={{
                  borderRadius: `${theme.button_border_radius}px ${theme.button_border_radius}px 0 0`,
                  backgroundColor: displayMode === 'contain' || !data.thumbnail_url ? (
                    theme.button_style === "outline" ? `${theme.button_color}10` : `${theme.button_text_color}10`
                  ) : undefined,
                }}
              >
                {data.thumbnail_url ? (
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
                ) : iconPath ? (
                  <div className="w-full h-full flex items-center justify-center py-6">
                    <svg
                      viewBox="0 0 24 24"
                      className="w-16 h-16"
                      style={{ color: theme.button_text_color }}
                      fill={isFilledIcon ? "currentColor" : "none"}
                      stroke={isFilledIcon ? "none" : "currentColor"}
                      strokeWidth={isFilledIcon ? undefined : "2"}
                      strokeLinecap={isFilledIcon ? undefined : "round"}
                      strokeLinejoin={isFilledIcon ? undefined : "round"}
                    >
                      <path d={iconPath} />
                    </svg>
                  </div>
                ) : null}
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
              <span className="truncate font-medium max-w-full block" style={{ color: theme.button_text_color }}>
                {data.label || "Link"}
              </span>
              {/* Spotify metadata display for Pro Layout */}
              {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                  className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
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
              {/* Apple Music metadata display for Pro Layout */}
              {isAppleMusicUrl(data.url) && data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
                <span
                  className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.75
                  }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 512 512">
                    <defs>
                      <linearGradient id="am-pro-pub-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                        <stop offset="0" stopColor="#FA233B"/>
                        <stop offset="1" stopColor="#FB5C74"/>
                      </linearGradient>
                    </defs>
                    <path fill="url(#am-pro-pub-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
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

        // If Pro layout should open Apple Music modal, render as button
        if (proShouldOpenAppleMusicModal) {
          return (
            <button
              type="button"
              onClick={() => {
                trackClick(block.id, data.url)
                openAppleMusicModal(data)
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

      // Check if this is an Apple Music link with modal mode (default layout)
      const appleMusicMode = data.apple_music_mode || 'go_to_url'
      const shouldOpenAppleMusicModal = isAppleMusicUrl(data.url) && appleMusicMode === 'audio_preview' && appleMusicModalContext

      if (shouldOpenSpotifyModal) {
        return (
          <button
            type="button"
            onClick={() => {
              trackClick(block.id, data.url)
              openSpotifyModal(data)
            }}
            className={cn(
              "w-full flex items-center py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 font-medium text-[13px] sm:text-[15px] transition-all cursor-pointer",
              hoverEffect,
              hasThumbnail ? "relative justify-center" : "justify-center",
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt=""
                className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] rounded object-cover shrink-0 absolute left-[20px]"
              />
            ) : iconPath ? (
              <svg
                className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] shrink-0 absolute left-[20px]"
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
            <div className={cn("flex flex-col min-w-0", hasThumbnail ? "w-full text-center px-12" : "")}>
              <span className="text-center break-words whitespace-normal leading-tight">{data.label || "Link"}</span>
              {/* Spotify info display */}
              {data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                    className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                    style={{
                      color: theme.button_text_color,
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

      // Apple Music modal button for Default layout - always centered
      if (shouldOpenAppleMusicModal) {
        return (
          <button
            type="button"
            onClick={() => {
              trackClick(block.id, data.url)
              openAppleMusicModal(data)
            }}
            className={cn(
              "w-full relative flex items-center justify-center py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 font-medium text-[13px] sm:text-[15px] transition-all cursor-pointer",
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
                className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] rounded object-cover shrink-0 absolute left-[20px]"
              />
            ) : iconPath ? (
              <svg
                className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] shrink-0 absolute left-[20px]"
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
            <div className="flex flex-col min-w-0 w-full text-center px-12">
              <span className="text-center break-words whitespace-normal leading-tight">{data.label || "Link"}</span>
              {/* Apple Music info display */}
              {data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
                <span
                  className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                  style={{
                    color: theme.button_text_color,
                    opacity: 0.75
                  }}
                >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 512 512">
                    <defs>
                      <linearGradient id="am-def-pub-modal-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                        <stop offset="0" stopColor="#FA233B"/>
                        <stop offset="1" stopColor="#FB5C74"/>
                      </linearGradient>
                    </defs>
                    <path fill="url(#am-def-pub-modal-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
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
      const hasIconOnly = iconPath && !data.thumbnail_url

      return (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(block.id, data.url)}
          className={cn(
            "w-full flex items-center py-[19.5px] sm:py-[21.5px] px-5 sm:px-6 font-medium text-[13px] sm:text-[15px] transition-all",
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
              className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] rounded object-cover shrink-0 absolute left-[20px]"
            />
          ) : iconPath ? (
            <svg
              className="w-[37.5px] h-[37.5px] sm:w-[42.5px] sm:h-[42.5px] shrink-0 absolute left-[20px]"
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
          <div className={cn("flex flex-col min-w-0", (hasIconOnly || hasThumbnail) ? "w-full text-center px-12" : "")}>
            <span className="text-center break-words whitespace-normal leading-tight">{data.label || "Link"}</span>
            {/* Spotify info display */}
            {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
              <span
                className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_text_color,
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
            {/* Apple Music info display for default layout */}
            {isAppleMusic && data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
              <span
                className="text-xs flex items-center justify-center gap-1 mt-0.5 max-w-full"
                style={{
                  color: theme.button_text_color,
                  opacity: 0.75
                }}
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 512 512">
                  <defs>
                    <linearGradient id="am-def-pub-grad" x1="0.5" y1="0.99" x2="0.5" y2="0.02">
                      <stop offset="0" stopColor="#FA233B"/>
                      <stop offset="1" stopColor="#FB5C74"/>
                    </linearGradient>
                  </defs>
                  <path fill="url(#am-def-pub-grad)" d="M199 359V199q0-9 10-11l138-28q11-2 12 10v122q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69V88s0-20-17-15l-170 35s-13 2-13 18v203q0 15-45 20c-57 9-48 105 30 79 30-11 35-40 35-69"/>
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
      const dividerColor = `${theme.text_color}30`
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
      if (data.style === "dashed") {
        return (
          <div className="w-full flex items-center" style={{ height: `${height}px` }}>
            <div className="w-full border-t-[1px] border-dashed" style={{ borderColor: dividerColor }} />
          </div>
        )
      }
      if (data.style === "double") {
        return (
          <div className="w-full flex flex-col justify-center gap-[3px]" style={{ height: `${height}px` }}>
            <div className="w-full h-px" style={{ backgroundColor: dividerColor }} />
            <div className="w-full h-px" style={{ backgroundColor: dividerColor }} />
          </div>
        )
      }
      if (data.style === "wave") {
        return (
          <div className="w-full flex items-center overflow-hidden" style={{ height: `${height}px` }}>
            <svg width="100%" height="12" viewBox="0 0 200 12" preserveAspectRatio="none" style={{ opacity: 0.4 }}>
              <path d="M0 6 Q 12.5 0, 25 6 T 50 6 T 75 6 T 100 6 T 125 6 T 150 6 T 175 6 T 200 6" fill="none" stroke={theme.text_color} strokeWidth="1.5" />
            </svg>
          </div>
        )
      }
      if (data.style === "zigzag") {
        return (
          <div className="w-full flex items-center overflow-hidden" style={{ height: `${height}px` }}>
            <svg width="100%" height="10" viewBox="0 0 200 10" preserveAspectRatio="none" style={{ opacity: 0.4 }}>
              <path d="M0 5 L 10 0 L 20 10 L 30 0 L 40 10 L 50 0 L 60 10 L 70 0 L 80 10 L 90 0 L 100 10 L 110 0 L 120 10 L 130 0 L 140 10 L 150 0 L 160 10 L 170 0 L 180 10 L 190 0 L 200 5" fill="none" stroke={theme.text_color} strokeWidth="1.5" />
            </svg>
          </div>
        )
      }
      if (data.style === "gradient") {
        return (
          <div className="w-full flex items-center" style={{ height: `${height}px` }}>
            <div className="w-full h-[2px] rounded-full" style={{ background: `linear-gradient(90deg, transparent 0%, ${theme.text_color}40 20%, ${theme.text_color}40 80%, transparent 100%)` }} />
          </div>
        )
      }
      return <div className="w-full" style={{ height: `${height}px` }} />
    }

    case "image": {
      const data = (block.data || { image_url: "" }) as ImageBlockData
      // Get images array (support both legacy single image and new multi-image)
      const images = data.images || (data.image_url ? [{ id: '1', image_url: data.image_url, alt_text: data.alt_text, title: '', link_url: data.link_url }] : [])
      if (images.length === 0 || !images[0]?.image_url) return null

      // Get border radius value
      const borderRadiusMap: Record<string, string> = {
        'none': '0',
        'sm': '8px',
        'md': '12px',
        'lg': '20px',
        'full': '9999px',
      }
      const borderRadius = borderRadiusMap[data.border_radius || 'md'] || '12px'

      // Get aspect ratio class
      const aspectRatioClass =
        data.aspect_ratio === "square" ? "aspect-square" :
        data.aspect_ratio === "portrait" ? "aspect-[3/4]" :
        data.aspect_ratio === "landscape" ? "aspect-[4/3]" :
        data.aspect_ratio === "video" ? "aspect-video" :
        data.aspect_ratio === "wide" ? "aspect-[2/1]" : ""

      // Render single image
      const renderImage = (img: typeof images[0], index: number) => {
        const imageContent = (
          <div className="w-full">
            <div
              className={cn("w-full overflow-hidden", aspectRatioClass)}
              style={{ borderRadius }}
            >
              <img
                src={img.image_url || "/placeholder.svg"}
                alt={img.alt_text || ""}
                className={cn(
                  "w-full",
                  aspectRatioClass ? "h-full" : "h-auto",
                  data.image_fit === 'contain' ? 'object-contain' : 'object-cover'
                )}
                loading="lazy"
              />
            </div>
            {data.show_captions && img.title && (
              <p
                className="text-center text-sm mt-2 opacity-70"
                style={{ color: theme.text_color }}
              >
                {img.title}
              </p>
            )}
          </div>
        )

        if (data.clickable && img.link_url) {
          return (
            <a
              key={img.id || index}
              href={img.link_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackClick(block.id, img.link_url!)}
              className={cn("w-full block transition-opacity", !isInsideCarousel && "hover:opacity-90")}
            >
              {imageContent}
            </a>
          )
        }
        return <div key={img.id || index} className="w-full">{imageContent}</div>
      }

      // Single display or only one image
      if (data.display_style === 'single' || images.length === 1) {
        return <div className="w-full py-px">{renderImage(images[0], 0)}</div>
      }

      // Grid display
      if (data.display_style === 'grid') {
        const cols = data.grid_columns || 2
        return (
          <div
            className="w-full grid gap-3 py-px"
            style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
          >
            {images.map((img, idx) => renderImage(img, idx))}
          </div>
        )
      }

      // Carousel display with navigation dots and smooth scroll (disabled inside group blocks)
      if (data.display_style === 'carousel' && !isInsideGroup) {
        return (
          <div className="w-full py-px">
            <PublicImageCarousel
              images={images}
              renderImage={renderImage}
              autoplay={data.carousel_autoplay}
              theme={theme}
              isDesktop={isDesktop}
            />
          </div>
        )
      }

      // If carousel is requested but inside group, show single image instead
      if (data.display_style === 'carousel' && isInsideGroup) {
        return <div className="w-full py-px">{renderImage(images[0], 0)}</div>
      }

      // Default: single image
      return <div className="w-full py-px">{renderImage(images[0], 0)}</div>
    }

    case "email_capture": {
      const data = (block.data || {
        headline: "Subscribe",
        placeholder: "Email",
        button_text: "Join",
        success_message: "Thanks!",
      }) as EmailCaptureBlockData

      const isPro = data.layout_type === "pro"
      const hasDigitalProduct = data.enable_digital_product && data.digital_product_file_url
      const layoutImage = data.product_image || data.digital_product_thumbnail
      const showThumbnail = isPro && layoutImage

      // Button styles with shadows and borders (matching link_button and product blocks)
      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
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
      const emailButtonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "filled"
            ? theme.button_color
            : theme.button_style === "glass"
              ? `${theme.button_color}`
              : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(1, theme.button_border_width) : theme.button_border_width}px`,
        borderColor:
          theme.button_style === "outline"
            ? theme.text_color
            : theme.button_style === "glass"
              ? `${theme.button_text_color}30`
              : theme.button_border_color || "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
        boxShadow: shadowStyles[buttonShadow] || "none",
      }

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
        // If submitted and we have a download link, always show "Download"
        if (emailSubmitted && downloadLink) {
          return "Download"
        }
        // If submitted without download link
        if (emailSubmitted) {
          return "Subscribed!"
        }
        // Get the preset or custom button text
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

      // Check if user has exceeded subscription limit (3 per device in 3 days)
      const checkSubscriptionLimit = (): boolean => {
        const rateLimitKey = `onepage_subscription_limit`
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000
        try {
          const stored = localStorage.getItem(rateLimitKey)
          if (stored) {
            const data = JSON.parse(stored)
            const now = Date.now()
            // Filter out entries older than 3 days
            const recentAttempts = (data.attempts || []).filter((timestamp: number) => now - timestamp < threeDaysMs)
            if (recentAttempts.length >= 3) {
              return false // Limit exceeded
            }
          }
          return true // Within limit
        } catch {
          return true // Default to allowing if localStorage fails
        }
      }

      // Record a subscription attempt
      const recordSubscriptionAttempt = () => {
        const rateLimitKey = `onepage_subscription_limit`
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000
        try {
          const stored = localStorage.getItem(rateLimitKey)
          const now = Date.now()
          let attempts: number[] = []
          if (stored) {
            const data = JSON.parse(stored)
            // Keep only recent attempts (within 3 days)
            attempts = (data.attempts || []).filter((timestamp: number) => now - timestamp < threeDaysMs)
          }
          attempts.push(now)
          localStorage.setItem(rateLimitKey, JSON.stringify({ attempts }))
        } catch {
          // Ignore localStorage errors
        }
      }

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || isSubmitting || emailSubmitted) return

        // Check subscription rate limit
        if (!checkSubscriptionLimit()) {
          alert("You've reached the maximum number of subscriptions from this device. Please try again in 3 days.")
          return
        }

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
              enable_digital_product: data.enable_digital_product,
              digital_product_file_url: data.digital_product_file_url,
              digital_product_title: data.digital_product_title,
            }),
          })
          const result = await response.json()
          if (response.ok) {
            setEmailSubmitted(true)
            // Record the subscription attempt for rate limiting
            recordSubscriptionAttempt()
            // Store the download link directly from data if digital product is enabled
            if (data.enable_digital_product && data.digital_product_file_url) {
              setDownloadLink(data.digital_product_file_url)
            }
            // Save subscription state to localStorage for persistence
            const storageKey = `onepage_subscribed_${onepageId}_${block.id}`
            localStorage.setItem(storageKey, JSON.stringify({
              subscribed: true,
              email: email,
              downloadLink: data.enable_digital_product ? data.digital_product_file_url : null,
              timestamp: Date.now()
            }))
          }
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
          setDownloadLink(null)
          // Clear localStorage when email is modified
          const storageKey = `onepage_subscribed_${onepageId}_${block.id}`
          localStorage.removeItem(storageKey)
        }
      }

      // Handle download click - triggers direct download
      const handleDownloadClick = () => {
        if (downloadLink) {
          // Create a temporary anchor element to trigger download
          const link = document.createElement('a')
          link.href = downloadLink
          link.download = data.digital_product_title || 'download'
          link.target = '_blank'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
        }
      }

      // Pro layout with thumbnail
      if (isPro && showThumbnail) {
        return (
          <div
            className={cn("w-full rounded-xl sm:rounded-2xl overflow-hidden", getEmailAnimationClass(data.animation_type))}
            style={{ backgroundColor: `${theme.button_color}10` }}
          >
            <div className="p-4 sm:p-5 space-y-3">
              {/* Product row */}
              <div className="flex gap-3 sm:gap-4 items-start">
                <img
                  src={layoutImage || ""}
                  alt=""
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl object-cover shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold" style={{ color: theme.text_color }}>
                    {data.headline}
                  </h3>
                  {data.description && (
                    <p
                      className="text-xs sm:text-sm line-clamp-2"
                      style={{ color: theme.secondary_text_color || theme.text_color }}
                    >
                      {data.description}
                    </p>
                  )}
                </div>
              </div>
              {/* Form - Responsive layout based on button text length */}
              {(() => {
                const buttonText = getButtonText()
                const isShortButton = buttonText.length <= 12

                if (isShortButton) {
                  return (
                    <form onSubmit={handleSubmit} className="flex flex-row gap-2 items-stretch">
                      <input
                        type="email"
                        value={email}
                        onChange={handleEmailChange}
                        placeholder={data.placeholder || "Enter your email"}
                        required
                        disabled={isSubmitting}
                        className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 flex-1 min-w-0"
                        style={{ color: "#000", width: '60%' }}
                      />
                      {emailSubmitted && downloadLink ? (
                        <button
                          type="button"
                          onClick={handleDownloadClick}
                          className={cn(
                            "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity whitespace-nowrap shrink-0",
                            !isInsideCarousel && "hover:opacity-90"
                          )}
                          style={emailButtonStyles}
                        >
                          Download
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={isSubmitting || emailSubmitted}
                          className={cn(
                            "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0",
                            !isInsideCarousel && "hover:opacity-90"
                          )}
                          style={emailButtonStyles}
                        >
                          {isSubmitting ? "..." : buttonText}
                        </button>
                      )}
                    </form>
                  )
                }

                return (
                  <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={handleEmailChange}
                      placeholder={data.placeholder || "Enter your email"}
                      required
                      disabled={isSubmitting}
                      className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 w-full"
                      style={{ color: "#000" }}
                    />
                    {emailSubmitted && downloadLink ? (
                      <button
                        type="button"
                        onClick={handleDownloadClick}
                        className={cn(
                          "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity whitespace-nowrap w-full",
                          !isInsideCarousel && "hover:opacity-90"
                        )}
                        style={emailButtonStyles}
                      >
                        Download
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmitting || emailSubmitted}
                        className={cn(
                          "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap w-full",
                          !isInsideCarousel && "hover:opacity-90"
                        )}
                        style={emailButtonStyles}
                      >
                        {isSubmitting ? "..." : buttonText}
                      </button>
                    )}
                  </form>
                )
              })()}
            </div>
            {emailSubmitted && (
              <div className="px-4 sm:px-5 pb-3 sm:pb-4">
                <p className="text-xs text-center opacity-70" style={{ color: theme.text_color }}>
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
        <div
          className={cn("w-full p-5 sm:p-6 rounded-xl sm:rounded-2xl", getEmailAnimationClass(data.animation_type))}
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
          {/* Form - Responsive layout based on button text length */}
          {isShortButton ? (
            <form onSubmit={handleSubmit} className="flex flex-row gap-2 items-stretch">
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder={data.placeholder || "Enter your email"}
                required
                disabled={isSubmitting}
                className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 flex-1 min-w-0"
                style={{ color: "#000", width: '60%' }}
              />
              {emailSubmitted && downloadLink ? (
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className={cn(
                    "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity whitespace-nowrap shrink-0",
                    !isInsideCarousel && "hover:opacity-90"
                  )}
                  style={emailButtonStyles}
                >
                  Download
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || emailSubmitted}
                  className={cn(
                    "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0",
                    !isInsideCarousel && "hover:opacity-90"
                  )}
                  style={emailButtonStyles}
                >
                  {isSubmitting ? "..." : buttonText}
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder={data.placeholder || "Enter your email"}
                required
                disabled={isSubmitting}
                className="px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 w-full"
                style={{ color: "#000" }}
              />
              {emailSubmitted && downloadLink ? (
                <button
                  type="button"
                  onClick={handleDownloadClick}
                  className={cn(
                    "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity whitespace-nowrap w-full",
                    !isInsideCarousel && "hover:opacity-90"
                  )}
                  style={emailButtonStyles}
                >
                  Download
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting || emailSubmitted}
                  className={cn(
                    "px-4 sm:px-5 py-2.5 sm:py-3 text-sm font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap w-full",
                    !isInsideCarousel && "hover:opacity-90"
                  )}
                  style={emailButtonStyles}
                >
                  {isSubmitting ? "..." : buttonText}
                </button>
              )}
            </form>
          )}
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

    case "product": {
      const data = block.data as ProductBlockData
      if (!data.product_id && !data.product_title) {
        return null
      }

      // Use context for Quick Checkout modal
      const quickCheckoutContext = useContext(QuickCheckoutModalContext)

      const productUrl = data.product_slug ? `/p/${data.product_slug}` : '#'
      const priceDisplay = data.product_price_cents && data.product_price_cents > 0
        ? `$${(data.product_price_cents / 100).toFixed(2)}`
        : 'Free'
      const isFreeProduct = !data.product_price_cents || data.product_price_cents === 0
      const useQuickCheckout = isFreeProduct && data.quick_checkout === true

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

      const productBorderRadius = theme.button_border_radius
      const blockBackgroundColor = data.block_background_color || theme.button_color
      const textColor = data.text_color || theme.button_text_color

      // Helper to darken a hex color
      const darkenHex = (hex: string, percent: number) => {
        const num = parseInt(hex.replace('#', ''), 16)
        const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)))
        const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)))
        const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)))
        return `#${(r << 16 | g << 8 | b).toString(16).padStart(6, '0')}`
      }

      const isPreviewStyle = data.style === 'preview'
      const ctaButtonColor = isPreviewStyle
        ? (data.button_color || `${textColor}15`)
        : darkenHex(blockBackgroundColor, 0.08)
      const ctaButtonTextColor = isPreviewStyle
        ? (data.button_text_color || textColor)
        : textColor

      // Button styles for product block (mirrors link_button styles)
      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
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
            ? `${Math.max(1, theme.button_border_width || 2)}px`
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

      // Check if product is already purchased
      const isPurchased = quickCheckoutContext?.purchasedProducts?.[data.product_id] !== undefined
      const purchaseInfo = isPurchased ? quickCheckoutContext?.purchasedProducts[data.product_id] : null

      // Handle click - download if purchased, open checkout modal, or navigate to product page
      const handleProductClick = (e: React.MouseEvent) => {
        // Track click
        trackClick(block.id, productUrl)

        // If already purchased with quick checkout, download directly
        if (isPurchased && quickCheckoutContext && useQuickCheckout) {
          e.preventDefault()
          quickCheckoutContext.downloadPurchasedAsset(data.product_id)
          return
        }

        if (useQuickCheckout && quickCheckoutContext) {
          e.preventDefault()
          quickCheckoutContext.openQuickCheckoutModal({
            productId: data.product_id,
            productTitle: data.product_title || 'Product',
            productThumbnail: data.custom_thumbnail || data.product_thumbnail,
            productSlug: data.product_slug,
            ctaText: data.cta_text || 'Get it Now',
            blockBackgroundColor,
            textColor,
            buttonBorderRadius: productBorderRadius,
          })
        }
      }

      // Determine CTA text - show "Download" if already purchased
      const ctaDisplayText = isPurchased && useQuickCheckout ? 'Download' : (data.cta_text || 'Get My Guide')

      // Button style - simple button
      if (data.style === 'button') {
        const buttonContent = (
          <>
            {data.product_thumbnail && (
              <img
                src={data.product_thumbnail}
                alt=""
                className="w-6 h-6 sm:w-7 sm:h-7 rounded object-cover shrink-0"
              />
            )}
            <span className="truncate">{ctaDisplayText}</span>
            {data.show_price !== false && !isPurchased && (
              <span className="text-sm opacity-75 shrink-0">{priceDisplay}</span>
            )}
          </>
        )

        if (useQuickCheckout) {
          return (
            <button
              onClick={handleProductClick}
              className={cn(
                "w-full font-medium flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 px-4 sm:px-5 text-sm sm:text-base transition-all cursor-pointer",
                hoverEffect,
                getProductAnimationClass(data.animation_type),
              )}
              style={buttonStyles}
            >
              {buttonContent}
            </button>
          )
        }

        return (
          <a
            href={productUrl}
            onClick={() => trackClick(block.id, productUrl)}
            className={cn(
              "w-full font-medium flex items-center justify-center gap-2 sm:gap-3 py-3 sm:py-4 px-4 sm:px-5 text-sm sm:text-base transition-all cursor-pointer",
              hoverEffect,
              getProductAnimationClass(data.animation_type),
            )}
            style={buttonStyles}
          >
            {buttonContent}
          </a>
        )
      }

      // Preview style - full card with image
      if (data.style === 'preview') {
        const previewContent = (
          <>
            {(data.custom_thumbnail || data.product_thumbnail) && (
              <div className="w-full aspect-[2/1] overflow-hidden">
                <img
                  src={data.custom_thumbnail || data.product_thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-4 space-y-1.5">
              <p
                className="font-medium text-base sm:text-lg"
                style={{ color: textColor }}
              >
                {data.product_title || 'Product'}
              </p>
              {data.show_description !== false && stripHtmlToPlainText(data.product_description) && (
                <p
                  className="text-sm opacity-75"
                  style={{ color: textColor }}
                >
                  {stripHtmlToPlainText(data.product_description)}
                </p>
              )}
              {data.show_price !== false && (
                <p
                  className="font-semibold text-base"
                  style={{ color: textColor }}
                >
                  {priceDisplay}
                </p>
              )}
              {/* CTA Button */}
              <div
                className="w-full py-2.5 mt-3 text-center font-medium text-sm sm:text-base transition-all"
                style={{
                  borderRadius: `${Math.max(0, productBorderRadius - 4)}px`,
                  backgroundColor: ctaButtonColor,
                  color: ctaButtonTextColor,
                  boxShadow: shadowStyles[buttonShadow] || "none",
                }}
              >
                {ctaDisplayText}
              </div>
            </div>
          </>
        )

        if (useQuickCheckout) {
          return (
            <button
              onClick={handleProductClick}
              className={cn(
                "w-full block overflow-hidden transition-all cursor-pointer text-left",
                hoverEffect,
                getProductAnimationClass(data.animation_type),
              )}
              style={{
                borderRadius: `${productBorderRadius}px`,
                backgroundColor: blockBackgroundColor,
                border: "none",
              }}
            >
              {previewContent}
            </button>
          )
        }

        return (
          <a
            href={productUrl}
            onClick={() => trackClick(block.id, productUrl)}
            className={cn(
              "w-full block overflow-hidden transition-all cursor-pointer",
              hoverEffect,
              getProductAnimationClass(data.animation_type),
            )}
            style={{
              borderRadius: `${productBorderRadius}px`,
              backgroundColor: blockBackgroundColor,
              border: "none",
            }}
          >
            {previewContent}
          </a>
        )
      }

      // Callout style (default) - compact card with thumbnail
      const calloutContent = (
        <>
          <div className="p-3 sm:p-4 flex gap-3 sm:gap-4">
            {(data.custom_thumbnail || data.product_thumbnail) && (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden shrink-0 bg-gray-100">
                <img
                  src={data.custom_thumbnail || data.product_thumbnail}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="flex-1 min-w-0 space-y-0.5 sm:space-y-1">
              <p
                className="font-medium text-base sm:text-lg truncate"
                style={{ color: textColor }}
              >
                {data.product_title || 'Product'}
              </p>
              {data.show_description !== false && stripHtmlToPlainText(data.product_description) && (
                <p
                  className="text-sm opacity-75 line-clamp-1"
                  style={{ color: textColor }}
                >
                  {stripHtmlToPlainText(data.product_description)}
                </p>
              )}
              {data.show_price !== false && (
                <p
                  className="text-sm sm:text-base font-semibold"
                  style={{ color: textColor }}
                >
                  {priceDisplay}
                </p>
              )}
            </div>
          </div>
          {/* CTA Button */}
          <div
            className="w-full py-3 sm:py-3.5 text-center font-medium text-sm sm:text-base transition-all"
            style={{
              borderRadius: `0 0 ${productBorderRadius}px ${productBorderRadius}px`,
              backgroundColor: ctaButtonColor,
              color: ctaButtonTextColor,
              boxShadow: shadowStyles[buttonShadow] || "none",
            }}
          >
            {ctaDisplayText}
          </div>
        </>
      )

      if (useQuickCheckout) {
        return (
          <button
            onClick={handleProductClick}
            className={cn(
              "w-full block overflow-hidden transition-all cursor-pointer text-left",
              hoverEffect,
              getProductAnimationClass(data.animation_type),
            )}
            style={{
              borderRadius: `${productBorderRadius}px`,
              backgroundColor: blockBackgroundColor,
              border: "none",
            }}
          >
            {calloutContent}
          </button>
        )
      }

      return (
        <a
          href={productUrl}
          onClick={() => trackClick(block.id, productUrl)}
          className={cn(
            "w-full block overflow-hidden transition-all cursor-pointer",
            hoverEffect,
            getProductAnimationClass(data.animation_type),
          )}
          style={{
            borderRadius: `${productBorderRadius}px`,
            backgroundColor: blockBackgroundColor,
            border: "none",
          }}
        >
          {calloutContent}
        </a>
      )
    }

    case "pdf_document": {
      const data = block.data as PDFDocumentBlockData
      const isPro = data.layout_type === "pro"
      const thumbnailUrl = data.thumbnail_url
      const pdfUrl = data.pdf_file_url

      // Button styles for PDF block (matching other blocks)
      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
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
      const pdfButtonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "filled"
            ? theme.button_color
            : theme.button_style === "glass"
              ? `${theme.button_color}`
              : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(1, theme.button_border_width) : theme.button_border_width}px`,
        borderColor:
          theme.button_style === "outline"
            ? theme.text_color
            : theme.button_style === "glass"
              ? `${theme.button_text_color}30`
              : theme.button_border_color || "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
        boxShadow: shadowStyles[buttonShadow] || "none",
      }

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

      // Use PDF modal context - modal renders at root level for proper z-index stacking
      const pdfModalContext = useContext(PDFModalContext)

      const handleOpenPdf = () => {
        if (!pdfUrl) return

        // Track the click
        trackClick(block.id, pdfUrl)

        // If open_directly is enabled, open PDF in new tab
        if (data.open_directly) {
          window.open(pdfUrl, '_blank')
          return
        }

        // If enable_preview is enabled (or default), show modal via context
        if (data.enable_preview !== false && pdfModalContext) {
          pdfModalContext.openPdfModal({
            title: data.title || "PDF Document",
            description: data.description,
            pdfUrl: pdfUrl,
            previewButtonText: data.preview_button_text,
          })
        }
      }

      const textColor = theme.button_text_color
      const hoverEffect = !isInsideCarousel ? "hover:opacity-90" : ""

      // Featured (Pro) layout with thumbnail, title, description
      if (isPro) {
        return (
          <button
            onClick={handleOpenPdf}
            className={cn(
              "w-full overflow-hidden font-medium text-sm sm:text-base transition-all cursor-pointer",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={{
              ...pdfButtonStyles,
              padding: 0,
            }}
          >
            <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
              {/* Thumbnail/Preview */}
              <div
                className="shrink-0 flex items-center justify-center bg-gray-100"
                style={{
                  width: 52,
                  height: 52,
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
                    width="26"
                    height="26"
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
                <span className="text-sm sm:text-base font-semibold leading-tight truncate block" style={{ color: textColor }}>
                  {data.title || "PDF Document"}
                </span>
                {data.description && (
                  <span className="text-xs sm:text-sm leading-tight mt-0.5 opacity-70 truncate block" style={{ color: textColor }}>
                    {data.description}
                  </span>
                )}
              </div>
              {/* Arrow icon - properly aligned */}
              <div className="shrink-0 flex items-center justify-center pr-1">
                <ExternalLink className="w-5 h-5 opacity-50" style={{ color: textColor }} />
              </div>
            </div>
          </button>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <button
          onClick={handleOpenPdf}
          className={cn(
            "w-full flex flex-col items-center justify-center font-medium text-sm sm:text-base transition-all cursor-pointer py-3.5 sm:py-4 px-5 sm:px-6",
            hoverEffect,
            getAnimationClass(data.animation_type)
          )}
          style={pdfButtonStyles}
        >
          {/* Title */}
          <span className="font-semibold truncate w-full text-center" style={{ color: textColor }}>
            {data.title || "PDF Document"}
          </span>
          {/* Button text with PDF icon */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 opacity-70">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
              style={{ color: textColor }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            <span className="text-xs sm:text-sm truncate" style={{ color: textColor }}>
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

      // Button styles for menu block (matching other blocks)
      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
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
      const menuButtonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "filled"
            ? theme.button_color
            : theme.button_style === "glass"
              ? `${theme.button_color}`
              : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(1, theme.button_border_width) : theme.button_border_width}px`,
        borderColor:
          theme.button_style === "outline"
            ? theme.text_color
            : theme.button_style === "glass"
              ? `${theme.button_text_color}30`
              : theme.button_border_color || "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
        boxShadow: shadowStyles[buttonShadow] || "none",
      }

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

      // Use PDF modal context - modal renders at root level for proper z-index stacking
      const pdfModalContext = useContext(PDFModalContext)

      const handleOpenMenu = () => {
        if (!pdfUrl) return

        // Track the click
        trackClick(block.id, pdfUrl)

        // If open_directly is enabled, open PDF in new tab
        if (data.open_directly) {
          window.open(pdfUrl, '_blank')
          return
        }

        // If enable_preview is enabled (or default), show modal via context
        if (data.enable_preview !== false && pdfModalContext) {
          pdfModalContext.openPdfModal({
            title: data.title || "Menu",
            description: data.description,
            pdfUrl: pdfUrl,
            previewButtonText: data.preview_button_text,
          })
        }
      }

      const textColor = theme.button_text_color
      const hoverEffect = !isInsideCarousel ? "hover:opacity-90" : ""

      // Featured (Pro) layout with thumbnail, title, description
      if (isPro) {
        return (
          <button
            onClick={handleOpenMenu}
            className={cn(
              "w-full overflow-hidden font-medium text-sm sm:text-base transition-all cursor-pointer",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={{
              ...menuButtonStyles,
              padding: 0,
            }}
          >
            <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
              {/* Thumbnail/Preview */}
              <div
                className="shrink-0 flex items-center justify-center bg-gray-100"
                style={{
                  width: 52,
                  height: 52,
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
                    width="26"
                    height="26"
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
                <span className="text-sm sm:text-base font-semibold leading-tight truncate block" style={{ color: textColor }}>
                  {data.title || "Menu"}
                </span>
                {data.description && (
                  <span className="text-xs sm:text-sm leading-tight mt-0.5 opacity-70 truncate block" style={{ color: textColor }}>
                    {data.description}
                  </span>
                )}
              </div>
              {/* Arrow icon - properly aligned */}
              <div className="shrink-0 flex items-center justify-center pr-1">
                <ExternalLink className="w-5 h-5 opacity-50" style={{ color: textColor }} />
              </div>
            </div>
          </button>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <button
          onClick={handleOpenMenu}
          className={cn(
            "w-full flex flex-col items-center justify-center font-medium text-sm sm:text-base transition-all cursor-pointer py-3.5 sm:py-4 px-5 sm:px-6",
            hoverEffect,
            getAnimationClass(data.animation_type)
          )}
          style={menuButtonStyles}
        >
          {/* Title */}
          <span className="font-semibold truncate w-full text-center" style={{ color: textColor }}>
            {data.title || "Menu"}
          </span>
          {/* Button text with menu icon */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 opacity-70">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
              style={{ color: textColor }}
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            <span className="text-xs sm:text-sm truncate" style={{ color: textColor }}>
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

      // Button styles for Calendly block (matching other blocks)
      const buttonShadow = (theme as any).button_shadow || "none"
      const shadowColor = (theme as any).button_shadow_color || "#000000"
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
      const calendlyButtonStyles: React.CSSProperties = {
        backgroundColor:
          theme.button_style === "filled"
            ? theme.button_color
            : theme.button_style === "glass"
              ? `${theme.button_color}`
              : "transparent",
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(1, theme.button_border_width) : theme.button_border_width}px`,
        borderColor:
          theme.button_style === "outline"
            ? theme.text_color
            : theme.button_style === "glass"
              ? `${theme.button_text_color}30`
              : theme.button_border_color || "transparent",
        borderStyle: "solid",
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : "none",
        boxShadow: shadowStyles[buttonShadow] || "none",
      }

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

      // State for Calendly modal
      const [showCalendlyModal, setShowCalendlyModal] = useState(false)

      // Dispatch custom event when modal state changes (for mobile button hiding)
      useEffect(() => {
        window.dispatchEvent(new CustomEvent('pdfModalStateChange', { detail: { isOpen: showCalendlyModal } }))
      }, [showCalendlyModal])

      const handleOpenCalendly = () => {
        if (!calendlyUrl) return

        // Track the click
        trackClick(block.id, calendlyUrl)

        // If direct_link mode, open in new tab
        if (data.embed_mode === 'direct_link') {
          window.open(calendlyUrl, '_blank')
          return
        }

        // If embedded mode with modal type, show modal
        if (data.embed_mode === 'embedded' && data.embed_type === 'modal') {
          setShowCalendlyModal(true)
          return
        }

        // Default: open in new tab (for inline embed mode or fallback)
        window.open(calendlyUrl, '_blank')
      }

      const handleCloseCalendly = () => {
        setShowCalendlyModal(false)
      }

      const textColor = theme.button_text_color
      const hoverEffect = !isInsideCarousel ? "hover:opacity-90" : ""

      // Check if inline embed mode
      const isInlineEmbed = data.embed_mode === 'embedded' && data.embed_type === 'inline' && calendlyUrl

      // Inline embed layout
      if (isInlineEmbed) {
        return (
          <div
            className={cn(
              "w-full overflow-hidden",
              getAnimationClass(data.animation_type)
            )}
            style={{
              borderRadius: `${theme.button_border_radius}px`,
            }}
          >
            <iframe
              src={calendlyUrl}
              className="w-full border-0"
              style={{
                minHeight: '650px',
                borderRadius: `${theme.button_border_radius}px`,
              }}
              title={data.title || "Schedule a Meeting"}
            />
          </div>
        )
      }

      // Featured (Pro) layout with thumbnail, title, description
      if (isPro) {
        return (
          <>
            <button
              onClick={handleOpenCalendly}
              className={cn(
                "w-full overflow-hidden font-medium text-sm sm:text-base transition-all cursor-pointer",
                hoverEffect,
                getAnimationClass(data.animation_type)
              )}
              style={{
                ...calendlyButtonStyles,
                padding: 0,
              }}
            >
              <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4">
                {/* Thumbnail/Preview */}
                <div
                  className="shrink-0 flex items-center justify-center bg-gray-100"
                  style={{
                    width: 52,
                    height: 52,
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
                    <Calendar className="w-6 h-6 text-blue-500" />
                  )}
                </div>
                {/* Content - Title and Description vertically aligned */}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-sm sm:text-base font-semibold leading-tight truncate block" style={{ color: textColor }}>
                    {data.title || "Book a Meeting"}
                  </span>
                  {data.description && (
                    <span className="text-xs sm:text-sm leading-tight mt-0.5 opacity-70 truncate block" style={{ color: textColor }}>
                      {data.description}
                    </span>
                  )}
                </div>
                {/* Arrow icon - properly aligned */}
                <div className="shrink-0 flex items-center justify-center pr-1">
                  <ExternalLink className="w-5 h-5 opacity-50" style={{ color: textColor }} />
                </div>
              </div>
            </button>

            {/* Calendly Modal - Clean light UI */}
            {showCalendlyModal && calendlyUrl && (
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 bg-black/60 sm:bg-black/50 animate-in fade-in duration-300 ease-out"
                onClick={handleCloseCalendly}
              >
                <div
                  className="relative w-full h-full sm:h-[85vh] sm:max-h-[720px] max-w-lg bg-white sm:rounded-3xl flex flex-col shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Top Bar */}
                  <div className="flex items-center justify-between px-4 py-3 sm:py-4 border-b shrink-0">
                    <button
                      onClick={handleCloseCalendly}
                      className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M19 12H5M12 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <h3 className="text-base font-semibold text-gray-900 truncate flex-1 text-center px-2">
                      {data.title || "Book a Meeting"}
                    </h3>
                    <button
                      onClick={handleCloseCalendly}
                      className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Calendly Embed */}
                  <div className="flex-1 overflow-hidden min-h-0">
                    <iframe
                      src={calendlyUrl}
                      className="w-full h-full border-0"
                      style={{ minHeight: '500px' }}
                      title={data.title || "Book a Meeting"}
                    />
                  </div>
                </div>
              </div>
            )}
          </>
        )
      }

      // Default layout - Title on top, button text below with icon
      return (
        <>
          <button
            onClick={handleOpenCalendly}
            className={cn(
              "w-full flex flex-col items-center justify-center font-medium text-sm sm:text-base transition-all cursor-pointer py-3.5 sm:py-4 px-5 sm:px-6",
              hoverEffect,
              getAnimationClass(data.animation_type)
            )}
            style={calendlyButtonStyles}
          >
            {/* Title */}
            <span className="font-semibold truncate w-full text-center" style={{ color: textColor }}>
              {data.title || "Book a Meeting"}
            </span>
            {/* Button text with Calendar icon */}
            <div className="flex items-center justify-center gap-1.5 sm:gap-2 opacity-70">
              <Calendar className="w-3.5 h-3.5 shrink-0" style={{ color: textColor }} />
              <span className="text-xs sm:text-sm truncate" style={{ color: textColor }}>
                {data.button_text || "Schedule Now"}
              </span>
            </div>
          </button>

          {/* Calendly Modal - Clean light UI */}
          {showCalendlyModal && calendlyUrl && (
            <div
              className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 bg-black/60 sm:bg-black/50 animate-in fade-in duration-300 ease-out"
              onClick={handleCloseCalendly}
            >
              <div
                className="relative w-full h-full sm:h-[85vh] sm:max-h-[720px] max-w-lg bg-white sm:rounded-3xl flex flex-col shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Top Bar */}
                <div className="flex items-center justify-between px-4 py-3 sm:py-4 border-b shrink-0">
                  <button
                    onClick={handleCloseCalendly}
                    className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-base font-semibold text-gray-900 truncate flex-1 text-center px-2">
                    {data.title || "Book a Meeting"}
                  </h3>
                  <button
                    onClick={handleCloseCalendly}
                    className="p-2 -mr-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Calendly Embed */}
                <div className="flex-1 overflow-hidden min-h-0">
                  <iframe
                    src={calendlyUrl}
                    className="w-full h-full border-0"
                    style={{ minHeight: '500px' }}
                    title={data.title || "Book a Meeting"}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )
    }

    default:
      return null
  }
}
