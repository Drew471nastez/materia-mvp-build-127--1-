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
import { cn } from "@/lib/utils"
import { StorefrontProductCard, type StorefrontCardProduct } from "./storefront-product-card"

export type AllProductsGridProduct = StorefrontCardProduct

type SortKey = "recent" | "price-low" | "price-high" | "rating"

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Most recent",
  "price-low": "Price: low to high",
  "price-high": "Price: high to low",
  rating: "Top rated",
}

export function AllProductsGrid({
  products,
  creatorName,
  creatorUsername,
  creatorAvatarUrl,
}: {
  products: AllProductsGridProduct[]
  creatorName?: string | null
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
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
      case "rating":
        return list.sort((a, b) => (b.reviews_average ?? 0) - (a.reviews_average ?? 0))
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
        THE CONTROLS ARE ALWAYS HERE. Category chips only appear for a creator
        who has more than one category — a filter with a single option is not a
        choice — but that left the tab with nothing at all on it for everybody
        else, which is what "there's no filtering, no nothing" was about. Sort
        works for any number of products, so the row is never empty.
      */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {categories.length > 1 && (
            <>
              <FilterChip
                label="All"
                count={products.length}
                active={active === null}
                onClick={() => setActive(null)}
              />
              {categories.map((category) => (
                <FilterChip
                  key={category.name}
                  label={category.name}
                  count={category.count}
                  active={active === category.name}
                  onClick={() => setActive(category.name)}
                />
              ))}
            </>
          )}
        </div>

        {products.length > 1 && (
          <label className="flex shrink-0 items-center gap-2 text-[13px] text-muted-foreground">
            <span className="sr-only">Sort products</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="cursor-pointer rounded-lg border border-border bg-transparent py-1.5 pl-2 pr-7 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {Object.entries(SORT_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((product) => (
          <StorefrontProductCard
            key={product.id}
            product={product}
            creatorName={creatorName}
            creatorUsername={creatorUsername}
            creatorAvatarUrl={creatorAvatarUrl}
          />
        ))}
      </div>
    </div>
  )
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label} <span className="opacity-60">{count}</span>
    </button>
  )
}
