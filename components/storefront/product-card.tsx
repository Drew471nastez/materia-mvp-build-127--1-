"use client"

/**
 * THE creator-storefront product card. One of it, used everywhere.
 *
 * The Featured rail and the Products tab render the same cards, and the way
 * that goes wrong is that somebody needs a grid, copies the markup, and the two
 * drift until they are visibly different components on the same page. So the
 * body lives here and both call sites render it inside whatever wrapper they
 * need — a link on the live page, a plain div in the builder canvas where a
 * click has to select the section rather than navigate.
 *
 * WHAT IS ON IT, and what deliberately is not:
 *
 *   4:5 image, discount badge if there is one
 *   Product name
 *   Creator · Category
 *   €29  €230
 *
 * No type chip — "PRODUCT" over every card in a grid of products is a word
 * that never distinguishes anything. No description: a grid is scanned, not
 * read, and two lines of prose under each title is what stops it being
 * scannable.
 */

import Image from "next/image"
import { Package, Star } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StorefrontProductCardProduct {
  title: string
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number
  categories?: Array<{ name: string }> | null
  // Denormalised onto the product row, so showing a rating on a card costs no
  // extra query — the storefront already selects them with everything else.
  reviews_count?: number | null
  reviews_average?: number | null
}

export interface StorefrontProductCardProps {
  product: StorefrontProductCardProduct
  formatPrice: (cents: number) => string
  creatorName?: string | null
  showPrice?: boolean
  textColor?: string
  priceColor?: string
}

export function StorefrontProductCard({
  product,
  formatPrice,
  creatorName,
  showPrice = true,
  textColor,
  priceColor,
}: StorefrontProductCardProps) {
  const hasDiscount = product.compare_at_cents != null && product.compare_at_cents > product.price_cents
  const discountPercent = hasDiscount
    ? Math.round((1 - product.price_cents / (product.compare_at_cents as number)) * 100)
    : 0

  const category = product.categories?.[0]?.name
  const byline = [creatorName, category].filter(Boolean).join(" · ")

  /**
   * A rating is only worth printing once somebody has left one. "0.0" or an
   * empty row of grey stars under every card says the opposite of what a
   * rating is for — it makes a new product look judged rather than new.
   */
  const reviewsCount = product.reviews_count ?? 0
  const hasReviews = reviewsCount > 0 && (product.reviews_average ?? 0) > 0
  const rating = hasReviews ? (product.reviews_average as number).toFixed(1) : null

  return (
    <>
      {/* 16:9. Tried 4:5 and it was worse — a portrait frame makes each card
          tall enough that a three-across grid stops being scannable in one
          screen, which is the whole job of the rail. */}
      <div className="relative aspect-video overflow-hidden rounded-t-lg bg-muted">
        {product.thumbnail_url ? (
          /**
           * The opacity handling here was a real bug, not just clutter: a ref
           * set the image to opacity 0 whenever it was not already complete,
           * and only the onLoad handler put it back. If the image FAILED — a
           * dead URL, an offline moment — onLoad never fires and the card was
           * left permanently blank with no way to recover.
           *
           * The fade is pure CSS now, so a broken image shows the placeholder
           * rather than a hole, and `quality` plus accurate `sizes` mean the
           * browser fetches roughly the pixels it will actually paint instead
           * of a full-size original scaled down in the card.
           */
          <Image
            src={product.thumbnail_url || "/placeholder.svg"}
            alt={product.title}
            fill
            loading="lazy"
            quality={72}
            className="object-cover animate-[card-img-in_320ms_ease-out] transition-transform duration-500 [@media(hover:hover)]:group-hover:scale-105"
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 30vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Package className="h-8 w-8 text-muted-foreground" />
          </div>
        )}

        {/* The saving, stated as the thing a buyer actually compares. */}
        {hasDiscount && discountPercent > 0 && (
          <span className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white shadow-sm">
            {discountPercent}% off
          </span>
        )}
      </div>

      <div className="p-4">
        <div
          className={cn("text-[15px] font-semibold leading-snug line-clamp-2", !textColor && "text-foreground")}
          style={{ color: textColor || undefined }}
        >
          {product.title}
        </div>

        {/* Creator · Category, and the rating if there is one. Each part is
            conditional on its own, so a product with no category and no reviews
            renders no row at all rather than an orphaned separator. */}
        {(byline || rating) && (
          <div
            className={cn("mt-1 flex items-center gap-1.5 text-xs", !textColor && "text-muted-foreground")}
            style={{ color: textColor ? `${textColor}99` : undefined }}
          >
            {byline && <span className="line-clamp-1">{byline}</span>}
            {byline && rating && (
              <span aria-hidden className="opacity-40">
                |
              </span>
            )}
            {rating && (
              <span className="flex shrink-0 items-center gap-1">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                <span className="sr-only">Rated </span>
                {rating}
              </span>
            )}
          </div>
        )}

        {showPrice && (
          <div className="mt-3 flex items-baseline gap-2">
            {/* 600, not 700: the price should be the firmest thing on the card
                without shouting over the title. */}
            <span
              className={cn("text-[15px] font-semibold tracking-tight", !priceColor && "text-foreground")}
              style={{ color: priceColor || undefined }}
            >
              {product.price_cents === 0 ? "Free" : formatPrice(product.price_cents)}
            </span>
            {/* Shown whenever the product HAS one. It used to also require
                settings.showCompareAtPrice, so a creator who had entered a
                compare-at price still saw no discount unless they found a
                second toggle — the saving simply did not appear. A price to
                compare against is the creator saying "show this". */}
            {hasDiscount && (
              <span
                className={cn("text-[13px] line-through", !priceColor && "text-muted-foreground/70")}
                style={{ color: priceColor ? `${priceColor}99` : undefined }}
              >
                {formatPrice(product.compare_at_cents as number)}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  )
}
