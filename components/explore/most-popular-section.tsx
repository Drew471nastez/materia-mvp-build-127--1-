"use client"

import { useMemo } from "react"
import { ProductCard } from "./product-card"

interface MostPopularSectionProps {
  products: any[]
}

export function MostPopularSection({ products }: MostPopularSectionProps) {
  // Get most popular products based on sales count
  const popularProducts = useMemo(() => {
    return [...products]
      .filter(p => p.thumbnail_url) // Only products with thumbnails
      .sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0))
      .slice(0, 9) // 3x3 grid = 9 products
  }, [products])

  if (popularProducts.length === 0) {
    return null
  }

  return (
    <section className="mt-8 md:mt-12 pt-6 md:pt-8 border-t border-neutral-100">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-neutral-900">
          Most popular
        </h2>
      </div>

      {/* Product grid - 2 per row on mobile, 3x3 on desktop */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
        {popularProducts.map((product, index) => (
          <ProductCard
            key={product.id}
            product={product}
            srcParam="?src=platform"
            priority={index < 6}
          />
        ))}
      </div>
    </section>
  )
}
