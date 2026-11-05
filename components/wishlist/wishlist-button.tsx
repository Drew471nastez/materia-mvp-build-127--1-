"use client"

import { useState, useEffect } from "react"
import { Heart, Loader2, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { sharedJson } from "@/lib/net/shared-read"
import { paintAs, tint } from "@/lib/appearance/site-paint"
import { useSitePaint, useSitePaintOn } from "@/lib/appearance/site-paint-context"
import { extractUsernameFromHost, getCanonicalSiteUrl } from "@/lib/url-helpers"

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
  /*
    Round 31, the owner: "the add to wishlist button is not adapted". On Storelib's own product page its colours follow
    the person's look (lib/appearance/site-paint): the card's charcoal, a faint edge, light words and heart in the dark;
    exactly the colours it had in the light look.
  */
  const paint = useSitePaint()
  const painting = useSitePaintOn()

  useEffect(() => {
    const checkWishlist = async () => {
      try {
        /* One read for both of the product page's buy boxes (lib/net/shared-read.ts, round 54). */
        const data = await sharedJson<{ isWishlisted?: boolean; isLoggedIn?: boolean }>(`/api/wishlist/check?productId=${productId}`, { credentials: "include" })
        if (data) {
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

  // When on a seller subdomain (e.g. anisia.storelib.com) always redirect to the
  // canonical platform domain so the user lands on storelib.com/wishlist, not the
  // seller's subdomain /wishlist which doesn't exist there.
  const wishlistHref = (() => {
    const basePath = userLoggedIn ? "/account/library/wishlist" : "/wishlist"
    if (typeof window !== "undefined" && extractUsernameFromHost(window.location.host)) {
      return `${getCanonicalSiteUrl()}${basePath}`
    }
    return basePath
  })()

  // Common button styles
  const buttonStyle = {
    backgroundColor: paint(backgroundColor || "#ffffff", "bg"),
    borderColor: paint(borderColor || "#d1d5db", "line"),
    color: paint(textColor || "#111827", "ink"),
  }

  const iconStyle = iconColor ? { color: paint(iconColor, "ink") } : undefined
  const iconClassName = iconColor ? "h-4 w-4" : "h-4 w-4 text-gray-400"

  // Loading state
  if (isLoading) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] relative z-10",
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
          type="button"
          onClick={handleClick}
          className="w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] hover:opacity-80 transition-colors cursor-pointer relative z-10"
          style={{
            ...buttonStyle,
            borderColor: painting ? paintAs("danger-line", "#fca5a5") : "#fca5a5",
            color: paint(textColor || "#dc2626", "ink"),
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
    const checkBadgeBg = backgroundColor ? paint(textColor || "rgba(255,255,255,0.2)", "ink") : paint("#e5e7eb", "bg")
    const checkIconColor = backgroundColor ? paint(backgroundColor, "bg") : paint("#6b7280", "ink")

    const handleWishlistClick = () => {
      // Use window.location.href for reliable navigation (works across subdomains)
      window.location.href = wishlistHref
    }

    return (
      <button
        type="button"
        onClick={handleWishlistClick}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] cursor-pointer relative z-10",
          "transition-[opacity,scale] duration-150 ease-out hover:opacity-80 active:scale-[0.985]",
          className
        )}
        style={buttonStyle}
      >
        <div
          className="flex shrink-0 items-center justify-center w-5 h-5 rounded-full"
          style={{ backgroundColor: iconColor ? tint(paint(iconColor, "ink"), "33") : checkBadgeBg }}
        >
          <Check
            className="h-3 w-3"
            strokeWidth={2.5}
            style={{ color: paint(iconColor, "ink") || checkIconColor }}
          />
        </div>
        <span className="text-sm font-medium">In your wishlist</span>
        <ChevronRight className="h-4 w-4 ml-1" style={iconStyle} />
      </button>
    )
  }

  /**
   * ===========================================================================
   *  NOTHING IN THIS BUTTON MOVES WHEN IT IS PRESSED
   * ===========================================================================
   * Pressing it used to change three things at once: the icon became a
   * spinner, "Add to wishlist" became "Adding...", and the whole control
   * dropped to 70% opacity. The label is centred, so a shorter word re-centres
   * the row — the icon and the text both slide inwards — and the fade reads as
   * the button having gone dead. For the length of a network round trip, on
   * the one control a visitor has just committed to.
   *
   * The two icons are the same 16px box in the same flex slot, so swapping
   * one for the other moves nothing at all. The label does not change, because
   * a button says what it DOES, and it is still doing it. And it keeps its
   * colour: busy is not unavailable.
   *
   * `active:scale` is the press itself, which is the one piece of feedback
   * that was missing — there was no response at all between the press and the
   * server answering.
   */
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isAdding}
      aria-busy={isAdding || undefined}
      className={cn(
        "w-full flex items-center justify-center gap-2 rounded-lg border py-3 px-4 min-h-[48px] group cursor-pointer relative z-10",
        "transition-[opacity,scale] duration-150 ease-out hover:opacity-80 active:scale-[0.985]",
        isAdding && "cursor-progress",
        className
      )}
      style={buttonStyle}
    >
      {isAdding ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" style={iconStyle} aria-hidden />
      ) : (
        <Heart
          className={cn("h-4 w-4 shrink-0 transition-colors", !iconColor && "group-hover:text-rose-500")}
          style={iconStyle}
          aria-hidden
        />
      )}
      <span className="text-sm font-medium">Add to wishlist</span>
    </button>
  )
}
