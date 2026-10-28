"use client"

import { personName } from "@/lib/profile/display-name"
import { PLAN_CURRENCY, isPlanPriced } from "@/lib/money/product-currency"
import { shopMoneyIn } from "@/lib/store/shop-money"
import { usePageMoney } from "@/components/platform/price-currency"
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
import { normalizeSocialUrl } from "@/lib/onepage/types"
import { socialLinkId } from "@/lib/onepage/link-keys"
import { LinkIcon, SocialIcon, socialPlatformLabel } from "@/components/onepage/brand-icons"
import { resolveLinkIcon } from "@/components/onepage/link-icons"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AvatarMark } from "@/components/app/app-avatar"
import { useState, useRef, useEffect, useLayoutEffect, useCallback, createContext, useContext } from "react"
import { Bell, X, Check, Send, ChevronLeft, ChevronRight, ExternalLink, Loader2, Download, ShoppingBag, Calendar } from "lucide-react"
import { getLinksUrl, getLinksShareUrl } from "@/lib/url-helpers"
import { downloadEntitledFile } from "@/components/download-button"
import { downloadFile } from "@/lib/downloads/download-file"
import { intervalOf, perInterval } from "@/lib/pricing/list-price"
import { ExtraBlock, ExtraBlockPreviewContext, IncompleteLinkPlaceholder, SensitiveLinkQuestion } from "@/components/onepage/extra-blocks"
import { isExtraBlock, isIncompleteLink } from "@/lib/onepage/extra-blocks"
import { OnePageFonts } from "@/components/onepage/onepage-fonts"
import { fontStack } from "@/lib/onepage/fonts"
import { WallpaperNoise, WallpaperPattern } from "@/components/onepage/wallpaper-layers"
/* Round 40: the photo wallpaper, block layouts, the header's alignment and the themed sheets (components/onepage/themes, lib/onepage/theme-layout, lib/onepage/sheet-theme). */
import { WallpaperPhoto } from "@/components/onepage/themes/wallpaper-photo"
import { blockGapClass, blockLayoutOf, headerAlignOf, isLinkTilePair, linkDrawnAsCard, pairLinkTiles } from "@/lib/onepage/theme-layout"
import { sheetRootCss } from "@/lib/onepage/sheet-theme"
import { BottomSheet } from "@/components/ui/bottom-sheet"
import { isBlockShown } from "@/lib/onepage/extra-blocks"
import { pageOrigin } from "@/lib/orders/checkout-origin-browser"
import { getOrCreateSessionId, getOrCreateVisitorId } from "@/lib/analytics-utils"
import { canvasRule, heroHeaderShown } from "@/lib/onepage/page-frame"
import { PosterVideo } from "@/components/onepage/poster-video"
import { HERO_FADE_MASK, videoPoster } from "@/lib/onepage/poster-video"
import { readableOn } from "@/lib/onepage/theme-apply"
import { OnePageProductBlock, type LegacyQuickCheckout } from "@/components/onepage/product-block"
import { pairProductTiles } from "@/lib/onepage/product-block"
import { tt } from "@/lib/i18n/text"
import { useLiveLayout } from "@/lib/onepage/live-layout"
import { ONEPAGE_COLUMN_PX, onePageImageSrc } from "@/lib/onepage/display-image"
import { croppedMediaStyle } from "@/lib/onepage/media-crop"
import { bookingSource } from "@/lib/onepage/creator-blocks"
import { BUTTON_ICON_CLASS, BUTTON_ICON_INSET, BUTTON_SIZE_CLASS, buttonAlign, buttonBackground, buttonHover, buttonHoverVars, buttonIconSide, buttonShadow as themeButtonShadow, buttonShape, buttonSize, themeButtonStripFill, themeButtonStyle } from "@/lib/onepage/button-style"
import { EmailSignupView, type EmailSignupFormOptions } from "@/components/onepage/email-signup"
import { OnePageLegalLinks } from "@/components/onepage/onepage-legal-links"
import { OnePageSubscribeSheet } from "@/components/onepage/subscribe-sheet"
import { OnePageShareSheet } from "@/components/onepage/share-sheet"
import { emailSignupImage, emailSignupLayout, emailSignupStacked } from "@/lib/onepage/email-signup"

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

/**
 * The wallpaper video drawn through the part the creator framed in the
 * editor (lib/onepage/media-crop.ts, a 9:16 crop saved with `v: 2`), so the
 * preview and the live page show the same part. A page with no such crop
 * keeps the full-bleed cover it always had.
 */
function wallpaperVideoStyle(theme: unknown, base: React.CSSProperties): React.CSSProperties {
  const crop = (theme as { background_video_crop?: { v?: number } | null } | null)?.background_video_crop
  const framed = crop && crop.v === 2 ? croppedMediaStyle(crop) : undefined
  if (!framed) return base
  return { ...base, right: "auto", bottom: "auto", ...(framed as React.CSSProperties), position: base.position ?? "absolute" }
}

/*
  THE PROFILE VIDEO, FROM ITS OWN FIRST FRAME (round 40). This drew the
  profile photo blurred and scaled under the video, and the video blurred,
  scaled and see-through, then let both transition into each other: two
  different pictures blended for half a second ("they morph and interlace").
  It also gave the video z-index 1 with nothing to contain it, which put it
  over the hero's name, bio and social row. It is components/onepage/
  poster-video now: the poster frame in the video's own box, the video
  faded in over it on `playing`, opacity only, in its own stacking context.
  The photo is only the still for a visitor who asked for reduced motion or
  less data, or when the video will not play.
*/
function SmoothAvatarVideo({
  videoUrl,
  imageUrl,
  poster,
  alt,
  videoStyle,
  imageStyle,
  priority,
}: {
  videoUrl: string
  imageUrl?: string | null
  /** The video's first frame, saved with it (lib/onepage/poster-video). */
  poster?: string | null
  alt: string
  videoStyle?: React.CSSProperties
  imageStyle?: React.CSSProperties
  priority?: boolean
}) {
  return (
    <PosterVideo
      src={videoUrl}
      poster={poster}
      fallback={imageUrl}
      alt={alt}
      mediaStyle={videoStyle}
      fallbackStyle={imageStyle}
      priority={priority}
    />
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
  sellerName,
  error,
  onSubmit,
}: {
  ctaText: string
  sellerName: string
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
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/25 focus:border-transparent transition-all"
          required
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/25 focus:border-transparent transition-all"
          required
        />
      </div>
      <input
        type="email"
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a1a2e]/25 focus:border-transparent transition-all"
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
        {/* Said before the button is pressed: taking the download adds the
            address to the seller's list (app/api/checkout/quick-free). */}
        We'll email your download link, and {sellerName} may send you updates. Unsubscribe any time.
      </p>
    </div>
  )
}

/* Glass for a light page: the same frosted button and panel, in ink instead of white (GLASS ON A LIGHT PAGE). */
const GLASS_ON_LIGHT_BELL = {
  buttonBg: "rgba(17, 17, 19, 0.06)",
  buttonBorder: "1px solid rgba(17, 17, 19, 0.12)",
  panelBg: "rgba(255, 255, 255, 0.72)",
  panelBorder: "1px solid rgba(17, 17, 19, 0.1)",
  iconColor: "text-[#111113]/80",
  textColor: "text-[#111113]/90",
  inputBg: "bg-black/5",
  inputBorder: "border-black/10",
  inputText: "text-[#111113]",
  inputPlaceholder: "placeholder-black/40",
  buttonSubmitBg: "bg-[#111113] hover:bg-[#1a1a2e] text-white",
  dotColor: "bg-[#111113]/60",
  shadow: "0 0 6px rgba(17, 17, 19, 0.25)",
}
const GLASS_ON_LIGHT_SHARE = {
  buttonBg: "rgba(17, 17, 19, 0.06)",
  buttonBorder: "1px solid rgba(17, 17, 19, 0.12)",
  panelBg: "rgba(255, 255, 255, 0.98)",
  iconColor: "text-[#111113]/80",
}

/**
 * Whether the page behind the corner buttons is light: a solid colour, or
 * the average of a gradient's colours, brighter than the middle. A picture
 * or a video counts as dark, as glass was made for it.
 */
export function pageIsLight(theme: { background_type?: string | null; background_color?: string | null; background_gradient?: string | null }): boolean {
  if (theme.background_type === "image" || theme.background_type === "video") return false
  const src = theme.background_type === "gradient" && theme.background_gradient ? theme.background_gradient : theme.background_color || "#ffffff"
  const hexes = src.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)
  if (!hexes) return true
  const lum = hexes.map((h) => {
    let x = h.slice(1)
    if (x.length === 3) x = x.split("").map((c) => c + c).join("")
    return (0.299 * parseInt(x.slice(0, 2), 16) + 0.587 * parseInt(x.slice(2, 4), 16) + 0.114 * parseInt(x.slice(4, 6), 16)) / 255
  })
  return lum.reduce((a, b) => a + b, 0) / lum.length > 0.6
}

