/**
 * The Storelib logo, mounted for real: the shared component at every size a
 * page draws it, and the surfaces that carry it, in the real stylesheet.
 * Bundled and measured by scripts/check-storelib-logo.mjs.
 */
import { createRoot } from "react-dom/client"
import type { ReactNode } from "react"

import { StorelibLogo } from "@/components/brand/storelib-logo"
import { MarketingFooter } from "@/components/marketing/footer"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { AuthLogo } from "@/components/auth/auth-logo"
import { CtaSection } from "@/components/marketing/cta-section"
import { ToolStackSection } from "@/components/marketing/tool-stack-section"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { PublicWishlistShell } from "@/components/wishlist/public-wishlist-shell"
import { ShellHeaderStill } from "@/components/app/shell-header-still"
import { OfflineGuard } from "@/components/app/offline-guard"

/* Every size the product draws the logo at (grep "<StorelibLogo size=", and
   HEADER_LOGO in components/platform/platform-header-client.tsx). The header
   sizes are 5% under what they were: 25.65, 30.4, 36.1, 39.9 and 41.8. */
export const SIZES = [12, 15, 16, 18, 24, 25.65, 28, 30.4, 31, 32, 34, 36.1, 37, 39.9, 40, 41.8, 46, 56, 68, 80]

const mount = (id: string, node: ReactNode) => {
  const el = document.getElementById(id)
  if (el) createRoot(el).render(node)
}

const row = (bg: string) => (
  <div style={{ display: "flex", alignItems: "center", gap: 18, padding: 20, background: bg, flexWrap: "wrap" }}>
    {SIZES.map((s) => (
      <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <StorelibLogo size={s} data-probe-size={String(s)} />
        <span style={{ font: "11px Inter, system-ui", color: bg === "#ffffff" ? "#6b7280" : "#a1a1aa" }}>{s}</span>
      </div>
    ))}
  </div>
)

mount("sizes-light", row("#ffffff"))
mount("sizes-dark", row("#131316"))
mount("marketing-footer", <MarketingFooter />)
mount("seller-footer", <SellerFooter />)
mount("seller-footer-phone", <SellerFooter isMobile />)
mount("auth", <AuthLogo />)
mount("cta", <CtaSection />)
mount("tool-stack", <ToolStackSection />)
mount("dashboard", <DashboardSidebar />)
mount("wishlist", <PublicWishlistShell />)
mount("still", <ShellHeaderStill name="Ana Pop Studio" photo={null} />)
mount("offline", <OfflineGuard><div style={{ height: 1 }} /></OfflineGuard>)
