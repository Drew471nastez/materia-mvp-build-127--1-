"use client"
import {useCanonicalPrice} from "@/components/product/use-canonical-price"

import { personName } from "@/lib/profile/display-name"
import { listPrice } from "@/lib/pricing/list-price"
import { usePageCurrency } from "@/components/platform/price-currency"
import { memo, useRef, useCallback, useEffect, useLayoutEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { getProductUrl, getStoreUrl } from "@/lib/url-helpers"
import { SmartLink } from "@/components/smart-link"
import { saveExploreScrollNow } from "@/lib/explore/use-explore-scroll"
import { Star } from "lucide-react"
import { leanImages, leanSizes } from "@/lib/images/lean"
import { AppAvatar } from "@/components/app/app-avatar"
import { useDrawnByServer } from "@/lib/ui/drawn-by-server"

/** Covers this tab has already drawn: a card mounted again (back to Explore, another page of it) shows its cover at once. */
const drawnCovers = new Set<string>()

interface ProductCardProps {
  product: {
    id: string
    title: string
    slug: string
    /** A card that is not a product page (a free community): where it goes instead. Same-site paths only. */
    href?: string | null
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
    /* The currency its store sells in (lib/store/store-currencies), when the list read it. */
    currency?: string | null
    category?: string | null // Direct category field from product
    categoryName?: string | null // Pre-computed category name for display
    reviews_count?: number | null
    reviews_average?: number | null
    /** Every copy of a limited run sold (lib/products/sales-limit.ts), counted on the server: the card says so. */
    sold_out?: boolean | null
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
  /** The picture's drawn width for the grid it sits in (the `sizes` attribute); the default suits a four column row. */
  sizes?: string
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
  product: suppliedProduct,
  srcParam = "",
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw",
  clientNav = true,
  discoverLayout = true,
  showCreator = true,
  surface,
}: ProductCardProps) {
  const product = useCanonicalPrice(suppliedProduct,discoverLayout)
  /* A card on one store's page (its creator page) is in that store's currency when the row does not say (components/platform/price-currency). */
  const pageCurrency = usePageCurrency()
  // Scroll guard: track touch movement (both axes) to cancel accidental clicks during scroll.
  // Hooks must be declared before any early return (React rules).
  const router = useRouter()
  /*
    THE COVER IS THERE, OR IT ARRIVES QUIETLY (the owner: "cleaner and
    calmer", no visible fade for a picture already loaded, at most a short
    one for a new one, no blur).

    "drawn": shown at once with no opacity transition. That is a cover in the
      page's HTML (shown as the browser has it, lib/ui/drawn-by-server), one
      this tab has drawn before (back to Explore), and one the browser has
      complete before the first paint (read in a layout effect, so the hidden
      frame is never painted).
    "wait": a new cover on its way; the card's own grey box until it loads.
    "in": it arrived after the box was painted, and comes up over 150ms.

    There used to be a blurred 32px copy under every cover and a 500ms fade
    over it, and both played on every return to Explore because the card
    started hidden and only found out after painting that its cover was
    already there.

    On 3G, data saver or a 2 GB phone (lib/images/lean.ts), a cover that has
    not started loading yet still asks for a 1x file: a cover already on its
    way is left alone, so nothing is fetched twice.
  */
  const coverRef = useRef<HTMLImageElement>(null)
  const fromServer = useDrawnByServer()
  /*
    STORELIB.COM COVERS WHOLE (the owner): every place this card is drawn is one of storelib.com's own commerce pages
    (Explore, the marketplace, a creator's store on storelib.com), so it always draws the stored 16:9 copy, never the
    cover as uploaded, whatever discoverLayout says.
  */
  const coverUrl = product?.thumbnail_url || ""
  const coverSrc = coverUrl
  const [cover, setCover] = useState<"drawn" | "wait" | "in">(() =>
    priority || fromServer || drawnCovers.has(coverSrc) ? "drawn" : "wait",
  )
  const [leanSizesValue, setLeanSizesValue] = useState<string | null>(null)
  useLayoutEffect(() => {
    const img = coverRef.current
    if (img?.complete && img.naturalWidth > 0) {
      drawnCovers.add(coverSrc)
      setCover((c) => (c === "wait" ? "drawn" : c))
    }
  }, [coverSrc])
  useEffect(() => {
    const img = coverRef.current
    if (priority || !leanImages() || img?.currentSrc) return
    setLeanSizesValue(leanSizes(sizes, window.devicePixelRatio || 1))
  }, [priority, sizes])
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
  const priceLabel = listPrice({ ...product, currency: product.currency ?? pageCurrency })

  const creatorName = personName({ name: product.creator?.profile?.display_name, username: product.creator?.profile?.username, slug: product.creator?.slug })
  // Only use the profile username — it's what /u/[username] routes look up.
  // creator.slug may differ from profile.username or be a UUID → broken URL.
  const creatorUsername = product.creator?.profile?.username || ""
  const creatorAvatarUrl = product.creator?.profile?.avatar_url
  const baseProductUrl = product.href && product.href.startsWith("/") ? product.href : getProductUrl(creatorUsername, product.slug || "")
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
      data-product-card=""
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card isolate transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none [@media(hover:hover)]:hover:border-border [@media(hover:hover)]:hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.1)]"
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
        THE HOVER, IN AND OUT THE SAME (round 18: "too bumpy"). The cover's
        zoom is Tailwind's `scale`, its own CSS property, and the transition
        named `transform`, so it jumped the whole way in one frame on the way
        in and again on the way out while the shadow faded beside it. The
        transition names `scale` now, the zoom is smaller (2%), and the card
        fades only its border and shadow (not `all`), over the same curve both
        ways. `isolate` keeps the zooming cover inside the card's rounded
        corners in Safari while it moves. All of it behind a real mouse (the
        `hover` variant, app/globals.css): a finger sees none of it.

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
        className={`relative aspect-video ${product.thumbnail_url ? "bg-[#f0f0f0]" : "bg-muted"} overflow-hidden transition-[filter] duration-100 active:brightness-95`}
      >
        {product.thumbnail_url ? (
          <Image
            ref={coverRef}
            src={coverUrl}
            alt={product.title || "Product"}
            /*
              The cover whole in the 16:9 card, as Explore shows it: the shop's 16:9 copy, grey padding and all, kept
              from the page's trim (lib/images/cover-trim), so every card is the same shape; a picture with no padded
              copy (a landscape cover the editor kept as it was, an import) letterboxed on the same light grey
              (object-contain on #f0f0f0, the middle of the editor's padding), never cropped.
            */
            data-cover-trim="keep"
            fill
            sizes={leanSizesValue ?? sizes}
            className={
              "object-contain transition-[scale,opacity] duration-500 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none [@media(hover:hover)]:group-hover:scale-[1.02] " +
              (cover === "wait" ? "opacity-0" : "opacity-100")
            }
            /* The hover zoom keeps its 500ms; opacity moves only for a cover that arrived after its box was painted, over 150ms. */
            style={{ transitionDuration: cover === "in" ? "500ms, 150ms" : "500ms, 0s" }}
            priority={priority}
            loading={priority ? undefined : "lazy"}
            fetchPriority={priority ? undefined : "low"}
            decoding="async"
            onLoad={() => {
              drawnCovers.add(coverSrc)
              setCover((c) => (c === "wait" ? "in" : c))
            }}
            onError={() => setCover((c) => (c === "wait" ? "in" : c))}
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
                {/* The shared avatar (components/app/app-avatar): a photo, or the default face, never initials. Its name is written beside it. */}
                <AppAvatar src={creatorAvatarUrl} name={creatorName} alt="" size={20} kind="person" tone={surface ? "theme" : "light"} lazy />
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
          {/*
            TWO LINES, ALWAYS, WITH AN ELLIPSIS. A long title ran to three
            lines and made its card taller than the two beside it, so a row
            of cards had a step in it and every row after it sat lower. The
            title stops at two lines (the whole of it is the tooltip and the
            product page's heading), and the grid's rows stretch each card
            to the row's height, with the price held at the foot (mt-auto),
            so cards in a row are one height.
          */}
          <div className="flex items-start justify-between gap-2">
            <h3 className="flex-1 min-w-0 line-clamp-2 text-[17px] font-medium leading-tight break-words" title={product.title} data-product-title="" style={surface?.textColor ? { color: surface.textColor } : undefined}>{product.title}</h3>
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
            {priceLabel.was && !product.sold_out && (
              <span
                className="ml-2 text-sm text-muted-foreground line-through"
                style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
              >
                {priceLabel.was}
              </span>
            )}
            {product.sold_out && (
              <span
                data-sold-out=""
                className="ml-2 text-sm font-medium text-muted-foreground"
                style={surface?.mutedColor ? { color: surface.mutedColor } : undefined}
              >
                Sold out
              </span>
            )}
          </div>
        </SmartLink>
      </div>
    </div>
  )
})
