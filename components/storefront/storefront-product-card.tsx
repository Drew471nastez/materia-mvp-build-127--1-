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

import { ProductCard } from "@/components/explore/product-card"

export interface StorefrontCardProduct {
  id: string
  slug?: string
  title: string
  thumbnail_url?: string | null
  price_cents: number
  compare_at_cents?: number | null
  type?: string
  categories?: Array<{ id?: string; name: string; slug?: string; type?: string | null }> | null
  reviews_count?: number | null
  reviews_average?: number | null
}

export interface StorefrontProductCardProps {
  product: StorefrontCardProduct
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  priority?: boolean
}

export function StorefrontProductCard({
  product,
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
  priority = false,
}: StorefrontProductCardProps) {
  return (
    <ProductCard
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
        price_cents: product.price_cents,
        compare_at_cents: product.compare_at_cents ?? null,
        thumbnail_url: product.thumbnail_url ?? null,
        type: product.type || "digital",
        reviews_count: product.reviews_count ?? null,
        reviews_average: product.reviews_average ?? null,
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
}
