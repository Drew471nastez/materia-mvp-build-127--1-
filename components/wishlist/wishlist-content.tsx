"use client"

import { useState, useEffect, useCallback } from "react"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Heart, Trash2, Loader2, ShoppingBag, RefreshCw } from "lucide-react"
import { getStoreUrl, getProductUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/ui/smart-link"

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
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const fetchWishlist = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setIsRefreshing(true)
    }

    try {
      const res = await fetch("/api/wishlist", {
        credentials: "include",
        cache: "no-store",
      })

      const data = await res.json()
      console.log("[WishlistContent] Response:", data)

      if (res.ok && data.items) {
        const validItems = data.items.filter((item: WishlistItem) => item.products !== null)
        setItems(validItems)
        
        if (data.guestId) {
          saveGuestId(data.guestId)
        }
      } else {
        console.error("[WishlistContent] Error:", data.error)
        setItems([])
      }
    } catch (err) {
      console.error("[WishlistContent] Fetch error:", err)
      setItems([])
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
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
      fetchWishlist(true)
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
      <div className="flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Loading wishlist...</p>
        </div>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-6">
          <Heart className="h-10 w-10 text-gray-400" strokeWidth={1.5} />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-gray-900">Your wishlist is empty</h2>
        <p className="text-gray-500 mb-8 max-w-sm mx-auto">
          Browse products and add them to your wishlist to save them for later.
        </p>
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link href="/explore">
            <ShoppingBag className="h-4 w-4 mr-2" />
            Explore Products
          </Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-gray-500">
          {items.length} {items.length === 1 ? "item" : "items"} saved
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchWishlist(true)}
          disabled={isRefreshing}
          className="text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        {items.map((item) => {
          const product = item.products
          if (!product) return null

          // Get creator info from the new structure
          const creatorName = product.creator_profile?.display_name || "Creator"
          const creatorUsername = product.creator_profile?.username || product.creators?.slug

          return (
            <Card key={item.id} className="overflow-hidden border-gray-200 hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="flex gap-4 p-4">
                  <SmartLink href={creatorUsername ? getProductUrl(creatorUsername, product.slug) : `/p/${product.slug}`} className="shrink-0">
                    <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden bg-gray-100">
                      {product.thumbnail_url ? (
                        <Image
                          src={product.thumbnail_url}
                          alt={product.title}
                          fill
                          className="object-cover hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ShoppingBag className="h-8 w-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                  </SmartLink>

                  <div className="flex-1 min-w-0 flex flex-col">
                    <SmartLink href={creatorUsername ? getProductUrl(creatorUsername, product.slug) : `/p/${product.slug}`}>
                      <h3 className="font-semibold text-gray-900 hover:text-blue-600 truncate transition-colors">
                        {product.title}
                      </h3>
                    </SmartLink>

                    {creatorUsername && (
                      <SmartLink
                        href={getStoreUrl(creatorUsername)}
                        className="text-sm text-gray-500 hover:text-gray-700 transition-colors mt-0.5"
                      >
                        by {creatorName}
                      </SmartLink>
                    )}

                    <div className="mt-2 flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
                      </span>
                      {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
                        <span className="text-sm text-gray-400 line-through">
                          {formatPrice(product.compare_at_cents)}
                        </span>
                      )}
                    </div>

                    <div className="mt-auto pt-3 flex gap-2">
                      <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700">
                        <SmartLink href={creatorUsername ? getProductUrl(creatorUsername, product.slug) : `/p/${product.slug}`}>
                          View Product
                        </SmartLink>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(product.id)}
                        disabled={removingId === product.id}
                        className="text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                      >
                        {removingId === product.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
