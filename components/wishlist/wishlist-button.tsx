"use client"

import { useState, useEffect } from "react"
import { Heart, Loader2, ChevronRight, Check } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface WishlistButtonProps {
  productId: string
  className?: string
  isLoggedIn?: boolean
  onWishlistChange?: (count: number) => void
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

export function WishlistButton({ productId, className, isLoggedIn = false, onWishlistChange }: WishlistButtonProps) {
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

  // Loading state
  if (isLoading) {
    return (
      <button
        disabled
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 px-4 min-h-[44px] text-gray-900",
          className
        )}
      >
        <Heart className="h-4 w-4 text-gray-400" />
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
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-300 bg-white py-3 px-4 min-h-[44px] text-red-600 hover:bg-red-50 transition-colors"
        >
          <Heart className="h-4 w-4" />
          <span className="text-sm font-medium">Try again</span>
        </button>
        <p className="text-xs text-red-500 text-center">{error}</p>
      </div>
    )
  }

  // Already in wishlist - gray check icon in circle, black text, chevron
  if (isWishlisted) {
    return (
      <Link
        href={wishlistHref}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 px-4 min-h-[44px] hover:bg-gray-50 hover:border-gray-400 transition-colors cursor-pointer",
          className
        )}
      >
        <div className="flex items-center justify-center w-5 h-5 rounded-full bg-gray-200">
          <Check className="h-3 w-3 text-gray-500" strokeWidth={2.5} />
        </div>
        <span className="text-sm font-medium text-gray-900">In your wishlist</span>
        <ChevronRight className="h-4 w-4 text-gray-400 ml-1" />
      </Link>
    )
  }

  // Default state - add to wishlist
  return (
    <button
      onClick={handleClick}
      disabled={isAdding}
      className={cn(
        "w-full flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white py-3 px-4 min-h-[44px] hover:bg-gray-50 hover:border-gray-400 transition-colors group",
        isAdding && "opacity-70 cursor-not-allowed",
        className
      )}
    >
      {isAdding ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
          <span className="text-sm font-medium text-gray-900">Adding...</span>
        </>
      ) : (
        <>
          <Heart className="h-4 w-4 text-gray-500 group-hover:text-rose-500 transition-colors" />
          <span className="text-sm font-medium text-gray-900">Add to wishlist</span>
        </>
      )}
    </button>
  )
}
