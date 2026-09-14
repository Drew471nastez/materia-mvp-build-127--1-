"use client"

import { memo, useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { Star } from "lucide-react"

function CreatorAvatar({ url, name, size = 20 }: { url?: string | null; name: string; size?: number }) {
  const [failed, setFailed] = useState(false)
  const initial = name.charAt(0).toUpperCase()

  if (!url || failed) {
    return (
      <div
        className="rounded-full bg-muted flex items-center justify-center font-medium text-muted-foreground shrink-0 aspect-square"
        style={{ width: size, height: size, fontSize: size * 0.5 }}
      >
        {initial}
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0 aspect-square"
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ width: size, height: size }}
    />
  )
}

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
  /** Use router.push() on native instead of window.location.href to avoid white flash */
  clientNav?: boolean
  /**
   * `?layout=discover` tells the product page it was reached from a browse
   * surface and to render the back-to-discover chrome. A creator's own
   * storefront is not that, so it passes false and links straight to the
   * product.
   */
  discoverLayout?: boolean
  /**
   * The seller row. On a browse surface it is the point — it says whose work
   * this is. On a creator's OWN storefront every card would carry the same
   * face and the same name, directly under a header showing that face and that
   * name, which tells the visitor nothing and costs a row on every card.
   */
  showCreator?: boolean
  /**
   * THE COLOURS A THEME GIVES THE CARD, applied inline.
   *
   * The root is `bg-card border-border/60`, which is the design system's
   * white. A creator page paints its sections from a theme preset, and for
   * every dark preset that meant a white card with near-white text on it —
   * invisible titles, invisible prices. The featured-products renderer had
   * been computing exactly these four colours from the theme and then not
   * passing them anywhere, so this is the prop that was missing. Inline,
   * because an inline style beats a class and nothing else does.
   */
  surface?: {
    backgroundColor?: string
    borderColor?: string
    textColor?: string
    priceColor?: string
    /**
     * Everything secondary on the card: the seller's name, the rating, the
     * struck-through original price. All three were `text-muted-foreground`,
     * a token that means grey-on-white, so on a dark card they were a shade
     * away from invisible.
     */
    mutedColor?: string
    /**
     * The category pill. `variant="secondary"` is a light grey chip with dark
     * type in it, which on a dark card is a white blob — it is the "Digital"
     * badge in the report. The discount flag is deliberately NOT themed: red
     * means a discount, and a scheme does not get to change what it means.
     */
    badgeBackgroundColor?: string
    badgeTextColor?: string
  }
}

