/**
 * ===========================================================================
 *  STORELIB'S OWN SCREENS, WITH MADE UP CONTENT, FOR THE FRONT PAGE HERO
 * ===========================================================================
 * Served by scripts/hero-shots.mjs, which photographs each one for the hero's
 * slider and its backdrop (public/marketing/hero/). Every screen is the real
 * component a visitor or a creator sees; only the content is invented: one
 * made up creator, Juniper Studio, and its made up products, with pictures
 * the script draws itself (/demo/*.png). No real creator's name, page or
 * photo is in any of them.
 *
 *   ?shot=store       a website on Storelib's default theme: header, hero, products
 *   ?shot=product     that website's product page
 *   ?shot=onepage     a one page link in bio, &theme=<OnePage theme id>
 *   ?shot=creator     a creator page: header, tabs, product cards, footer
 *   ?shot=dashboard   the /app home a creator lands on, beside the sidebar
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { ProductSection } from "@/components/website-builder/sections/renderers/ProductSection"
import { PlatformSettingsProvider } from "@/components/platform/platform-settings-context"
import { mainProductSection } from "@/lib/website-builder/product-page"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { ProductSectionData } from "@/lib/products/product-page-model"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"
import { publicOnePage } from "@/lib/onepage/public-shape"
import { ShopHeaderRenderer } from "@/components/store-builder/section-renderer"
import { StorefrontTabs } from "@/components/storefront/storefront-tabs"
import { StorefrontProductCard } from "@/components/storefront/storefront-product-card"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { resolveStorefrontChrome, cardAccents } from "@/lib/store-builder/storefront-chrome"
import { defaultShopHeaderSettings, themePresets } from "@/lib/store-builder/defaults"
import type { ShopHeaderSettings } from "@/lib/store-builder/types"
import { DashboardClient } from "@/components/app/dashboard-client"
import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA, type NavItemData } from "@/components/app/sidebar-desktop-nav"
import { LanguageProvider } from "@/lib/i18n/context"
import { NO_FACTS } from "@/lib/home/progress"
import { StorelibLogo } from "@/components/brand/storelib-logo"

const q = new URLSearchParams(location.search)
const shot = q.get("shot") ?? "store"
const pic = (name: string) => `${location.origin}/demo/${name}.png`

/** The made up shop. Prices in cents. */
const PRODUCTS = [
  { id: "10000000-0000-4000-8000-000000000001", slug: "film-presets", title: "Film Presets Vol. 2", price: 2400, compare: 3200, image: "presets", kind: "Digital" },
  { id: "10000000-0000-4000-8000-000000000002", slug: "weekly-planner", title: "Weekly Planner for Notion", price: 1200, compare: null, image: "planner", kind: "Template" },
  { id: "10000000-0000-4000-8000-000000000003", slug: "watercolor-brushes", title: "Watercolor Brush Set", price: 1800, compare: null, image: "brushes", kind: "Digital" },
  { id: "10000000-0000-4000-8000-000000000004", slug: "sourdough-at-home", title: "Sourdough at Home", price: 1500, compare: null, image: "ebook", kind: "Ebook" },
  { id: "10000000-0000-4000-8000-000000000005", slug: "alpine-poster-pack", title: "Alpine Poster Pack", price: 2900, compare: 3900, image: "posters", kind: "Print" },
  { id: "10000000-0000-4000-8000-000000000006", slug: "mobile-editing-course", title: "Mobile Editing Course", price: 4900, compare: null, image: "course", kind: "Course" },
]
const money = (c: number) => `$${(c / 100).toFixed(2)}`
const STUDIO = "Juniper Studio"

const themeDefaults = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues
/* No entrance animation in a photograph. */
const theme = { ...themeDefaults, animations_enabled: false } as unknown as ThemeSettingsValues

