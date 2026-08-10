"use client"

import { memo, useState, useRef, useCallback } from "react"
import Image from "next/image"
import { CARD_RATIO, cardDimensions, cardImage, readVariants } from "@/lib/images/variants"
import { Badge } from "@/components/ui/badge"

import { getListingUrl, type ListingOrigin } from "@/lib/marketplace/listing-url"
import { SmartLink } from "@/components/smart-link"
import { useIsWishlisted, useToggleWishlist } from "@/components/explore/wishlist-context"
import { useLocale } from "@/components/locale-provider"
import { ProtectionMark } from "@/components/marketplace/buyer-protection"
import { buyerPaysCents } from "@/lib/marketplace/display-price"
import { useIsMyListing } from "@/lib/marketplace/use-my-username"
import { CONDITIONS } from "@/lib/marketplace/categories"
import { cn } from "@/lib/utils"
import { Heart, ImageOff } from "lucide-react"

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
      window.dispatchEvent(new CustomEvent("wishlist-toast", { detail: { saved: willSave } }))
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
          // Slow, observable red fill — transitions over 750ms so you watch it fill.
          "h-[19px] w-[19px] shrink-0 transition-colors duration-[750ms] ease-out",
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
  /** Which surface this card is on — recorded in the URL so the back arrow can
   *  return you there, and so we can see which surfaces convert. */
  origin?: ListingOrigin
  product: {
    id: string
    title: string
    slug: string
    description?: string | null
    price_cents: number
    thumbnail_url?: string | null
    /** jsonb string[] — the second real photo drives the hover swap. May hold YouTube posters. */
    gallery_urls?: string[] | null
    /** jsonb — the optimised pair per photo, positionally aligned with
     *  [thumbnail_url, ...gallery_urls]. Absent on every listing created before
     *  the pipeline shipped, which is why every read of it falls back. */
    image_variants?: unknown
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
      /** The seller's auth user id. Already selected by the feed alongside the
       *  creators row, and the only identifier that cannot be null for a
       *  signed-in account — see useIsMyListing. */
      user_id?: string | null
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
   * ON BY DEFAULT, and it must stay that way. This defaulted to FALSE.
   *
   * `false` does not mean "no special handling", it means `useClientNav={false}`
   * on the SmartLink below — which that component reads as an explicit demand
   * for a hard navigation. In the app the tap became `window.location.href`; on
   * the web it fell past the blended branch to a bare `<a href>`. Both are a
   * full document load: the React tree torn down, every query run again from
   * cold, and — because `warm()` returns early for a hard nav — no prefetch of
   * the route and no warming of the photo either.
   *
   * The home feed passed `clientNav` explicitly and was fast. The profile grid,
   * the recommendations, the popular rail and the category pages did not, and
   * every listing opened from them reloaded the whole site. That is the entire
   * difference between opening a listing from the feed and opening the same
   * listing from a profile, and no amount of transition work could reach it:
   * the animation was on the far side of a document teardown, along with the
   * client router cache that makes coming BACK instant.
   *
   * A product card's href is always /products/<slug>, which is always inside the
   * marketing layout. There is no product card anywhere that wants a document
   * load, so the safe answer is the default rather than something five call
   * sites have to remember. SmartLink still forces a hard navigation for the
   * genuinely cross-layout routes (/app, /store-builder, /library) on its own,
   * and a listing URL can never be one of those.
   */
  clientNav?: boolean
  /** Hide the seller row in dense carousels */
  showSeller?: boolean
  /**
   * Where the card goes, when it is not /products/<slug>.
   *
   * A DRAFT has no listing page — it was never published, and the route 404s
   * for anything that is not — so its card opens the form it was left in
   * instead of a URL that cannot resolve.
   */
  hrefOverride?: string
  /**
   * Replaces the wishlist heart in the corner.
   *
   * On your OWN card the heart is the wrong control twice over: saving your own
   * listing does nothing anybody wants, and the corner is the only spot on a
   * grid card where a per-item menu can live. The owner grid passes a ⋯ here.
   */
  cornerAction?: React.ReactNode
  /** A state mark — Ciornă, Rezervat, Arhivat, Vândut — over the photo. */
  statusBadge?: React.ReactNode
}

