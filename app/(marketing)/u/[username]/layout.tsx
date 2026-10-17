import type React from "react"

import { loadShopThemePreset } from "@/lib/commerce/creator-page-data"
import { STORELIB_CURRENCY } from "@/lib/pricing/surface-currency"
import { PriceCurrency } from "@/components/platform/price-currency"
import { getThemeSkeletonColors } from "@/lib/theme-skeleton-colors"
import { isDarkScheme } from "@/lib/store-builder/scheme-tone"
import { storefrontPageBackground } from "@/lib/store-builder/page-surface"
import type { ThemePreset } from "@/lib/store-builder/types"

interface ShopLayoutProps {
  children: React.ReactNode
  params: Promise<{ username: string }>
}

/**
 * ===========================================================================
 *  THE SKELETON'S COLOURS, AND NOTHING ELSE
 * ===========================================================================
 * This used to run three SEQUENTIAL queries of its own — profiles, then
 * creators, then store_builder_configs — to pick those colours.
 *
 * A layout is not inside the page's Suspense boundary, so nothing renders
 * until it resolves, the loading skeleton included. Pressing a creator's name
 * therefore bought three round trips of blank screen BEFORE the skeleton
 * appeared, and the page underneath then fetched the same three rows again
 * for itself. That is the "it goes to a skeleton and sticks there".
 *
 * The lookup was never the mistake — a light skeleton on a dark scheme is a
 * white flash on every navigation, so the theme really is needed here.
 * Paying for it twice, in series, ahead of everything else was. The loaders
 * are deduped per request and shared between requests; see
 * lib/commerce/creator-page-data.
 */
export default async function ShopLayout({ children, params }: ShopLayoutProps) {
  const { username } = await params

  let themePreset: ThemePreset = "default"
  try {
    themePreset = (await loadShopThemePreset(username)) as ThemePreset
  } catch (error) {
    /* A creator page with a default-coloured skeleton is fine. A creator page
       that does not render because its skeleton could not be tinted is not. */
    console.error("[shop-layout] theme preset lookup failed", error)
  }

  const colors = getThemeSkeletonColors(themePreset)

  return (
    <div
      style={{
        // CSS custom properties the loading skeleton reads.
        /* The page's own rule for its colour: a preset's white means nobody
           chose, and the page is then its light grey, so loading and loaded
           are the same colour rather than white turning grey. */
        "--skeleton-bg": storefrontPageBackground(colors.backgroundColor),
        "--skeleton-color": colors.skeletonColor || "#e5e7eb",
        "--skeleton-text": colors.textColor,
        "--skeleton-border": isDarkScheme(themePreset) ? "#2a2a2a" : "#e5e7eb",
        "--skeleton-card-bg": isDarkScheme(themePreset) ? (colors.skeletonColor ?? "#1a1a1a") : colors.backgroundColor,
      } as React.CSSProperties}
    >
      {/* A creator page is Storelib's page, not the creator's website: its prices
          are Storelib's currency whatever the store sells in on its own site
          (lib/pricing/surface-currency). */}
      <PriceCurrency currency={STORELIB_CURRENCY}>{children}</PriceCurrency>
    </div>
  )
}