const preset = (type: string) => STORELIB_SCHEMAS[type]?.presets?.[0]
const section = (id: string, type: string, settings: Record<string, unknown>, blocks?: SectionInstance["blocks"]): SectionInstance =>
  ({ id, type, name: type, settings: { ...(preset(type)?.settings ?? {}), ...settings }, blocks: blocks ?? ((preset(type)?.blocks ?? []) as SectionInstance["blocks"]) }) as SectionInstance

const header = section("hdr", "header", { logo_text: STUDIO, header_sticky: false }, [
  { id: "n1", type: "nav_link", settings: { label: "Shop", url: "/shop" } },
  { id: "n2", type: "nav_link", settings: { label: "Presets", url: "/presets" } },
  { id: "n3", type: "nav_link", settings: { label: "About", url: "/about" } },
] as SectionInstance["blocks"])

const cards = PRODUCTS.map((p) => ({
  id: p.id,
  type: "product",
  settings: { title: p.title, price: money(p.price), compare_price: p.compare ? money(p.compare) : "", image: pic(p.image), url: `/products/${p.slug}`, tag: p.compare ? "Sale" : "" },
}))

/**
 * The page's own sections drawn by the theme engine, as the builder's canvas
 * and the published page draw them (renderStorelibSection with the shop's
 * products); the header and footer by ThemePage around them.
 */
function Store() {
  const body = [
    section("hero", "hero_split", { heading: "Presets and planners for slow, careful work", subheading: "Made in a small studio. Instant download, yours to keep.", image: pic("hero") }),
    section("grid", "product_grid", { heading: "New in the shop" }),
  ].map((s) => ({ s, r: renderStorelibSection(s, theme, { template: "index" }, undefined, cards) }))
  return (
    <div data-snapshot-stage="">
      <StorelibLiveProvider sources={{}} inEditor={false} products={cards}>
        <SiteCartProvider shopId={undefined}>
          <ThemePage theme={theme} sections={[header, section("ftr", "footer", { logo_text: STUDIO, tagline: "Presets, planners and prints from a small studio." })]} storefront={{}}>
            {body.map(({ s, r }) => (r.ok ? (
              <div key={s.id} id={`section-${s.id}`}>
                <style dangerouslySetInnerHTML={{ __html: r.css }} />
                <div dangerouslySetInnerHTML={{ __html: r.html }} />
              </div>
            ) : <pre key={s.id}>{JSON.stringify(r)}</pre>))}
          </ThemePage>
        </SiteCartProvider>
      </StorelibLiveProvider>
    </div>
  )
}

function Product() {
  const p = PRODUCTS[0]
  const data: ProductSectionData = {
    id: p.id,
    title: p.title,
    slug: p.slug,
    type: "digital",
    description: "<p>Twelve presets for warm, grainy film tones. Lightroom desktop and mobile.</p>",
    description_html: "<p>Twelve presets for warm, grainy film tones. Lightroom desktop and mobile.</p>",
    price_cents: p.price,
    compare_at_cents: p.compare,
    thumbnail_url: pic(p.image),
    gallery_urls: [pic(p.image), pic("presets-2"), pic("presets-3")],
    options: [],
    variants: [],
    inventory_left: null,
    created_at: new Date().toISOString(),
  } as unknown as ProductSectionData
  const made = mainProductSection("main-product")
  const main: SectionInstance = {
    ...made,
    settings: { ...made.settings, multiple_images_layout: "stacked", image_width: "55%", sticky_info: false, media_ratio: "square", _product_data: data },
    blocks: [
      ...(made.blocks ?? []),
      { id: "tab-1", type: "collapsible_tab", settings: { heading: "What you get", content: "<p>12 presets, a short guide and free updates.</p>", margin_bottom: 0 } },
    ],
  }
  return (
    <div data-snapshot-stage="">
      <StorelibLiveProvider sources={{}} inEditor={false} products={cards}>
        <SiteCartProvider shopId={undefined}>
          <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
            <ThemePage theme={theme} sections={[header]} storefront={{}}>
              <div className="@container" style={{ background: "#fff" }}>
                <ProductSection section={main} theme={theme} />
              </div>
            </ThemePage>
          </PlatformSettingsProvider>
        </SiteCartProvider>
      </StorelibLiveProvider>
    </div>
  )
}

