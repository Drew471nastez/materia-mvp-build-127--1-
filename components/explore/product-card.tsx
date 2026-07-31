"use client"

import { memo, useState, useRef, useCallback } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { useIsWishlisted, useToggleWishlist } from "@/components/explore/wishlist-context"
import { useLocale } from "@/components/locale-provider"
import { CONDITIONS } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"
import { Heart } from "lucide-react"

// Portrait grid: 2 columns on mobile, 3 on tablet, 4 on desktop (container max-w-[1400px]).
const GRID_IMAGE_SIZES = "(max-width: 639px) 47vw, (max-width: 1023px) 31vw, (max-width: 1400px) 23vw, 336px"

// 1x1 neutral grey, inlined by next/image — no extra request, no white flash on slow links.
const BLUR_DATA_URL = "data:image/gif;base64,R0lGODlhAQABAIAAAOfn5wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="

// YouTube thumbnails can live in gallery_urls but are video posters, not product photos
// (same rule the PDP gallery applies in app/(marketing)/p/[slug]/page.tsx).
function isYouTubeThumbnailUrl(url: string): boolean {
  return url.includes("img.youtube.com") || url.includes("i.ytimg.com")
}

/** Second real photo for the hover swap — skips video posters and the primary image. */
function pickHoverImage(gallery: string[] | null | undefined, thumbnail: string | null | undefined): string | null {
  // Array.isArray rather than ?.length: gallery_urls is jsonb and can arrive as a non-array.
  if (!Array.isArray(gallery)) return null
  return (
    gallery.find(
      (url) => typeof url === "string" && url.length > 0 && url !== thumbnail && !isYouTubeThumbnailUrl(url)
    ) ?? null
  )
}

// Best-effort size until products.size ships — anchored to "size:" so a stray "S" in
// prose can't false-positive, and nothing renders when we aren't sure.
const SIZE_IN_TITLE_RE = /\bsize[:\s]+([a-z0-9./]{1,6})\b/i
const SIZE_TOKEN_RE = /^(XXS|XS|S|M|L|XL|XXL|XXXL|(UK|EU|US)\s?\d{1,2}(\.5)?|\d{1,3}(\.5)?)$/i
// products.size_system is a UI hint — prefix a bare number so "9" reads as "UK 9".
const SIZE_SYSTEM_PREFIX: Record<string, string> = { uk: "UK", eu: "EU", us: "US" }

function getSizeLabel(product: { size?: string | null; size_system?: string | null; title?: string }): string | null {
  const explicit = product.size?.trim()
  if (explicit) {
    const prefix = SIZE_SYSTEM_PREFIX[(product.size_system || "").toLowerCase()]
    // Only prefix a bare number — "UK UK 9" and "EU One size" both read wrong.
    return prefix && /^\d{1,3}(\.5)?$/.test(explicit) ? `${prefix} ${explicit}` : explicit
  }
  const token = product.title?.match(SIZE_IN_TITLE_RE)?.[1]?.trim()
  return token && SIZE_TOKEN_RE.test(token) ? token.toUpperCase() : null
}

/** Maps products.condition to its display label; unknown values render nothing. */
function getConditionLabel(condition: string | null | undefined): string | null {
  if (!condition) return null
  const key = condition.trim().toLowerCase().replace(/[\s-]+/g, "_")
  return CONDITIONS.find((entry) => entry.id === key)?.label ?? null
}


/**
 * Card-sized wishlist toggle. Reads from the shared store, so a 30-card grid costs
 * one request instead of one per card, and toggling is instant (optimistic).
 */
function WishlistHeartButton({ productId, savesCount = 0 }: { productId: string; savesCount?: number }) {
  const isWishlisted = useIsWishlisted(productId)
  const toggleWishlist = useToggleWishlist()
  // Replays the pop/burst on every toggle. `nonce` bumps so the same class
  // re-triggers the CSS animation even on rapid taps.
  const [nonce, setNonce] = useState(0)
  const [burst, setBurst] = useState(false)
  // The user's own saves/un-saves since load — the server `savesCount` already
  // includes the user's initial save (if any), so ±1 per tap keeps it accurate.
  const [userDelta, setUserDelta] = useState(0)

  const displayed = Math.max(0, savesCount + userDelta)

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      // The heart floats over the product link — never let the click navigate.
      e.preventDefault()
      e.stopPropagation()
      const willSave = !isWishlisted
      setNonce((n) => n + 1)
      setUserDelta((d) => d + (willSave ? 1 : -1))
      // The bloom only reads right when saving — skip it on un-save.
      if (willSave) {
        setBurst(false)
        // next frame so the node remounts and the animation restarts
        requestAnimationFrame(() => setBurst(true))
      }
      void toggleWishlist(productId)
    },
    [productId, isWishlisted, toggleWishlist]
  )

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isWishlisted}
      aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
      // after:-inset-3 widens the finger target well past the visual, so a tap
      // near the heart still registers without enlarging the icon itself.
      className={cn(
        "absolute right-2 top-2 z-10 flex h-9 cursor-pointer items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm transition-transform duration-200 ease-out after:absolute after:-inset-3 after:content-[''] motion-safe:active:scale-[0.88] [@media(hover:hover)]:hover:bg-white",
        // Count sits inside the heart control as a pill; plain circle when 0.
        displayed > 0 ? "gap-1 pl-2 pr-2.5" : "w-9",
      )}
    >
      {/* Bloom ring — one-shot, keyed so it restarts each save */}
      {burst && (
        <span
          key={nonce}
          aria-hidden="true"
          className="heart-burst pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: "0 0 0 2px rgba(244, 63, 94, 0.5)" }}
          onAnimationEnd={() => setBurst(false)}
        />
      )}
      <Heart
        key={nonce}
        className={cn(
          // Slow, observable red fill — transitions over 450ms so you watch it fill.
          "h-[19px] w-[19px] shrink-0 transition-colors duration-[450ms] ease-out",
          // Only pop after a real toggle — never on the grid's first paint.
          nonce > 0 && "motion-safe:heart-pop",
          isWishlisted ? "fill-rose-500 text-rose-500" : "text-neutral-700"
        )}
      />
      {displayed > 0 && (
        <span className="text-[12px] font-semibold leading-none text-neutral-800 tabular-nums">{displayed}</span>
      )}
    </button>
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
    /** jsonb string[] — the second real photo drives the hover swap. May hold YouTube posters. */
    gallery_urls?: string[] | null
    type: string
    category?: string | null // Direct category field from product
    categoryName?: string | null // Pre-computed category name for display
    /** Marketplace attributes. Optional until the migration lands — never render them empty. */
    size?: string | null
    size_system?: string | null
    brand?: string | null
    condition?: string | null
    /** Total saves across all users — drives the read-only count pill. */
    saves_count?: number | null
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
  /** Hide the seller row in dense carousels */
  showSeller?: boolean
}

