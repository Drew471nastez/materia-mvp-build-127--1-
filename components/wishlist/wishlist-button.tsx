"use client"

import { useState, useEffect } from "react"
import { Heart, Loader2, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface WishlistButtonProps {
  productId: string
  className?: string
  isLoggedIn?: boolean
  onWishlistChange?: (count: number) => void
  // Theme color props
  backgroundColor?: string
  textColor?: string
  borderColor?: string
  iconColor?: string
}

// Helper to save guest ID
function saveGuestId(guestId: string): void {
  if (typeof document !== "undefined") {
    const maxAge = 365 * 24 * 60 * 60
    document.cookie = `materia_guest_id=${guestId}; path=/; max-age=${maxAge}; samesite=lax`
  }
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("materia_guest_id", guestId)
  }
}

export function WishlistButton({
  productId,
  className,
  isLoggedIn = false,
  onWishlistChange,
  backgroundColor,
  textColor,
  borderColor,
  iconColor,
}: WishlistButtonProps) {
  const [isWishlisted, setIsWishlisted] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [userLoggedIn, setUserLoggedIn] = useState(isLoggedIn)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkWishlist = async () => {
      try {
        const res = await fetch(`/api/wishlist/check?productId=${productId}`, {
          credentials: "include",
        })
        
        if (res.ok) {
          const data = await res.json()
          setIsWishlisted(data.isWishlisted || false)
          setUserLoggedIn(data.isLoggedIn || false)
        }
      } catch (err) {
        console.error("[WishlistButton] Check error:", err)
      } finally {
        setIsLoading(false)
      }
    }

    checkWishlist()
  }, [productId])

  const handleClick = async () => {
    if (isAdding) return
    if (isWishlisted) return

    setIsAdding(true)
    setError(null)

    try {
      const res = await fetch("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
        credentials: "include",
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setIsWishlisted(true)

        if (data.guestId) {
          saveGuestId(data.guestId)
        }

        if (onWishlistChange && typeof data.count === "number") {
          onWishlistChange(data.count)
        }

        window.dispatchEvent(new CustomEvent("wishlist-updated", { 
          detail: { count: data.count, guestId: data.guestId } 
        }))
      } else {
        setError(data.error || "Failed to add")
      }
    } catch (err) {
      console.error("[WishlistButton] Add error:", err)
      setError("Something went wrong")
    } finally {
      setIsAdding(false)
    }
  }

  const wishlistHref = userLoggedIn ? "/library/wishlist" : "/wishlist"

  // Common button styles
  const buttonStyle = {
    backgroundColor: backgroundColor || "#ffffff",
    borderColor: borderColor || "#d1d5db",
    color: textColor || "#111827",
  }

  const iconStyle = iconColor ? { color: iconColor } : undefined
  const iconClassName = iconColor ? "h-4 w-4" : "h-4 w-4 text-gray-400"

  // Loading state
  if (isLoading) {
    return (
      <button
        disabled
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px]",
          className
        )}
        style={buttonStyle}
      >
        <Heart className={iconClassName} style={iconStyle} />
        <span className="text-sm font-medium">Add to wishlist</span>
      </button>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={cn("space-y-2", className)}>
        <button
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] hover:opacity-80 transition-colors"
          style={{
            ...buttonStyle,
            borderColor: "#fca5a5",
            color: textColor || "#dc2626",
          }}
        >
          <Heart className="h-4 w-4" />
          <span className="text-sm font-medium">Try again</span>
        </button>
        <p className="text-xs text-red-500 text-center">{error}</p>
      </div>
    )
  }

  // Already in wishlist - check icon in circle, themed text, chevron
  if (isWishlisted) {
    // Determine check badge colors based on theme
    const checkBadgeBg = backgroundColor ? (textColor || "rgba(255,255,255,0.2)") : "#e5e7eb"
    const checkIconColor = backgroundColor ? backgroundColor : "#6b7280"

    const handleWishlistClick = () => {
      // Use window.location.href for reliable navigation (works across subdomains)
      window.location.href = wishlistHref
    }

    return (
      <button
        onClick={handleWishlistClick}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] hover:opacity-80 transition-colors cursor-pointer",
          className
        )}
        style={buttonStyle}
      >
        <div
          className="flex items-center justify-center w-5 h-5 rounded-full"
          style={{ backgroundColor: iconColor ? `${iconColor}33` : checkBadgeBg }}
        >
          <Check
            className="h-3 w-3"
            strokeWidth={2.5}
            style={{ color: iconColor || checkIconColor }}
          />
        </div>
        <span className="text-sm font-medium">In your wishlist</span>
        <ChevronRight className="h-4 w-4 ml-1" style={iconStyle} />
      </button>
    )
  }

  // Default state - add to wishlist
  return (
    <button
      onClick={handleClick}
      disabled={isAdding}
      className={cn(
        "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] hover:opacity-80 transition-colors group",
        isAdding && "opacity-70 cursor-not-allowed",
        className
      )}
      style={buttonStyle}
    >
      {isAdding ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" style={iconStyle} />
          <span className="text-sm font-medium">Adding...</span>
        </>
      ) : (
        <>
          <Heart
            className={cn("h-4 w-4 transition-colors", !iconColor && "group-hover:text-rose-500")}
            style={iconStyle}
          />
          <span className="text-sm font-medium">Add to wishlist</span>
        </>
      )}
    </button>
  )
}