function OnePageShot() {
  const id = q.get("theme") || "default"
  const template = THEME_TEMPLATES.find((t) => t.id === id)
  const opTheme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" } as OnePage["theme"]
  let order = 0
  const b = (type: string, data: Record<string, unknown>) => ({ id: `${type}_${order}`, type, enabled: true, sort_order: order++, data }) as never
  const blocks = [
    b("header", { show_avatar: true, show_name: true, show_bio: true }),
    b("link_button", { label: "Shop the presets", url: "https://example.com/shop" }),
    b("product", { product_id: PRODUCTS[0].id, show_price: true, show_description: true, cta_text: "Buy now", style: "callout", product_title: PRODUCTS[0].title, product_thumbnail: pic(PRODUCTS[0].image), product_description: "Twelve warm film tones", product_price_cents: PRODUCTS[0].price, product_slug: PRODUCTS[0].slug }),
    b("link_button", { label: "Free planner sample", url: "https://example.com/sample", thumbnail_url: pic("planner") }),
    b("link_button", { label: "Watch the studio vlog", url: "https://example.com/vlog", thumbnail_url: pic("course") }),
    b("social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/" }, { platform: "tiktok", url: "https://tiktok.com/" }, { platform: "youtube", url: "https://youtube.com/" }], style: "icons" }),
    b("email_capture", { headline: "The studio letter", description: "One email, every other Sunday", placeholder: "Your email", button_text: "Subscribe", success_message: "Thanks" }),
  ]
  const page = {
    id: "op_demo", owner_id: "demo", slug: "juniper", title: STUDIO, bio: "Presets, planners and prints",
    avatar_url: pic("avatar"), theme: opTheme, settings: { ...defaultSettings }, seller_id: "seller_demo",
    social_links: {}, draft_blocks: blocks, status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
  } as unknown as OnePage
  const shape = publicOnePage(page as never, { source: "published" })
  return <PublicOnePage onepage={shape as never} />
}

function Creator() {
  const scheme = q.get("scheme") || "default"
  const settings = {
    ...defaultShopHeaderSettings,
    coverImageUrl: pic("cover"),
    avatarUrl: pic("avatar"),
    bio: "Presets, planners and prints from a small studio",
    showBio: true,
    showStats: true,
    socialLinks: { ...defaultShopHeaderSettings.socialLinks, instagram: { enabled: true, url: "https://instagram.com/" }, youtube: { enabled: true, url: "https://youtube.com/" } },
  } as unknown as ShopHeaderSettings
  const chrome = resolveStorefrontChrome(scheme as never, { pageBackground: undefined, text: undefined, bar: { backgroundColor: "#ffffff", textColor: "#000000", buttonColor: "#2563eb", buttonTextColor: "#ffffff" } } as never)
  const t = themePresets[scheme as keyof typeof themePresets] ?? themePresets.default
  const surface = { backgroundColor: t.productCard.backgroundColor, borderColor: t.productCard.borderColor, textColor: t.productCard.textColor, priceColor: t.productCard.priceColor, ...cardAccents(t.productCard.backgroundColor, t.productCard.textColor) }
  const products = PRODUCTS.map((p, i) => ({ id: p.id, slug: p.slug, title: p.title, thumbnail_url: pic(p.image), price_cents: p.price, compare_at_cents: p.compare, type: "digital", categories: [{ name: p.kind }], reviews_count: [12, 4, 7, 9, 3, 15][i], reviews_average: [4.9, 4.8, 5, 4.7, 4.9, 4.8][i] }))
  const grid = (
    <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-4 px-4 py-6 md:grid-cols-3">
      {products.map((p, i) => <StorefrontProductCard key={p.id} product={p as never} creatorName={STUDIO} creatorUsername="juniper" priority={i < 3} surface={surface} />)}
    </div>
  )
  return (
    <div style={{ background: chrome.pageBackground, color: chrome.text, minHeight: "100vh", ...(chrome.tokens as React.CSSProperties) }}>
      <ShopHeaderRenderer settings={settings} profile={{ id: "p1", display_name: STUDIO, username: "juniper", avatar_url: pic("avatar"), created_at: "2025-03-01" } as never} creator={{ id: "c1", bio: "Presets, planners and prints from a small studio" } as never} products={[]} productCount={products.length} surface={{ textColor: chrome.text, mutedColor: chrome.muted }} />
      <StorefrontTabs tabs={[{ id: "products", label: "Products", panel: grid }, { id: "about", label: "About", panel: <div /> }]} surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }} />
      <SellerFooter surface={{ backgroundColor: chrome.footerBackground, textColor: chrome.footerText, mutedColor: chrome.footerMuted, borderColor: chrome.border }} />
    </div>
  )
}

