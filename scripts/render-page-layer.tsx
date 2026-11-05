/**
 * The two pages drawn as a layer over the shell (the plans page at every
 * width, the product editor on a phone only), through their real layouts:
 * the plans page (app/(storelib)/app/settings/billing/upgrade/layout.tsx around the real
 * UpgradePageClient) and the product editor (app/(storelib)/app/products/new/layout.tsx
 * and [id]/layout.tsx around the real ProductEditor). Around them, a shell
 * with the same boxes and classes as app/(storelib)/app/layout.tsx and the real
 * sidebar's chrome: the phone header and the desktop header (both
 * [data-shell-chrome], z 50, their height plus the safe-area inset), the rail,
 * and a nav pill at z 55. Bundled by scripts/check-page-layer.mjs.
 *
 *   ?page=plans | new | edit      which page
 *   ?history=1                    there is an /app page behind it
 *   ?capacitor=1                  html.capacitor, as the native shell sets it
 */
import React from "react"
import { createRoot } from "react-dom/client"

import UpgradeLayout from "@/app/(storelib)/app/settings/billing/upgrade/layout"
import NewProductLayout from "@/app/(storelib)/app/products/new/layout"
import EditProductLayout from "@/app/(storelib)/app/products/[id]/layout"
import { UpgradePageClient } from "@/components/app/billing/upgrade-page-client"
import { ProductEditor } from "@/app/(storelib)/app/products/new/product-editor"
import type { LoadedProduct } from "@/app/(storelib)/app/products/new/editor-form"
import { markLanded } from "@/lib/ui/app-navigation"

const q = new URLSearchParams(location.search)
if (q.has("history")) markLanded()
if (q.has("capacitor")) document.documentElement.classList.add("capacitor")
const which = q.get("page") || "plans"

const plans = [
  { id: "free", name: "Free", price_cents: 0, billing_period: null },
  { id: "growth", name: "Growth", price_cents: 2990, billing_period: "month" },
  { id: "pro", name: "Pro", price_cents: 9900, billing_period: "month" },
]

const loaded: LoadedProduct = {
  product: {
    id: "8f0c2b1e-3a4d-4c5e-9f60-718293a4b5c6",
    creator_id: "c1",
    title: "Portrait retouching presets",
    description: "<p>Forty presets made on real client sessions.</p>".repeat(8),
    price_cents: 2900,
    compare_at_cents: null,
    slug: "portrait-presets",
    type: "digital",
    status: "published",
    show_sales_badge: false,
    refund_policy_enabled: false,
    refund_policy_type: "14_day",
    seo_title: null,
    seo_description: null,
    call_to_action: "Buy Now",
    category: "Photography",
    pay_what_you_want: false,
    thumbnail_url: null,
    gallery_urls: [],
    whats_included: ["40 presets"],
    faqs: [],
  },
  assets: [],
  variants: [],
} as unknown as LoadedProduct

const creator = { id: "c1", slug: "astrid", username: "astrid" }

function Page() {
  if (which === "new") return <NewProductLayout><ProductEditor creator={creator} loaded={null} /></NewProductLayout>
  if (which === "edit") return <EditProductLayout><ProductEditor creator={creator} loaded={loaded} /></EditProductLayout>
  return (
    <UpgradeLayout>
      <UpgradePageClient plans={plans} currentPlanId="free" hasActiveSubscription={false} />
    </UpgradeLayout>
  )
}

createRoot(document.getElementById("app")!).render(
  <div className="h-svh overflow-hidden bg-[#111111] md:bg-[#131316] app-no-scrollbar">
    {/* The shell's chrome, as components/app/sidebar.tsx draws it. */}
    <header data-shell-chrome="" data-desktop-header="" className="fixed left-0 right-0 top-0 z-50 hidden pt-[env(safe-area-inset-top,_0px)] md:block">
      <div className="h-[58px] bg-[#131316]" />
    </header>
    <header data-shell-chrome="" className="fixed left-0 right-0 top-0 z-50 bg-[#111111] md:hidden" style={{ height: "calc(68px + env(safe-area-inset-top, 0px))", transform: "translateZ(0)" }}>
      <div className="flex h-[68px] items-center px-4" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
        <span className="text-[13px] text-white/90">AndrewRullz</span>
      </div>
    </header>
    <aside data-shell-chrome="" data-rail="" className="fixed left-0 z-40 hidden w-[240px] bg-white md:flex" style={{ top: "calc(58px + env(safe-area-inset-top, 0px))", height: "calc(100svh - 58px - env(safe-area-inset-top, 0px))" }} />
    <div data-app-nav-pill="" className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] flex items-end justify-center md:hidden" style={{ paddingBottom: "max(4px, env(safe-area-inset-bottom, 0px))" }}>
      <button data-pill-tab="" className="pointer-events-auto mb-1.5 h-[58px] w-[300px] rounded-full bg-black" />
    </div>
    <main className="h-svh pt-[calc(68px_+_env(safe-area-inset-top,_0px))] md:pt-[calc(58px+env(safe-area-inset-top,_0px))] md:pl-[240px] bg-[#f8f9fa] md:bg-white rounded-t-[20px] md:rounded-none overflow-hidden app-main-content">
      <div className="h-[calc(100svh_-_68px_-_env(safe-area-inset-top,_0px))] md:h-[calc(100svh-58px-env(safe-area-inset-top,_0px))] overflow-y-auto app-content-scroll">
        <Page />
      </div>
    </main>
  </div>,
)
