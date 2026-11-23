import type React from "react"

import { MarketplaceHeader } from "@/components/themes/marketplace-header"
import { MarketplaceFooter } from "@/components/themes/marketplace-shell"
import { THEME_SEO_CATEGORIES, marketplaceCategoryCopy } from "@/lib/themes/theme-seo"

/**
 * Every page under /themes: the marketplace's own bar, the page, its black
 * footer (marketplace round 23). The site's header is not drawn here
 * (components/marketing/conditional-header.tsx, isThemeStore) and the site's
 * footer never was, so this is the one header and the one footer. A layout,
 * so moving between the grid, a category and a template keeps the bar where
 * it is rather than drawing it again.
 */
export default function ThemesLayout({ children }: { children: React.ReactNode }) {
  const categories = THEME_SEO_CATEGORIES.map(marketplaceCategoryCopy)
  return (
    <div className="flex min-h-svh flex-col bg-white" data-market-frame="">
      <MarketplaceHeader />
      <div className="flex-1">{children}</div>
      <MarketplaceFooter categories={categories} />
    </div>
  )
}