const RAIL: NavItemData[] = [
  { href: "/app", label: "Dashboard", icon: NAV_ICONS.dashboard },
  { href: "/app/products", label: "Products", icon: NAV_ICONS.products },
  { href: "/app/analytics", label: "Analytics", icon: NAV_ICONS.analytics },
  { href: "/app/orders", label: "Orders", icon: NAV_ICONS.orders },
  { href: "/app/website-builder", label: "Website", icon: NAV_ICONS.websiteBuilder },
  { href: "/app/emails", label: "Emails", icon: NAV_ICONS.emails },
  { href: "/app/payouts", label: "Payouts", icon: NAV_ICONS.payouts },
  { href: "/app/integrations", label: "Integrations", icon: NAV_ICONS_EXTRA.integrations },
]

function Dashboard() {
  const orders = Array.from({ length: 14 }, (_, i) => ({
    id: `order-${i}`, product_id: PRODUCTS[i % PRODUCTS.length].id, amount_cents: PRODUCTS[i % PRODUCTS.length].price, status: "paid",
    created_at: new Date(Date.now() - Math.floor(i / 2) * 86400000).toISOString(), stripe_session_id: `cs_${i}`, refund_amount_cents: 0,
  }))
  const props = {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "June",
    initialProgress: { ...NO_FACTS, products: 6, publishedProducts: 6, guideOpened: true },
    productIds: PRODUCTS.map((p) => p.id),
    initialOrders: orders,
    creatorHandle: "juniper",
    connectedDomain: null,
    websitePublished: true,
    subscriptionPlanId: "pro",
  } as unknown as React.ComponentProps<typeof DashboardClient>
  return (
    <LanguageProvider>
      <div className="min-h-svh bg-[#111111]">
        <header className="fixed inset-x-0 top-0 z-50 flex h-[58px] items-center gap-2 bg-[#111111] px-5">
          <StorelibLogo size={28} />
          <span className="text-[17px] font-semibold text-white">Storelib</span>
        </header>
        <aside className="fixed left-0 top-[58px] z-40 hidden h-[calc(100svh-58px)] w-[240px] border-r border-neutral-200/60 bg-white md:block">
          <DesktopSidebarContent items={RAIL} expandedGroups={new Set()} onToggle={() => {}} onForceNavigate={() => {}} settingsLabel="Settings" upgradeTitle="Pro plan" upgradeSubtitle="Your plan" />
        </aside>
        <main className="min-h-svh bg-[#f8f9fa] pt-[58px] md:pl-[240px]">
          <DashboardClient {...props} />
        </main>
      </div>
    </LanguageProvider>
  )
}

const SHOTS: Record<string, () => React.ReactElement> = { store: Store, product: Product, onepage: OnePageShot, creator: Creator, dashboard: Dashboard }
const Shot = SHOTS[shot] ?? Store
createRoot(document.getElementById("app")!).render(<Shot />)
;(window as unknown as { __ready: boolean }).__ready = true
