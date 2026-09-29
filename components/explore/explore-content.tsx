"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition, useCallback, memo } from "react"
import { useExploreScrollRestore } from "@/lib/explore/use-explore-scroll"
import { ProductCard } from "./product-card"
import { CreatorCard } from "./creator-card"
import { ProductCardSkeleton } from "./product-card-skeleton"
import { CreatorCardSkeleton } from "./creator-card-skeleton"

interface ExploreContentProps {
  products: any[]
  creators: any[]
  activeTab: string
  category: string
  searchQuery: string
  sortBy: string
  src: string
  dbError: string | null
}

// Memoized skeleton grids for performance
const ProductSkeletonGrid = memo(function ProductSkeletonGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-200">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
})

const CreatorSkeletonGrid = memo(function CreatorSkeletonGrid() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-200">
      {Array.from({ length: 6 }).map((_, i) => (
        <CreatorCardSkeleton key={i} />
      ))}
    </div>
  )
})

export function ExploreContent({
  products,
  creators,
  activeTab,
  category,
  searchQuery,
  sortBy,
  src,
  dbError,
}: ExploreContentProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentTab, setCurrentTab] = useState(activeTab)

  useExploreScrollRestore()

  const handleTabChange = useCallback((newTab: string) => {
    setCurrentTab(newTab)
    startTransition(() => {
      // Use scroll: false to prevent scrolling to top
      router.push(
        `/explore?tab=${newTab}&category=${category}&q=${searchQuery}&sort=${sortBy}&src=${src}`,
        { scroll: false }
      )
    })
  }, [router, category, searchQuery, sortBy, src])

  const showProducts = currentTab === "products"
  const showCreators = currentTab === "creators"

  return (
    <>
      {/* Tab buttons */}
      <div className="mb-6 inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        <button
          type="button"
          onClick={() => handleTabChange("products")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all cursor-pointer ${
            showProducts ? "bg-background text-foreground shadow-sm" : "hover:text-foreground hover:bg-background/50"
          }`}
        >
          Products ({products.length})
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("creators")}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all cursor-pointer ${
            showCreators ? "bg-background text-foreground shadow-sm" : "hover:text-foreground hover:bg-background/50"
          }`}
        >
          Creators ({creators.length})
        </button>
      </div>

      {/* Content with smooth transitions */}
      <div className="mt-6">
        {/* Products tab */}
        {showProducts && (
          <>
            {isPending ? (
              <ProductSkeletonGrid />
            ) : products.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-300">
                {products.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    srcParam="?src=platform"
                    priority={index < 3}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-12 text-center animate-in fade-in duration-300">
                <p className="text-muted-foreground">
                  {dbError
                    ? "Unable to load products. Please try again later."
                    : searchQuery
                      ? `No products found for "${searchQuery}"`
                      : "No products found yet."}
                </p>
              </div>
            )}
          </>
        )}

        {/* Creators tab */}
        {showCreators && (
          <>
            {isPending ? (
              <CreatorSkeletonGrid />
            ) : creators.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 animate-in fade-in duration-300">
                {creators.map((creator) => (
                  <CreatorCard key={creator.id} creator={creator} />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-12 text-center animate-in fade-in duration-300">
                <p className="text-muted-foreground">
                  {dbError
                    ? "Unable to load creators. Please try again later."
                    : searchQuery
                      ? `No creators found for "${searchQuery}"`
                      : "No creators found yet."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
