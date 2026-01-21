"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { ThemePreset } from "@/lib/store-builder/types"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"

// Re-export for backwards compatibility
export { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"

interface PublicPageSkeletonProps {
  themePreset?: ThemePreset
  pageType: "product" | "shop"
}

// Product Page Skeleton - matches the preview canvas layout
export function ProductPageSkeleton({ themePreset = "default" }: { themePreset?: ThemePreset }) {
  const colors = getThemeSkeletonColors(themePreset)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.backgroundColor }}
    >
      {/* Creator Bar Skeleton */}
      <div
        className="h-14 border-b flex items-center justify-between px-4"
        style={{
          backgroundColor: themePreset === "astrid" ? "#1a1a1a" : colors.backgroundColor,
          borderColor: themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb"
        }}
      >
        <div className="flex items-center gap-3">
          <Skeleton themePreset={themePreset} className="h-8 w-8 rounded-full" />
          <Skeleton themePreset={themePreset} className="h-4 w-24" />
        </div>
        <Skeleton themePreset={themePreset} className="h-8 w-24 rounded-lg" />
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-[1200px] px-3 sm:px-4 lg:px-6 py-6 sm:py-12">
        <div className="grid gap-8 lg:grid-cols-5 lg:gap-12 lg:items-start">
          {/* Left: Gallery (3 cols) */}
          <div className="lg:col-span-3 space-y-4">
            <Skeleton themePreset={themePreset} className="aspect-video w-full rounded-xl" />
            <div className="flex gap-2">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} themePreset={themePreset} className="h-16 w-16 rounded-lg" />
              ))}
            </div>

            {/* Title and creator */}
            <div className="mt-6 space-y-4">
              <Skeleton themePreset={themePreset} className="h-8 w-3/4" />
              <div className="flex items-center gap-3">
                <Skeleton themePreset={themePreset} className="h-10 w-10 rounded-full" />
                <Skeleton themePreset={themePreset} className="h-5 w-32" />
              </div>
            </div>

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

          {/* Right: Price Card (2 cols) - Desktop only */}
          <div className="hidden lg:block lg:col-span-2">
            <div
              className="sticky top-6 rounded-xl border p-6 space-y-4"
              style={{
                backgroundColor: themePreset === "astrid" ? "#1a1a1a" : colors.backgroundColor,
                borderColor: themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb"
              }}
            >
              <Skeleton themePreset={themePreset} className="h-10 w-24" />
              <Skeleton themePreset={themePreset} className="h-12 w-full rounded-lg" />
              <Skeleton themePreset={themePreset} className="h-10 w-full rounded-lg" />
              <div className="pt-4 border-t space-y-3" style={{ borderColor: themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb" }}>
                <Skeleton themePreset={themePreset} className="h-5 w-32" />
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton themePreset={themePreset} className="h-4 w-4" />
                    <Skeleton themePreset={themePreset} className="h-4 w-32" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* More From Seller Section */}
      <div
        className="py-12 px-4"
        style={{ backgroundColor: themePreset === "astrid" ? "#0a0a0a" : colors.backgroundColor }}
      >
        <div className="max-w-6xl mx-auto">
          <Skeleton themePreset={themePreset} className="h-8 w-48 mb-8" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton themePreset={themePreset} className="aspect-video w-full rounded-lg" />
                <Skeleton themePreset={themePreset} className="h-4 w-3/4" />
                <Skeleton themePreset={themePreset} className="h-5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Shop/Homepage Skeleton - matches the preview canvas layout
export function ShopPageSkeleton({ themePreset = "default" }: { themePreset?: ThemePreset }) {
  const colors = getThemeSkeletonColors(themePreset)

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: colors.backgroundColor }}
    >
      {/* Subscribe Bar Skeleton */}
      <div
        className="py-3 px-4 flex items-center justify-center gap-4"
        style={{
          backgroundColor: themePreset === "astrid" ? "#1a1a1a" : colors.backgroundColor,
          borderBottom: `1px solid ${themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb"}`
        }}
      >
        <Skeleton themePreset={themePreset} className="h-8 w-8 rounded-full" />
        <Skeleton themePreset={themePreset} className="h-4 w-48" />
        <Skeleton themePreset={themePreset} className="h-10 w-48 rounded-lg" />
        <Skeleton themePreset={themePreset} className="h-10 w-24 rounded-lg" />
      </div>

      {/* Cover Image Skeleton */}
      <Skeleton themePreset={themePreset} className="h-48 sm:h-64 w-full" />

      {/* Header Section */}
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
        <div className="flex flex-col items-center text-center">
          <Skeleton themePreset={themePreset} className="h-24 w-24 rounded-full -mt-12" />
          <Skeleton themePreset={themePreset} className="mt-4 h-8 w-48" />
          <Skeleton themePreset={themePreset} className="mt-2 h-4 w-64" />
          <div className="mt-4 flex gap-2">
            <Skeleton themePreset={themePreset} className="h-6 w-20 rounded-full" />
            <Skeleton themePreset={themePreset} className="h-6 w-20 rounded-full" />
            <Skeleton themePreset={themePreset} className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton themePreset={themePreset} className="mt-6 h-16 w-full max-w-xl" />
          <div className="mt-6 flex gap-8">
            <Skeleton themePreset={themePreset} className="h-4 w-24" />
            <Skeleton themePreset={themePreset} className="h-4 w-24" />
          </div>
        </div>
      </div>

      {/* Featured Products Section */}
      <div
        className="py-12 px-4"
        style={{ backgroundColor: themePreset === "astrid" ? "#0a0a0a" : colors.backgroundColor }}
      >
        <div className="max-w-6xl mx-auto">
          <Skeleton themePreset={themePreset} className="h-8 w-48 mb-4" />
          <Skeleton themePreset={themePreset} className="h-4 w-64 mb-8" />

          {/* Category Filter */}
          <div className="flex gap-3 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} themePreset={themePreset} className="h-8 w-20 rounded-full" />
            ))}
          </div>

          {/* Products Grid */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: themePreset === "astrid" ? "#1a1a1a" : colors.backgroundColor,
                  borderColor: themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb"
                }}
              >
                <Skeleton themePreset={themePreset} className="aspect-video w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton themePreset={themePreset} className="h-5 w-3/4" />
                  <Skeleton themePreset={themePreset} className="h-4 w-1/2" />
                  <Skeleton themePreset={themePreset} className="h-6 w-20 mt-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* About Section Skeleton */}
      <div
        className="py-12 px-4"
        style={{ backgroundColor: themePreset === "astrid" ? "#0a0a0a" : colors.backgroundColor }}
      >
        <div className="max-w-4xl mx-auto text-center">
          <Skeleton themePreset={themePreset} className="h-8 w-32 mx-auto mb-6" />
          <Skeleton themePreset={themePreset} className="h-20 w-20 rounded-full mx-auto mb-4" />
          <Skeleton themePreset={themePreset} className="h-6 w-48 mx-auto mb-2" />
          <Skeleton themePreset={themePreset} className="h-4 w-64 mx-auto mb-4" />
          <Skeleton themePreset={themePreset} className="h-16 w-full max-w-md mx-auto" />
        </div>
      </div>

      {/* Footer Skeleton */}
      <div
        className="py-8 px-4 border-t"
        style={{
          backgroundColor: themePreset === "astrid" ? "#0a0a0a" : colors.backgroundColor,
          borderColor: themePreset === "astrid" ? "#2a2a2a" : "#e5e7eb"
        }}
      >
        <div className="max-w-6xl mx-auto flex justify-center">
          <Skeleton themePreset={themePreset} className="h-4 w-48" />
        </div>
      </div>
    </div>
  )
}

// Main component that selects the right skeleton based on page type
export function PublicPageSkeleton({ themePreset = "default", pageType }: PublicPageSkeletonProps) {
  if (pageType === "product") {
    return <ProductPageSkeleton themePreset={themePreset} />
  }
  return <ShopPageSkeleton themePreset={themePreset} />
}

// Re-export helper for backwards compatibility
export { getLoadingBackground } from "@/lib/theme-skeleton-colors"
