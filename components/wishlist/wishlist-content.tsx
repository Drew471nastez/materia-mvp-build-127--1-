"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Heart, X, Loader2, ShoppingBag, ArrowRight } from "lucide-react"
import { getStoreUrl, getProductUrl } from "@/lib/url-helpers"

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

export function WishlistContent({ isLibrary = false }: WishlistContentProps) {
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
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-neutral-200 border-t-neutral-800 animate-spin" />
          <p className="text-sm text-neutral-400">Loading your wishlist...</p>
        </div>
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
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-neutral-500">
          {items.length} {items.length === 1 ? "item" : "items"} saved
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) => {
          const product = item.products
          if (!product) return null

          const creatorName = product.creator_profile?.display_name || "Creator"
          const creatorUsername = product.creator_profile?.username || product.creators?.slug
          const productUrl = creatorUsername ? getProductUrl(creatorUsername, product.slug) : `/p/${product.slug}`
          const isRemoving = removingId === product.id

          return (
            <div
              key={item.id}
              className={`group relative rounded-2xl border border-neutral-100 bg-white overflow-hidden transition-all duration-200 hover:shadow-md hover:border-neutral-200 ${
                isRemoving ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              {/* Thumbnail */}
              <a href={productUrl} className="block">
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
              </a>

              {/* Remove button — top right */}
              <button
                onClick={() => removeItem(product.id)}
                disabled={isRemoving}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-red-50 cursor-pointer"
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
                <a href={productUrl}>
                  <h3 className="font-medium text-neutral-900 text-sm truncate hover:text-violet-600 transition-colors">
                    {product.title}
                  </h3>
                </a>

                {creatorUsername && (
                  <a
                    href={getStoreUrl(creatorUsername)}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors mt-0.5 block truncate"
                  >
                    {creatorName}
                  </a>
                )}

                <div className="flex items-center justify-between mt-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 text-sm">
                      {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                    </span>
                    {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                      <span className="text-xs text-neutral-400 line-through">
                        {formatPrice(product.compare_at_cents)}
                      </span>
                    )}
                  </div>
                  <a
                    href={productUrl}
                    className="text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
                  >
                    View
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
