"use client"

import type { Section } from "@/lib/store-builder/types"
import {
  UnifiedSectionRenderer,
  UnifiedShopHeader,
  UnifiedProductPage,
  UnifiedProductsGrid,
  SectionContainer,
  type ProductData,
  type CreatorData,
  type ProfileData,
  type UnifiedShopHeaderProps,
  type UnifiedProductPageProps,
  type UnifiedProductsGridProps,
} from "./unified-section-renderer"

// Re-export types for convenience
export type { ProductData, CreatorData, ProfileData }

// ====== SECTION RENDERER FOR LIVE PAGES ======
// ✅ Live pages use isPreviewMode=false so product cards navigate with <Link>
// The empty state placeholder is controlled separately and won't show on live pages
// because there's no onSelect callback passed
export function SectionRenderer({
  section,
  products,
  isMobile = false,
  moreFromSellerProducts,
  creatorName,
  productId,
  reviews,
  reviewsCount,
  reviewsAverage,
}: {
  section: Section
  products?: ProductData[]
  isMobile?: boolean
  moreFromSellerProducts?: ProductData[]
  creatorName?: string
  productId?: string
  reviews?: any[]
  reviewsCount?: number
  reviewsAverage?: number
}) {
  return (
    <UnifiedSectionRenderer
      section={section}
      products={products}
      isMobile={isMobile}
      // ✅ isPreviewMode=false allows product card navigation via <Link>
      // Empty state placeholder won't show because we're not passing onSelect
      isPreviewMode={false}
      moreFromSellerProducts={moreFromSellerProducts}
      creatorName={creatorName}
      productId={productId}
      reviews={reviews}
      reviewsCount={reviewsCount}
      reviewsAverage={reviewsAverage}
    />
  )
}

// ====== SHOP HEADER RENDERER FOR LIVE PAGES ======
export function ShopHeaderRenderer(props: Omit<UnifiedShopHeaderProps, "isPreviewMode" | "isSelected" | "onSelect">) {
  return <UnifiedShopHeader {...props} isPreviewMode={true} />
}

// ====== PRODUCT PAGE RENDERER FOR LIVE PAGES ======
export function ProductPageRenderer(props: Omit<UnifiedProductPageProps, "isPreviewMode" | "isSelected" | "onSelect">) {
  return <UnifiedProductPage {...props} isPreviewMode={false} />
}

// ====== PRODUCTS GRID RENDERER FOR LIVE PAGES ======
export function ProductsGridRenderer(
  props: Omit<UnifiedProductsGridProps, "isPreviewMode" | "isSelected" | "onSelect">,
) {
  return <UnifiedProductsGrid {...props} isPreviewMode={false} />
}

// Re-export SectionContainer for use in live pages
export { SectionContainer }
