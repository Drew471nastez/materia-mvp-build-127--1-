"use client"

import type { Section } from "@/lib/store-builder/types"
import type { CommunityBlockData } from "@/lib/communities/blocks"
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
  sellerContactHandle,
  aboutOwnerActions,
  communityBlocks,
  productsOrder,
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
  /**
   * =========================================================================
   *  THE PROP THIS WRAPPER USED TO SWALLOW
   * =========================================================================
   * This component forwards by NAME, not by spread, and this one was never
   * in the list. So the creator page passed a contact address, the wrapper
   * dropped it on the floor, and the About block rendered no Contact at all —
   * for as long as the feature has existed. Nothing failed: the page's call
   * had a prop the wrapper's type does not declare, which is a type error,
   * and next.config.mjs sets `ignoreBuildErrors`.
   *
   * The same shape as the chart's missing `lastTouchXRef`: a green build over
   * code that cannot work. tests/creator-page.test.ts now checks that every
   * prop this wrapper accepts is also passed on, so a name added to one half
   * and not the other is caught here rather than by a blank space on a page.
   */
  sellerContactHandle?: string
  /** The owner's About edit control; only the page knows who is looking. */
  aboutOwnerActions?: React.ReactNode
  /** The Community sections' data, read on the server for this page (lib/communities/server/blocks.ts). */
  communityBlocks?: Record<string, CommunityBlockData>
  /**
   * The creator's arrangement (headerSettings.productsOrder), which the page
   * passed and this wrapper dropped, the same way as the contact address
   * above: Arrange saved, the Products tab followed it, and Home's Featured
   * row stayed in the builder's order (round 50).
   */
  productsOrder?: string[]
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
      sellerContactHandle={sellerContactHandle}
      aboutOwnerActions={aboutOwnerActions}
      communityBlocks={communityBlocks}
      productsOrder={productsOrder}
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
