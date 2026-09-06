"use client"

/**
 * Everything the creator sells, behind the Products tab.
 *
 * It renders StorefrontProductCard — the same component the Featured rail uses
 * — rather than its own copy of the markup, so the two grids on one page
 * cannot end up looking like different products from different sites.
 */

import * as React from "react"
import { ChevronDown, Package } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { StorefrontProductCard, type StorefrontCardProduct } from "./storefront-product-card"

export type AllProductsGridProduct = StorefrontCardProduct

type SortKey = "recent" | "oldest" | "price-low" | "price-high" | "popular"

/**
 * THE SAME CONTROL AS THE FEATURED RAIL ON THE HOME TAB — same trigger, same
 * labels, same order. A visitor switching between the two tabs was getting two
 * different sort controls with two different vocabularies for the same idea,
 * which is the sort of thing that makes a page feel assembled rather than
 * designed. If you change these labels, change them in
 * UnifiedFeaturedProductsSection too.
 */
const SORT_LABELS: Record<SortKey, string> = {
  recent: "Most Recent",
  oldest: "Oldest",
  "price-low": "Price: Low → High",
  "price-high": "Price: High → Low",
  popular: "Most Popular",
}

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
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex w-auto shrink-0 items-center gap-2 rounded-md bg-transparent px-2 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none">
              <span>Sort: {SORT_LABELS[sort]}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <DropdownMenuItem key={key} className="cursor-pointer" onClick={() => setSort(key)}>
                  {SORT_LABELS[key]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
            isOwner={isOwner}
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