export const ProductCard = memo(function ProductCard({
  product,
  srcParam = "",
  priority = false,
  clientNav = true,
  showSeller = true,
  origin = "feed",
  hrefOverride,
  cornerAction,
  statusBadge,
}: ProductCardProps) {
  // Scroll guard: track touch movement (both axes) to cancel accidental clicks during scroll.
  // Hooks must be declared before any early return (React rules).
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
  const didScroll = useRef(false)
  const { t, formatPrice } = useLocale()
  // Before the `if (!product) return null` below, so it is unconditional — and
  // therefore optional all the way down, because at this point there may be no
  // product at all.
  const mine = useIsMyListing(product?.creator?.profile?.username, product?.creator?.user_id)

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
  // Relative /products/<slug>, so the tap is a client navigation rather than a
  // document load — that is most of why opening a listing now feels instant.
  const productUrl = hrefOverride ?? getListingUrl(product.slug || "", origin)
  // "#" when username is unknown so the creator link is a safe no-op.
  // The marketplace member page, not the creator storefront — a listing's
  // seller is a person with more listings, and that is what this shows.
  const storeUrl = creatorUsername ? `/member/${encodeURIComponent(creatorUsername)}` : "#"

  const savesCount = product.saves_count ?? 0


  /**
   * THE CARD IMAGE — a thumbnail if there is one, the original if not.
   *
   * `cardImage` is the fallback rule in one place (lib/images/variants.ts):
   * thumb → large → thumbnail_url → nothing. Every listing created before the
   * image pipeline shipped has no variants at all and lands on the third
   * branch, rendering exactly as it does today. That is what lets this deploy
   * before the backfill has touched a single old listing.
   *
   * The thumbnail is ~80 KB and already 3:4; the fallback is whatever the
   * seller's phone produced. Both are displayed identically by the CSS below,
   * so the only difference a visitor can see is how fast the feed scrolls.
   */
  const variants = readVariants(product.image_variants)
  const cardSrc = cardImage(variants, product.thumbnail_url)
  const cardDims = cardDimensions(variants[0])

  // Second real photo, for the hover swap. The helper for this already existed —
  // the swap itself had just been removed at some point.
  const hoverImage =
    // Prefer the second photo's THUMBNAIL: this one is fetched on hover on a
    // desktop grid, and pulling a 1280px original for an effect is the kind of
    // thing that makes a feed feel heavy for no visible benefit.
    (variants[1]?.thumb ?? null) || pickHoverImage(product.gallery_urls, product.thumbnail_url)

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
      {/* 3:4 — one ratio for every card in the marketplace, and the same ratio
          the thumbnail is GENERATED at (lib/images/geometry.ts, 810×1080). That
          agreement is the point: a 3:4 file in a 3:4 box is displayed whole,
          while a mismatch means object-fit crops a second time and quietly
          throws away part of a crop the seller already chose.

          It is ~5% taller than 4:5, which is what a full-body clothing shot
          needs: a wider frame either crops the garment or leaves dead space
          either side of it.

          Written as an inline aspect-ratio rather than a Tailwind class so it
          reads from ONE constant shared with the thumbnail generator — the two
          cannot drift apart in a refactor. */}
      <div
        className="no-touch-callout relative w-full overflow-hidden rounded-xl bg-neutral-100"
        style={{ aspectRatio: CARD_RATIO }}
      >
        <SmartLink href={productUrl} useClientNav={clientNav} blend warmImage={cardSrc} className="absolute inset-0 block">
          {cardSrc ? (
            <Image
              src={cardSrc}
              width={cardDims.width}
              height={cardDims.height}
              alt={product.title || "Product"}
              sizes={GRID_IMAGE_SIZES}
              quality={70}
              placeholder="blur"
              blurDataURL={BLUR_DATA_URL}
              // Never fades. The second photo is layered ON TOP and fades in over
              // it, so the primary is always behind whatever is showing. That's
              // what removes the white flash: a listing with one photo has no
              // second layer at all, and one whose second photo hasn't decoded
              // yet simply keeps showing the first instead of blanking to the
              // empty well underneath.
/* COVER. The card fills its frame.
               *
               * This was briefly `contain` and it was wrong. A grid is a grid
               * because every tile is the same shape and every tile is FULL —
               * letterboxed photos put grey bars down the sides of half the
               * cards and the feed stops reading as one surface.
               *
               * It costs nothing for a listing uploaded since the image
               * pipeline shipped: the thumbnail is generated at 3:4 and the
               * card is 3:4, so there is nothing to crop. The crop only applies
               * to older photos of another shape, and filling the frame is the
               * right answer for those too — the whole photograph is one tap
               * away on the detail page, which is `contain` precisely so
               * nothing is cut off where it matters. */
              className="absolute inset-0 h-full w-full object-cover select-none"
              decoding="async"
              draggable={false}
              priority={priority}
              loading={priority ? undefined : "lazy"}
            />
          ) : (
            /* NOT AN EMOJI. This was a 👜 at text-4xl, and an emoji is the one
               thing that can never be part of a design system: it is drawn by
               the OS, so the same listing showed a flat Android handbag, a
               glossy Apple one, and on a machine with no font for it a hollow
               rectangle. It carried its own colours into a grid tuned to
               neutrals, sat at whatever weight the vendor chose, and read as a
               character somebody had typed into the page — which is what makes
               a missing photo look like a mistake rather than a blank.

               A drawn mark instead, in the same neutral as every other empty
               state here, at the stroke width the card's own icons use. It says
               "no photograph" rather than "handbag", which is the honest
               subject: this well is empty for a listing of any kind. */
            <div aria-hidden className="flex h-full items-center justify-center">
              <ImageOff className="h-8 w-8 text-neutral-300" strokeWidth={1.5} />
            </div>
          )}
          {/* Second photo, fading in on top on hover — the plain crossfade every
              marketplace uses, because it's the one that reads as the garment
              turning rather than as an effect.
              Rendered only when there IS a second photo, so a single-photo
              listing has no hover behaviour instead of dissolving into nothing.
              One opacity transition on the compositor: no layout, no repaint,
              nothing that can't hold 120fps. Pointer devices only — there's no
              hover on touch, and a second full image per card would cost the
              mobile feed for nothing. */}
          {hoverImage && (
            <Image
              src={hoverImage}
              alt=""
              aria-hidden
              width={cardDims.width}
              height={cardDims.height}
              sizes={GRID_IMAGE_SIZES}
              quality={70}
              // 240ms, not 550. Long crossfades read as the page struggling; at
              // this length it feels immediate but still lands softly.
              className="absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-[240ms] ease-out md:block md:group-hover:opacity-100"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          )}
        </SmartLink>
        {/* The state mark — Ciornă, Rezervat, Arhivat, Vândut. The discount
            badge that used to share this corner is gone with compare-at
            pricing: a second-hand marketplace has no list price to be a
            discount FROM, and "50% OFF" against a number the seller typed is a
            saving nobody was ever offered. */}
        {statusBadge}
        {/* NOT ON YOUR OWN LISTING. Saving your own item to your own wishlist
            does nothing anybody wants, and a heart on it is the interface
            offering you a thing it will then have to refuse. `cornerAction`
            still wins where a caller has one — the profile puts its ⋯ here. */}
        {cornerAction ?? (mine ? null : <WishlistHeartButton productId={product.id} savesCount={savesCount} />)}
      </div>

      {/* Meta — no card chrome, the photo carries the card */}
      <div className="flex flex-col px-0.5 pt-2.5">
        {/* Seller, then item, then price — read top to bottom that's "who ·
            what · how much", and the price is the largest thing on the card
            because it's what you're scanning a grid for. */}
        {showSeller && (
          <SmartLink
            href={storeUrl}
            className="group/seller mb-0.5 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Seller name only — no profile picture fetched on listings. */}
            <span className="truncate text-[11.5px] text-muted-foreground group-hover/seller:underline">
              {creatorName}
            </span>
          </SmartLink>
        )}
        <SmartLink href={productUrl} useClientNav={clientNav} blend warmImage={product.thumbnail_url}>
          <h3 className="line-clamp-1 text-[13px] leading-snug text-foreground">{product.title}</h3>
        </SmartLink>

        {/* THE PRICE A BUYER WILL ACTUALLY BE ASKED FOR, and a shield that
            opens the explanation.
            
            Not the seller's asking price: that number went up by 5% and 4 lei
            at the checkout, so every figure in this grid was wrong in the same
            direction and only stopped being wrong once somebody had committed.
            
            OUTSIDE the link, deliberately. The mark is a button, and a button
            inside an anchor is invalid nesting — the browser is entitled to
            take the tap for the link, which is exactly what it did. The
            photograph and the title are still the way into the listing; this
            row is a statement about the price, and one part of it is pressable. */}
        <div className="mt-0.5 flex items-baseline gap-2">
          <SmartLink
            href={productUrl}
            useClientNav={clientNav}
            blend
            warmImage={product.thumbnail_url}
            className="text-[17px] font-bold leading-none tracking-[-0.01em] text-foreground"
          >
            {product.price_cents === 0 ? t("product.free") : formatPrice(buyerPaysCents(product.price_cents))}
          </SmartLink>
          {product.price_cents > 0 && <ProtectionMark className="self-center" />}
        </div>

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

      </div>
    </div>
  )
})
