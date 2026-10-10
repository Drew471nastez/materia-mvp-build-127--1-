"use client"

import { personName } from "@/lib/profile/display-name"
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react"
import { useStoreBuilder } from "./store-builder-context"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { ShopHeaderSettings, ProductHeaderSettings } from "@/lib/store-builder/types"
import { Skeleton } from "@/components/ui/skeleton"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { StorefrontCommunities } from "@/components/community/public/storefront-communities"
import type { CommunityCard } from "@/lib/communities/types"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import {
  UnifiedSectionRenderer,
  UnifiedShopHeader,
  UnifiedProductPage,
  ProductAboutSection,
  type ProductData,
  type CreatorData,
  type ProfileData,
} from "./unified-section-renderer"
import { ProductCreatorBar } from "./product-creator-bar"
import { EditorStickyAddToCart } from "./sticky-add-to-cart"
import {
  defaultProductCreatorBarSettings,
  defaultStickyAddToCartSettings,
} from "@/lib/store-builder/defaults"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { CoverImageEditor } from "./cover-image-editor"
import { cleanDescription } from "@/app/app/products/new/description-action"

interface PreviewCanvasProps {
  creatorId: string
  creator?: CreatorData
  profile?: ProfileData
  products?: ProductData[]
  isPreviewMode?: boolean
  isMobileSidebarOpen?: boolean
  /** The creator's communities: the Communities tab, as on the live page, only when there are some. */
  communities?: CommunityCard[]
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

export function PreviewCanvas({ creatorId, creator, profile, products, isPreviewMode = false, isMobileSidebarOpen = false, communities = [] }: PreviewCanvasProps) {
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
    updateSectionSettings,
  } = useStoreBuilder()

  const [runtimeIsMobile, setRuntimeIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)")
    const update = () => setRuntimeIsMobile(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [])

  const isMobile = previewDevice === "mobile" || runtimeIsMobile
  const isEditorMode = !isPreviewMode
  // In editor, sections should render in preview mode to show placeholders
  const sectionsPreviewMode = isEditorMode ? true : isPreviewMode

  const selectedProduct = selectedProductId ? products?.find((p) => p.id === selectedProductId) : null

  const moreFromSellerProducts = selectedProductId
    ? products?.filter((p) => p.id !== selectedProductId) || []
    : products || []

  // Calculate total sales from products for About section
  const totalSales = products?.reduce((acc, p) => acc + (p.sales_count || 0), 0) || 0
  // Calculate products count for About section
  const productsCount = products?.length || 0
  // Get member since date from profile or creator
  const memberSince = profile?.created_at || creator?.created_at

  const [coverEditorOpen, setCoverEditorOpen] = useState(false)
  const [isNavigatingAway, setIsNavigatingAway] = useState(false)

  useEffect(() => {
    const handleNavigationLoading = (event: Event) => {
      const customEvent = event as CustomEvent<{ isNavigating?: boolean }>
      setIsNavigatingAway(!!customEvent.detail?.isNavigating)
    }

    window.addEventListener("storebuilder-navigation-loading", handleNavigationLoading as EventListener)
    return () => window.removeEventListener("storebuilder-navigation-loading", handleNavigationLoading as EventListener)
  }, [])

  const handleAvatarEdit = () => {
    setSelectedSectionId("header")
    setSidebarMode("settings")
  }

  const handleBioEdit = () => {
    setSelectedSectionId("header")
    setSidebarMode("settings")
    // Scroll to bio input after sidebar renders
    setTimeout(() => {
      const bioSection = document.getElementById("sidebar-bio-section")
      if (bioSection) {
        bioSection.scrollIntoView({ behavior: "smooth", block: "center" })
        // Focus the bio input
        const bioInput = document.getElementById("sidebar-bio-input") as HTMLTextAreaElement
        if (bioInput) {
          bioInput.focus()
        }
      }
    }, 100)
  }

  const handleCoverEdit = () => {
    setCoverEditorOpen(true)
  }

