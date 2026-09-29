"use client"

import { listPrice } from "@/lib/pricing/list-price"
import { memo, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { saveExploreScrollNow } from "@/lib/explore/use-explore-scroll"
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
    /* Pay what you want: listed from its minimum (lib/pricing/list-price). */
    pay_what_you_want?: boolean | null
    pwyw_min_price_cents?: number | null
    thumbnail_url?: string | null
    type: string
    /* A membership's billing interval, when its plan was read: "$9/month" or "$90/year" (lib/pricing/list-price). */
    price_interval?: "month" | "year" | null
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
  /**
   * ═══════════════════════════════════════════════════════════════════════
   *  ON BY DEFAULT, BECAUSE A CARD IS A LINK INSIDE THE SAME APP
   * ═══════════════════════════════════════════════════════════════════════
   * This defaulted to FALSE, and `false` is not "let the link decide" — it is
   * SmartLink's way of saying force a full document load. So every product
   * card outside the explore page — a creator's whole storefront, every
   * recommendation row — threw the page away and asked the server for another
   * one. Measured on the live site, pressing a card from a creator page and
   * then pressing back:
   *
   *     press  -> a full document request, and `window` replaced
   *     back   -> a full document request, and three YouTube iframes again
   *
   * That is the difference between a marketplace and a website. A client
   * navigation prefetches the route while the card is on screen, shows the
   * route's own loading state in the same frame as the tap, and — the part
   * that matters most — makes BACK free, because the router still has the
   * page it just rendered.
   *
   * The explore page has passed `clientNav` for a long time, so the product
   * page has been reached this way in production all along; this is the rest
   * of the product catching up with it. SmartLink still forces a hard load
   * for /app, /library and the builders, which are a different layout and a
   * different auth context.
   *
   * Pass `false` for a link that genuinely has to reload the document.
   */
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
  clientNav = true,
  discoverLayout = true,
  showCreator = true,
  surface,
}: ProductCardProps) {
  // Scroll guard: track touch movement (both axes) to cancel accidental clicks during scroll.
  // Hooks must be declared before any early return (React rules).
  const router = useRouter()
  /**
   * ═════════════════════════════════════════════════════════════════════════
   *  PREFETCHED ON INTENT, NOT ON SIGHT
   * ═════════════════════════════════════════════════════════════════════════
   * next/link prefetches a route when the link scrolls into view, and for a
   * `force-dynamic` route that fetch stops at the nearest loading boundary —
   * which this route deliberately has none of. So the prefetch worth having
   * is the one that asks for the whole thing, and asking for the whole thing
   * from every card in a grid would fetch a hundred product pages to open one.
   *
   * Intent is the middle. A pointer arriving over the card, a finger landing
   * on it, or the keyboard reaching it all happen tens to hundreds of
   * milliseconds before the press — most of the wait — and none of them
   * happens for a card somebody merely scrolled past.
   *
   * ABOVE THE EARLY RETURN, with the rest of the hooks. tests/hook-order
   * caught this sitting below one, which is React error #310 and a blank
   * card rather than a slow one.
   *
   * The URL is carried in a ref because it is computed further down, after
   * the branch that can return. Writing a ref during render is not state and
   * not an effect; it is the same value every time for the same props.
   */
  const prefetched = useRef(false)
  const prefetchUrl = useRef("")
  const warm = useCallback(() => {
    if (prefetched.current || !prefetchUrl.current) return
    prefetched.current = true
    try {
      router.prefetch(prefetchUrl.current)
    } catch {
      /* A malformed href is the card's problem to show, not a reason to
         throw out of a pointer event. */
    }
  }, [router])

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
      return
    }
    if (discoverLayout) saveExploreScrollNow()
  }, [discoverLayout])

  // Safety check - if product is null/undefined, don't render
  if (!product) return null

  /* Free, pay what you want, a price and a saving: one rule for every card (lib/pricing/list-price). */
  const priceLabel = listPrice(product)

  const creatorName = product.creator?.profile?.display_name || "Creator"
  // Only use the profile username — it's what /u/[username] routes look up.
  // creator.slug may differ from profile.username or be a UUID → broken URL.
  const creatorUsername = product.creator?.profile?.username || ""
  const creatorAvatarUrl = product.creator?.profile?.avatar_url
  const baseProductUrl = getProductUrl(creatorUsername, product.slug || "")
  const productUrl = discoverLayout
    ? `${baseProductUrl}${baseProductUrl.includes("?") ? "&" : "?"}layout=discover&recommended=1`
    : baseProductUrl
  prefetchUrl.current = productUrl

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
      /* Intent: a pointer arriving, a finger landing, or the keyboard getting
         here. See the note on `warm`. */
      onPointerEnter={warm}
      onFocusCapture={warm}
      onTouchStart={(e) => {
        warm()
        onTouchStart(e)
      }}
      onTouchMove={onTouchMove}
      onClickCapture={onClickCapture}
    >
      {/*
        THE PRESS IS ANSWERED BY THE CARD DIPPING, AND BY NOTHING ELSE.

        There was a 3px bar across the top of the card while the navigation
        was in flight. It went, on the owner's instruction: a loading
        indicator on a card is a loading indicator ON THE THING YOU ARE
        LEAVING, and it draws the eye back to a card that is about to be
        replaced.

        `active:brightness-95` still answers in the same frame as the touch,
        before any navigation starts, so a press is never unacknowledged. What
        is gone is the part that kept animating afterwards.
      */}
      <SmartLink
        href={productUrl}
        useClientNav={clientNav}
        className="relative aspect-video bg-muted overflow-hidden transition-[filter] duration-100 active:brightness-95"
      >
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
        {priceLabel.off != null && (
          <Badge variant="destructive" className="absolute left-2 top-2 text-xs">
            {priceLabel.off}% OFF
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
                className="group/seller flex items-center gap-1.5 transition-opacity duration-100 active:opacity-70"
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

        <SmartLink href={productUrl} useClientNav={clientNav} className="relative flex-1 flex flex-col transition-opacity duration-100 active:opacity-70">
          {/*
            ═══════════════════════════════════════════════════════════════
             THE BADGE MAY NOT TAKE THE WHOLE ROW
            ═══════════════════════════════════════════════════════════════
            The title could shrink and the badge could not. On a phone, a card
            about 200px wide with a category called "Lightroom Presets" left
            the title roughly one character of room, and `break-words` did
            exactly what it was told: it broke the title after every letter.
            One word per line, fifty lines, a card two thousand pixels tall.

            That is also the "footer is intergalactic" report. The title
            overflowed its card and painted straight over the footer below it,
            so the footer's links and the product titles appeared interleaved.
            One cause, two bug reports.

            So the title takes the row and the badge is capped at 40% of it
            and ellipsises. A category nobody can read in full is a smaller
            loss than a title nobody can read at all.
          */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex-1 min-w-0 text-[17px] font-medium leading-tight break-words" style={surface?.textColor ? { color: surface.textColor } : undefined}>{product.title}</h3>
            <Badge
              variant="secondary"
              className="shrink min-w-0 max-w-[40%] overflow-hidden text-ellipsis whitespace-nowrap text-xs capitalize"
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
            <span className="font-semibold" style={surface?.priceColor ? { color: surface.priceColor } : undefined}>{priceLabel.main}</span>
            {priceLabel.was && (
              <span
                className="ml-2 text-sm text-muted-foreground line-through"
                style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
              >
                {priceLabel.was}
              </span>
            )}
          </div>
        </SmartLink>
      </div>
    </div>
  )
})
