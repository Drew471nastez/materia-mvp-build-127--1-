"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Star, Download } from "lucide-react"
import { stickyAddToCartButtonPresets } from "@/lib/store-builder/defaults"
import { downloadEntitledFile } from "@/components/download-button"
import { getCanonicalSiteUrl } from "@/lib/url-helpers"
import { useEditorFrame } from "@/components/storefront/use-editor-frame"
import { usePurchaseStatus } from "@/components/checkout/use-purchase-status"
import { DownloadFilesSheet } from "@/components/checkout/download-files-sheet"
import { optimizedImageUrl } from "@/lib/images/optimized-url"
import { useProductTopBarShown } from "@/lib/store-builder/product-top-bar"

export interface StickyAddToCartSettings {
  visible: boolean
  backgroundColor: string
  buttonColor: string
  buttonTextColor: string
  buttonStyle: "add_to_cart" | "grab_it" | "grab_me" | "download" | "get_it"
  borderRadius: number
  borderColor?: string
  textColor?: string
}

interface ProductData {
  id: string
  slug?: string
  title: string
  /** The picture the page leads with. The desktop bar shows it; see below. */
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number
  reviews_count?: number
  reviews_average?: number
  selectedVariantId?: string | null
}

interface StickyAddToCartProps {
  isPurchased?: boolean
  downloadFiles?: Array<{ id: string; file_name?: string }>

  settings: StickyAddToCartSettings
  product: ProductData
  creatorId?: string
  isEditorPreview?: boolean
  isMobile?: boolean
  isSelected?: boolean
  onSelect?: () => void
  scrollY?: number
}

function formatPrice(cents: number): string {
  if (cents === 0) return "Free"
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)
}

function getButtonText(style: StickyAddToCartSettings["buttonStyle"]): string {
  return stickyAddToCartButtonPresets[style] || "Add to cart"
}

/*
  THE PICTURE THE PAGE LEADS WITH, at the size the bar can hold. 44 CSS px
  asked for at 88 through Next's optimizer — the same endpoint <Image> points
  its srcset at, and nothing to do with Supabase's metered transformer
  (tests/no-image-transforms.test.ts). A plain <img> rather than <Image>
  because a src on a host next.config does not list THROWS during render, and
  thumbnail_url is user data going back years: one bad row would take a whole
  product page down for the sake of a 44px square.

  No picture means no square. An empty grey box is worse than the title
  starting at the left edge.

  A FUNCTION AT MODULE SCOPE, called as a function. Both bars render this and
  a component declared in a render body is a new type every render, so React
  remounts its subtree instead of updating it — the same rule the price badge
  below follows, for the same reason.
*/
function barThumbnail(src: string | null | undefined, isDarkBg: boolean) {
  if (!src) return null
  return (
    <span
      className={cn(
        "relative block h-11 w-11 shrink-0 overflow-hidden rounded-[10px]",
        isDarkBg ? "bg-white/10" : "bg-black/5",
      )}
    >
      <img
        src={optimizedImageUrl(src, 44, 75)}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />
    </span>
  )
}

/*
  ONE STAR AND THE NUMBER, under the title. It was five stars beside the
  button: a second row of graphics in a strip 60px tall, where a filled star
  with the average next to it says the same thing in a quarter of the room.
  The number is the part anybody reads.
*/
function barRating(count: number, average: number, textColor: string | undefined, isDarkBg: boolean) {
  if (count <= 0) return null
  return (
    <span
      className={cn(
        "mt-0.5 flex items-center gap-1 text-[12px] leading-none",
        !textColor && (isDarkBg ? "text-gray-300" : "text-gray-500"),
      )}
      style={{ color: textColor ? `${textColor}b3` : undefined }}
    >
      <Star className="h-3 w-3 shrink-0 fill-current" />
      {average > 0 ? average.toFixed(1) : "5.0"}
      <span className="opacity-70">({count})</span>
    </span>
  )
}

