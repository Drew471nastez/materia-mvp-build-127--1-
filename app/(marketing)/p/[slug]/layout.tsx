import type React from "react"
import { productPriceCurrency } from "@/lib/money/product-currency"
import { loadProductBySlug, loadStoreConfig } from "@/lib/commerce/product-page-data"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import type { ThemePreset } from "@/lib/store-builder/types"
import { cachedStoreCurrency } from "@/lib/store/selling-currency-server"
import { MarketplaceQuote, PriceCurrency } from "@/components/platform/price-currency"
import { productPageQuote } from "@/lib/money/marketplace-server"

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
  /* On the marketplace in US dollars (lib/money/marketplace): the Buy links carry the rate day. */
  let quote: { active: boolean; fxAsOf: string | null } = { active: false, fxAsOf: null }

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
      /* The currency this product's price is in: the store's, or dollars for a membership or community plan (lib/money/product-currency). */
      currency = productPriceCurrency(product, sells)
      /* A product page on Storelib is the marketplace: in dollars once its store is switched over, or waiting for a rate. */
      const q = await productPageQuote(product, currency)
      currency = q.currency
      quote = { active: q.marketplace || q.paused, fxAsOf: q.fxAsOf }
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
      <PriceCurrency currency={currency}>
        <MarketplaceQuote active={quote.active} fxAsOf={quote.fxAsOf}>{children}</MarketplaceQuote>
      </PriceCurrency>
    </div>
  )
}
