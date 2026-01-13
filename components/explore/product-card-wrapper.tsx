"use client"

import { useSearchParams } from "next/navigation"
import { ProductCard as BaseProductCard } from "./product-card"

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
    creator?: {
      id?: string
      slug?: string
      niche_tags?: string[]
      profile?: {
        display_name?: string | null
        avatar_url?: string | null
      } | null
    } | null
  }
}

/**
 * Wrapper for ProductCard that preserves src=platform if present in current URL
 */
export function ProductCardWrapper({ product }: ProductCardProps) {
  const searchParams = useSearchParams()
  const src = searchParams.get("src")

  return <BaseProductCard product={product} srcParam={src === "platform" ? "?src=platform" : ""} />
}
