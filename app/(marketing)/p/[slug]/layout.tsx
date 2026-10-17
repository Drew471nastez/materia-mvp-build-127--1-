import type React from "react"
import { loadProductBySlug, loadStoreConfig } from "@/lib/commerce/product-page-data"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import type { ThemePreset } from "@/lib/store-builder/types"
import { STORELIB_CURRENCY } from "@/lib/pricing/surface-currency"
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
  /*
    A THING THAT SHIPS IS THE ONE EXCEPTION. Everything else on this page is
    priced in Storelib's currency, because Storelib's own checkout takes it
    (lib/pricing/surface-currency). A thing that ships can only be bought
    through the shipped checkout, and that one prices the shipping rates, the
    local delivery and the cash on delivery fee in the currency the store
    chose, so it charges that currency wherever the buyer came from. The page
    says what will actually be taken rather than a tidier symbol.
  */
  let shipsIn: string | null = null

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
      const ships = (product as { type?: string | null }).type === "physical"
      const [config, sells] = await Promise.all([
        loadStoreConfig(product.creator_id, "product"),
        ships ? cachedStoreCurrency(product.creator_id) : Promise.resolve(null),
      ])
      themePreset = config?.published_config?.globalSettings?.themePreset || "default"
      shipsIn = sells
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
      {/* A product page on storelib.com is Storelib's page: its prices are
          Storelib's currency, not the store's website currency
          (lib/pricing/surface-currency), unless it ships (above). */}
      <PriceCurrency currency={shipsIn ?? STORELIB_CURRENCY}>{children}</PriceCurrency>
    </div>
  )
}
