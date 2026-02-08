"use client"

import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { Star } from "lucide-react"

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    description?: string | null
    price_cents: number
    compare_at_cents?: number | null
    thumbnail_url?: string | null
    type: string
    category?: string | null // Direct category field from product
    categoryName?: string | null // Pre-computed category name for display
    reviews_count?: number | null
    reviews_average?: number | null
    categories?: {
      id: string
      name: string
      slug: string
      type?: string
    }[]
    creator?: {
      id?: string
      slug?: string
      niche_tags?: string[]
      profile?: {
        display_name?: string | null
        avatar_url?: string | null
        username?: string | null
      } | null
    } | null
  }
  srcParam?: string
  /** Set to true for above-the-fold images for faster LCP */
  priority?: boolean
}

export function ProductCard({ product, srcParam = "", priority = false }: ProductCardProps) {
  // Safety check - if product is null/undefined, don't render
  if (!product) return null

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format((cents || 0) / 100)
  }

  const creatorName = product.creator?.profile?.display_name || "Creator"
  const creatorUsername = product.creator?.profile?.username || product.creator?.slug || ""
  const creatorAvatarUrl = product.creator?.profile?.avatar_url
  const baseProductUrl = getProductUrl(creatorUsername, product.slug || "")
  const productUrl = `${baseProductUrl}${baseProductUrl.includes("?") ? "&" : "?"}layout=discover&recommended=1`
  const storeUrl = getStoreUrl(creatorUsername)

  const hasReviews = (product.reviews_count ?? 0) > 0
  const reviewsAverage = product.reviews_average ?? 0

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-all duration-300 ease-out hover:border-border hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]">
      <a href={productUrl} className="relative aspect-video bg-muted overflow-hidden">
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt={product.title || "Product"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            priority={priority}
            loading={priority ? undefined : "lazy"}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <span className="text-4xl">
              {product.type === "digital" ? "📦" : product.type === "course" ? "📚" : "👥"}
            </span>
          </div>
        )}
        {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
          <Badge variant="destructive" className="absolute left-2 top-2 text-xs">
            {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
          </Badge>
        )}
      </a>
      <div className="flex flex-1 flex-col p-4">
        {/* Seller info row - avatar, name (clickable), divider, rating */}
        <div className="flex items-center gap-2 mb-2">
          <a
            href={storeUrl}
            className="group/seller flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {creatorAvatarUrl ? (
              <Image
                src={creatorAvatarUrl}
                alt={creatorName}
                width={20}
                height={20}
                className="rounded-full object-cover shrink-0 aspect-square"
                loading="lazy"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0 aspect-square">
                {creatorName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="text-[13px] text-muted-foreground truncate max-w-[120px] group-hover/seller:underline">
              {creatorName}
            </span>
          </a>
          {hasReviews && (
            <>
              <span className="h-3.5 w-px bg-border/60 shrink-0" />
              <div className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-current text-foreground" />
                <span className="text-[13px] text-muted-foreground">
                  {reviewsAverage.toFixed(1)}
                </span>
              </div>
            </>
          )}
        </div>

        <a href={productUrl} className="flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[17px] font-medium leading-tight break-words min-w-0">{product.title}</h3>
            <Badge variant="secondary" className="shrink-0 text-xs capitalize">
              {product.categoryName || product.categories?.[0]?.name || product.category || product.type}
            </Badge>
          </div>
          <div className="mt-auto pt-4">
            <span className="font-semibold">{product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}</span>
            {product.compare_at_cents && product.compare_at_cents > product.price_cents && (
              <span className="ml-2 text-sm text-muted-foreground line-through">
                {formatPrice(product.compare_at_cents)}
              </span>
            )}
          </div>
        </a>
      </div>
    </div>
  )
}
