import type React from "react"

import { MarketplaceHeader } from "@/components/themes/marketplace-header"
import { MarketingFooter } from "@/components/marketing/footer"

/**
 * Every page under /themes: the marketplace's own bar, the page, and
 * storelib.com's own footer (marketplace round 24, the owner: "the same
 * footer as the main site, not the custom black one"). The site's header is
 * not drawn here (components/marketing/conditional-header.tsx,
 * isThemeStore), and ConditionalFooter draws nothing on /themes (it is not
 * one of its platform pages), so this is the one header and the one footer.
 * The footer is drawn here rather than by ConditionalFooter so it is in the
 * server's HTML with the page, not added after hydration. A layout, so
 * moving between the grid, a category and a template keeps the bar where it
 * is rather than drawing it again.
 */
export default function ThemesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-white" data-market-frame="">
      <MarketplaceHeader />
      <div className="flex-1">{children}</div>
      <div className="relative isolate" data-market-footer="">
        <MarketingFooter />
      </div>
    </div>
  )
}
