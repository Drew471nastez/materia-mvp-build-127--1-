"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Heart, X, Loader2, ShoppingBag, ArrowRight } from "lucide-react"
import { getStoreUrl, getProductUrl, getProductShareUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { isNativeApp } from "@/lib/native-bridge"
import { WishlistSkeleton } from "./wishlist-skeleton"

interface WishlistItem {
  id: string
  product_id: string
  created_at: string
  products: {
    id: string
    title: string
    slug: string
    price_cents: number
    compare_at_cents: number | null
    thumbnail_url: string | null
    type: string
    creator_id: string
    creator_profile?: {
      display_name: string | null
      username: string | null
      avatar_url: string | null
    } | null
    creators?: {
      id: string
      user_id: string
      slug: string
    } | null
  } | null
}

interface WishlistContentProps {
  isLibrary?: boolean
  showDiscoverMoreCta?: boolean
}

// Helper to get guest ID from cookie
function getGuestIdFromCookie(): string | null {
  if (typeof document === "undefined") return null
  const match = document.cookie.match(/materia_guest_id=([^;]+)/)
  return match ? match[1] : null
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

export function WishlistContent({ isLibrary = false, showDiscoverMoreCta = false }: WishlistContentProps) {
  const [items, setItems] = useState<WishlistItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const fetchWishlist = useCallback(async () => {
    try {
      const res = await fetch("/api/wishlist", {
        credentials: "include",
        cache: "no-store",
      })

      const data = await res.json()

      if (res.ok && data.items) {
        const validItems = data.items.filter((item: WishlistItem) => item.products !== null)
        setItems(validItems)

        if (data.guestId) {
          saveGuestId(data.guestId)
        }
      } else {
        setItems([])
      }
    } catch {
      setItems([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWishlist()
  }, [fetchWishlist])

  useEffect(() => {
    const handleWishlistUpdate = (event: CustomEvent) => {
      if (event.detail?.guestId) {
        saveGuestId(event.detail.guestId)
      }
      fetchWishlist()
    }

    window.addEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
    return () => window.removeEventListener("wishlist-updated", handleWishlistUpdate as EventListener)
  }, [fetchWishlist])

  const removeItem = async (productId: string) => {
    setRemovingId(productId)
    try {
      const res = await fetch(`/api/wishlist?productId=${productId}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (res.ok) {
        setItems(prev => prev.filter(item => item.product_id !== productId))
        const data = await res.json()
        window.dispatchEvent(new CustomEvent("wishlist-updated", { detail: { count: data.count } }))
      }
    } catch (err) {
      console.error("Failed to remove:", err)
    } finally {
      setRemovingId(null)
    }
  }

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(cents / 100)
  }

  if (isLoading) {
    /* In the library, the same grid the route's loading screen drew, so the
       wait between the two is one shape and nothing jumps when cards land. */
    if (isLibrary) return <WishlistSkeleton />
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-neutral-200 border-t-neutral-800 animate-spin" />
          <p className="text-sm text-neutral-400">Loading your wishlist...</p>
        </div>
      </div>
    )
  }

  if (items.length === 0 && isLibrary) {
    /* The library's own empty card (components/library/library-home.tsx has the same shape). */
    return (
      <div data-wishlist-empty="" className="rounded-2xl border border-[#e4e7ec]/80 bg-white px-5 py-10 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]">
        <Heart className="mx-auto h-7 w-7 text-[#c4c8cf]" strokeWidth={1.5} aria-hidden />
        <p className="mt-3 text-[16px] font-semibold text-[#1a1a2e]">Nothing saved yet</p>
        <p className="mx-auto mt-1.5 max-w-[320px] text-[14px] leading-relaxed text-[#6b7280]">Tap the heart on any product to keep it here for later.</p>
        <Link href="/explore" className="mt-5 inline-flex h-10 items-center justify-center rounded-[10px] bg-[#7c3aed] px-4 text-[14px] font-semibold text-white hover:bg-[#6d28d9]">
          Discover products
        </Link>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-20 h-20 rounded-full bg-neutral-50 flex items-center justify-center mb-6">
          <Heart className="h-9 w-9 text-neutral-300" strokeWidth={1.5} />
        </div>
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">No saved items yet</h2>
        <p className="text-neutral-500 text-sm text-center max-w-xs mb-8">
          Products you save will appear here. Start exploring to find something you love.
        </p>
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
        >
          Explore Products
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* The library's count line (components/library/library-home.tsx), in the library; the page's own elsewhere. */}
      <p className={isLibrary ? "mb-3 px-0.5 text-[13px] text-[#6b7280]" : "mb-5 text-sm text-neutral-500"}>
        {items.length} {items.length === 1 ? "item" : "items"} saved
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const product = item.products
          if (!product) return null

          const creatorName = product.creator_profile?.display_name || "Creator"
          const creatorUsername = product.creator_profile?.username || product.creators?.slug
          const native = isNativeApp()
          // On native apps, use the full share URL so SmartLink opens it in the external browser
          const productUrl = native && creatorUsername
            ? getProductShareUrl(creatorUsername, product.slug)
            : creatorUsername ? getProductUrl(creatorUsername, product.slug) : `/p/${product.slug}`
          const isRemoving = removingId === product.id

          return (
            <div
              key={item.id}
              className={`group relative rounded-2xl border border-neutral-100 bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:border-neutral-200 ${
                isRemoving ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {/* Thumbnail */}
              <SmartLink href={productUrl} className="block" target={native ? "_blank" : undefined}>
                <div className="relative aspect-[4/3] bg-neutral-50 overflow-hidden">
                  {product.thumbnail_url ? (
                    <Image
                      src={product.thumbnail_url}
                      alt={product.title}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-neutral-300" />
                    </div>
                  )}
                </div>
              </SmartLink>

              {/* Remove button — top right */}
              <button
                onClick={() => removeItem(product.id)}
                disabled={isRemoving}
                className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-50 cursor-pointer"
                aria-label="Remove from wishlist"
              >
                {isRemoving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-neutral-400" />
                ) : (
                  <X className="h-3.5 w-3.5 text-neutral-500 hover:text-red-500" />
                )}
              </button>

              {/* Info */}
              <div className="p-3.5">
                <SmartLink href={productUrl} target={native ? "_blank" : undefined}>
                  <h3 className="font-medium text-neutral-900 text-sm truncate hover:text-violet-600 transition-colors">
                    {product.title}
                  </h3>
                </SmartLink>

                {creatorUsername && (
                  <SmartLink
                    href={getStoreUrl(creatorUsername)}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors mt-0.5 block truncate"
                  >
                    {creatorName}
                  </SmartLink>
                )}

                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 text-sm">
                      {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                    </span>
                    {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                      <span className="text-xs text-neutral-400 line-through">
                        {formatPrice(product.compare_at_cents)}
                      </span>
                    )}
                  </div>
                  <SmartLink
                    href={productUrl}
                    className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
                    target={native ? "_blank" : undefined}
                  >
                    View
                  </SmartLink>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {showDiscoverMoreCta && items.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors"
          >
            Discover More
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
