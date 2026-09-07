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
  creatorUsername,
  creatorAvatarUrl,
  viewerIsOwner,
  productId,
  reviews,
  reviewsCount,
  reviewsAverage,
  globalSettings,
  sellerMemberSince,
  sellerTotalSales,
  sellerProductsCount,
  aboutOwnerActions,
}: {
  section: Section
  products?: ProductData[]
  isMobile?: boolean
  moreFromSellerProducts?: ProductData[]
  creatorName?: string
  creatorUsername?: string | null
  creatorAvatarUrl?: string | null
  viewerIsOwner?: boolean
  productId?: string
  reviews?: any[]
  reviewsCount?: number
  reviewsAverage?: number
  globalSettings?: any
  sellerMemberSince?: string
  sellerTotalSales?: number
  sellerProductsCount?: number
  /** The owner's About edit control; only the page knows who is looking. */
  aboutOwnerActions?: React.ReactNode
}) {
  // Defensive check - don't render if section or settings are invalid
  if (!section || !section.settings) {
    return null
  }

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
      creatorUsername={creatorUsername}
      creatorAvatarUrl={creatorAvatarUrl}
      viewerIsOwner={viewerIsOwner}
      productId={productId}
      reviews={reviews}
      reviewsCount={reviewsCount}
      reviewsAverage={reviewsAverage}
      globalSettings={globalSettings}
      sellerMemberSince={sellerMemberSince}
      sellerTotalSales={sellerTotalSales}
      sellerProductsCount={sellerProductsCount}
      aboutOwnerActions={aboutOwnerActions}
    />
  )
}

// ====== SHOP HEADER RENDERER FOR LIVE PAGES ======
export function ShopHeaderRenderer(props: Omit<UnifiedShopHeaderProps, "isPreviewMode" | "isSelected" | "onSelect">) {
  return <UnifiedShopHeader {...props} isPreviewMode={false} />
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