// Notification Bell Component with Subscribe Form
function NotificationBell({
  sellerName,
  sellerId,
  onepageId,
  style = "glass",
  isVisible = true,
  onLight = false,
}: { sellerName: string; sellerId: string | null; onepageId: string; style?: "glass" | "white" | "black"; isVisible?: boolean; onLight?: boolean }) {
  const [isOpen, setIsOpen] = useState(false)
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
  /*
    GLASS ON A LIGHT PAGE IS INK GLASS. Glass is white on a 15% white circle,
    made for a dark or photo page; on a light one the bell could not be seen
    and its panel's words were white on near white (round 10 audit, S1). On a
    light page (pageIsLight) the same glass is drawn in ink.
  */
  const inkGlass = onLight && !(style === "white" || style === "black")
  const s = inkGlass ? GLASS_ON_LIGHT_BELL : styles[style as keyof typeof styles] || styles.glass
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
  // Show when visible OR when panel is open (so it doesn't vanish mid-interaction)
  const shouldShow = (isVisible || isOpen) && !hideForModal

  /*
    THE PANEL IS A SHEET NOW (components/onepage/subscribe-sheet): its own
    scrim, Escape and drag close it, so nothing here listens for a press
    elsewhere. A press inside the sheet would have counted as one.
  */
  return (
    <div
      className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[20] transition-all duration-500 ease-out"
      style={{
        opacity: shouldShow ? 1 : 0,
        transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
        pointerEvents: shouldShow ? "auto" : "none",
      }}
    >
      {/* Bell Button */}
      <button
        data-onepage-bell=""
        data-ink={inkGlass ? "" : undefined}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Subscribe to ${sellerName}`}
        aria-haspopup="dialog"
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

      <OnePageSubscribeSheet
        open={isOpen}
        onClose={() => setIsOpen(false)}
        dark={!onLight}
        sellerName={sellerName}
        sellerId={sellerId}
        onepageId={onepageId}
      />

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
  avatarVideoUrl,
  style = "white",
  isVisible = true,
  onLight = false,
}: {
  pageUrl: string
  pageTitle: string
  avatarUrl?: string | null
  avatarVideoUrl?: string | null
  style?: "glass" | "white" | "black"
  /* Passed by the page and no longer read: the sheet takes the page's light or dark instead of a band in its colour (components/onepage/share-sheet). */
  showSubscribe?: boolean
  accentColor?: string
  themeBackgroundType?: "solid" | "gradient" | "image" | "video"
  themeBackgroundColor?: string
  themeBackgroundGradient?: string
  isVisible?: boolean
  /** The page behind is light: glass is drawn in ink (see GLASS ON A LIGHT PAGE). */
  onLight?: boolean
}) {
  const [isOpen, setIsOpen] = useState(false)
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
  const inkGlass = onLight && !(style === "white" || style === "black")
  const s = inkGlass ? GLASS_ON_LIGHT_SHARE : styles[style as keyof typeof styles] || styles.glass

  // Share icon is always positioned on the TOP LEFT (both mobile and desktop)
  // Subscribe icon stays on TOP RIGHT
  // Desktop (md): top-[22px] to align 2px above the subscribe button which is at top-6 (24px)
  const positionClass = "fixed top-4 left-4 sm:top-6 sm:left-6 md:top-[22px] md:left-8 z-[20]"
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
  // Show when visible OR when share modal is open (don't vanish mid-interaction)
  const shouldShow = (isVisible || isOpen) && !hideForModal

  return (
    <>
      <div
        className={positionClass}
        style={{
          transition: "opacity 500ms ease-out, transform 500ms ease-out",
          opacity: shouldShow ? 1 : 0,
          transform: shouldShow ? "translateY(0)" : "translateY(-10px)",
          pointerEvents: shouldShow ? "auto" : "none",
        }}
      >
        <div>
          {/* Share Button - icons 3px smaller on desktop */}
          <button
            data-onepage-share-button=""
            data-ink={inkGlass ? "" : undefined}
            onClick={() => setIsOpen(!isOpen)}
            aria-label={`Share ${pageTitle}`}
            aria-haspopup="dialog"
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
            <Send className={cn("w-[18px] h-[18px] sm:w-[17px] sm:h-[17px] transition-transform duration-300", isOpen ? "rotate-45 scale-90" : "", s.iconColor)} />
          </button>
        </div>
      </div>

      <OnePageShareSheet
        open={isOpen}
        onClose={() => setIsOpen(false)}
        dark={!onLight}
        pageUrl={pageUrl}
        pageTitle={pageTitle}
        avatarUrl={avatarUrl}
        avatarVideoUrl={avatarVideoUrl}
      />
    </>
  )
}

// Dynamic Favicon Component for OnePage
/*
  THE ICON IS THE PICTURE THE PAGE DRAWS. The page's photo, or with only a
  video a frame of it. It used to go on, for a page with no photo, to the
  creator page header's photo (/api/onepage/seller-avatar), so the tab and an
  iPhone's app switcher could show a face the page itself did not: an old
  one, left in the header. The server's icon comes from the same photo
  (app/(marketing)/l/[slug], publishedShape).
*/
interface OnePageDynamicFaviconProps {
  avatarUrl?: string | null
  videoUrl?: string | null
}

function OnePageDynamicFavicon({ avatarUrl, videoUrl }: OnePageDynamicFaviconProps) {
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null)

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
  const faviconUrl = avatarUrl || videoFrameUrl

  // Apply favicon
  useEffect(() => {
    if (!faviconUrl) return

    /* The same rule as components/store-builder/dynamic-favicon: this clears
       only the links it added. Clearing `link[rel*='icon']` takes the root
       layout's React-rendered one with it, and a React-owned node removed
       behind React's back crashes the next deletion of that subtree with
       "removeChild of null". A browser reads the last icon link in the
       document, so appending is all this needs to do. */
    const OURS = "data-storelib-favicon"
    const dropOurs = () => {
      document.querySelectorAll(`link[${OURS}]`).forEach((link) => link.remove())
    }
    dropOurs()

    // Create new favicon link
    const link = document.createElement("link")
    link.rel = "icon"
    link.href = faviconUrl
    link.type = faviconUrl.startsWith("data:") ? "image/png" : "image/x-icon"
    link.setAttribute(OURS, "")
    document.head.appendChild(link)

    // Also add apple-touch-icon for iOS
    const appleLink = document.createElement("link")
    appleLink.rel = "apple-touch-icon"
    appleLink.href = faviconUrl
    appleLink.setAttribute(OURS, "")
    document.head.appendChild(appleLink)

    return dropOurs
  }, [faviconUrl])

  return null
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

/**
 * True below 640px, where the music and checkout panels are the shared sheet.
 * Its own few lines rather than the app's (components/ui/choice-list), which
 * would bring the app's pickers into a visitor's page.
 */
function usePhoneWidth(): boolean {
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)")
    const on = () => setPhone(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return phone
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
  const sellerName = personName({ name: title })

  // Modal visibility state - to hide buttons when fullscreen modals are open
  /* True in the editor's preview frame (components/onepage/preview-document). */
  const inEditorPreview = useContext(ExtraBlockPreviewContext)
  const [isAnyModalOpen, setIsAnyModalOpen] = useState(false)
  const modalVisibilityContextValue = { isAnyModalOpen, setIsAnyModalOpen }

  // Scroll-based fade for share/notification buttons (same as editor preview)
  const [buttonsVisible, setButtonsVisible] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const nearTop = currentScrollY < 50
      const scrollingUp = currentScrollY < lastScrollY.current - 5

      setButtonsVisible(nearTop || scrollingUp)
      lastScrollY.current = currentScrollY
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  /* Below 640px the music and checkout panels are the shared sheet (see THE SPOTIFY, APPLE MUSIC below). */
  const isPhone = usePhoneWidth()

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

  // Prevent pull-to-refresh when any modal is open
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
          /* This page and where its visit came from, for the order's Source. */
          origin: pageOrigin(),
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

  /*
   * The shared button's helper, not a request and a window.open of our own.
   * That window was asked for AFTER the await, which is what a pop-up
   * blocker eats, and the iOS build has no Browser plugin to call. The
   * helper asks for the address and saves the file where the button is,
   * keeping the visitor on this page (components/download-button,
   * lib/downloads/download-file).
   */
  const handleQuickCheckoutDownload = useCallback(async (asset: DigitalAsset) => {
    if (!quickCheckoutReceiptToken) return
    await downloadEntitledFile(asset.id, { receiptToken: quickCheckoutReceiptToken })
  }, [quickCheckoutReceiptToken])

  // Download function for already purchased products
  const downloadPurchasedAsset = useCallback(async (productId: string) => {
    const purchase = purchasedProducts[productId]
    if (!purchase || !purchase.receiptToken || !purchase.assets?.length) return

    // Download the first asset, through the same helper as the receipt.
    const asset = purchase.assets[0]
    await downloadEntitledFile(asset.id, { receiptToken: purchase.receiptToken })
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
    /*
      No title colour, title font or social icon colour here, on purpose.
      They used to default to black and Inter, and the blocks below read
      `title_color || text_color`: a theme that never set a title colour (the
      default theme, most templates) got a BLACK title and black icons on the
      live page, over a dark wallpaper, while the editor's preview, which has
      no such defaults, showed them in the text colour. Same for the title
      font: Inter live, the body font in the preview. Left unset, both
      surfaces fall back the same way.
    */
    title_color: null as string | null,
    title_font: null as string | null,
    social_icon_color: undefined as string | undefined,
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

  // Track whether initial block animations have completed to prevent retrigger on modal close
  const [hasBlocksAnimated, setHasBlocksAnimated] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setHasBlocksAnimated(true), (safeBlocks?.length || 0) * 50 + 500)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  /* The wallpaper's grain and pattern are components/onepage/wallpaper-layers, shared with the editor's preview. */

  /* On the creator page's own domain it is <domain>/links (settings.custom_domain, lib/custom-domains). */
  const pageUrl = getLinksShareUrl(onepage.slug, (onepage.settings as { custom_domain?: string | null } | null)?.custom_domain)

  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  A FUNCTION THAT RETURNS ELEMENTS, NOT A COMPONENT DECLARED IN A RENDER
   * ═══════════════════════════════════════════════════════════════════════
   * This used to be written as a component and used as `<PageContent />`. A
   * component declared inside a render is a NEW function on every render, and
   * React compares element types by identity: a different type means throw
   * the old tree away and build a new one. So every state change in this
   * component unmounted and rebuilt the entire page.
   *
   * There is a state change on almost every scroll — `buttonsVisible` above
   * flips as you move — and on a phone you are always scrolling. Measured on
   * the real page in scripts/check-onepage-stability.mjs: ONE scroll event
   * destroyed 12 <img> elements and built 12 fresh ones. A rebuilt <img>
   * repaints from nothing, the avatar drops back to the grey disc Radix shows
   * while it re-resolves, the deblur keyframe replays, and the carousel loses
   * its measured width. That is the blinking, the avatar "refreshing" on its
   * own, and the flash while you swipe — all one bug.
   *
   * Called as a plain function, the elements it returns are reconciled by
   * position like any other children, so nothing remounts. It holds no hooks,
   * which is what makes that legal.
   */
  /* The computer's layout or the phone's, not both (lib/onepage/live-layout): the server sends both, the browser keeps one. */
  const liveLayout = useLiveLayout()
  const renderPageContent = ({ isDesktop = false }: { isDesktop?: boolean } = {}) => (
    <div
      className={cn("relative z-10 w-full flex flex-col min-h-full", isDesktop ? "max-w-full" : "max-w-lg mx-auto")}
      style={{
        paddingLeft: isDesktop ? "28px" : "20px",
        paddingRight: isDesktop ? "28px" : "20px",
        // More top padding on mobile to push avatar/content down
        /* No top padding only above a hero that is really drawn: without a
           picture the header is the classic one and needs the same 50px it
           always has (lib/onepage/page-frame heroHeaderShown). */
        paddingTop: isDesktop ? "0" : heroHeaderShown(safeTheme, { avatar_url, avatar_video_url }) ? "0" : "50px",
        paddingBottom: "20px",
        minHeight: isDesktop ? "100%" : "100vh",
      }}
    >
      {/* The gap is the page's spacing, tighter on the Compact layout; the alignment is the classic header's (lib/onepage/theme-layout). */}
      <div
        className={cn("flex flex-col items-center", blockGapClass(safeTheme))}
        data-block-layout={blockLayoutOf(safeTheme)}
        data-op-align={headerAlignOf(safeTheme)}
      >
        {pairLinkTiles(pairProductTiles(safeBlocks
          /* In the editor's preview a new link still waiting for its address is drawn as a placeholder; never live. */
          .filter((b) => isBlockVisible(b) || (inEditorPreview && isIncompleteLink(b)))
          .sort((a, b) => (a?.sort_order || 0) - (b?.sort_order || 0))), blockLayoutOf(safeTheme))
          .map((item, index) => {
            const animClass = !hasBlocksAnimated ? "animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both" : ""
            const animStyle = !hasBlocksAnimated ? { animationDelay: `${index * 50}ms` } : undefined
            /* The Grid layout: plain links that follow one another, two to a row, each a tile (app/globals.css [data-link-tile]). */
            if (isLinkTilePair(item)) {
              return (
                <div key={item.key} className={cn("grid w-full grid-cols-2 gap-3", animClass)} style={animStyle} data-link-pair="">
                  {(item.links as OnePageBlock[]).map((block) => (
                    <div key={block.id} className="min-w-0" data-link-tile="" data-sensitive-label={sensitiveLabel(block)}>
                      {inEditorPreview && isIncompleteLink(block) ? (
                        <IncompleteLinkPlaceholder label={(block.data as LinkButtonBlockData)?.label} theme={safeTheme} />
                      ) : (
                        <PublicBlockRenderer
                          block={block}
                          theme={safeTheme}
                          profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                          onepageId={onepage.id}
                          sellerId={seller_id}
                          isDesktop={isDesktop}
                          settings={safeSettings}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )
            }
            /* Product tiles that follow one another, two to a row (lib/onepage/product-block pairProductTiles). */
            if ("tiles" in item) {
              return (
                <div key={item.key} className={cn("grid w-full gap-3", item.tiles.length > 1 ? "grid-cols-2" : "grid-cols-1", animClass)} style={animStyle} data-onepage-enter={animClass ? "" : undefined} data-product-pair="">
                  {item.tiles.map((block) => (
                    <div key={block.id} className="min-w-0" data-sensitive-label={sensitiveLabel(block)}>
                      <PublicBlockRenderer
                        block={block}
                        theme={safeTheme}
                        profile={{ title, bio, avatar_url, avatar_video_url, avatar_video_crop, social_links }}
                        onepageId={onepage.id}
                        sellerId={seller_id}
                        isDesktop={isDesktop}
                        settings={safeSettings}
                        inPair={item.tiles.length > 1}
                      />
                    </div>
                  ))}
                </div>
              )
            }
            const block = item
            if (inEditorPreview && isIncompleteLink(block)) {
              return (
                <div key={block.id} className={cn("w-full", animClass)} style={animStyle} data-onepage-enter={animClass ? "" : undefined}>
                  <IncompleteLinkPlaceholder label={(block.data as LinkButtonBlockData)?.label} theme={safeTheme} />
                </div>
              )
            }
            return (
              <div
                key={block.id}
                className={cn("w-full", animClass)}
                style={animStyle}
                data-onepage-enter={animClass ? "" : undefined}
                data-sensitive-label={sensitiveLabel(block)}
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
            )
          })}
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
        {/* Footer links: Privacy, Terms and Cookies open in a sheet over the page (components/onepage/onepage-legal-links). */}
        <OnePageLegalLinks dark={isDarkBackground} color={isDarkBackground ? "#9ca3af" : "#1f2937"} />
      </div>
    </div>
  )

  /*
    THE SPOTIFY, APPLE MUSIC AND FREE CHECKOUT SHEETS. On a phone each was a
    panel that animated up with a class, could not be dragged, and vanished
    on the frame it was closed. Under 640px they are the shared sheet now
    (components/ui/bottom-sheet.tsx): the same rise, the same drag and flick,
    the same slide out as the sheets in the app. From 640px they are the
    centred dialogs they were. What is inside is written once, below, and
    drawn in either; a close button in it hands the close to the sheet on a
    phone (`data-sheet-close`), so the slide starts before the page renders.
    Each takes its data as an argument of the same name, already known to be
    there.
  */
  type SpotifyData = NonNullable<typeof spotifyModalData>
  const spotifyBody = (spotifyModalData: SpotifyData) => (
    <>
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
          data-sheet-close=""
          onClick={isPhone ? undefined : () => setSpotifyModalOpen(false)}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Spotify Embed - responsive height */}
      <div className="p-3">
        <div className="w-full overflow-hidden rounded-xl bg-black/5" style={{ aspectRatio: '1 / 0.85', maxHeight: '352px' }}>
          <iframe
            src={spotifyModalData.embedUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="block w-full h-full"
          />
        </div>
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
    </>
  )

  type AppleMusicData = NonNullable<typeof appleMusicModalData>
  const appleMusicBody = (appleMusicModalData: AppleMusicData) => (
    <>
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
          data-sheet-close=""
          onClick={isPhone ? undefined : () => setAppleMusicModalOpen(false)}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Apple Music Embed - responsive */}
      <div className="p-3">
        <div className="w-full overflow-hidden rounded-xl bg-black/5" style={{ aspectRatio: '1 / 0.88', maxHeight: '360px' }}>
          <iframe
            src={appleMusicModalData.embedUrl}
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            allow="autoplay *; encrypted-media *; fullscreen *; clipboard-write"
            sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-storage-access-by-user-activation allow-top-navigation-by-user-activation"
            loading="lazy"
            className="block w-full h-full"
            style={{ overflow: 'hidden', background: 'transparent' }}
          />
        </div>
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
    </>
  )

  type QuickCheckoutData = NonNullable<typeof quickCheckoutModalData>
  const quickCheckoutBody = (quickCheckoutModalData: QuickCheckoutData) => (
    <>
      {/* Close button */}
      <button
        data-sheet-close=""
        onClick={isPhone ? undefined : () => setQuickCheckoutModalOpen(false)}
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
              alt={quickCheckoutModalData.productTitle}
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
            sellerName={sellerName}
            error={quickCheckoutError}
            onSubmit={handleQuickCheckoutSubmit}
          />
        )}

        {quickCheckoutStep === 'loading' && (
          <div className="py-12 flex flex-col items-center justify-center animate-in fade-in duration-200">
            <div className="relative">
              <Loader2 className="w-12 h-12 text-[#1a1a2e] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-[#1a1a2e]" />
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
                    <div className="w-10 h-10 bg-[#f1f2f4] rounded-lg flex items-center justify-center group-hover:bg-[#e8e9ec] transition-colors">
                      <Download className="w-5 h-5 text-[#1a1a2e]" />
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="font-medium text-gray-900 text-sm truncate">{asset.file_name}</p>
                      <p className="text-xs text-gray-500">Click to download</p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-[#4b5563] transition-colors" />
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
              data-sheet-close=""
              onClick={isPhone ? undefined : () => setQuickCheckoutModalOpen(false)}
              className="w-full mt-4 py-3 sm:py-2.5 px-4 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50 transition-colors mb-4 sm:mb-0"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  )

  /* The PDF panel's contents: in the phone's sheet (whose own close is data-sheet-close) or the centred panel. */
  const pdfBody = (
    pdfModalData: { title?: string; description?: string; pdfUrl: string; previewButtonText?: string },
    closeProps: { onClick?: () => void; "data-sheet-close"?: string },
  ) => (
    <>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-4 border-b shrink-0">
        <button
          type="button"
          {...closeProps}
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
          type="button"
          {...closeProps}
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
    </>
  )

  return (
    <ModalVisibilityContext.Provider value={modalVisibilityContextValue}>
    <SpotifyModalContext.Provider value={spotifyModalContextValue}>
    <AppleMusicModalContext.Provider value={appleMusicModalContextValue}>
    <QuickCheckoutModalContext.Provider value={quickCheckoutModalContextValue}>
    <PDFModalContext.Provider value={pdfModalContextValue}>
      {/* The icon is the page's own picture, or a frame of its video */}
      <OnePageDynamicFavicon avatarUrl={avatar_url} videoUrl={avatar_video_url} />
      {/* The document's canvas in the page's own colour: no white under the footer, in the home indicator's band or past the end of a pull (lib/onepage/page-frame) */}
      <style dangerouslySetInnerHTML={{ __html: canvasRule(safeTheme) }} />
      {/* The product sheet's, the checkout window's and the scrollbar's colours, from the theme (lib/onepage/sheet-theme, the .op-sheet rules in app/globals.css) */}
      <style dangerouslySetInnerHTML={{ __html: sheetRootCss(safeTheme) }} />
      {/* Asks before a link marked sensitive opens (data-sensitive-label on its box) */}
      <SensitiveLinkQuestion />
      {/* The theme's body and title fonts, the same links the editor's preview renders */}
      <OnePageFonts theme={safeTheme} />

      {/*
        THE DEBLUR IS GONE ON PURPOSE.

        A .media-deblur rule used to run blur(3px) down to blur(0) over half a
        second, with fill "both", on the avatar, the hero picture and the
        avatar video. "Both" means the very first frame is already blurred, and
        an entrance animation replays on every mount, so the creator's face
        arrived soft every time anything rebuilt the tree - which, until the
        remount above was fixed, was every scroll. It was reported as the blur
        over the avatar and as the picture refreshing at random. The hero image
        had already grown an onLoad that wiped filter and animation straight
        back off, which says the effect was not wanted even where it was
        written.
      */}
      {/* Animation keyframes for gradient */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes gradientShiftLive {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes laserGlowRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        /* Prevent image copying and dragging */
        .onepage-live img {
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
        .onepage-live video {
          -webkit-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
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
          isVisible={buttonsVisible}
          onLight={pageIsLight(safeTheme)}
        />
      )}

      {/* Share Button (only show if enabled) - positioned on TOP LEFT */}
      {safeSettings.share_enabled !== false && (
        <ShareButton
          pageUrl={pageUrl}
          pageTitle={sellerName}
          avatarUrl={avatar_url}
          avatarVideoUrl={avatar_video_url}
          style={safeSettings.share_style || "white"}
          showSubscribe={safeSettings.subscribe_enabled !== false}
          accentColor={safeTheme.button_color}
          themeBackgroundType={safeTheme.background_type}
          themeBackgroundColor={safeTheme.background_color}
          themeBackgroundGradient={safeTheme.background_gradient}
          isVisible={buttonsVisible}
          onLight={pageIsLight(safeTheme)}
        />
      )}

      {/* Desktop layout - NO internal scrollbar, page scrolls naturally. Only built where it is shown (lib/onepage/live-layout). */}
      {liveLayout !== "phone" && (
      <div
        className="onepage-live hidden md:block min-h-screen w-full relative [overflow-x:clip]"
        onContextMenu={(e) => { if ((e.target as HTMLElement).tagName === 'IMG') e.preventDefault() }}
        style={{
          background: getBackgroundStyle(),
          backgroundColor: safeTheme.background_color || "#000000",
          fontFamily: fontStack(safeTheme.font_family),
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined,
          overscrollBehavior: "none",
        }}
      >
        {/* The photo, fetched first and faded in whole when it changes (components/onepage/themes/wallpaper-photo). */}
        {safeTheme.background_type === "image" && safeTheme.background_image_url && (
          <WallpaperPhoto
            url={safeTheme.background_image_url}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
              backgroundSize: "cover",
              backgroundPosition: "center",
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
            style={wallpaperVideoStyle(safeTheme, {
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
            })}
            autoPlay
            loop
            muted
            playsInline
          />
        )}

        {/* Noise overlay for gradient backgrounds */}
        {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <WallpaperNoise strength={(safeTheme as any).noise_strength} />}
        {/* Noise overlay for image backgrounds */}
        {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <WallpaperNoise strength={(safeTheme as any).noise_strength} />}
        {/* Pattern overlay for solid/gradient backgrounds */}
        <WallpaperPattern theme={safeTheme} />

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
              <WallpaperPhoto
                url={safeTheme.background_image_url}
                style={{
                  position: "absolute",
                  top: "-50px",
                  left: "-50px",
                  right: "-50px",
                  bottom: "-50px",
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
                style={wallpaperVideoStyle(safeTheme, {
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
                })}
                autoPlay
                loop
                muted
                playsInline
              />
            )}
            {/* Noise overlay inside card */}
            {((safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise) || (safeTheme.background_type === "image" && (safeTheme as any).image_noise)) && (
              <WallpaperNoise strength={(safeTheme as any).noise_strength} className="absolute inset-0 rounded-[40px]" />
            )}
            {/* Pattern overlay inside card */}
            <WallpaperPattern theme={safeTheme} className="absolute inset-0 rounded-[40px]" />
            {renderPageContent({ isDesktop: true })}
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
      )}

      {/* Mobile layout (full screen). Only built where it is shown (lib/onepage/live-layout). */}
      {liveLayout !== "desktop" && (
      <div
        className="onepage-live md:hidden min-h-screen w-full relative"
        onContextMenu={(e) => { if ((e.target as HTMLElement).tagName === 'IMG') e.preventDefault() }}
        style={{
          overflowX: 'clip',
          background: getBackgroundStyle(),
          backgroundColor: safeTheme.background_color || "#000000",
          fontFamily: fontStack(safeTheme.font_family),
          backgroundSize: isAnimatedGradient ? "200% 200%" : undefined,
          animation: isAnimatedGradient ? "gradientShiftLive 10s ease-in-out infinite" : undefined,
          overscrollBehavior: "none",
        }}
      >
        <div className="relative min-h-screen">
          {safeTheme.background_type === "image" && safeTheme.background_image_url && (
            <WallpaperPhoto
              url={safeTheme.background_image_url}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                width: "100%",
                height: "100%",
                backgroundSize: "cover",
                backgroundPosition: "center",
                zIndex: 0,
                filter: `brightness(${(safeTheme as any).image_brightness || 100}%) blur(${(safeTheme as any).image_blur || 0}px)`,
                transform: "translateZ(0)",
                willChange: "transform",
                pointerEvents: "none",
              }}
            />
          )}

          {/* Video background for mobile */}
          {safeTheme.background_type === "video" && (safeTheme as any).background_video_url && (
            <video
              src={(safeTheme as any).background_video_url}
              style={wallpaperVideoStyle(safeTheme, {
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
                pointerEvents: "none",
              })}
              autoPlay
              loop
              muted
              playsInline
            />
          )}

          {/* Noise overlays for mobile */}
          {safeTheme.background_type === "gradient" && (safeTheme as any).gradient_noise && <WallpaperNoise strength={(safeTheme as any).noise_strength} />}
          {safeTheme.background_type === "image" && (safeTheme as any).image_noise && <WallpaperNoise strength={(safeTheme as any).noise_strength} />}
          {/* Pattern overlay for mobile */}
          <WallpaperPattern theme={safeTheme} />
          {renderPageContent()}
        </div>
      </div>
      )}
      
      {/* Spotify Modal - clean, compact, responsive design */}
      {isPhone ? (
        <BottomSheet
          isOpen={spotifyModalOpen && !!spotifyModalData}
          onClose={() => setSpotifyModalOpen(false)}
          label={spotifyModalData?.title ?? "Spotify"}
          hideFrom="sm"
          maxHeight="90svh"
        >
          {spotifyModalData && spotifyBody(spotifyModalData)}
        </BottomSheet>
      ) : spotifyModalOpen && spotifyModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300 ease-out"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setSpotifyModalOpen(false); }}
        >
          <div
            className="bg-white w-full rounded-t-2xl sm:rounded-2xl sm:w-[min(92vw,460px)] max-h-[90svh] sm:max-h-[85vh] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in slide-in-from-bottom-4 fade-in zoom-in-[0.97] duration-[350ms] ease-out"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {spotifyBody(spotifyModalData)}
          </div>
        </div>
      )}

      {/* Apple Music Modal - clean, compact, responsive design */}
      {isPhone ? (
        <BottomSheet
          isOpen={appleMusicModalOpen && !!appleMusicModalData}
          onClose={() => setAppleMusicModalOpen(false)}
          label={appleMusicModalData?.title ?? "Apple Music"}
          hideFrom="sm"
          maxHeight="90svh"
        >
          {appleMusicModalData && appleMusicBody(appleMusicModalData)}
        </BottomSheet>
      ) : appleMusicModalOpen && appleMusicModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-300 ease-out"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setAppleMusicModalOpen(false); }}
        >
          <div
            className="bg-white w-full rounded-t-2xl sm:rounded-2xl sm:w-[min(92vw,460px)] max-h-[90svh] sm:max-h-[85vh] overflow-y-auto overscroll-contain shadow-2xl will-change-transform animate-in slide-in-from-bottom-4 fade-in zoom-in-[0.97] duration-[350ms] ease-out"
            style={{ transform: 'translateZ(0)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {appleMusicBody(appleMusicModalData)}
          </div>
        </div>
      )}

      {/* Quick Checkout Modal */}
      {isPhone ? (
        <BottomSheet
          isOpen={quickCheckoutModalOpen && !!quickCheckoutModalData}
          onClose={() => setQuickCheckoutModalOpen(false)}
          label={quickCheckoutModalData?.productTitle ?? "Get it free"}
          hideFrom="sm"
          className="op-sheet"
          fill
          aboveKeyboard
          maxHeight="90svh"
        >
          {quickCheckoutModalData && <div className="relative flex min-h-0 flex-1 flex-col">{quickCheckoutBody(quickCheckoutModalData)}</div>}
        </BottomSheet>
      ) : quickCheckoutModalOpen && quickCheckoutModalData && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setQuickCheckoutModalOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" />

          {/* Modal */}
          <div
            className="op-sheet relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom sm:zoom-in-95 duration-300 max-h-[90vh] sm:max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {quickCheckoutBody(quickCheckoutModalData)}
          </div>
        </div>
      )}

      {/*
        THE PDF (and a menu, which opens the same way) ON A PHONE IS THE SHARED
        SHEET (components/ui/bottom-sheet.tsx), as the Spotify, Apple Music and
        checkout panels already were: it rises, follows the thumb, flicks closed
        and slides out. It was a full screen panel that vanished on close. The
        editor's phone preview had been given the sheet on its own copy of this
        panel; the preview is this page now (components/onepage/live-preview),
        so the page has it, for visitors too. From 640px it is the centred
        panel it was.
      */}
      {isPhone ? (
        <BottomSheet
          isOpen={pdfModalOpen && !!pdfModalData}
          onClose={closePdfModal}
          label={pdfModalData?.title || "PDF Document"}
          hideFrom="sm"
          fill
          maxHeight="90svh"
          className="mx-auto max-w-md min-h-[70vh]"
        >
          {pdfModalData && pdfBody(pdfModalData, { "data-sheet-close": "" })}
        </BottomSheet>
      ) : pdfModalOpen && pdfModalData && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 sm:bg-black/50 animate-in fade-in duration-200"
          onClick={closePdfModal}
        >
          <div
            className="relative w-full h-full sm:h-auto sm:max-h-[90vh] max-w-md sm:mx-4 bg-white sm:rounded-3xl flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {pdfBody(pdfModalData, { onClick: closePdfModal })}
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
  /** A product tile drawn beside another (lib/onepage/product-block pairProductTiles). */
  inPair?: boolean
}

/* The product block's own component, with the older free quick checkout read here (its window lives on this page). */
function ProductBlockWithQuickCheckout(props: Omit<React.ComponentProps<typeof OnePageProductBlock>, "quick">) {
  const quick = useContext(QuickCheckoutModalContext)
  return <OnePageProductBlock {...props} quick={quick as LegacyQuickCheckout | null} />
}

function getAnimationClassForProduct(animationType?: string) {
  switch (animationType) {
    case "pulse": return "animate-onepage-pulse"
    case "bounce": return "animate-onepage-bounce"
    case "shake": return "animate-onepage-shake"
    case "glow": return "animate-onepage-glow"
    case "swipe": return "animate-onepage-swipe"
    default: return ""
  }
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

  const inEditorPreview = useContext(ExtraBlockPreviewContext)
  const enabledChildren = groupChildrenShown(data.children, inEditorPreview)
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

  /*
    THERE ARE NO TOUCH HANDLERS HERE ON PURPOSE.

    The container below is a real scroller: overflow-x auto, scroll-snap x
    mandatory. A phone already scrolls it, with momentum, off the main thread,
    and snaps it. What used to sit here was a touchmove that wrote scrollLeft
    by hand on every move, so a finger moved the row twice — once natively and
    once from JavaScript — against a snap that was trying to settle it
    somewhere else. That fight is what the slider looked like on a phone.

    The mouse handlers stay. Drag-to-scroll with a pointer is a real feature
    and nothing else provides it.
  */

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
                data-sensitive-label={sensitiveLabel(child)}
              >
                <div className="w-full" style={{ overflow: 'visible' }}>
                  {inEditorPreview && isIncompleteLink(child) ? (
                    <IncompleteLinkPlaceholder label={(child.data as LinkButtonBlockData)?.label} theme={theme} />
                  ) : (
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
                  )}
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
        <div key={child.id} className="w-full" style={{ overflow: 'visible' }} data-sensitive-label={sensitiveLabel(child)}>
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

// Public Image Carousel Component with transform-based positioning for smooth, reliable swiping
/**
 * ===========================================================================
 *  THE SLIDER, ON A PHONE
 * ===========================================================================
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
const DOT_MIN = 8
const DOT_MAX = 24

/**
 * ===========================================================================
 *  THE SLIDER IS A SCROLLER, AND THE BROWSER DOES THE SCROLLING
 * ===========================================================================
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
function PublicImageCarousel({
  images,
  renderImage,
  autoplay,
  theme,
  isDesktop,
  carouselView = "1",
}: {
  images: { id: string; image_url: string; alt_text?: string; title?: string; link_url?: string | null }[]
  renderImage: (img: typeof images[0], index: number) => React.ReactNode
  autoplay?: boolean
  theme: OnePageTheme
  isDesktop?: boolean
  carouselView?: string
}) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isHovered, setIsHovered] = useState(false)
  /* Autoplay stands back for a few seconds after a finger has been on it. */
  const heldUntilRef = useRef(0)

  const view = parseFloat(carouselView) || 1
  const gap = view > 1 ? 8 : 6 // Always have a small gap between images
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

  /*
    AUTOPLAY ONLY WHILE SOMEONE CAN SEE IT (round 40). It advanced on a
    timer whatever the page was doing: off screen, in a background tab, and
    for a visitor who asked for reduced motion, which is the one case
    autoplay must not move. Now it waits while the slider is out of view
    or the tab is hidden, and never runs with reduced motion.
  */
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const el = scrollerRef.current
    if (!el || !autoplay || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver((entries) => setInView(entries.some((e) => e.isIntersecting)), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [autoplay])

  // Auto-advance slides
  useEffect(() => {
    if (!autoplay || isHovered || !inView || images.length <= 1) return
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    const interval = setInterval(() => {
      if (Date.now() < heldUntilRef.current) return
      if (typeof document !== "undefined" && document.hidden) return
      const el = scrollerRef.current
      if (!el) return
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 2
      goToSlide(atEnd ? 0 : currentIndex + 1)
    }, 5000)
    return () => clearInterval(interval)
  }, [autoplay, isHovered, inView, images.length, currentIndex, goToSlide])

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
        <div ref={dotsRef} className="flex justify-center gap-2 mt-3.5 pb-0.5">
          {Array.from({ length: dotCount }, (_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); hold(); goToSlide(idx) }}
              /*
                No w-6/w-2 and no opacity-40 here on purpose: paintDots owns
                both, written inline so they beat these classes, and a class
                that flipped on currentIndex is exactly the snap that was
                reported. What is left is the size before the first paint.
              */
              className="h-2 w-2 rounded-full bg-current opacity-40"
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

/** A link marked sensitive: its label, for the box around it (SensitiveLinkQuestion asks before it opens). */
function sensitiveLabel(block: any): string | undefined {
  if (block?.type !== "link_button" || !block.data?.sensitive) return undefined
  return String(block.data.label || "")
}

/** Is a block on the page? The one rule the editor's preview uses too (lib/onepage/extra-blocks). */
const isBlockVisible = (block: any): boolean => isBlockShown(block)
/* A group's blocks by the page's one rule (lib/onepage/group): on, in their schedule, with something to show; in the editor's preview a link still waiting for its address is shown as its placeholder, as it is on the page. */
const groupChildrenShown = (children: OnePageBlock[] | undefined, inPreview: boolean): OnePageBlock[] =>
  (children || []).filter((c) => isBlockVisible(c) || (inPreview && isIncompleteLink(c)))

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
  inPair = false,
}: PublicBlockRendererProps) {
  /* A product's price in its seller's store currency (components/platform/price-currency). */
  const pageMoney = usePageMoney()
  /* The editor's preview frame: a link inside a group that is still waiting for its address is drawn as its placeholder there. */
  const inGroupPreview = useContext(ExtraBlockPreviewContext)
  const [emailSubmitted, setEmailSubmitted] = useState(false)
  const [email, setEmail] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [downloadLink, setDownloadLink] = useState<string | null>(null)
  /* The email signup's first name (when the block asks), its hidden field and when it came on screen: the same spam checks as a website's forms (lib/site-contact looksAutomated). */
  const [leadName, setLeadName] = useState("")
  const [leadTrap, setLeadTrap] = useState("")
  const leadShownAt = useRef(0)
  useEffect(() => {
    leadShownAt.current = Date.now()
  }, [])
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
  /* Design › Social icons: each mark in its brand's colour, or all in the icon colour. A page saved before the choice existed has none, and stays one colour. */
  const socialTone: "brand" | "mono" = (theme as any).social_icon_tone === "brand" ? "brand" : "mono"

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

  /*
    One request, counted twice on the server (app/api/onepage/track): in
    onepage_clicks for this editor's link stats, and as a link_click in
    Analytics, which is why the page's address and the visit go with it.
    keepalive, so a link that leaves the page does not cancel its own count.
  */
  const trackClick = async (blockId: string, url: string) => {
    try {
      await fetch("/api/onepage/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          onepage_id: onepageId,
          /* The block, or an icon in a row of social icons (lib/onepage/link-keys socialLinkId). */
          block_id: blockId || block.id,
          event_type: "click",
          url,
          href: window.location.href,
          session_id: getOrCreateSessionId() || undefined,
          visitor_id: getOrCreateVisitorId() || undefined,
        }),
      })
    } catch {
      /* A count is never worth an error on the page. */
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
        /#[a-fA-F0-9]{6}|#[a-fA-F0-9]{3}|rgb\([^)]+\)|rgba\([^)]+\)/g,
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
      const hasVideo = !!profile.avatar_video_url

      // Hero layout: the picture fades into the page itself (a mask), so any wallpaper under it, a pattern included, carries on
      if (heroHeaderShown(theme as any, profile)) {
        // Desktop: +10% taller (14/11 vs old 7/5), Mobile: +20% taller (10/9 vs old 4/3)
        const aspectRatio = isDesktop ? "14/11" : "10/9"
        const heroMargin = isDesktop ? "-mx-7 -mt-0" : "-mx-5 -mt-8"
        const heroWidth = isDesktop ? "w-[calc(100%+56px)]" : "w-[calc(100%+40px)]"
        const heroPosition = { objectPosition: `50% ${(theme as any).hero_position_y ?? 50}%` }

        return (
          <div className={cn(heroWidth, "relative mb-2 md:mb-1", heroMargin)} data-hero-header="">
            {/*
              THE PICTURE IS MASKED, NOT PAINTED OVER (round 40). The page
              colour used to be laid over its bottom, which on a pattern is a
              flat band where the pattern stops, so Hero was switched off for
              patterns. A mask fades the picture itself, and whatever the
              page has under it shows through. A box of fixed shape, in its
              own stacking context, so a video in it can neither move the
              page nor be drawn over the name and the links.
            */}
            <div
              className="relative isolate w-full overflow-hidden"
              data-hero-media={hasVideo ? "video" : "image"}
              style={{ aspectRatio, maskImage: HERO_FADE_MASK, WebkitMaskImage: HERO_FADE_MASK, backgroundColor: `color-mix(in srgb, ${theme.text_color || "#000000"} 6%, transparent)` }}
            >
              {hasVideo ? (
                <SmoothAvatarVideo
                  videoUrl={profile.avatar_video_url!}
                  imageUrl={onePageImageSrc(profile.avatar_url, ONEPAGE_COLUMN_PX)}
                  poster={videoPoster(profile.avatar_video_crop)}
                  alt={profile.title || "Avatar"}
                  videoStyle={heroPosition}
                  imageStyle={heroPosition}
                  priority
                />
              ) : (
                <img
                  src={onePageImageSrc(profile.avatar_url, ONEPAGE_COLUMN_PX) || "/placeholder.svg"}
                  alt={profile.title || ""}
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                  style={{
                    imageRendering: "auto",
                    ...heroPosition,
                  }}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                />
              )}
            </div>
            {/* Over the faded end of the picture, where the page's own wallpaper already shows: always on top of the media. */}
            <div
              className={cn(
                "absolute left-0 right-0 z-[1] text-center px-6",
                isDesktop ? "bottom-8" : "bottom-4 sm:bottom-6",
              )}
            >
              {data.show_name !== false &&
                ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
                  <img
                    src={onePageImageSrc((theme as any).title_logo_url, 320) || "/placeholder.svg"}
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
                        fontFamily: fontStack((theme as any).title_font || theme.font_family),
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
      const avatarSize = isDesktop ? 121 : 114

      return (
        <div className={cn("flex flex-col items-center gap-3 sm:gap-4 w-full text-center")} data-op-header="">
          {data.show_avatar !== false && (
            /* A circle whatever the column around it does: its own size, never shrunk by the flex column (flex-shrink 0). */
            <div className="relative" data-page-avatar="" style={{ width: avatarSize, height: avatarSize, aspectRatio: "1 / 1", flexShrink: 0, marginTop: isDesktop ? 25 : 0 }}>
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
                    className="rounded-full overflow-hidden border-2 shadow-lg w-full h-full relative bg-white/15"
                    style={{
                      borderColor: `${theme.text_color}20`,
                      transform: `scale(${((theme as any).avatar_scale || 100) / 100})`,
                    }}
                  >
                    <SmoothAvatarVideo
                      videoUrl={profile.avatar_video_url!}
                      imageUrl={onePageImageSrc(profile.avatar_url, 160)}
                      poster={videoPoster(profile.avatar_video_crop)}
                      alt={profile.title || "Avatar"}
                      imageStyle={{
                        translate: `0 ${(theme as any).avatar_offset_y || 0}px`,
                      }}
                      /* The square the creator framed, exactly (lib/onepage/media-crop); a crop saved before round 11 is drawn the way it always was. */
                      videoStyle={croppedMediaStyle(profile.avatar_video_crop) as React.CSSProperties | undefined}
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
                      src={onePageImageSrc(profile.avatar_url, 160) || undefined}
                      className="object-cover"
                      style={{
                        imageRendering: "auto",
                        transform: `translateY(${(theme as any).avatar_offset_y || 0}px)`,
                      }}
                    />
                    {/* The page's first letter, or a plain person when it has
                        no title. It was a "?", and before that, for 600ms with
                        no picture coming, an empty circle. */}
                    <AvatarFallback
                      delayMs={profile.avatar_url ? undefined : 0}
                      className="text-2xl sm:text-3xl font-semibold"
                      /*
                        A solid button's colours; on a glass or outline theme the
                        button colour is see-through white and the circle under it
                        is white, so the letter was white on white (Graphite,
                        Midnight, Ocean with no picture). There it is the text
                        colour on a tint of it over the page's own colour.
                      */
                      style={theme.button_style === "glass" || theme.button_style === "outline"
                        ? { backgroundColor: `color-mix(in srgb, ${theme.text_color} 16%, ${theme.background_color || "#ffffff"})`, color: theme.text_color }
                        : { backgroundColor: theme.button_color, color: theme.button_text_color }}
                    >
                      {profile.title?.trim() ? profile.title.charAt(0).toUpperCase() : <AvatarMark name="" size={96} />}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            </div>
          )}
          {data.show_name !== false &&
            ((theme as any).title_style === "logo" && (theme as any).title_logo_url ? (
              <img
                src={onePageImageSrc((theme as any).title_logo_url, 320) || "/placeholder.svg"}
                alt={profile.title || "Logo"}
                className="mx-auto w-auto my-2"
                style={{
                  maxHeight:
                    (theme as any).title_size === "large" ? (isDesktop ? "76px" : "65px") : isDesktop ? "65px" : "56px",
                  maxWidth:
                    (theme as any).title_size === "large"
                      ? isDesktop
                        ? "281px"
                        : "248px"
                      : isDesktop
                        ? "248px"
                        : "216px",
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
                        ? "text-[39px]"
                        : "text-[36px] sm:text-[40px]"
                      : isDesktop
                        ? "text-[33px]"
                        : "text-[29px] sm:text-[33px]",
                  )}
                  style={{
                    color: (theme as any).title_color || theme.text_color,
                    fontFamily: fontStack((theme as any).title_font || theme.font_family),
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
      /* Pulled up onto the hero's fade only when there is a hero drawn above it. */
      const isHeroLayout = heroHeaderShown(theme as any, profile)

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
            /* Pulled up onto the hero, so it is drawn (and pressed) above the hero's box, not under it. */
            isHeroLayout && "relative z-[1]",
            !hasCustomPadding && isHeroLayout && "md:mt-[-20px] md:mb-7"
          )}
          /* Under a classic header set flush left, the icons are too (app/globals.css [data-op-socials]). */
          data-op-socials={isHeroLayout ? undefined : ""}
          style={{
            marginTop: `${paddingTop}px`,
            marginBottom: `${paddingBottom}px`
          }}
        >
          {data.platforms.map(({ platform, url }) => {
            /*
              EVERY PLATFORM THE EDITOR OFFERS IS DRAWN.

              This used to be `if (!Icon || !url) return null`, and eleven of the
              twenty-two platforms had no Icon here, so WhatsApp, Discord, a
              website and the rest were saved, shown in the preview, and missing
              from the page visitors open. SocialIcon has a mark for every one
              and a plain link glyph for a name it has never seen, so the only
              thing that still hides a platform is having no address to open.
            */
            if (!url || !url.trim()) return null
            const normalizedUrl = normalizeSocialUrl(platform, url)
            return (
              <a
                key={platform} // Added key prop
                href={normalizedUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackClick(socialLinkId(block.id, platform), normalizedUrl)}
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
                  <SocialIcon platform={platform} size={20} color={socialColor} title={socialPlatformLabel(platform)} tone={socialTone} />
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

      /*
        THE BUTTON'S ICON: the one picked in the editor, else its platform's mark
        read from the address. It is drawn by LinkIcon from the set the editor's
        picker offers (components/onepage/link-icons.ts), so an icon that can be
        picked is an icon the page can draw. This used to be a 40 icon copy of
        a 155 icon list, and a house, a cart or a clock drew nothing here.
      */
      const linkIcon = resolveLinkIcon(data.icon, data.url)

      /*
        THE BUTTON, from lib/onepage/button-style.ts: the same drawing every
        button block and the Design tab's samples use. Its hover (data-hover)
        is the page's choice, drawn by `.op-btn` in app/globals.css; a link
        inside a carousel or a group keeps still, as it always has.
      */
      const buttonStyles: React.CSSProperties = { ...themeButtonStyle(theme), ...buttonHoverVars(theme) }
      const size = buttonSize(theme)
      const align = buttonAlign(theme)
      const iconSide = buttonIconSide(theme)
      const buttonHoverAttrs = {
        "data-hover": isInsideCarousel || isInsideGroup ? "none" : buttonHover(theme),
        "data-shadow": themeButtonShadow(theme),
        "data-align": align,
      }
      const iconPlace = cn(BUTTON_ICON_CLASS[size], "shrink-0 absolute", BUTTON_ICON_INSET[size][iconSide])
      /* The label column: clear of the icon on both sides when centred, on the icon's side only when to the left. */
      const labelColumn = (withIcon: boolean) =>
        cn(
          "flex flex-col min-w-0 w-full",
          align === "left" ? "text-left items-start" : "text-center",
          withIcon ? (align === "left" ? (iconSide === "left" ? "pl-12" : "pr-12") : "px-12") : "",
        )
      const labelText = cn(align === "left" ? "text-left" : "text-center", "op-label break-words whitespace-normal leading-tight")

      const hasThumbnail = !!data.thumbnail_url || !!linkIcon
      /* A featured card on a Pill page: a pill's 999px would make the card an oval and crop its picture to one, so a card stops at 28px. */
      const cardRadius = buttonShape(theme.button_border_radius) === "pill" ? 28 : theme.button_border_radius

      // Pro Layout - Featured display with larger thumbnail (and, on the Cards layout, every link with a picture: lib/onepage/theme-layout)
      if (data.layout_type === 'pro' || linkDrawnAsCard(theme, data)) {
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
              className={cn("w-full overflow-hidden", getAnimationClass(data.animation_type))}
              style={{
                ...buttonStyles,
                borderRadius: `${cardRadius}px`,
                padding: 0,
                fontSize: 0,
                lineHeight: 0,
              }}
            >
              {/* YouTube embed area */}
              <div
                className="w-full aspect-video relative overflow-hidden"
                style={{
                  borderRadius: `${cardRadius}px ${cardRadius}px 0 0`,
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
                  backgroundColor: themeButtonStripFill(theme),
                  fontSize: '15px',
                  lineHeight: '1.4',
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
                  borderRadius: `${cardRadius}px ${cardRadius}px 0 0`,
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
            {!shouldEmbedTikTok && (data.thumbnail_url || linkIcon) && (
              <div
                className={cn(
                  "w-full relative overflow-hidden",
                  displayMode !== 'full' && "aspect-[2/1]"
                )}
                style={{
                  borderRadius: `${cardRadius}px ${cardRadius}px 0 0`,
                  backgroundColor: displayMode === 'contain' || !data.thumbnail_url ? (
                    theme.button_style === "outline" ? `${theme.button_color}10` : `${theme.button_text_color}10`
                  ) : undefined,
                }}
              >
                {data.thumbnail_url ? (
                  <img
                    src={data.thumbnail_url}
                    alt={data.label || ""}
                    className={cn(
                      "w-full",
                      !isInsideCarousel && "op-media",
                      displayMode === 'cover' && "h-full object-cover",
                      displayMode === 'contain' && "h-full object-contain",
                      displayMode === 'full' && "h-auto"
                    )}
                  />
                ) : linkIcon ? (
                  <div className="w-full h-full flex items-center justify-center py-6">
                    <LinkIcon name={linkIcon} className="w-16 h-16" style={{ color: theme.button_text_color }} />
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
              className="w-full px-5 py-3.5 sm:py-4 flex flex-col items-center justify-center overflow-hidden text-sm sm:text-base"
              style={{
                backgroundColor: themeButtonStripFill(theme),
                fontSize: '15px',
                lineHeight: '1.4',
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
              className={cn("op-card w-full overflow-hidden cursor-pointer block", getAnimationClass(data.animation_type))}
              style={{
                ...buttonStyles,
                borderRadius: `${cardRadius}px`,
                padding: 0,
                fontSize: 0,
                lineHeight: 0,
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
              className={cn("op-card w-full overflow-hidden cursor-pointer block", getAnimationClass(data.animation_type))}
              style={{
                ...buttonStyles,
                borderRadius: `${cardRadius}px`,
                padding: 0,
                fontSize: 0,
                lineHeight: 0,
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
            className={cn("op-card w-full overflow-hidden block", getAnimationClass(data.animation_type))}
            style={{
              ...buttonStyles,
              borderRadius: `${cardRadius}px`,
              padding: 0,
              fontSize: 0,
              lineHeight: 0,
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
            {...buttonHoverAttrs}
            className={cn(
              "op-btn w-full flex items-center font-medium cursor-pointer",
              BUTTON_SIZE_CLASS[size],
              hasThumbnail ? "relative justify-center" : "justify-center",
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt={data.label || ""}
                className={cn(iconPlace, "rounded object-cover")}
              />
            ) : linkIcon ? (
              <LinkIcon name={linkIcon} className={iconPlace} />
            ) : null}
            <div className={labelColumn(hasThumbnail)}>
              <span className={labelText}>{data.label || "Link"}</span>
              {/* Spotify info display */}
              {data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
                <span
                    className={cn("text-xs flex items-center gap-1 mt-0.5 max-w-full", align === "left" ? "justify-start" : "justify-center")}
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
            {...buttonHoverAttrs}
            className={cn(
              "op-btn w-full relative flex items-center justify-center font-medium cursor-pointer",
              BUTTON_SIZE_CLASS[size],
              getDefaultAnimationClass(data.animation_type)
            )}
            style={buttonStyles}
          >
            {/* Thumbnail positioned absolutely at the icon's side */}
            {data.thumbnail_url ? (
              <img
                src={data.thumbnail_url}
                alt={data.label || ""}
                className={cn(iconPlace, "rounded object-cover")}
              />
            ) : linkIcon ? (
              <LinkIcon name={linkIcon} className={iconPlace} />
            ) : null}
            <div className={labelColumn(true)}>
              <span className={labelText}>{data.label || "Link"}</span>
              {/* Apple Music info display */}
              {data.apple_music_show_metadata !== false && (data.apple_music_title || data.apple_music_artist) && (
                <span
                  className={cn("text-xs flex items-center gap-1 mt-0.5 max-w-full", align === "left" ? "justify-start" : "justify-center")}
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
      const hasIconOnly = linkIcon && !data.thumbnail_url

      return (
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackClick(block.id, data.url)}
          {...buttonHoverAttrs}
          className={cn(
            "op-btn w-full flex items-center font-medium",
            BUTTON_SIZE_CLASS[size],
            // Both icons and thumbnails use centered layout with absolute positioning
            (hasIconOnly || hasThumbnail) ? "relative justify-center" : "justify-center",
            getDefaultAnimationClass(data.animation_type)
          )}
          style={buttonStyles}
        >
          {data.thumbnail_url ? (
            <img
              src={data.thumbnail_url}
              alt={data.label || ""}
              className={cn(iconPlace, "rounded object-cover")}
            />
          ) : linkIcon ? (
            <LinkIcon name={linkIcon} className={iconPlace} />
          ) : null}
          <div className={labelColumn(!!(hasIconOnly || hasThumbnail))}>
            <span className={labelText}>{data.label || "Link"}</span>
            {/* Spotify info display */}
            {isSpotifyUrl(data.url) && data.spotify_show_metadata !== false && (data.spotify_title || data.spotify_artist) && (
              <span
                className={cn("text-xs flex items-center gap-1 mt-0.5 max-w-full", align === "left" ? "justify-start" : "justify-center")}
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
                className={cn("text-xs flex items-center gap-1 mt-0.5 max-w-full", align === "left" ? "justify-start" : "justify-center")}
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
      // Skip text blocks with no meaningful visible content — they render as
      // white vertical bars on dark backgrounds from inherited color + line-height.
      // Strip everything except letters, numbers, and common punctuation.
      // Content must have at least 2 meaningful characters to render.
      const raw = data.content || ""
      const stripped = raw.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF!?.,;:'"()@#$%&+=\/\\<>{}[\]~`^*]/g, "")
      if (stripped.length < 2) return null
      return (
        <p
          className={cn(
            "text-sm sm:text-base leading-relaxed w-full whitespace-pre-line",
            data.alignment === "left" ? "text-left" : data.alignment === "right" ? "text-right" : "text-center",
          )}
          style={{ color: theme.secondary_text_color || theme.text_color }}
        >
          {raw}
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
      /* Only pictures that have an address: a row just added in the editor (or one whose upload was stopped) is not a blank slide or a placeholder on the page. */
      const images = (data.images || (data.image_url ? [{ id: '1', image_url: data.image_url, alt_text: data.alt_text, title: '', link_url: data.link_url }] : [])).filter((img) => !!img?.image_url)
      if (images.length === 0) return null

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

      /* How many slides are within one swipe of the first one. */
      const isImageCarousel = data.display_style === 'carousel' && !isInsideGroup && images.length > 1
      const eagerSlides = Math.ceil(parseFloat(data.carousel_view || "1") || 1) + 1

      // Render single image
      const renderImage = (img: typeof images[0], index: number) => {
        const imageContent = (
          <div className="w-full">
            <div
              className={cn("w-full overflow-hidden", aspectRatioClass)}
              style={{ borderRadius }}
            >
              <img
                src={onePageImageSrc(img.image_url, ONEPAGE_COLUMN_PX) || "/placeholder.svg"}
                alt={img.alt_text || ""}
                /* Its own size when it was saved with one (round 40): the box is reserved before the picture arrives, so nothing below it moves. */
                width={(img as { width?: number }).width || undefined}
                height={(img as { height?: number }).height || undefined}
                className={cn(
                  "w-full",
                  aspectRatioClass ? "h-full" : "h-auto",
                  data.image_fit === 'contain' ? 'object-contain' : 'object-cover'
                )}
                /*
                  A SLIDE YOU ARE ABOUT TO SWIPE TO IS NOT "BELOW THE FOLD".

                  Lazy loading decides from the SCROLL viewport, and every
                  slide past the first sits outside it horizontally, so the
                  browser held them back until the swipe had already started
                  and they arrived blank and then filled in. The ones within
                  reach of one swipe are fetched up front; anything further
                  down a long carousel still waits.
                */
                loading={isImageCarousel && index <= eagerSlides ? "eager" : "lazy"}
                decoding="async"
                draggable={false}
              />
            </div>
            {data.show_captions && img.title && (
              <p
                className="text-center text-sm mt-2.5 opacity-70"
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
        return <div className="w-full py-1">{renderImage(images[0], 0)}</div>
      }

      // Grid display
      if (data.display_style === 'grid') {
        const cols = data.grid_columns || 2
        return (
          <div
            className="w-full grid gap-3 py-1"
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
            <PublicImageCarousel
              images={images}
              renderImage={renderImage}
              autoplay={data.carousel_autoplay}
              theme={theme}
              isDesktop={isDesktop}
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

    case "email_capture": {
      const data = (block.data || {
        headline: "Subscribe",
        placeholder: "Email",
        button_text: "Join",
        success_message: "Thanks!",
      }) as EmailCaptureBlockData

      const layout = emailSignupLayout(data.layout_type)
      const layoutImage = emailSignupImage(data)

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
      /*
        THE FIELD AND THE BUTTON BESIDE IT ARE ONE CONTROL, SO THEY MATCH.
        Measured on a phone at 390 (scripts/check-onepage-bar.mjs): Subscribe
        and the email box next to it were both 43px tall — a pixel under the
        44px a thumb is given everywhere else on the page — and the box's
        corners were a hardcoded `rounded-lg` while the button took the
        theme's `button_border_radius`. On a theme with round buttons (Olive
        and Riso set 999) that is a pill sitting against a square box, in one
        row, at one height. The padding is now the one the page already used
        from 640px (py-3, 47px tall), at every width, and the box borrows the
        button's radius below.
      */
      const emailButtonStyles: React.CSSProperties = {
        backgroundColor: buttonBackground(theme),
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
        borderStyle: "solid",
        borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
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
              name: data.ask_name ? leadName.trim() || undefined : undefined,
              company: leadTrap,
              elapsed: Date.now() - leadShownAt.current,
              block_id: block.id,
              lead_magnet_id: data.lead_magnet_id,
              enable_digital_product: data.enable_digital_product,
              digital_product_file_url: data.digital_product_file_url,
              digital_product_title: data.digital_product_title,
              /* Where this visit came from, for the contact's source (lib/attribution). */
              origin: pageOrigin(),
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

      /*
       * The lead magnet, once the address has been given. The file sits on
       * storage, another origin, where an anchor's `download` is ignored:
       * this was a plain anchor click once, so a file the browser could draw
       * replaced the creator's page with itself and the visitor was gone.
       * Then it went to a tab of its own, which the owner saw as about:blank
       * and did not want. It takes the one download path now
       * (lib/downloads/download-file): saved where the button is in a
       * browser, and the app's own downloader in the iOS and Android apps.
       * `download=` is still asked for, so storage sends an attachment.
       */
      const handleDownloadClick = () => {
        if (!downloadLink) return
        const name = data.digital_product_title || 'download'
        let downloadUrl = downloadLink
        if (downloadUrl.includes('/storage/v1/object/public/') || downloadUrl.includes('/media/')) {
          const separator = downloadUrl.includes('?') ? '&' : '?'
          downloadUrl = `${downloadUrl}${separator}download=${encodeURIComponent(name)}`
        }
        void downloadFile({ url: downloadUrl, fileName: name })
      }

      /*
        ASKED FOR A FIRST NAME, AND THE HIDDEN FIELD. Above the form, so the
        email box and its button stay one row. The name goes on the
        subscriber (Emails › Subscribers) and into the welcome automation.
      */
      const emailExtras = (
        <>
          <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden value={leadTrap} onChange={(e) => setLeadTrap(e.target.value)} className="absolute -left-[9999px] h-px w-px opacity-0" />
          {data.ask_name && !emailSubmitted ? (
            <input
              type="text"
              value={leadName}
              onChange={(e) => setLeadName(e.target.value)}
              placeholder={tt("First name")}
              aria-label={tt("First name")}
              autoComplete="given-name"
              maxLength={80}
              disabled={isSubmitting}
              data-email-name=""
              className="mb-2 w-full border-0 bg-white/90 px-3 py-3 text-[16px] outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70 sm:px-4 sm:text-sm"
              style={{ color: "#000", borderRadius: emailButtonStyles.borderRadius }}
            />
          ) : null}
        </>
      )
      /* After they join: the link the creator chose (a guide, a private video, a group), as the page's own button. */
      const afterUrl = (data.after_signup_url || "").trim()
      const afterSignupLink = afterUrl && /^https?:\/\//i.test(afterUrl) ? (
        <a
          href={afterUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-after-signup=""
          onClick={() => trackClick(block.id, afterUrl)}
          className="mt-3 flex w-full items-center justify-center px-4 py-3 text-sm font-medium"
          style={emailButtonStyles}
        >
          {(data.after_signup_label || "").trim() || tt("Open your free gift")}
        </a>
      ) : null

      /*
        THE FORM, ONCE, AND THE LAYOUT AROUND IT (components/onepage/email-
        signup). It was written out four times, one for each of two layouts
        times two button lengths, and Featured drew its own shape only with
        an image, so choosing it on a block without one changed nothing.
        Each of the five layouts now asks for this form in one row or
        stacked, and the Bold card for its button in the card's text colour.
      */
      const renderEmailForm = ({ stacked, inverted, outlined }: EmailSignupFormOptions) => {
        const buttonText = getButtonText()
        const submitStyles: React.CSSProperties = inverted
          ? { ...emailButtonStyles, backgroundColor: inverted.fill, color: inverted.text, borderColor: "transparent", boxShadow: "none", backdropFilter: undefined }
          : emailButtonStyles
        const buttonClass = cn(
          "px-4 sm:px-5 py-3 text-sm font-medium transition-opacity whitespace-nowrap",
          stacked ? "w-full" : "shrink-0",
          !isInsideCarousel && "[@media(hover:hover)]:hover:opacity-90",
        )
        return (
          <>
            {emailExtras}
            <form onSubmit={handleSubmit} className={stacked ? "flex flex-col gap-2" : "flex flex-row gap-2 items-stretch"} data-email-form={stacked ? "stacked" : "row"}>
              <input
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder={data.placeholder || "Enter your email"}
                aria-label={tt("Email")}
                required
                disabled={isSubmitting}
                className={cn("px-3 sm:px-4 py-3 text-sm bg-white/90 border-0 outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-70", stacked ? "w-full" : "flex-1 min-w-0", inverted && "ring-1 ring-black/10")}
                style={{ color: "#000", borderRadius: emailButtonStyles.borderRadius, backgroundColor: inverted ? "#fff" : undefined, boxShadow: outlined ? `inset 0 0 0 1px color-mix(in srgb, ${theme.text_color || "#111113"} 18%, transparent)` : undefined }}
              />
              {emailSubmitted && downloadLink ? (
                <button type="button" onClick={handleDownloadClick} className={buttonClass} style={submitStyles}>
                  Download
                </button>
              ) : (
                <button type="submit" disabled={isSubmitting || emailSubmitted} className={cn(buttonClass, "disabled:opacity-50 disabled:cursor-not-allowed")} style={submitStyles}>
                  {isSubmitting ? "..." : buttonText}
                </button>
              )}
            </form>
          </>
        )
      }

      return (
        <EmailSignupView
          layout={layout}
          headline={data.headline || ""}
          description={data.description}
          image={layoutImage}
          theme={theme}
          stackedForm={emailSignupStacked(layout, getButtonText())}
          renderForm={renderEmailForm}
          submitted={emailSubmitted}
          successMessage={data.success_message || "Thanks for subscribing!"}
          afterSignup={afterSignupLink}
          animationClass={getEmailAnimationClass(data.animation_type)}
        />
      )
    }

    case "group": {
      const data = (block.data || { layout: "stack", children: [] }) as GroupBlockData
      if (!data.children || data.children.length === 0) {
        return null
      }

      const enabledChildren = groupChildrenShown(data.children, inGroupPreview)
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
                  data-sensitive-label={sensitiveLabel(child)}
                >
                  {inGroupPreview && isIncompleteLink(child) ? (
                    <IncompleteLinkPlaceholder label={(child.data as LinkButtonBlockData)?.label} theme={theme} />
                  ) : (
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
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    case "product": {
      /*
        THE PRODUCT BLOCK IS ITS OWN COMPONENT (components/onepage/product-block, round 10): its eight layouts, the
        button's own hover, and what a tap does (the checkout, the product page, a sheet over this page, or the
        checkout window). Where it points stays a buy link for a download or a course, the product page for a product
        that ships (lib/onepage/product-block productHref, the owner: "buy buttons must open the product's checkout
        directly").
      */
      return (
        <ProductBlockWithQuickCheckout
          block={block}
          theme={theme}
          quiet={isInsideCarousel || isInsideGroup}
          inPair={inPair}
          seller={{ name: profile.title, avatarUrl: profile.avatar_url }}
          pageMoney={pageMoney}
          plainText={stripHtmlToPlainText}
          trackClick={trackClick}
          animationClass={getAnimationClassForProduct((block.data as ProductBlockData).animation_type)}
        />
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
        backgroundColor: buttonBackground(theme),
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
        borderStyle: "solid",
        borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
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
                    alt={data.title || ""}
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
        backgroundColor: buttonBackground(theme),
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
        borderStyle: "solid",
        borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
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
                    alt={data.title || ""}
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
      /* A Calendly or a Cal.com page (lib/onepage/creator-blocks bookingSource), on https; anything older is drawn as it was saved. */
      const calendlyUrl = bookingSource(data.calendly_url)?.url ?? data.calendly_url

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
        backgroundColor: buttonBackground(theme),
        color: theme.button_text_color,
        borderRadius: `${theme.button_border_radius}px`,
        borderWidth: `${theme.button_style === "outline" ? Math.max(2, theme.button_border_width || 0) : (theme.button_border_width || 0)}px`,
        borderStyle: "solid",
        borderColor: theme.button_style === "outline" ? (theme.button_border_color || theme.button_color) : theme.button_border_color,
        backdropFilter: theme.button_style === "glass" ? "blur(10px)" : undefined,
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
                      alt={data.title || ""}
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
                className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6 lg:p-8 animate-in fade-in duration-300 ease-out"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
                onClick={handleCloseCalendly}
              >
                <div
                  className="relative w-full h-full sm:h-[85vh] sm:max-h-[720px] max-w-lg bg-white sm:rounded-3xl flex flex-col shadow-2xl will-change-transform animate-in slide-in-from-bottom-4 fade-in zoom-in-[0.97] duration-[350ms] ease-out"
                style={{ transform: 'translateZ(0)' }}
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
                className="relative w-full h-full sm:h-[85vh] sm:max-h-[720px] max-w-lg bg-white sm:rounded-3xl flex flex-col shadow-2xl will-change-transform animate-in slide-in-from-bottom-4 fade-in zoom-in-[0.97] duration-[350ms] ease-out"
                style={{ transform: 'translateZ(0)' }}
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

    /* Course, music, testimonials and the contact form (components/onepage/creator-blocks): the same one component; the contact form needs the page's creator. */
    case "course":
    case "music":
    case "testimonials":
    case "contact_form":
    case "embed":
    case "heading":
    case "faq":
    case "countdown":
    case "map":
    case "video":
      return <ExtraBlock block={block} look={{ theme, scale: "live", sellerId, onepageId }} />

    default:
      /* Round 40: the shelf, lead magnets, posts, followers and codes (components/onepage/storelib-blocks), and any later block in that list, with no case of their own here. */
      return isExtraBlock(block) ? <ExtraBlock block={block} look={{ theme, scale: "live", sellerId, onepageId }} /> : null
  }
}
