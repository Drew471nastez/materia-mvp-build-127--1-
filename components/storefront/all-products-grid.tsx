"use client"

/**
 * Everything the creator sells, behind the Products tab.
 *
 * It renders StorefrontProductCard — the same component the Featured rail uses
 * — rather than its own copy of the markup, so the two grids on one page
 * cannot end up looking like different products from different sites.
 */

import * as React from "react"
import { Package } from "lucide-react"
import { StorefrontProductCard, type StorefrontCardProduct } from "./storefront-product-card"
import { CategorySelect, SortControl, type SortKey } from "./catalog-controls"

export type AllProductsGridProduct = StorefrontCardProduct

export function AllProductsGrid({
  products,
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
  isOwner = false,
}: {
  products: AllProductsGridProduct[]
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  isOwner?: boolean
}) {
  /**
   * Category filtering, which the tab had none of. Chips rather than the rail
   * that used to sit down the left of Featured — they cost no horizontal room,
   * they read the same on a phone and a desktop, and they sit above the thing
   * they filter instead of beside it.
   *
   * Built from the products actually on the page, so a creator never sees a
   * filter that leads nowhere, and hidden entirely below two categories, where
   * the only thing to choose is "everything".
   */
  const [active, setActive] = React.useState<string | null>(null)
  const [sort, setSort] = React.useState<SortKey>("recent")

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>()
    for (const product of products) {
      for (const category of product.categories || []) {
        if (category?.name) counts.set(category.name, (counts.get(category.name) ?? 0) + 1)
      }
    }
    return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }, [products])

  const shown = React.useMemo(() => {
    const filtered = active
      ? products.filter((p) => (p.categories || []).some((c) => c.name === active))
      : [...products]
    const list = active ? [...filtered] : filtered
    switch (sort) {
      case "price-low":
        return list.sort((a, b) => a.price_cents - b.price_cents)
      case "price-high":
        return list.sort((a, b) => b.price_cents - a.price_cents)
      case "popular":
        return list.sort((a, b) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0))
      case "oldest":
        return list.reverse()
      default:
        return list
    }
  }, [products, active, sort])

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
      {/*
        ONE ROW OF CONTROLS: the category selector on the left, sort on the
        right — the same arrangement, and the same two components, as the
        Featured rail on the Home tab.

        The chip row that used to be here is gone. It looked fine with two
        categories and fell apart with nine: three wrapped lines on a phone,
        with the products pushed below the fold.

        Sort collapses to an icon on a phone. "Sort: Most Recent" spends half
        the width of a phone saying what the icon says.
      */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <CategorySelect categories={categories} value={active} onChange={setActive} total={products.length} />
        <div className="ml-auto">
          {products.length > 1 && (
            <>
              <SortControl value={sort} onChange={setSort} compact className="sm:hidden" />
              <SortControl value={sort} onChange={setSort} className="hidden sm:inline-flex" />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((product) => (
          <StorefrontProductCard
            key={product.id}
            product={product}
            creatorName={creatorName}
            creatorUsername={creatorUsername}
            creatorAvatarUrl={creatorAvatarUrl}
            isOwner={isOwner}
          />
        ))}
      </div>
    </div>
  )
}
