"use client"

/**
 * Everything the creator sells, behind the Products tab.
 *
 * It renders StorefrontProductCard — the same component the Featured rail uses
 * — rather than its own copy of the markup, so the two grids on one page
 * cannot end up looking like different products from different sites.
 */

import { SmartLink } from "@/components/smart-link"
import { Package } from "lucide-react"
import { StorefrontProductCard, type StorefrontProductCardProduct } from "./product-card"

export interface AllProductsGridProduct extends StorefrontProductCardProduct {
  id: string
  slug?: string
}

const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100)

export function AllProductsGrid({
  products,
  creatorName,
}: {
  products: AllProductsGridProduct[]
  creatorName?: string | null
}) {
  if (products.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-3 py-12 sm:px-4 lg:px-6">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No products yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <SmartLink
            key={product.id}
            href={product.slug ? `/p/${product.slug}` : "#"}
            className="group overflow-hidden rounded-lg border border-border bg-card shadow-[0_1px_3px_0_rgba(0,0,0,0.1),0_1px_2px_-1px_rgba(0,0,0,0.1)] transition-all [@media(hover:hover)]:hover:shadow-lg"
          >
            <StorefrontProductCard product={product} formatPrice={formatPrice} creatorName={creatorName} />
          </SmartLink>
        ))}
      </div>
    </div>
  )
}
