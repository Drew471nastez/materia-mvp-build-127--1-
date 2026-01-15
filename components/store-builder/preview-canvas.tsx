"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useStoreBuilder } from "./store-builder-context"
import { cn } from "@/lib/utils"
import type { ShopHeaderSettings, ProductHeaderSettings } from "@/lib/store-builder/types"
import { Skeleton } from "@/components/ui/skeleton"
import {
  UnifiedSectionRenderer,
  UnifiedShopHeader,
  UnifiedProductPage,
  type ProductData,
  type CreatorData,
  type ProfileData,
} from "./unified-section-renderer"
import { EditorSubscribeBar } from "./subscribe-bar"
import { ProductCreatorBar } from "./product-creator-bar"
import { EditorStickyAddToCart } from "./sticky-add-to-cart"
import {
  defaultSubscribeBarSettings,
  defaultProductCreatorBarSettings,
  defaultStickyAddToCartSettings,
} from "@/lib/store-builder/defaults"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { CoverImageEditor } from "./cover-image-editor"

interface PreviewCanvasProps {
  creatorId: string
  creator?: CreatorData
  profile?: ProfileData
  products?: ProductData[]
  isPreviewMode?: boolean
}

type Rect = { left: number; width: number; bottom: number }

/** Returns the nearest scrollable parent */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null
  let parent: HTMLElement | null = el.parentElement
  while (parent) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    const canScrollY = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay"
    if (canScrollY && parent.scrollHeight > parent.clientHeight + 2) return parent
    parent = parent.parentElement
  }
  return null
}