  const handleCoverSave = (imageUrl: string, focalPoint: { x: number; y: number }) => {
    /* This editor places a picture at zoom 1, so a zoom from the profile
       sheet goes with it, as it does in sections-sidebar. */
    updateHeaderSettings({
      coverImageUrl: imageUrl,
      coverFocalPoint: focalPoint,
      coverZoom: undefined,
    })
  }

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

    // Robust measurement: keep trying until canvasRect is set (for initial load)
    let attempts = 0
    const maxAttempts = 10
    const measureInterval = setInterval(() => {
      measureCanvas()
      attempts++
      if (attempts >= maxAttempts) {
        clearInterval(measureInterval)
      }
    }, 100)

    return () => {
      window.removeEventListener("resize", onResize)
      ro.disconnect()
      clearInterval(measureInterval)
    }
  }, [currentPageType, selectedProductId, isMobile])

  // In editor mode, start with sticky visible so users can see and customize it
  // ALWAYS visible in editor mode on all devices (mobile included)
  const [showSticky, setShowSticky] = useState(true)
  const lastScrollTopRef = useRef(0)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const scrollParentRef = useRef<HTMLElement | null>(null)

  // Ensure sticky is visible by default when in editor mode
  useEffect(() => {
    if (isEditorMode && currentPageType === "product") {
      setShowSticky(true)
    }
  }, [isEditorMode, currentPageType, selectedProductId])

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
      // Smoother footer detection - hide when footer is about to enter viewport
      return rect.top < window.innerHeight + 100
    }

    const handleScroll = () => {
      const y = getScrollTop()
      const prevY = lastScrollTopRef.current
      lastScrollTopRef.current = y

      measureCanvas()

      const nearFooter = isNearFooter()

      // In editor mode, ALWAYS show sticky so users can see and customize it
      // Hide smoothly when approaching footer
      if (isEditorMode) {
        // Always visible in editor unless near footer
        setShowSticky(!nearFooter)
        return
      }

      // Preview/Live mode: show on scroll up OR after initial scroll, hide near footer
      const scrollThreshold = 200
      const isScrollingUp = y < prevY

      if (nearFooter) {
        setShowSticky(false)
      } else if (y > scrollThreshold) {
        // Show after passing threshold (either scroll up or down)
        setShowSticky(true)
      } else if (y <= scrollThreshold && !isScrollingUp) {
        // Hide when scrolling back to top
        setShowSticky(false)
      }
    }

    const targets: (HTMLElement | Window)[] = []
    if (scrollParent) targets.push(scrollParent)
    targets.push(window)

    targets.forEach((t) => t.addEventListener("scroll", handleScroll, { passive: true }))
    window.addEventListener("resize", handleScroll, { passive: true })

    // Initial check - in editor mode, always show by default
    if (isEditorMode) {
      setShowSticky(true)
    } else {
      handleScroll()
    }

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

  // Local product state for description editing
  const [localProductData, setLocalProductData] = useState<ProductData | null>(null)

  // Update local product data when selected product changes
  useEffect(() => {
    if (selectedProduct) {
      setLocalProductData(selectedProduct)
    }
  }, [selectedProduct])

  // Debounced description update to database
  const descriptionUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleDescriptionChange = useCallback(async (newDescription: string) => {
    if (!selectedProduct?.id) return

    // Update local state immediately for responsive UI
    setLocalProductData((prev) => prev ? { ...prev, description: newDescription } : null)

    // Debounce the database update
    if (descriptionUpdateTimeoutRef.current) {
      clearTimeout(descriptionUpdateTimeoutRef.current)
    }

    descriptionUpdateTimeoutRef.current = setTimeout(async () => {
      try {
        /* Through the same allow list as the product editor's save. */
        const cleaned = await cleanDescription(newDescription)
        if (!cleaned.ok) {
          console.error("Description not saved:", cleaned.error)
          return
        }
        const supabase = createClient()
        const { error } = await supabase
          .from("products")
          .update({ description: cleaned.html })
          .eq("id", selectedProduct.id)

        if (error) {
          console.error("Failed to update product description:", error)
        }
      } catch (err) {
        console.error("Failed to update product description:", err)
      }
    }, 500) // Debounce for 500ms
  }, [selectedProduct?.id])

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

  // Don't render sticky add-to-cart when mobile sidebar is open (to avoid overlap)
  const shouldRenderSticky =
    currentPageType === "product" && selectedProduct && stickySettings && stickySettings.visible && canvasRect && !isMobileSidebarOpen && !isNavigatingAway

  // Get theme preset for skeleton loading colors
  const themePreset = draftConfig.globalSettings?.themePreset || "default"
  /* Dark by the scheme's page colour, never its name (lib/store-builder/scheme-tone). */
  const isDarkTheme = isDarkScheme(themePreset)

  if (isLoading) {
    // Get theme-specific background colors for loading state
    const getLoadingBackground = () => {
      if (isDarkTheme) return getThemeSkeletonColors(themePreset).backgroundColor
      switch (themePreset) {
        case 'cream':
          return '#FAF4E8'
        case 'bubble':
          return '#ffffff'
        case 'pink':
          return '#ffffff'
        case 'air':
          return '#ffffff'
        default:
          return 'var(--background)'
      }
    }

    const getBorderColor = () => {
      return isDarkTheme ? '#2a2a2a' : '#e5e7eb'
    }

    // Product page skeleton
    if (currentPageType === "product") {
      return (
        <div className={cn("min-h-full flex items-start justify-center bg-white dark:bg-zinc-950", isMobile ? "p-2" : "p-4 sm:p-6")}>
          <div
            className={cn(
              "shadow-xl overflow-hidden",
              // Same edge rounding as the real canvas, so the skeleton and the
              // thing that replaces it have identical silhouettes.
              "[&>*:first-child]:rounded-t-[20px] [&>*:last-child]:rounded-b-[20px]",
              isMobile ? "w-[375px] min-h-[667px] rounded-[20px]" : "w-full max-w-5xl rounded-[20px] ring-1 ring-border",
            )}
            style={{ backgroundColor: getLoadingBackground() }}
          >
            {/* Creator Bar Skeleton */}
            <div
              className="h-14 border-b flex items-center justify-between px-4"
              style={{
                backgroundColor: isDarkTheme ? '#1a1a1a' : getLoadingBackground(),
                borderColor: getBorderColor()
              }}
            >
              <div className="flex items-center gap-3">
                <Skeleton themePreset={themePreset} className="h-8 w-8 rounded-full" />
                <Skeleton themePreset={themePreset} className="h-4 w-24" />
              </div>
              <Skeleton themePreset={themePreset} className="h-8 w-24 rounded-lg" />
            </div>

            {/* Main Content */}
            <div className={cn("p-4", isMobile ? "space-y-4" : "p-6")}>
              {/* Gallery */}
              <Skeleton themePreset={themePreset} className="aspect-video w-full rounded-xl" />
              <div className="flex gap-2 mt-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} themePreset={themePreset} className={cn("rounded-lg", isMobile ? "h-12 w-12" : "h-16 w-16")} />
                ))}
              </div>

              {/* Title */}
              <div className="mt-6 space-y-3">
                <Skeleton themePreset={themePreset} className="h-8 w-3/4" />
                <div className="flex items-center gap-3">
                  <Skeleton themePreset={themePreset} className="h-10 w-10 rounded-full" />
                  <Skeleton themePreset={themePreset} className="h-5 w-32" />
                </div>
              </div>

              {/* Mobile Price Card */}
              {isMobile && (
                <div
                  className="mt-4 rounded-xl border p-4 space-y-3"
                  style={{ borderColor: getBorderColor(), backgroundColor: isDarkTheme ? '#1a1a1a' : getLoadingBackground() }}
                >
                  <Skeleton themePreset={themePreset} className="h-8 w-24" />
                  <Skeleton themePreset={themePreset} className="h-12 w-full rounded-lg" />
                  <Skeleton themePreset={themePreset} className="h-10 w-full rounded-lg" />
                </div>
              )}

              {/* Description */}
              <div className="mt-6 space-y-2">
                <Skeleton themePreset={themePreset} className="h-6 w-32 mb-3" />
                <Skeleton themePreset={themePreset} className="h-4 w-full" />
                <Skeleton themePreset={themePreset} className="h-4 w-full" />
                <Skeleton themePreset={themePreset} className="h-4 w-3/4" />
              </div>

              {/* FAQ */}
              <div className="mt-8 space-y-3">
                <Skeleton themePreset={themePreset} className="h-6 w-48 mb-4" />
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} themePreset={themePreset} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )
    }

    // Shop page skeleton (default)
    return (
      <div className={cn("min-h-full flex items-start justify-center bg-white dark:bg-zinc-950", isMobile ? "p-2" : "p-4 sm:p-6")}>
        <div
          className={cn(
            "shadow-xl overflow-hidden",
            // Same edge rounding as the real canvas, so the skeleton and the
            // thing that replaces it have identical silhouettes.
            "[&>*:first-child]:rounded-t-[20px] [&>*:last-child]:rounded-b-[20px]",
            isMobile ? "w-[375px] min-h-[667px] rounded-[20px]" : "w-full max-w-5xl rounded-[20px] ring-1 ring-border",
          )}
          style={{ backgroundColor: getLoadingBackground() }}
        >
          {/* Cover Image */}
          <Skeleton themePreset={themePreset} className={cn("w-full", isMobile ? "h-32" : "h-48")} />

          {/* Header */}
          <div className="p-6 space-y-4">
            <div className="flex flex-col items-center text-center">
              <Skeleton themePreset={themePreset} className={cn("rounded-full -mt-12", isMobile ? "h-20 w-20" : "h-24 w-24")} />
              <Skeleton themePreset={themePreset} className="mt-4 h-8 w-48" />
              <Skeleton themePreset={themePreset} className="mt-2 h-4 w-64" />
              <div className="mt-4 flex gap-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} themePreset={themePreset} className="h-6 w-20 rounded-full" />
                ))}
              </div>
              <div className="mt-6 w-full max-w-xl space-y-2">
                <Skeleton themePreset={themePreset} className="h-4 w-full" />
                <Skeleton themePreset={themePreset} className="h-4 w-3/4 mx-auto" />
              </div>
              <div className="mt-6 flex gap-8">
                <Skeleton themePreset={themePreset} className="h-4 w-24" />
                <Skeleton themePreset={themePreset} className="h-4 w-24" />
              </div>
            </div>
          </div>

          {/* Featured Products */}
          <div className="p-6 pt-0">
            <Skeleton themePreset={themePreset} className="h-7 w-48 mb-4" />
            <Skeleton themePreset={themePreset} className="h-4 w-64 mb-6" />
            <div className="flex gap-3 mb-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} themePreset={themePreset} className="h-8 w-20 rounded-full" />
              ))}
            </div>
            <div className={cn("grid gap-4", isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3")}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border overflow-hidden"
                  style={{ borderColor: getBorderColor(), backgroundColor: isDarkTheme ? '#1a1a1a' : getLoadingBackground() }}
                >
                  <Skeleton themePreset={themePreset} className="aspect-video w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton themePreset={themePreset} className="h-5 w-3/4" />
                    <Skeleton themePreset={themePreset} className="h-4 w-1/2" />
                    <Skeleton themePreset={themePreset} className="h-6 w-20 mt-3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("min-h-full flex items-start justify-center bg-white dark:bg-zinc-950", isMobile ? "p-2" : "p-4 sm:p-6")}>
      {/*
        Canvas - NO internal scrolling, corners preserved.

        THE FIRST AND LAST SECTIONS GET THE CANVAS'S OWN RADIUS. `overflow-hidden`
        clips them to the rounded rect, but clipping is not the same as rounding:
        a selected section draws `ring-inset`, a box-shadow that follows the
        SECTION's radius, and the sections are square. So at each canvas corner
        the clip sliced the ring's square corner clean off and the outline just
        stopped, leaving a bare notch, which is what "the corners get cut" is.
        Giving the edge sections the matching radius makes the ring trace the
        same curve the clip does.
      */}
      <div
        ref={canvasRef}
        className={cn(
          "shadow-xl mx-auto relative flex flex-col rounded-[20px] ring-1 ring-border overflow-hidden",
          "[&>*:first-child]:rounded-t-[20px] [&>*:last-child]:rounded-b-[20px]",
          isMobile ? "w-[375px]" : "w-full max-w-5xl",
        )}
        style={{
          background: draftConfig.globalColors?.backgroundColor || "var(--background)",
          color: (draftConfig.headerSettings as any)?.colors?.textColor || "var(--foreground)",
        }}
      >
        {currentPageType === "product" && selectedProduct ? (
          <>
            <ProductCreatorBar
              settings={
                (draftConfig.headerSettings as ProductHeaderSettings).creatorBar || defaultProductCreatorBarSettings
              }
              creatorName={personName({ name: profile?.display_name, username: profile?.username })}
              creatorUsername={profile?.username}
              avatarUrl={avatarUrl}
              isEditorPreview={isEditorMode}
              isMobile={isMobile}
              isSelected={isEditorMode && selectedSectionId === "creator-bar"}
              onSelect={() => handleSelectSection("creator-bar")}
            />

            <UnifiedProductPage
              settings={draftConfig.headerSettings as ProductHeaderSettings}
              product={localProductData || selectedProduct}
              creator={creator}
              profile={profile}
              isMobile={isMobile}
              isPreviewMode={isPreviewMode}
              isSelected={isEditorMode && selectedSectionId === "product-content"}
              onSelect={() => handleSelectSection("product-content")}
              reviewsCount={productReviews.count}
              reviewsAverage={productReviews.average}
              reviews={productReviews.reviews}
              globalSettings={draftConfig.globalSettings}
              onEditFaqs={() => {
                // Find the FAQ section and select it to open the sidebar
                const faqSection = draftConfig.sections.find((s) => s.type === "faq")
                if (faqSection) {
                  handleSelectSection(faqSection.id)
                }
              }}
              onDescriptionChange={handleDescriptionChange}
              faqSettings={draftConfig.sections.find((s) => s.type === "faq")?.settings as { customFaqs?: Array<{ id: string; question: string; answer: string; isDefault?: boolean }>; allFaqs?: Array<{ id: string; question: string; answer: string; isDefault?: boolean }> } | undefined}
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
                  globalSettings={draftConfig.globalSettings}
                />
              ))}

            {/* About section with payment methods for product pages */}
            <ProductAboutSection
              isMobile={isMobile}
              textColor={(draftConfig.headerSettings as any)?.colors?.textColor}
              backgroundColor={draftConfig.globalColors?.backgroundColor}
            />

            <SellerFooter isMobile={isMobile} />

            {/* Footer sentinel for detecting when to hide sticky - positioned absolute to avoid layout gap */}
            <div ref={footerSentinelRef} className="absolute bottom-0 h-px w-full pointer-events-none" />
          </>
        ) : currentPageType === "shop" ? (
          <>
            {/* Check if there's an announcement bar at position 0 (top) - render it above everything */}
            {(() => {
              const sortedSections = [...draftConfig.sections].sort((a, b) => a.order - b.order)
              const topAnnouncementBar = sortedSections.length > 0 &&
                sortedSections[0].type === "announcement-bar" &&
                sortedSections[0].settings.visible
                  ? sortedSections[0]
                  : null

              return topAnnouncementBar ? (
                <UnifiedSectionRenderer
                  key={topAnnouncementBar.id}
                  section={topAnnouncementBar}
                  products={products}
                  isMobile={isMobile}
                  isPreviewMode={sectionsPreviewMode}
                  isSelected={isEditorMode && selectedSectionId === topAnnouncementBar.id}
                  onSelect={() => handleSelectSection(topAnnouncementBar.id)}
                  moreFromSellerProducts={moreFromSellerProducts}
                  creatorName={profile?.display_name}
                  accentColor={draftConfig.globalSettings?.themeColors?.accent}
                  globalSettings={draftConfig.globalSettings}
                />
              ) : null
            })()}

            {/*
              NO BAR ABOVE THE COVER, HERE EITHER. The live creator page stopped
              drawing it (lib/storefront/subscribe-bar-visibility.ts: it was
              ours, no creator ever asked for it, and the one control they had
              over it did nothing), so the canvas does not draw one. A builder
              that shows a bar the page does not have is worse than no builder.
            */}

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
              onBioEdit={handleBioEdit}
              globalSettings={draftConfig.globalSettings}
            />

            {(() => {
              // Filter out announcement bar at position 0 (already rendered at top)
              // Also filter out About section to render it separately at the bottom
              const sortedSections = [...draftConfig.sections].sort((a, b) => a.order - b.order)
              const topAnnouncementBarId = sortedSections.length > 0 &&
                sortedSections[0].type === "announcement-bar" &&
                sortedSections[0].settings.visible
                  ? sortedSections[0].id
                  : null

              const regularSections = draftConfig.sections
                .filter((s) => s.settings.visible && s.id !== topAnnouncementBarId && s.type !== "about")
                .sort((a, b) => a.order - b.order)

              const aboutSection = draftConfig.sections.find((s) => s.type === "about" && s.settings.visible)

              /**
               * THE CANVAS SHOWS THE TABS THE LIVE PAGE HAS.
               *
               * It did not, so the builder was a preview of a page that no
               * longer existed: a creator arranged sections against one layout
               * and published another. The three tabs, the strip, the panels
               * and the About-below-them are all the storefront's own
               * components, rendered here with the draft config, so the
               * preview cannot drift from the page again without the page
               * changing too.
               *
               * EDITING IS UNCHANGED. Every section a creator can arrange
               * lives on Home, which is the panel that opens; Products and
               * Communities are the same read-only panels the visitor gets.
               * `isMobile` has to be passed because the phone frame is narrow
               * while the viewport is not, and CSS can only see the viewport.
               */
              const homePanel = (
                <>
                  {regularSections.map((section) => (
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
                      globalSettings={draftConfig.globalSettings}
                    />
                  ))}
                </>
              )

              const featured = regularSections.find((s) => s.type === "featured-products")
              const canvasTabs: StorefrontTab[] = [{ id: "home", label: "Home", panel: homePanel }]
              if ((products?.length ?? 0) > 1) {
                canvasTabs.push({
                  id: "products",
                  label: "Products",
                  panel: (
                    <AllProductsGrid
                      products={products as never}
                      creatorName={profile?.display_name}
                      showCategoryFilter={
                        !(featured?.settings as { hideCategoryFilter?: boolean } | undefined)?.hideCategoryFilter
                      }
                    />
                  ),
                })
              }
              /* The live page's Communities tab: real cards, and no tab when there are none. */
              if (communities.length > 0) {
                canvasTabs.push({
                  id: "communities",
                  label: "Communities",
                  panel: <StorefrontCommunities cards={communities} phone={isMobile} />,
                })
              }

              return (
                <>
                  <StorefrontTabs tabs={canvasTabs} isMobile={isMobile} />

                  {/* About section - always rendered last (fixed at bottom) */}
                  {aboutSection && (
                    <UnifiedSectionRenderer
                      key={aboutSection.id}
                      section={aboutSection}
                      products={products}
                      isMobile={isMobile}
                      isPreviewMode={sectionsPreviewMode}
                      isSelected={isEditorMode && selectedSectionId === aboutSection.id}
                      onSelect={() => handleSelectSection(aboutSection.id)}
                      moreFromSellerProducts={moreFromSellerProducts}
                      creatorName={profile?.display_name}
                      accentColor={draftConfig.globalSettings?.themeColors?.accent}
                      globalSettings={draftConfig.globalSettings}
                      sellerMemberSince={memberSince}
                      sellerTotalSales={totalSales}
                      sellerProductsCount={productsCount}
                      onUpdateAboutSettings={(settings) => updateSectionSettings(aboutSection.id, settings)}
                      onOpenAboutSidebar={() => handleSelectSection(aboutSection.id)}
                    />
                  )}
                </>
              )
            })()}

            <SellerFooter isMobile={isMobile} />
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
              thumbnail_url: selectedProduct.thumbnail_url,
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
