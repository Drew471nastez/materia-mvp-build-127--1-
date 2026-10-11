/**
 * Round 23 storefront probe pages, for scripts/check-storefront23.ts: the
 * real components with a fixture shop, every /api request answered here.
 *
 *   ?view=product   Storelib's product section as the live product page
 *                   draws it (the default product page's blocks, Delivery
 *                   and pickup among them, with `_product_data` as the server
 *                   fills it), and the cart page under it, with Website
 *                   settings › Commerce's returns line on.
 *   ?view=domains&state=none|pending|live|two
 *                   Website settings › Domains, open, with the domains the
 *                   route would list in that state.
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { CartPageBody } from "@/components/website-builder/cart-page-body"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { ProjectSettings } from "@/components/website-builder/project-settings"
import { mainProductSection } from "@/lib/website-builder/product-page"
import { siteCommerce } from "@/lib/website-builder/site-commerce"
import type { ProductSectionData } from "@/lib/products/product-page-model"
import type { SettingsSection } from "@/components/website-builder/website-settings/types"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const q = new URLSearchParams(location.search)
const SHOP = "c0000000-0000-4000-8000-000000000001"
const pic = (fill: string) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><rect width="800" height="1000" fill="${fill}"/></svg>`)

declare global {
  interface Window {
    __calls?: string[]
  }
}

function stubFetch(domains: unknown[]) {
  const calls: string[] = (window.__calls = [])
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }))
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push(`${init?.method ?? "GET"} ${url}`)
    if (url.startsWith("/api/physical/storefront/shop")) return json({ returns: { enabled: true, windowDays: 30 }, freeShippingFromCents: 7500 })
    if (url === "/api/domains/verify") return json({ verified: false, message: "The records are not showing yet.", checks: [] })
    if (url.startsWith("/api/domains")) return json({ domains })
    if (url.startsWith("/api/coupons")) return json({ error: "No code" }, 404)
    return json({})
  }) as typeof fetch
}

/* ── The product page and the cart ───────────────────────────────────── */

const product: ProductSectionData = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Posture shirt",
  slug: "posture-shirt",
  type: "physical",
  description: "<p>Breathable cotton with a support panel across the back.</p>",
  description_html: "<p>Breathable cotton with a support panel across the back.</p>",
  price_cents: 4900,
  compare_at_cents: 6900,
  thumbnail_url: pic("#c9d3cf"),
  gallery_urls: [pic("#c9d3cf"), pic("#9fb0aa")],
  options: [{ name: "Size", values: ["Small", "Medium", "Large"] }],
  variants: [
    { id: "20000000-0000-4000-8000-000000000001", name: "Small", options: ["Small", null, null], price_cents: 4900, compare_at_cents: 6900, image_url: null, available: true, left: 3, max_quantity: 3, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
    { id: "20000000-0000-4000-8000-000000000002", name: "Medium", options: ["Medium", null, null], price_cents: 4900, compare_at_cents: 6900, image_url: null, available: true, left: null, max_quantity: 4, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
    { id: "20000000-0000-4000-8000-000000000003", name: "Large", options: ["Large", null, null], price_cents: 5200, compare_at_cents: null, image_url: null, available: false, left: null, max_quantity: 0, pay_what_you_want: false, pwyw_min_price_cents: null, pwyw_suggested_price_cents: null },
  ],
  inventory_left: null,
  low_stock_at: 5,
  created_at: "2026-01-01T00:00:00Z",
  delivery: {
    ship: { country: "PT", priceCents: 499, estimate: "3 to 5 business days", freeFromCents: 7500 },
    pickup: { "20000000-0000-4000-8000-000000000001": [{ name: "Main Street", city: "Lisbon", ready: "Usually ready in 24 hours" }] },
  },
}

const made = mainProductSection("main-product")
const section: SectionInstance = { ...made, settings: { ...made.settings, media_ratio: "portrait", _product_data: product } }
const theme: ThemeSettingsValues = { border_radius: 8, button_style: "rounded", cart_returns_note: true } as ThemeSettingsValues

function ProductView() {
  return (
    <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
      <StorefrontProvider value={{ creatorId: SHOP, commerce: siteCommerce(theme as Record<string, unknown>) }}>
        <SiteCartProvider shopId={SHOP} cartType="page">
          <header style={{ height: 56, display: "flex", alignItems: "center", padding: "0 20px", fontWeight: 600, borderBottom: "1px solid #eee", background: "#fff" }}>Posturex</header>
          <div className="@container" data-product-box="">
            <ProductSection section={section} theme={theme} />
          </div>
          <section data-cart-page="" style={{ borderTop: "1px solid #eee", padding: "24px 0 64px" }}>
            <CartPageBody palette={{ bg: "#ffffff", text: "#374151", heading: "#111827", border: "#e5e7eb", buttonBg: "#111827", buttonText: "#ffffff" }} radius={8} />
          </section>
        </SiteCartProvider>
      </StorefrontProvider>
    </PlatformSettingsProvider>
  )
}

/* ── Website settings › Domains ──────────────────────────────────────── */

const RECORDS = [
  { type: "A", name: "@", value: "216.198.79.1" },
  { type: "CNAME", name: "www", value: "domains.storelib.com" },
]
function domainsFor(state: string) {
  const pending = { id: "d1", domain: "posturex.com", status: "pending", ssl_status: null, purpose: "website", is_primary: true, host: "www.posturex.com", apex: true, records: RECORDS }
  const live = { ...pending, status: "active", ssl_status: "active", verified_at: "2026-10-01T10:00:00Z" }
  if (state === "pending") return [pending]
  if (state === "live") return [live]
  if (state === "securing") return [{ ...pending, status: "ssl_provisioning", ssl_status: "provisioning" }]
  if (state === "two") return [live, { ...pending, id: "d2", domain: "posturex.shop", host: "www.posturex.shop", is_primary: false, status: "active", ssl_status: "active" }]
  return []
}

function DomainsView() {
  return (
    <ProjectSettings
      open
      onClose={() => {}}
      installId="install-1"
      name="Posturex"
      onRenamed={() => {}}
      websiteUrl="https://posturex.storelib.com"
      websiteUrlDisplay="posturex.storelib.com"
      onAddressChanged={() => {}}
      live
      publishedAt="2026-10-01T09:30:00Z"
      initialSection={"domains" as SettingsSection}
      settings={{}}
      onSettingChange={() => {}}
      pages={[{ key: "home", name: "Home", path: "/" }]}
      productCount={2}
      onUnpublished={() => {}}
      onNavigate={(href) => window.__calls?.push(`navigate ${href}`)}
    />
  )
}

export function boot(mount: (el: React.ReactElement) => void) {
  const view = q.get("view") ?? "product"
  stubFetch(domainsFor(q.get("state") ?? "none"))
  mount(view === "domains" ? <DomainsView /> : <ProductView />)
}

if (!(window as unknown as { __noBoot?: boolean }).__noBoot) {
  const root = createRoot(document.getElementById("root")!)
  boot((el) => root.render(el))
}