export const ProductCard = memo(function ProductCard({
  product,
  srcParam = "",
  priority = false,
  clientNav = false,
  discoverLayout = true,
  showCreator = true,
  surface,
}: ProductCardProps) {
  // Scroll guard: track touch movement (both axes) to cancel accidental clicks during scroll.
  // Hooks must be declared before any early return (React rules).
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const didScroll = useRef(false)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? 0
    touchStartX.current = e.touches[0]?.clientX ?? 0
    didScroll.current = false
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaY = Math.abs((e.touches[0]?.clientY ?? 0) - touchStartY.current)
    const deltaX = Math.abs((e.touches[0]?.clientX ?? 0) - touchStartX.current)
    // Lower threshold (5px) and check both axes so diagonal/horizontal scrolls
    // don't trigger accidental card clicks on touch devices.
    if (deltaY > 5 || deltaX > 5) didScroll.current = true
  }, [])

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (didScroll.current) {
      e.preventDefault()
      e.stopPropagation()
      didScroll.current = false
    }
  }, [])

  // Safety check - if product is null/undefined, don't render
  if (!product) return null

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format((cents || 0) / 100)
  }

  const creatorName = product.creator?.profile?.display_name || "Creator"
  // Only use the profile username — it's what /u/[username] routes look up.
  // creator.slug may differ from profile.username or be a UUID → broken URL.
  const creatorUsername = product.creator?.profile?.username || ""
  const creatorAvatarUrl = product.creator?.profile?.avatar_url
  const baseProductUrl = getProductUrl(creatorUsername, product.slug || "")
  const productUrl = discoverLayout
    ? `${baseProductUrl}${baseProductUrl.includes("?") ? "&" : "?"}layout=discover&recommended=1`
    : baseProductUrl
  // "#" when username is unknown so the creator link is a safe no-op.
  const storeUrl = creatorUsername ? getStoreUrl(creatorUsername) : "#"

  const hasReviews = (product.reviews_count ?? 0) > 0
  const reviewsAverage = product.reviews_average ?? 0

  return (
    <div
      className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-card transition-all duration-300 ease-out [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]"
      style={
        surface?.backgroundColor || surface?.borderColor || surface?.textColor
          ? { backgroundColor: surface.backgroundColor, borderColor: surface.borderColor, color: surface.textColor }
          : undefined
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onClickCapture={onClickCapture}
    >
      <SmartLink href={productUrl} useClientNav={clientNav} className="relative aspect-video bg-muted overflow-hidden">
        {product.thumbnail_url ? (
          <Image
            src={product.thumbnail_url}
            alt={product.title || "Product"}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover:scale-[1.03]"
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
        {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
          <Badge variant="destructive" className="absolute left-2 top-2 text-xs">
            {Math.round((1 - product.price_cents / product.compare_at_cents) * 100)}% OFF
          </Badge>
        )}
      </SmartLink>
      <div className="flex flex-1 flex-col p-4">
        {/* Seller info row - avatar, name (clickable), divider, rating.
            The row disappears entirely when there is neither a seller to show
            nor a rating, rather than leaving an empty 20px gap above the
            title. */}
        {(showCreator || hasReviews) && (
          <div className="flex items-center gap-2 mb-2">
            {showCreator && (
              <SmartLink
                href={storeUrl}
                className="group/seller flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <CreatorAvatar url={creatorAvatarUrl} name={creatorName} size={20} />
                <span
                  className="text-[13px] text-muted-foreground truncate max-w-[120px] group-hover/seller:underline"
                  style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
                >
                  {creatorName}
                </span>
              </SmartLink>
            )}
            {hasReviews && (
              <>
                {showCreator && (
                  <span
                    className="h-3.5 w-px bg-border/60 shrink-0"
                    style={surface?.borderColor ? { background: surface.borderColor } : undefined}
                  />
                )}
                <div className="flex items-center gap-1">
                  <Star
                    className="h-3.5 w-3.5 fill-current text-foreground"
                    style={surface?.textColor ? { color: surface.textColor } : undefined}
                  />
                  <span
                    className="text-[13px] text-muted-foreground"
                    style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
                  >
                    {reviewsAverage.toFixed(1)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        <SmartLink href={productUrl} useClientNav={clientNav} className="flex-1 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[17px] font-medium leading-tight break-words min-w-0" style={surface?.textColor ? { color: surface.textColor } : undefined}>{product.title}</h3>
            <Badge
              variant="secondary"
              className="shrink-0 text-xs capitalize"
              style={
                surface?.badgeBackgroundColor || surface?.badgeTextColor
                  ? { backgroundColor: surface.badgeBackgroundColor, color: surface.badgeTextColor }
                  : undefined
              }
            >
              {product.categoryName || product.categories?.[0]?.name || product.category || product.type}
            </Badge>
          </div>
          <div className="mt-auto pt-4">
            <span className="font-semibold" style={surface?.priceColor ? { color: surface.priceColor } : undefined}>{product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}</span>
            {!!product.compare_at_cents && product.compare_at_cents > product.price_cents && (
              <span
                className="ml-2 text-sm text-muted-foreground line-through"
                style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
              >
                {formatPrice(product.compare_at_cents)}
              </span>
            )}
          </div>
        </SmartLink>
      </div>
    </div>
  )
})