export function EditorStickyAddToCart({
  settings,
  product,
  isPurchased = false,
  downloadFiles = [],
  isEditorPreview,
  isMobile,
  isSelected,
  onSelect,
  scrollY = 0,
}: StickyAddToCartProps) {
  /*
    HOOKS FIRST. `settings.visible` is a switch the creator flips in the
    sidebar, so it changes between renders of this same component: with
    these two below the early return, turning the bar off and on again
    rendered a different number of hooks than the time before and React
    threw (#310), taking the preview down. Nothing renders differently for
    having declared them up here.
  */
  const [showFilesModal, setShowFilesModal] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // If settings say not visible, don't render
  if (!settings.visible) return null

  // In editor preview mode, parent controls visibility via showSticky state
  // So we always show here when rendered - the parent handles scroll-based visibility
  // This fixes the issue where the bar wasn't showing in the editor preview
  const shouldShow = true

  const buttonText = isPurchased
    ? (downloadFiles.length > 0 ? "Download" : "Access")
    : getButtonText(settings.buttonStyle)

  const handleDownloadFile = async (assetId: string) => {
    setDownloadingId(assetId)
    await downloadEntitledFile(assetId)
    setDownloadingId(null)
  }
  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0

  const handleInteractiveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  /* Browsing in the editor's canvas is the point; buying from it is not. */
  const inEditorFrame = useEditorFrame()

  const handleButtonClick = async (e: React.MouseEvent) => {
    if (inEditorFrame) { e.preventDefault(); e.stopPropagation(); return }
    e.stopPropagation()
    if (isEditorPreview) return
    if (isPurchased) {
      return
    }
    let checkoutUrl = `/checkout?productId=${product.id}`
    if (product.selectedVariantId) {
      checkoutUrl += `&variantId=${product.selectedVariantId}`
    }
    window.location.href = checkoutUrl
  }

  const handleWrapperClick = () => {
    if (onSelect) onSelect()
  }

  /*
    ELEMENTS AND A PLAIN FUNCTION, NOT COMPONENTS — see subscribe-bar.tsx.
    An arrow component declared in a render body is a new type every render,
    so React remounts its whole subtree each time instead of updating it.
  */
  const priceBadge = (
    <span
      className={cn(
        "font-bold shrink-0",
        isMobile ? "px-3 py-1 text-sm" : "px-3.5 py-1.5 text-[15px]"
      )}
      style={{
        backgroundColor: settings.buttonColor || "#2563eb",
        color: settings.buttonTextColor || "#ffffff",
        borderRadius: `${settings.borderRadius || 8}px`,
      }}
    >
      {formatPrice(product.price_cents)}
    </span>
  )

  const isDarkBg = settings.backgroundColor && (
    settings.backgroundColor.startsWith("#0") ||
    settings.backgroundColor.startsWith("#1") ||
    settings.backgroundColor.startsWith("#2")
  )

  // Use textColor from settings if available, otherwise derive from background
  const contentTextColor = settings.textColor || (isDarkBg ? "#ffffff" : undefined)

  const thumbnail = barThumbnail(product.thumbnail_url, !!isDarkBg)
  const ratingLine = barRating(reviewsCount, reviewsAverage, contentTextColor, !!isDarkBg)

  return (
    <>
      <div
      onClick={handleWrapperClick}
      className={cn(
        "sticky bottom-0 w-full z-30 border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300",
        isMobile ? "py-3 px-[7px]" : "py-3.5 px-[15px]",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-sky-500 ring-inset",
        !settings.borderColor && "border-gray-200",
        shouldShow ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none",
      )}
      style={{
        backgroundColor: settings.backgroundColor || "#ffffff",
        backdropFilter: "none",
        borderColor: settings.borderColor || undefined,
      }}
    >
      <div
        className={cn(
          "mx-auto w-full flex items-center justify-between",
          isMobile ? "max-w-[calc(100%-10px)] gap-4" : "max-w-[1150px] gap-5"
        )}
      >
        {/* The live bar's desktop row, so the creator is looking at what a
            visitor looks at. See the note on it in LiveStickyAddToCart. */}
        <div className={cn("flex items-center min-w-0 flex-1", isMobile ? "gap-3" : "gap-3.5")}>
          {isMobile ? priceBadge : thumbnail}
          {isMobile ? (
            <p className="text-sm font-medium truncate" style={{ color: contentTextColor }}>
              {product.title}
            </p>
          ) : (
            <div className="min-w-0">
              <p
                className="text-[15px] font-semibold truncate leading-tight"
                style={{ color: contentTextColor }}
              >
                {product.title}
              </p>
              {ratingLine}
            </div>
          )}
        </div>

        <div className="flex items-center shrink-0 gap-4">
          {!isMobile && (
            <span
              className={cn("text-[17px] font-semibold tabular-nums", !contentTextColor && "text-gray-900")}
              style={{ color: contentTextColor }}
            >
              {formatPrice(product.price_cents)}
            </span>
          )}
          <Button
            size="sm"
            type="button"
            className={cn(
              "shrink-0 font-medium cursor-pointer",
              isMobile ? "h-10 px-5 text-sm" : "h-11 px-7 text-[15px]"
            )}
            onClick={isEditorPreview ? handleInteractiveClick : handleButtonClick}
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: `${settings.borderRadius || 8}px`,
            }}
          >
            {buttonText}
          </Button>
        </div>
      </div>
      </div>

      {downloadFiles.length > 1 && (
        <DownloadFilesSheet
          isOpen={showFilesModal}
          onClose={() => setShowFilesModal(false)}
          title={product.title}
          files={downloadFiles}
          downloadingFileId={downloadingId}
          onDownload={handleDownloadFile}
        />
      )}
    </>
  )
}

