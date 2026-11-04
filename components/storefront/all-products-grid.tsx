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
import { CatalogHeader, CategorySelect, SortControl, type SortKey } from "./catalog-controls"
import dynamic from "next/dynamic"
import { useCreatorPageOwner } from "./creator-page-viewer"
/* Round 48: owner only, so fetched only for the owner (it brings the editor sheet); see unified-section-renderer. */
const ArrangeProductsControl = dynamic(() => import("./arrange-products-button").then((m) => m.ArrangeProductsControl))

export type AllProductsGridProduct = StorefrontCardProduct

export function AllProductsGrid({
  products,
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
  isOwner: ownerGiven = false,
  showCategoryFilter = true,
  hasManualOrder = false,
}: {
  products: AllProductsGridProduct[]
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  isOwner?: boolean
  /**
   * The builder's "Hide Category Filter" switch, which used to live on the
   * Featured rail because the filter did. The filter is the Products tab's
   * now, so the switch has to reach here or it becomes a control that is
   * saved and read by nothing — which it already was once.
   */
  showCategoryFilter?: boolean
  /**
   * True once the creator has dragged their catalogue into an order. It
   * changes ONE thing: what the default sort is called. Leaving it as "Most
   * Recent" while the list is in a hand-picked order is the control telling
   * the visitor something that is not true.
   */
  hasManualOrder?: boolean
}) {
  /* The owner's Arrange and card menus: what the caller said, or the creator page's own answer after load (round 49, ./creator-page-viewer). */
  const isOwner = useCreatorPageOwner(ownerGiven)
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
      <div className="mx-auto w-full max-w-[1180px] px-3 py-12 sm:px-4 lg:px-6">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Package className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No products yet.</p>
        </div>
      </div>
    )
  }

  /*
    THE BOTTOM PADDING HERE IS NOT THE GAP TO WHAT FOLLOWS.

    Raising it was the obvious way to give the About block below more air,
    and it does nothing: StorefrontTabs zeroes the bottom padding of its
    panel's last child on purpose, so that the gap belongs to the section
    that follows rather than to whichever panel happens to be open. Measured
    before and after at 48px either way. See the note on that rule, and the
    one on the About block, which is where the air was added instead.
  */
  return (
    <div className="mx-auto w-full max-w-[1180px] px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
      {/*
        THE SAME HEADER COMPONENT THE FEATURED RAIL USES — category selector on
        the left, sort on the right, one fixed row height. The two tabs used to
        each own their spacing and matched only while their rows happened to be
        the same height; see the note on CatalogHeader.

        The chip row that used to be here is gone. It looked fine with two
        categories and fell apart with nine: three wrapped lines on a phone,
        with the products pushed below the fold. Sort collapses to an icon on a
        phone, because "Sort: Most Recent" spends half the width of a phone
        saying what the icon says.
      */}
      <CatalogHeader title="Products" titleClassName="text-lg sm:text-xl lg:text-2xl">
        {showCategoryFilter && (
          <CategorySelect categories={categories} value={active} onChange={setActive} total={products.length} />
        )}
        {products.length > 1 && (
          <>
            <SortControl value={sort} onChange={setSort} compact className="sm:hidden" defaultLabel={hasManualOrder ? "Your order" : undefined} />
            <SortControl value={sort} onChange={setSort} className="hidden sm:inline-flex" defaultLabel={hasManualOrder ? "Your order" : undefined} />
          </>
        )}
        {/*
          LAST, so it is at the right end of the row, and filled so it does
          not read as a third filter. See ArrangeProductsControl: its own row
          above the grid cost a whole row of vertical space for one button.
        */}
        {isOwner ? <ArrangeProductsControl products={products} isOwner={isOwner} /> : null}
      </CatalogHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
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