export function PreviewCanvas({ creatorId, creator, profile, products, isPreviewMode = false }: PreviewCanvasProps) {
  const {
    currentPageType,
    draftConfig,
    previewDevice,
    selectedSectionId,
    setSelectedSectionId,
    isLoading,
    selectedProductId,
    setSidebarMode,
    updateHeaderSettings,
  } = useStoreBuilder()

  const isMobile = previewDevice === "mobile"
  const isEditorMode = !isPreviewMode
  // In editor, sections should render in preview mode to show placeholders
  const sectionsPreviewMode = isEditorMode ? true : isPreviewMode

  const selectedProduct = selectedProductId ? products?.find((p) => p.id === selectedProductId) : null

  const moreFromSellerProducts = selectedProductId
    ? products?.filter((p) => p.id !== selectedProductId) || []
    : products || []

  const [coverEditorOpen, setCoverEditorOpen] = useState(false)

  const handleAvatarEdit = () => {
    setSelectedSectionId("header")
    setSidebarMode("settings")
  }

  const handleCoverEdit = () => {
    setCoverEditorOpen(true)
  }

  const handleCoverSave = (imageUrl: string, focalPoint: { x: number; y: number }) => {
    updateHeaderSettings({
      coverImageUrl: imageUrl,
      coverFocalPoint: focalPoint,
    })
  }

  const subscribeBarSettings =
    currentPageType === "shop"
      ? (draftConfig.headerSettings as ShopHeaderSettings).subscribeBar || defaultSubscribeBarSettings
      : null

  const headerSettings = draftConfig.headerSettings as ShopHeaderSettings
  const avatarUrl =
    headerSettings?.avatarUrl === ""
      ? undefined
      : headerSettings?.avatarUrl !== undefined
        ? headerSettings.avatarUrl
        : profile?.avatar_url || undefined

  // ===== refs for measuring canvas position =====
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const footerSentinelRef = useRef<HTMLDivElement | null>(null)
  const [canvasRect, setCanvasRect] = useState<Rect | null>(null)

  const measureCanvas = () => {
    const el = canvasRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.round(r.width)
    if (width < 50) return
    setCanvasRect({
      left: Math.round(r.left),
      width,
      bottom: Math.round(r.bottom),
    })
  }

  // Measure on layout changes
  useLayoutEffect(() => {
    measureCanvas()
    requestAnimationFrame(() => requestAnimationFrame(measureCanvas))
  }, [isMobile, currentPageType, selectedProductId])

  // Keep measuring when element changes size
  useEffect(() => {
    measureCanvas()
    requestAnimationFrame(() => requestAnimationFrame(measureCanvas))

    const onResize = () => measureCanvas()
    window.addEventListener("resize", onResize)

    const ro = new ResizeObserver(() => measureCanvas())
    if (canvasRef.current) ro.observe(canvasRef.current)

    return () => {
      window.removeEventListener("resize", onResize)
      ro.disconnect()
    }
  }, [])

  // In editor mode, start with sticky visible so users can see and customize it
  const [showSticky, setShowSticky] = useState(!isPreviewMode)
  const lastScrollTopRef = useRef(0)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (currentPageType !== "product") return

    const canvasEl = canvasRef.current
    const scrollParent = getScrollParent(canvasEl)
    scrollParentRef.current = scrollParent

    const getScrollTop = () => {
      if (scrollParentRef.current) return scrollParentRef.current.scrollTop
      return window.scrollY || document.documentElement.scrollTop || 0
    }

    const isNearFooter = () => {
      const sentinel = footerSentinelRef.current
      if (!sentinel) return false
      const rect = sentinel.getBoundingClientRect()
      return rect.top < window.innerHeight + 120
    }

    const handleScroll = () => {
      const y = getScrollTop()
      lastScrollTopRef.current = y

      measureCanvas()

      const nearFooter = isNearFooter()

      // In editor mode, ALWAYS show sticky so users can see and customize it
      // In preview/live mode, use scroll threshold
      if (isEditorMode) {
        // Always visible in editor unless near footer
        setShowSticky(!nearFooter)
        return
      }

      // Live mode: show after 200px scroll and not near footer
      const scrollThreshold = 200
      if (y > scrollThreshold && !nearFooter) {
        setShowSticky(true)
      } else {
        setShowSticky(false)
      }
    }

    const targets: (HTMLElement | Window)[] = []
    if (scrollParent) targets.push(scrollParent)
    targets.push(window)

    targets.forEach((t) => t.addEventListener("scroll", handleScroll, { passive: true }))
    window.addEventListener("resize", handleScroll, { passive: true })

    // Initial check
    handleScroll()

    return () => {
      targets.forEach((t) => t.removeEventListener("scroll", handleScroll))
      window.removeEventListener("resize", handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [currentPageType, selectedProductId, isMobile, isEditorMode])

  const handleSelectSection = (sectionId: string) => {
    if (isEditorMode) {
      setSelectedSectionId(sectionId)
      setSidebarMode("settings")
    }
  }

  const [productReviews, setProductReviews] = useState<{ count: number; average: number; reviews: any[] }>({ count: 0, average: 0, reviews: [] })

  useEffect(() => {
    if (!selectedProduct?.id) return

    const fetchReviews = async () => {
      try {
        // Fetch stats
        const statsRes = await fetch(`/api/reviews/stats?productId=${selectedProduct.id}`)
        const statsData = await statsRes.json()
        
        // Fetch actual reviews
        const reviewsRes = await fetch(`/api/reviews?productId=${selectedProduct.id}&limit=10`)
        const reviewsData = await reviewsRes.json()
        
        setProductReviews({ 
          count: statsData.reviewsCount || 0, 
          average: statsData.reviewsAverage || 0,
          reviews: reviewsData.reviews || []
        })
      } catch (err) {
        console.error("Failed to fetch reviews for preview:", err)
      }
    }

    fetchReviews()
  }, [selectedProduct?.id])

  const stickySettings =
    currentPageType === "product"
      ? (draftConfig.headerSettings as ProductHeaderSettings).stickyAddToCart || defaultStickyAddToCartSettings
      : null

  const shouldRenderSticky =
    currentPageType === "product" && selectedProduct && stickySettings && stickySettings.visible && canvasRect

  if (isLoading) {
    return (
      <div className={cn("min-h-full flex items-start justify-center bg-muted/30", isMobile ? "p-2" : "p-4 sm:p-6")}>
        <div
          className={cn(
            "bg-background shadow-xl overflow-hidden",
            isMobile ? "w-[375px] min-h-[667px] rounded-[20px]" : "w-full max-w-5xl rounded-[20px] ring-1 ring-border",
          )}
        >
          <Skeleton className={cn("w-full", isMobile ? "h-32" : "h-40")} />
          <div className="p-6 space-y-6">
            <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            <Skeleton className="h-8 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <div className="space-y-2 max-w-xl mx-auto">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("min-h-full flex items-start justify-center bg-muted/30", isMobile ? "p-2" : "p-4 sm:p-6")}>
      {/* Canvas - NO internal scrolling, corners preserved */}
      <div
        ref={canvasRef}
        className={cn(
          "shadow-xl mx-auto relative flex flex-col rounded-[20px] ring-1 ring-border overflow-hidden",
          isMobile ? "w-[375px]" : "w-full max-w-5xl",
        )}
        style={{
          background: draftConfig.globalColors?.backgroundColor || "var(--background)",
        }}
      >
        {currentPageType === "product" && selectedProduct ? (
          <>
            <ProductCreatorBar
              settings={
                (draftConfig.headerSettings as ProductHeaderSettings).creatorBar || defaultProductCreatorBarSettings
              }
              creatorName={profile?.display_name || "Creator"}
              creatorUsername={profile?.username}
              avatarUrl={profile?.avatar_url}
              isEditorPreview={isEditorMode}
              isMobile={isMobile}
              isSelected={isEditorMode && selectedSectionId === "creator-bar"}
              onSelect={() => handleSelectSection("creator-bar")}
            />

            <UnifiedProductPage
              settings={draftConfig.headerSettings as ProductHeaderSettings}
              product={selectedProduct}
              creator={creator}
              profile={profile}
              isMobile={isMobile}
              isPreviewMode={isPreviewMode}
              isSelected={isEditorMode && selectedSectionId === "product-content"}
              onSelect={() => handleSelectSection("product-content")}
              reviewsCount={productReviews.count}
              reviewsAverage={productReviews.average}
              reviews={productReviews.reviews}
            />

            {draftConfig.sections
              .filter((s) => s.settings.visible)
              .sort((a, b) => a.order - b.order)
              .map((section) => (
                <UnifiedSectionRenderer
                  key={section.id}
                  section={section}
                  products={products}
                  isMobile={isMobile}
                  isPreviewMode={sectionsPreviewMode}
                  isSelected={isEditorMode && selectedSectionId === section.id}
                  onSelect={() => handleSelectSection(section.id)}
                  moreFromSellerProducts={moreFromSellerProducts}
                  creatorName={profile?.display_name}
                  productId={selectedProduct.id}
                  reviewsCount={productReviews.count}
                  reviewsAverage={productReviews.average}
                  reviews={productReviews.reviews}
                  accentColor={draftConfig.globalSettings?.themeColors?.accent}
                />
              ))}

            <SellerFooter />

            {/* Footer sentinel for detecting when to hide sticky */}
            <div ref={footerSentinelRef} className="h-px w-full" />
          </>
        ) : currentPageType === "shop" ? (
          <>
            {/* Subscribe Bar - MUST be BEFORE header, at absolute top of canvas */}
            <EditorSubscribeBar
              settings={
                {
                  ...subscribeBarSettings,
                  // Normalize colors: extract from colors object if not at top level
                  backgroundColor:
                    subscribeBarSettings?.backgroundColor || subscribeBarSettings?.colors?.backgroundColor || "#ffffff",
                  textColor: subscribeBarSettings?.textColor || subscribeBarSettings?.colors?.textColor || "#000000",
                  // Pass avatar and creator info
                  showAvatar: subscribeBarSettings?.showAvatar ?? true,
                  avatarUrl: avatarUrl,
                  creatorName: profile?.display_name || "Creator",
                } || defaultSubscribeBarSettings
              }
              creatorId={creatorId}
              isEditorPreview={isEditorMode}
              isMobile={isMobile}
              isSelected={isEditorMode && selectedSectionId === "subscribe-bar"}
              onSelect={() => handleSelectSection("subscribe-bar")}
              scrollContainerRef={scrollParentRef}
            />

            <UnifiedShopHeader
              settings={draftConfig.headerSettings as ShopHeaderSettings}
              creator={creator}
              profile={profile}
              products={products}
              productCount={products?.length || 0}
              isMobile={isMobile}
              isPreviewMode={isPreviewMode}
              isSelected={isEditorMode && selectedSectionId === "header"}
              onSelect={() => handleSelectSection("header")}
              onAvatarEdit={handleAvatarEdit}
              onCoverEdit={handleCoverEdit}
              globalSettings={draftConfig.globalSettings}
            />

            {draftConfig.sections
              .filter((s) => s.settings.visible)
              .sort((a, b) => a.order - b.order)
              .map((section) => (
                <UnifiedSectionRenderer
                  key={section.id}
                  section={section}
                  products={products}
                  isMobile={isMobile}
                  isPreviewMode={sectionsPreviewMode}
                  isSelected={isEditorMode && selectedSectionId === section.id}
                  onSelect={() => handleSelectSection(section.id)}
                  moreFromSellerProducts={moreFromSellerProducts}
                  creatorName={profile?.display_name}
                  accentColor={draftConfig.globalSettings?.themeColors?.accent}
                />
              ))}

            <SellerFooter />
          </>
        ) : null}
      </div>

      {/* Sticky Add to Cart - FIXED positioned, constrained to canvas width */}
      {shouldRenderSticky && selectedProduct && stickySettings && canvasRect && (
        <div
          style={{
            position: "fixed",
            left: canvasRect.left,
            width: canvasRect.width,
            bottom: 0,
            zIndex: 9999,
          }}
          className={cn(
            "transition-all duration-300 ease-out",
            showSticky ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none",
          )}
        >
          <EditorStickyAddToCart
            settings={stickySettings}
            product={{
              id: selectedProduct.id,
              slug: selectedProduct.slug,
              title: selectedProduct.title,
              price_cents: selectedProduct.price_cents,
              compare_at_cents: selectedProduct.compare_at_cents,
              reviews_count: productReviews.count,
              reviews_average: productReviews.average,
            }}
            isEditorPreview={isEditorMode}
            isMobile={isMobile}
            isSelected={isEditorMode && selectedSectionId === "sticky-add-to-cart"}
            onSelect={() => handleSelectSection("sticky-add-to-cart")}
          />
        </div>
      )}

      {/* Cover Image Editor Popup */}
      <CoverImageEditor
        open={coverEditorOpen}
        onOpenChange={setCoverEditorOpen}
        currentImageUrl={(draftConfig.headerSettings as ShopHeaderSettings).coverImageUrl}
        currentFocalPoint={(draftConfig.headerSettings as ShopHeaderSettings).coverFocalPoint}
        onSave={handleCoverSave}
      />
    </div>
  )
}