export const ProductCard = memo(function ProductCard({ product, srcParam = "", priority = false, clientNav = false, showSeller = true }: ProductCardProps) {
  // Scroll guard: track touch movement (both axes) to cancel accidental clicks during scroll.
  // Hooks must be declared before any early return (React rules).
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const didScroll = useRef(false)
  const { t, formatPrice } = useLocale()

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

  const creatorName = product.creator?.profile?.display_name || "Creator"
  // Only use the profile username — it's what /u/[username] routes look up.
  // creator.slug may differ from profile.username or be a UUID → broken URL.
  const creatorUsername = product.creator?.profile?.username || ""
  const baseProductUrl = getProductUrl(creatorUsername, product.slug || "")
  const productUrl = `${baseProductUrl}${baseProductUrl.includes("?") ? "&" : "?"}layout=discover&recommended=1`
  // "#" when username is unknown so the creator link is a safe no-op.
  const storeUrl = creatorUsername ? getStoreUrl(creatorUsername) : "#"

  const savesCount = product.saves_count ?? 0

  const compareAtCents = product.compare_at_cents ?? 0
  const hasDiscount = compareAtCents > product.price_cents

  const sizeLabel = getSizeLabel(product)
  // Brand and condition sit on one subtle line, Depop-style — both are optional.
  const detailLine = [product.brand?.trim() || null, getConditionLabel(product.condition)]
    .filter(Boolean)
    .join(" · ")

  return (
    <div
      className="group flex flex-col no-tap-fade"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onClickCapture={onClickCapture}
    >
      {/* Image well — relative so the heart can sit beside (never inside) the link.
          Subtle ring + shadow give the flat white grid a bit of depth. The
          no-touch-callout class kills iOS long-press "save/copy image", text
          selection and image dragging so the photo feels like a native tile. */}
      <div className="no-touch-callout relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-neutral-100">
        <SmartLink href={productUrl} useClientNav={clientNav} className="absolute inset-0 block">
          {product.thumbnail_url ? (
            <Image
              src={product.thumbnail_url}
              alt={product.title || "Product"}
              fill
              sizes={GRID_IMAGE_SIZES}
              quality={70}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              // No hover crossfade / zoom — the photo stays clean and still.
              className="object-cover select-none"
              draggable={false}
              priority={priority}
              loading={priority ? undefined : "lazy"}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <span className="text-4xl">👜</span>
            </div>
          )}
        </SmartLink>
        {hasDiscount && (
          <Badge variant="destructive" className="pointer-events-none absolute left-2 top-2 px-1.5 py-0 text-[10px]">
            {Math.round((1 - product.price_cents / compareAtCents) * 100)}% OFF
          </Badge>
        )}
        <WishlistHeartButton productId={product.id} savesCount={savesCount} />
      </div>

      {/* Meta — no card chrome, the photo carries the card */}
      <div className="flex flex-col px-0.5 pt-2.5">
        <SmartLink href={productUrl} useClientNav={clientNav} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold leading-none text-foreground">
              {product.price_cents === 0 ? t("product.free") : formatPrice(product.price_cents)}
            </span>
            {hasDiscount && (
              <span className="text-[12px] leading-none text-muted-foreground line-through">
                {formatPrice(compareAtCents)}
              </span>
            )}
          </div>
          <h3 className="line-clamp-1 text-[13px] leading-snug text-muted-foreground">{product.title}</h3>
        </SmartLink>

        {(sizeLabel || detailLine) && (
          <div className="mt-1.5 flex items-center gap-1.5">
            {sizeLabel && (
              <span className="inline-flex shrink-0 items-center rounded border border-border/70 px-1.5 py-px text-[11px] font-medium leading-[1.4] text-muted-foreground">
                {sizeLabel}
              </span>
            )}
            {detailLine && <span className="truncate text-[11px] text-muted-foreground">{detailLine}</span>}
          </div>
        )}

        {showSeller && (
          <SmartLink
            href={storeUrl}
            className="group/seller mt-1.5 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Seller name only — no profile picture fetched on listings. */}
            <span className="truncate text-[11px] text-muted-foreground group-hover/seller:underline">
              {creatorName}
            </span>
          </SmartLink>
        )}
      </div>
    </div>
  )
})