export function LiveStickyAddToCart({
  settings,
  product,
  creatorId,
  onAddToCart,
  isPurchased: serverIsPurchased = false,
  downloadFiles: serverDownloadFiles = [],
}: StickyAddToCartProps & { onAddToCart?: () => void }) {
  /* Browsing in the editor's canvas is the point; buying from it is not. */
  const inEditorFrame = useEditorFrame()
  // Client-side purchase detection (checks localStorage + server state)
  const { hasPurchased: clientHasPurchased, isChecking } = usePurchaseStatus(
    product.id,
    serverIsPurchased,
    null,
    []
  )

  // Use client-side detection which merges server + localStorage
  const isPurchased = clientHasPurchased
  const downloadFiles = serverDownloadFiles

  /*
    ONE BAR AT A TIME. The creator bar across the top reveals on a scroll up
    and this one appears on the way down, so a scroll up in the middle of a
    long page put a bar at each end of the screen around the thing somebody
    was reading. While the top one is up, this one stays down; the next
    downward scroll hides that one and brings this one back, so neither is
    ever more than one gesture away. lib/store-builder/product-top-bar.ts.
  */
  const topBarShown = useProductTopBarShown()

  // Start hidden - only show after scrolling past product content area
  const [isVisible, setIsVisible] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  const [showFilesModal, setShowFilesModal] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // Mount on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Handle scroll visibility - show when reaching description section, hide near footer
  useEffect(() => {
    if (!isMounted) return

    const handleScroll = () => {
      const scrollY = window.scrollY
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight

      // Find footer
      const footer = document.querySelector("footer") || document.querySelector('[data-seller-footer]')
      let footerTop = documentHeight

      if (footer) {
        const footerRect = footer.getBoundingClientRect()
        footerTop = footerRect.top + scrollY
      }

      const currentBottom = scrollY + windowHeight
      const nearFooter = currentBottom > footerTop - 100

      // Try to find description section as the trigger point (primary)
      // Look for the description heading or container
      // Note: :contains() is jQuery syntax, not valid CSS - removed to prevent errors
      const descriptionSection = document.querySelector('[data-description-section]') ||
                                 document.querySelector('.description-section')

      // Fallback: find any h2 with "Description" text
      let descriptionHeading: Element | null = null
      if (!descriptionSection) {
        const allH2s = document.querySelectorAll('h2')
        allH2s.forEach(h2 => {
          if (h2.textContent?.toLowerCase().includes('description')) {
            descriptionHeading = h2
          }
        })
      }

      // Secondary fallback: FAQ section
      const faqSection = document.querySelector('[data-faq-section]') ||
                         document.querySelector('.faq-section')

      let pastDescriptionStart = false

      // Priority 1: Description section
      const targetSection = descriptionSection || descriptionHeading
      if (targetSection) {
        const rect = targetSection.getBoundingClientRect()
        const sectionTop = rect.top + scrollY
        // Show when the description section starts entering the viewport (top 70%)
        pastDescriptionStart = scrollY > sectionTop - windowHeight * 0.7
      } else if (faqSection) {
        // Priority 2: FAQ section fallback
        const faqRect = faqSection.getBoundingClientRect()
        const faqTop = faqRect.top + scrollY
        pastDescriptionStart = scrollY > faqTop - windowHeight * 0.5
      } else {
        // Priority 3: Percentage fallback (30% of page - earlier than before)
        const scrollableHeight = documentHeight - windowHeight
        const scrollPercentage = scrollableHeight > 0 ? (scrollY / scrollableHeight) * 100 : 0
        pastDescriptionStart = scrollPercentage >= 30
      }

      // Show only after reaching description area and not near footer
      const shouldShow = pastDescriptionStart && !nearFooter
      setIsVisible(shouldShow)
    }

    // Initial check
    handleScroll()

    // Add listeners
    window.addEventListener("scroll", handleScroll, { passive: true })
    window.addEventListener("resize", handleScroll, { passive: true })

    return () => {
      window.removeEventListener("scroll", handleScroll)
      window.removeEventListener("resize", handleScroll)
    }
  }, [isMounted])

  // Don't render on server or if settings say not visible
  if (!isMounted || !settings.visible) return null

  const buttonText = isPurchased
    ? (downloadFiles.length > 0 ? "Download" : "Access")
    : getButtonText(settings.buttonStyle)

  const handleDownloadFile = async (assetId: string) => {
    setDownloadingId(assetId)
    await downloadEntitledFile(assetId)
    setDownloadingId(null)
  }
  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0

  const handleClick = async () => {
    /* Same rule as the buy button: the canvas browses, it does not buy. */
    if (inEditorFrame) return
    if (isPurchased) {
      if (downloadFiles.length > 1) {
        setShowFilesModal(true)
        return
      }
      if (downloadFiles.length === 1) {
        handleDownloadFile(downloadFiles[0].id)
        return
      }
      const canonical = getCanonicalSiteUrl()
      window.location.assign(new URL("/library/my-downloads", canonical).toString())
      return
    }

    if (onAddToCart) {
      onAddToCart()
    } else {
      let checkoutUrl = `/checkout?productId=${product.id}`
      if (product.selectedVariantId) {
        checkoutUrl += `&variantId=${product.selectedVariantId}`
      }
      window.location.href = checkoutUrl
    }
  }

  /*
    ELEMENTS AND A PLAIN FUNCTION, NOT COMPONENTS — see subscribe-bar.tsx.
    An arrow component declared in a render body is a new type every render,
    so React remounts its whole subtree each time instead of updating it.
  */
  const priceBadge = (isDesktop = false) => (
    <span
      className={cn(
        "font-bold shrink-0",
        isDesktop ? "px-3.5 py-1.5 text-[15px]" : "px-3 py-1 text-sm"
      )}
      style={{
        backgroundColor: settings.buttonColor || "#2563eb",
        color: settings.buttonTextColor || "#ffffff",
        borderRadius: `${settings.borderRadius || 8}px`,
      }}
    >
      {formatPrice(product.price_cents)}
    </span>
  )

  const isDarkBg = settings.backgroundColor && (
    settings.backgroundColor.startsWith("#0") ||
    settings.backgroundColor.startsWith("#1") ||
    settings.backgroundColor.startsWith("#2")
  )

  // Use textColor from settings if available, otherwise derive from background
  const contentTextColor = settings.textColor || (isDarkBg ? "#ffffff" : undefined)

  const thumbnail = barThumbnail(product.thumbnail_url, !!isDarkBg)
  const ratingLine = barRating(reviewsCount, reviewsAverage, contentTextColor, !!isDarkBg)

  return (
    <>
    <div
      ref={barRef}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300",
        isVisible && !topBarShown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none",
        !settings.borderColor && "border-gray-200",
      )}
      style={{
        backgroundColor: settings.backgroundColor || "#ffffff",
        backdropFilter: "none",
        borderColor: settings.borderColor || undefined,
        // env(safe-area-inset-bottom) keeps content above the iOS home indicator.
        // --sab was never defined anywhere; use the native env() directly.
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Mobile version - NO STARS */}
      <div
        className="sm:hidden py-3"
        style={{
          // Keep content clear of rounded-corner areas on all modern phones.
          // max(12px, ...) guarantees a comfortable minimum even when insets are 0.
          paddingLeft: "max(12px, env(safe-area-inset-left))",
          paddingRight: "max(12px, env(safe-area-inset-right))",
        }}
      >
        <div className="mx-auto w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {priceBadge(false)}
            <p
              className="text-sm font-medium truncate"
              style={{ color: contentTextColor }}
            >
              {product.title}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleClick}
            className="shrink-0 h-10 px-5 text-sm font-medium cursor-pointer relative z-10 flex items-center gap-2"
            style={{
              backgroundColor: settings.buttonColor || "#2563eb",
              color: settings.buttonTextColor || "#ffffff",
              borderRadius: `${settings.borderRadius || 8}px`,
            }}
          >
            {isPurchased && downloadFiles.length > 0 && <Download className="h-4 w-4" />}
            {buttonText}
          </Button>
        </div>
      </div>

      {/*
        =====================================================================
         DESKTOP: THE THING, THEN THE PRICE AND THE BUTTON
        =====================================================================
        It was a coloured price chip, the title, five stars and a button, and
        the chip at the far left meant the first thing in the bar was a
        number with no picture attached to it. A bar that follows somebody
        down a page should look like the thing they are deciding about:
        the product's own picture, its name, and at the other end the price
        next to the button that acts on it. Left is what, right is what it
        costs and what to do.

        The five stars became one. They were a second row of graphics in a
        strip 60px tall, and at that size a filled star with the average
        beside it says the same thing in a quarter of the room. The number
        is the part anybody reads.

        The phone bar keeps the chip. There is no room for a picture at that
        width without taking it from the title.
      */}
      <div className="hidden sm:block py-3 px-[15px]">
        <div className="mx-auto w-full max-w-[1150px] flex items-center justify-between gap-6">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            {thumbnail}
            <div className="min-w-0">
              <p
                className="text-[15px] font-semibold truncate leading-tight"
                style={{ color: contentTextColor }}
              >
                {product.title}
              </p>
              {ratingLine}
            </div>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span
              className={cn("text-[17px] font-semibold tabular-nums", !contentTextColor && "text-gray-900")}
              style={{ color: contentTextColor }}
            >
              {formatPrice(product.price_cents)}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={handleClick}
              className="shrink-0 h-11 px-7 text-[15px] font-medium cursor-pointer relative z-10 flex items-center gap-2"
              style={{
                backgroundColor: settings.buttonColor || "#2563eb",
                color: settings.buttonTextColor || "#ffffff",
                borderRadius: `${settings.borderRadius || 8}px`,
              }}
            >
              {isPurchased && downloadFiles.length > 0 && <Download className="h-4 w-4" />}
              {buttonText}
            </Button>
          </div>
        </div>
      </div>
    </div>

      {downloadFiles.length > 1 && (
        <DownloadFilesSheet
          isOpen={showFilesModal}
          onClose={() => setShowFilesModal(false)}
          title={product.title}
          files={downloadFiles}
          downloadingFileId={downloadingId}
          onDownload={handleDownloadFile}
        />
      )}
    </>
  )
}
