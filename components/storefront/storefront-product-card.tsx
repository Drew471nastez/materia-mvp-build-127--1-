"use client"

/**
 * The creator storefront renders THE EXPLORE CARD. Not a copy of it.
 *
 * "The product cards in the profile listings should use the same font sizes
 * and all the things such as on the explore product listings" is not a styling
 * task — matching a design by hand is how two components start identical and
 * end up different, which has already happened twice on this page. So the
 * storefront uses `components/explore/product-card.tsx` itself, and this file
 * does nothing but reshape a storefront product into what that card expects.
 *
 * The one behavioural difference is `discoverLayout={false}`: `?layout=discover`
 * tells the product page it was reached from a browse surface and to render the
 * back-to-discover chrome, which a creator's own storefront is not.
 */

import type React from "react"

import { ProductCard } from "@/components/explore/product-card"
import dynamic from "next/dynamic"
/*
  Round 48: the owner's menu on a card (and the bottom sheet it opens on a
  phone, about 130 KB of source) is fetched for the owner only; a visitor's
  card returns before it is drawn. Server rendered for the owner as before.
*/
const ProductOwnerMenu = dynamic(() => import("./product-owner-menu").then((m) => m.ProductOwnerMenu))
import { getProductInternalPath } from "@/lib/url-helpers"

export interface StorefrontCardProduct {
  id: string
  slug?: string
  /** Where the card goes when it is not a product page (a free community). */
  href?: string
  title: string
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number | null
  /** The currency the price is in when it is not the page's (lib/money/marketplace). */
  currency?: string | null
  pay_what_you_want?: boolean | null
  pwyw_min_price_cents?: number | null
  type?: string
  /** A membership's interval, when its plan was read (lib/memberships/intervals). */
  price_interval?: "month" | "year" | null
  categories?: Array<{ id?: string; name: string; slug?: string; type?: string | null }> | null
  reviews_count?: number | null
  reviews_average?: number | null
  /** Every copy of a limited run sold (lib/products/sales-limit.ts). */
  sold_out?: boolean | null
}

export interface StorefrontProductCardProps {
  product: StorefrontCardProduct
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  priority?: boolean
  /**
   * Decided on the SERVER, from the session. When false the menu is not
   * rendered at all — a visitor never receives it, rather than receiving it
   * hidden.
   */
  isOwner?: boolean
  /** The colours the page's theme gives a card. See ProductCard. */
  surface?: NonNullable<React.ComponentProps<typeof ProductCard>["surface"]>
}

export function StorefrontProductCard({
  product,
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
  priority = false,
  isOwner = false,
  surface,
}: StorefrontProductCardProps) {
  const card = (
    <ProductCard
      surface={surface}
      priority={priority}
      discoverLayout={false}
      /**
       * No seller row on the creator's own page. Every card would show the
       * same face and the same name, directly beneath a header showing that
       * face and that name. The rating still renders on its own.
       */
      showCreator={false}
      product={{
        id: product.id,
        title: product.title,
        slug: product.slug || "",
        href: product.href ?? null,
        price_cents: product.price_cents,
        compare_at_cents: product.compare_at_cents ?? null,
        ...(product.currency ? { currency: product.currency } : {}),
        pay_what_you_want: product.pay_what_you_want ?? null,
        pwyw_min_price_cents: product.pwyw_min_price_cents ?? null,
        thumbnail_url: product.thumbnail_url ?? null,
        type: product.type || "digital",
        price_interval: product.price_interval ?? null,
        reviews_count: product.reviews_count ?? null,
        reviews_average: product.reviews_average ?? null,
        sold_out: product.sold_out ?? null,
        categories: (product.categories || []).map((c) => ({
          id: c.id || c.name,
          name: c.name,
          slug: c.slug || c.name,
          type: c.type ?? undefined,
        })),
        creator: {
          profile: {
            display_name: creatorName ?? null,
            avatar_url: creatorAvatarUrl ?? null,
            username: creatorUsername ?? null,
          },
        },
      }}
    />
  )

  if (!isOwner) return card

  return (
    // The menu floats over the card's own image corner. `relative` here rather
    // than on the card so the shared component stays untouched.
    <div className="relative">
      {card}
      <div className="absolute right-3 top-3 z-10">
        <ProductOwnerMenu productId={product.id} productHref={product.slug ? getProductInternalPath(product.slug, creatorUsername ?? undefined) : undefined} />
      </div>
    </div>
  )
}
