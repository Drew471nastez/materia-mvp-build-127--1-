"use client"

import type React from "react"
import { useEffect, useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Star } from "lucide-react"
import { stickyAddToCartButtonPresets } from "@/lib/store-builder/defaults"

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
  price_cents: number
  compare_at_cents?: number
  reviews_count?: number
  reviews_average?: number
}

interface StickyAddToCartProps {
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

export function EditorStickyAddToCart({
  settings,
  product,
  isEditorPreview,
  isMobile,
  isSelected,
  onSelect,
  scrollY = 0,
}: StickyAddToCartProps) {
  if (!settings.visible) return null

  const buttonText = getButtonText(settings.buttonStyle)
  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0
  const hasReviews = reviewsCount > 0

  const handleInteractiveClick = (e: React.MouseEvent) => {
    e.stopPropagation()
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isEditorPreview) return
    window.location.href = `/checkout?productId=${product.id}`
  }

  const handleWrapperClick = () => {
    if (onSelect) onSelect()
  }

  const PriceBadge = () => (
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

  const StarsDisplay = () => {
    if (!hasReviews) return null
    return (
      <div className="flex items-center gap-1 shrink-0">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= Math.round(reviewsAverage)
                ? isDarkBg ? "fill-current text-white" : "fill-current text-black"
                : isDarkBg ? "text-gray-500" : "text-gray-300",
            )}
            style={star <= Math.round(reviewsAverage) && contentTextColor ? { color: contentTextColor } : undefined}
          />
        ))}
        <span
          className="text-sm ml-1"
          style={{ color: contentTextColor ? `${contentTextColor}b3` : undefined }}
        >
          {reviewsCount}
        </span>
      </div>
    )
  }

  return (
    <div
      onClick={handleWrapperClick}
      className={cn(
        "sticky bottom-0 w-full z-30 border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)]",
        isMobile ? "py-3 px-[7px]" : "py-3.5 px-[15px]",
        onSelect && "cursor-pointer",
        isSelected && "ring-2 ring-sky-500 ring-inset",
        !settings.borderColor && "border-gray-200",
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
        <div className={cn("flex items-center min-w-0 flex-1", isMobile ? "gap-3" : "gap-4")}>
          <PriceBadge />
          <p
            className={cn("font-medium truncate", isMobile ? "text-sm" : "text-[15px]")}
            style={{ color: contentTextColor }}
          >
            {product.title}
          </p>
        </div>

        <div className={cn("flex items-center shrink-0", isMobile ? "gap-4" : "gap-5")}>
          {/* Stars only show on DESKTOP in editor */}
          {!isMobile && <StarsDisplay />}
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
  )
}

export function LiveStickyAddToCart({
  settings,
  product,
  creatorId,
  onAddToCart,
}: StickyAddToCartProps & { onAddToCart?: () => void }) {
  // Start visible by default so it shows immediately on page load/refresh
  const [isVisible, setIsVisible] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  // Mount on client
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Handle scroll visibility - only hide when near footer
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

      // Show by default, only hide when near footer
      const shouldShow = !nearFooter
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

  const buttonText = getButtonText(settings.buttonStyle)
  const reviewsCount = product.reviews_count || 0
  const reviewsAverage = product.reviews_average || 0
  const hasReviews = reviewsCount > 0

  const handleClick = () => {
    if (onAddToCart) {
      onAddToCart()
    } else {
      window.location.href = `/checkout?productId=${product.id}`
    }
  }

  const PriceBadge = ({ isDesktop = false }: { isDesktop?: boolean }) => (
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

  const StarsDisplay = () => {
    if (!hasReviews) return null
    return (
      <div className="flex items-center gap-1 shrink-0">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= Math.round(reviewsAverage)
                ? isDarkBg ? "fill-current text-white" : "fill-current text-black"
                : isDarkBg ? "text-gray-500" : "text-gray-300",
            )}
            style={star <= Math.round(reviewsAverage) && contentTextColor ? { color: contentTextColor } : undefined}
          />
        ))}
        <span
          className="text-sm ml-1"
          style={{ color: contentTextColor ? `${contentTextColor}b3` : undefined }}
        >
          {reviewsCount}
        </span>
      </div>
    )
  }

  return (
    <div
      ref={barRef}
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 border-t shadow-[0_-4px_12px_rgba(0,0,0,0.08)] transition-all duration-300",
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none",
        !settings.borderColor && "border-gray-200",
      )}
      style={{
        backgroundColor: settings.backgroundColor || "#ffffff",
        backdropFilter: "none",
        borderColor: settings.borderColor || undefined,
      }}
    >
      {/* Mobile version - NO STARS */}
      <div className="sm:hidden py-3 px-[7px]">
        <div className="mx-auto w-full max-w-[calc(100%-10px)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <PriceBadge />
            <p
              className="text-sm font-medium truncate"
              style={{ color: contentTextColor }}
            >
              {product.title}
            </p>
          </div>
          <Button
            size="sm"
            onClick={handleClick}
            className="shrink-0 h-10 px-5 text-sm font-medium"
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

      {/* Desktop version WITH STARS */}
      <div className="hidden sm:block py-3.5 px-[15px]">
        <div className="mx-auto w-full max-w-[1150px] flex items-center justify-between gap-5">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <PriceBadge isDesktop />
            <p
              className="text-[15px] font-semibold truncate"
              style={{ color: contentTextColor }}
            >
              {product.title}
            </p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <StarsDisplay />
            <Button
              size="sm"
              onClick={handleClick}
              className="shrink-0 h-11 px-7 text-[15px] font-medium"
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
    </div>
  )
}
