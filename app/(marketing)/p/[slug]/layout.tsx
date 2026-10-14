import type React from "react"
import { loadProductBySlug, loadStoreConfig } from "@/lib/commerce/product-page-data"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import type { ThemePreset } from "@/lib/store-builder/types"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { PriceCurrency } from "@/components/platform/price-currency"

interface ProductLayoutProps {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function ProductLayout({ children, params }: ProductLayoutProps) {
  const { slug } = await params

  // Quick query to get just the theme preset for skeleton loading
  let themePreset: ThemePreset = "default"
  /* The currency its store sells in: every price on the page is in it (components/platform/price-currency). */
  let currency: string | null = null

  try {
    /*
      THE SAME TWO ROWS THE PAGE IS ABOUT TO ASK FOR. These were this file's
      own queries, so a product page fetched its product row here and again in
      generateMetadata and again in the page. The loaders are request-scoped,
      so whichever of the three runs first pays and the other two are free.
      lib/commerce/product-page-data.ts.
    */
    const { product } = await loadProductBySlug(slug)

    if (product?.creator_id) {
      const [config, sells] = await Promise.all([loadStoreConfig(product.creator_id, "product"), cachedStoreCurrency(product.creator_id)])
      themePreset = config?.published_config?.globalSettings?.themePreset || "default"
      currency = sells
    }
  } catch (error) {
    // Silently fall back to default theme on error
    console.error("Error fetching theme preset:", error)
  }

  const colors = getThemeSkeletonColors(themePreset)

  return (
    <div
      style={{
        // Set CSS custom properties for skeleton loading
        "--skeleton-bg": colors.backgroundColor,
        "--skeleton-color": colors.skeletonColor || "#e5e7eb",
        "--skeleton-text": colors.textColor,
        "--skeleton-border": isDarkScheme(themePreset) ? "#2a2a2a" : "#e5e7eb",
        "--skeleton-card-bg": isDarkScheme(themePreset) ? (colors.skeletonColor ?? "#1a1a1a") : colors.backgroundColor,
      } as React.CSSProperties}
    >
      <PriceCurrency currency={currency}>{children}</PriceCurrency>
    </div>
  )
}
