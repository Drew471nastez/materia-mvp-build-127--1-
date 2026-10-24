/**
 * ===========================================================================
 *  STORELIB'S OWN SCREENS, AS DEMO STORES, FOR THE FRONT PAGE HERO
 * ===========================================================================
 * Served by scripts/hero-shots.mjs, which photographs each one for the hero's
 * slider and its backdrop (public/marketing/hero/). Every screen is the real
 * component a visitor or a creator sees, on Storelib's real theme with each
 * store's own theme settings (colours, fonts, buttons, announcement bar).
 * Only the content is invented: five made up brands, their made up products,
 * and pictures scripts/hero-demo-art.mjs draws (/demo/*.png). No real
 * creator's name, page or photo is in any of them.
 *
 *   ?shot=watch       Maison Verlaine, a watch atelier: a product page
 *   ?shot=pet         Marrow & Oat, dog food: the store's front page
 *   ?shot=meal        Fennel & Fig, meal kits: the store's front page
 *   ?shot=presets     Halcyon, Lightroom presets: the store's front page (a dark theme)
 *   ?shot=course      Wheel & Kiln, a pottery course: its landing page
 *   ?shot=onepage     Studio Arlo's link in bio, &theme=<OnePage theme id>
 *   ?shot=dashboard   Marrow & Oat's /app home, with a demo week of visits and orders
 *
 * THE DASHBOARD'S FIGURES ARE DEMO DATA. The probe answers the reports route
 * itself (fetch below) with a made up week counted by the real report code
 * (lib/analytics/reports buildReports): 1,284 visitors, 46 orders, $3,420.
 * Modest on purpose, the size of a small store's good week. They appear in
 * this picture only, never as a figure about Storelib.
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
import { DashboardClient } from "@/components/app/dashboard-client"
import { DesktopSidebarContent, NAV_ICONS, NAV_ICONS_EXTRA, type NavItemData } from "@/components/app/sidebar-desktop-nav"
import { LanguageProvider } from "@/lib/i18n/context"
import { NO_FACTS } from "@/lib/home/progress"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import { buildReports, type ViewRow } from "@/lib/analytics/reports"
import type { OrderRow } from "@/lib/orders/order-view"

const q = new URLSearchParams(location.search)
const shot = q.get("shot") ?? "watch"
const pic = (name: string) => `${location.origin}/demo/${name}.png`
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`

/* ── The theme, per brand ───────────────────────────────────────────────── */

const themeDefaults = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as Record<string, unknown>

type Palette = { bg: string; bg2: string; text: string; muted: string; heading: string; accent: string; border: string; button: string; buttonText: string }
const scheme = (p: Palette) => ({
  background: p.bg, background_secondary: p.bg2, text: p.text, text_muted: p.muted, heading: p.heading, accent: p.accent, link: p.heading, border: p.border,
  primary_button_background: p.button, primary_button_text: p.buttonText, primary_button_border: p.button,
  secondary_button_background: "transparent", secondary_button_text: p.heading, secondary_button_border: p.heading,
  input_background: p.bg2, input_text: p.heading, input_border: p.border,
})

/** A brand's theme settings: the real settings a creator sets in Website settings. */
function brandTheme(o: { palette: Palette; alt?: Palette; heading: string; body: string; shape: "square" | "rounded" | "pill"; radius: number; cardRadius: number; announcement?: [string, string, string] }): ThemeSettingsValues {
  return {
    ...themeDefaults,
    animations_enabled: false,
    font_heading: o.heading,
    font_body: o.body,
    background_color: o.palette.bg,
    text_color: o.palette.text,
    primary_color: o.palette.button,
    button_shape: o.shape,
    button_border_radius: o.radius,
    border_radius: o.cardRadius,
    image_border_radius: o.cardRadius,
    input_radius: Math.min(o.radius, 10),
    color_schemes: { white: scheme(o.palette), light: scheme(o.alt ?? o.palette) },
    ...(o.announcement ? { announcement_bar_enabled: true, announcement_bar_text: o.announcement[0], announcement_bar_bg: o.announcement[1], announcement_bar_color: o.announcement[2] } : {}),
  } as unknown as ThemeSettingsValues
}

const preset = (type: string) => STORELIB_SCHEMAS[type]?.presets?.[0]
const section = (id: string, type: string, settings: Record<string, unknown>, blocks?: SectionInstance["blocks"]): SectionInstance =>
  ({ id, type, name: type, settings: { ...(preset(type)?.settings ?? {}), ...settings }, blocks: blocks ?? ((preset(type)?.blocks ?? []) as SectionInstance["blocks"]) }) as SectionInstance
const block = (id: string, type: string, settings: Record<string, unknown>) => ({ id, type, settings })
const header = (name: string, links: string[], extra: Record<string, unknown> = {}) =>
  section("hdr", "header", { logo_text: name, logo_mode: "text", header_sticky: false, ...extra }, links.map((label, i) => block(`n${i}`, "nav_link", { label, url: `/${label.toLowerCase().replace(/\W+/g, "-")}` })) as SectionInstance["blocks"])
const footer = (name: string, tagline: string) => section("ftr", "footer", { logo_text: name, tagline })

type Item = { id: string; slug: string; title: string; price: number; compare?: number | null; image: string; tag?: string }
const cardsOf = (items: Item[]) => items.map((p) => ({
  id: p.id, type: "product",
  settings: { title: p.title, price: money(p.price), compare_price: p.compare ? money(p.compare) : "", image: pic(p.image), url: `/products/${p.slug}`, tag: p.tag ?? "" },
}))

/** A website's front page: the sections drawn by the theme engine as the published page draws them, the header and footer by ThemePage. */
function Site({ theme, chrome, body, items }: { theme: ThemeSettingsValues; chrome: SectionInstance[]; body: SectionInstance[]; items: Item[] }) {
  const cards = cardsOf(items)
  const drawn = body.map((s) => ({ s, r: renderStorelibSection(s, theme, { template: "index" }, undefined, cards) }))
  return (
    <div data-snapshot-stage="">
      <StorelibLiveProvider sources={{}} inEditor={false} products={cards}>
        <SiteCartProvider shopId={undefined}>
          <ThemePage theme={theme} sections={chrome} storefront={{}}>
            {drawn.map(({ s, r }) => (r.ok ? (
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

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`

/* ── Maison Verlaine: a watch atelier's product page ────────────────────── */

const VERLAINE = brandTheme({
  palette: { bg: "#f6f1e7", bg2: "#efe8da", text: "#4a473f", muted: "#7a756a", heading: "#1c2a22", accent: "#8a6d3b", border: "#ddd3c1", button: "#1d3b2f", buttonText: "#f6f1e7" },
  heading: "Cormorant Garamond", body: "Lato", shape: "square", radius: 0, cardRadius: 0,
  announcement: ["Hand finished in Geneva  ·  Edition of 88  ·  Insured delivery worldwide", "#1d3b2f", "#efe3c6"],
})

function Watch() {
  const data = {
    id: uuid(1), title: "No. 3, Forest Enamel", slug: "no-3-forest-enamel", type: "physical",
    description: "<p>A 38mm steel case around a grand feu enamel dial, fired eleven times for its depth of green. Swiss automatic calibre with a 42 hour reserve, sapphire front and back, and a hand stitched alligator strap.</p>",
    description_html: "<p>A 38mm steel case around a grand feu enamel dial, fired eleven times for its depth of green. Swiss automatic calibre with a 42 hour reserve, sapphire front and back, and a hand stitched alligator strap.</p>",
    price_cents: 480000, compare_at_cents: null,
    thumbnail_url: pic("watch-hero"), gallery_urls: [pic("watch-hero"), pic("watch-dial"), pic("watch-stone"), pic("watch-box")],
    options: [{ name: "Strap", values: ["Forest green", "Cognac", "Midnight"] }],
    variants: ["Forest green", "Cognac", "Midnight"].map((v, i) => ({ id: `v${i}`, name: v, options: [v], price_cents: 480000, compare_at_cents: null, image_url: null, available: true, left: i === 0 ? 4 : null, max_quantity: 1 })),
    inventory_left: null, low_stock_at: 5, created_at: "2026-09-01T00:00:00Z", category: "Watches",
  } as unknown as ProductSectionData
  const made = mainProductSection("main-product")
  const main: SectionInstance = {
    ...made,
    settings: { ...made.settings, multiple_images_layout: "thumbnails", image_width: "55%", sticky_info: false, media_ratio: "square", _product_data: data },
    blocks: [
      ...(made.blocks ?? []),
      block("tab-1", "collapsible_tab", { heading: "Calibre and case", content: "<p>Swiss automatic, 28,800 vph, 42 hour reserve. 38mm polished steel, 9.8mm thick, 50m water resistance.</p>", margin_bottom: 0 }),
      block("tab-2", "collapsible_tab", { heading: "Delivery and service", content: "<p>Insured courier in 5 to 7 days. Five year warranty and a first service at the atelier.</p>", margin_bottom: 0 }),
    ] as SectionInstance["blocks"],
  }
  return (
    <div data-snapshot-stage="">
      <StorelibLiveProvider sources={{}} inEditor={false} products={[]}>
        <SiteCartProvider shopId={undefined}>
          <PlatformSettingsProvider exploreMarketplace={false} buyerHeaderLight={false} physicalCommerce>
            <ThemePage theme={VERLAINE} sections={[header("MAISON VERLAINE", ["Collection", "The atelier", "Commissions", "Service", "Journal"], { logo_font: "Cormorant Garamond", cta_text: "Book a viewing" })]} storefront={{}}>
              <div className="@container">
                <ProductSection section={main} theme={VERLAINE} />
              </div>
            </ThemePage>
          </PlatformSettingsProvider>
        </SiteCartProvider>
      </StorelibLiveProvider>
    </div>
  )
}

/* ── Marrow & Oat: dog food ─────────────────────────────────────────────── */

const MARROW = brandTheme({
  palette: { bg: "#f7f0e5", bg2: "#efe3d0", text: "#55463b", muted: "#857262", heading: "#2a1d16", accent: "#b5532f", border: "#e5d6c1", button: "#b5532f", buttonText: "#fff8ef" },
  alt: { bg: "#efe3d0", bg2: "#f7f0e5", text: "#55463b", muted: "#857262", heading: "#2a1d16", accent: "#b5532f", border: "#dcc8ad", button: "#2a1d16", buttonText: "#fff8ef" },
  heading: "Poppins", body: "Nunito", shape: "pill", radius: 999, cardRadius: 14,
  announcement: ["Free delivery over $45  ·  Subscribe and save 10% on every bag", "#2a1d16", "#f7f0e5"],
})
const MARROW_ITEMS: Item[] = [
  { id: uuid(11), slug: "chicken-pumpkin", title: "Chicken & Pumpkin, 1 kg", price: 3800, image: "pet-chicken", tag: "Bestseller" },
  { id: uuid(12), slug: "salmon-kelp", title: "Salmon & Kelp, 1 kg", price: 4200, image: "pet-salmon" },
  { id: uuid(13), slug: "lamb-barley", title: "Lamb & Barley, 1 kg", price: 4000, image: "pet-lamb" },
  { id: uuid(14), slug: "duck-sweet-potato", title: "Duck & Sweet Potato, 1 kg", price: 4400, compare: 4900, image: "pet-duck" },
  { id: uuid(15), slug: "beef-liver-bites", title: "Beef liver bites, 200 g", price: 1400, image: "pet-treats" },
]

function Pet() {
  return (
    <Site
      theme={MARROW}
      items={MARROW_ITEMS}
      chrome={[header("Marrow & Oat", ["Shop", "Subscriptions", "Treats", "Our kitchen"], { cta_text: "Subscribe" }), footer("Marrow & Oat", "Real food for dogs, air-dried in small batches.")]}
      body={[
        section("hero", "hero_split", { eyebrow: "Human grade, air dried", heading: "Real food for dogs, made in small batches.", subheading: "Human grade meat, vegetables and nothing else. Cooked low and slow, then delivered on your schedule.", button_text: "Shop recipes", button2_text: "Build a subscription", list_1: "", image: pic("pet-hero"), padding_top: 64, padding_bottom: 64 }),
        section("grid", "product_grid", { source: "picked", heading: "The recipes", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, padding_top: 40 }, cardsOf(MARROW_ITEMS.slice(0, 4)) as SectionInstance["blocks"]),
      ]}
    />
  )
}

/* ── Fennel & Fig: meal kits ────────────────────────────────────────────── */

const FENNEL = brandTheme({
  palette: { bg: "#f4f2eb", bg2: "#ebe7dc", text: "#4b5045", muted: "#7a7f72", heading: "#1f2a1b", accent: "#5c7a3a", border: "#ddd9cc", button: "#33452b", buttonText: "#f4f2eb" },
  heading: "DM Sans", body: "DM Sans", shape: "rounded", radius: 10, cardRadius: 12,
  announcement: ["This week: lemon & lentil dahl is back  ·  First box $20 off", "#33452b", "#eef2e2"],
})
const FENNEL_ITEMS: Item[] = [
  { id: uuid(21), slug: "salmon-rice-bowl", title: "Miso salmon rice bowl", price: 1290, image: "meal-salmon", tag: "New" },
  { id: uuid(22), slug: "lentil-dahl", title: "Lemon & lentil dahl", price: 1090, image: "meal-dahl" },
  { id: uuid(23), slug: "green-curry", title: "Green curry with tofu", price: 1190, image: "meal-curry" },
  { id: uuid(24), slug: "tomato-linguine", title: "Cherry tomato linguine", price: 1050, image: "meal-pasta" },
]
const FENNEL_PAGE = [
  section("hero", "hero_split", { eyebrow: "Meal kits for two or four", heading: "Dinner, sorted for the week.", subheading: "Chef written recipes with every ingredient measured out. Thirty minutes from box to table.", button_text: "Choose your meals", button2_text: "How it works", image: pic("meal-hero"), image_side: "left", padding_top: 64, padding_bottom: 64 }),
  section("grid", "product_grid", { source: "picked", heading: "On the menu this week", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, shape: "4 / 3", padding_top: 40 }, cardsOf(FENNEL_ITEMS) as SectionInstance["blocks"]),
]

function Meal() {
  return <Site theme={FENNEL} items={FENNEL_ITEMS} chrome={[header("Fennel & Fig", ["Menu", "Plans", "Gift cards", "Help"], { cta_text: "Get started" }), footer("Fennel & Fig", "Meal kits from our kitchen to yours.")]} body={FENNEL_PAGE} />
}

/* ── Halcyon: Lightroom presets, a dark theme ───────────────────────────── */

const HALCYON = brandTheme({
  palette: { bg: "#0f1111", bg2: "#181b1a", text: "#b9bfbb", muted: "#8a908c", heading: "#f2f4f1", accent: "#d7f36b", border: "#262a28", button: "#d7f36b", buttonText: "#101210" },
  heading: "Space Grotesk", body: "Inter", shape: "rounded", radius: 8, cardRadius: 10,
})
const HALCYON_ITEMS: Item[] = [
  { id: uuid(31), slug: "coastal", title: "Coastal, 12 presets", price: 2400, image: "preset-coastal", tag: "Bestseller" },
  { id: uuid(32), slug: "golden-hour", title: "Golden Hour, 10 presets", price: 2400, image: "preset-golden" },
  { id: uuid(33), slug: "nordic-light", title: "Nordic Light, 8 presets", price: 1900, image: "preset-nordic" },
  { id: uuid(34), slug: "moody-film", title: "Moody Film, presets + LUTs", price: 2900, compare: 3900, image: "preset-moody" },
]

function Presets() {
  return (
    <Site
      theme={HALCYON}
      items={HALCYON_ITEMS}
      chrome={[header("HALCYON", ["Presets", "LUTs", "Templates", "Tutorials"], { cta_text: "Shop all" }), footer("Halcyon", "Presets and templates for photographers.")]}
      body={[
        section("hero", "hero_split", { eyebrow: "Lightroom presets  ·  Desktop and mobile", heading: "Colour that holds up in every light.", subheading: "Built on real film scans and tested on ten thousand raw files. One click, then make it yours.", button_text: "Shop the presets", button2_text: "See before and after", image: pic("preset-compare"), padding_top: 64, padding_bottom: 64 }),
        section("grid", "product_grid", { source: "picked", heading: "The collection", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, padding_top: 40 }, cardsOf(HALCYON_ITEMS) as SectionInstance["blocks"]),
      ]}
    />
  )
}

/* ── Wheel & Kiln: a pottery course ─────────────────────────────────────── */

const KILN = brandTheme({
  palette: { bg: "#f5f0e8", bg2: "#ece4d7", text: "#544b42", muted: "#857b70", heading: "#2b211b", accent: "#9c5a3c", border: "#e0d5c5", button: "#9c5a3c", buttonText: "#fbf6ef" },
  alt: { bg: "#ece4d7", bg2: "#f5f0e8", text: "#544b42", muted: "#857b70", heading: "#2b211b", accent: "#9c5a3c", border: "#d8cab5", button: "#2b211b", buttonText: "#fbf6ef" },
  heading: "Playfair Display", body: "Source Sans 3", shape: "rounded", radius: 6, cardRadius: 8,
})

function Course() {
  const modules = [
    ["Wedging and centring", "4 lessons, 38 min", "Getting the clay ready, and the one skill every pot depends on.", "Wedging by hand\nSetting up the wheel\nCentring, slowly\nWhen it wobbles"],
    ["Your first cylinder", "5 lessons, 52 min", "Opening, pulling walls and trimming a straight sided pot.", "Opening the clay\nThe first pull\nEven walls\nCutting it off\nTrimming the foot"],
    ["Bowls and curves", "4 lessons, 46 min", "", ""],
    ["Glazing and the kiln", "6 lessons, 61 min", "", ""],
  ].map(([title, length, summary, lessons], i) => block(`m${i}`, "module", { title, length, summary, lessons, open: i === 0 }))
  return (
    <Site
      theme={KILN}
      items={[]}
      chrome={[header("Wheel & Kiln", ["The course", "Lessons", "Kit list", "FAQ"], { cta_text: "Enrol" }), footer("Wheel & Kiln", "Learn to throw on the wheel at home.")]}
      body={[
        section("hero", "hero_split", { eyebrow: "Online course  ·  19 lessons  ·  3 hours", heading: "Learn to throw on the wheel, at home.", subheading: "From a lump of clay to a glazed bowl you will use every day. Filmed close up, at the pace of a real class.", button_text: "Enrol for $129", button2_text: "Watch a free lesson", note: "Lifetime access. Start any day.", image: pic("course-hero"), padding_top: 64, padding_bottom: 56 }),
        section("curriculum", "course_curriculum", { heading: "Inside the course", color_scheme: "light", padding_top: 56 }, modules as SectionInstance["blocks"]),
      ]}
    />
  )
}

/* ── Studio Arlo: a link in bio ─────────────────────────────────────────── */

function OnePageShot() {
  const id = q.get("theme") || "default"
  const template = THEME_TEMPLATES.find((t) => t.id === id)
  const opTheme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" } as OnePage["theme"]
  let order = 0
  const b = (type: string, data: Record<string, unknown>) => ({ id: `${type}_${order}`, type, enabled: true, sort_order: order++, data }) as never
  const blocks = [
    b("header", { show_avatar: true, show_name: true, show_bio: true }),
    b("product", { product_id: uuid(41), show_price: true, show_description: true, cta_text: "Buy now", style: "callout", product_title: "Speckled mug, set of two", product_thumbnail: pic("mugs"), product_description: "Thrown and glazed in the studio", product_price_cents: 6400, product_slug: "speckled-mugs" }),
    b("link_button", { label: "Wheel & Kiln, the online course", url: "https://example.com/course", thumbnail_url: pic("course-hero") }),
    b("link_button", { label: "Studio sale, Saturday 10am", url: "https://example.com/sale", thumbnail_url: pic("lesson-2") }),
    b("link_button", { label: "Commission a piece", url: "https://example.com/commissions", thumbnail_url: pic("lesson-0") }),
    b("social_row", { platforms: [{ platform: "instagram", url: "https://instagram.com/" }, { platform: "tiktok", url: "https://tiktok.com/" }, { platform: "youtube", url: "https://youtube.com/" }], style: "icons" }),
    b("email_capture", { headline: "Kiln opening letter", description: "First look at every firing, once a month", placeholder: "Your email", button_text: "Subscribe", success_message: "Thanks" }),
  ]
  const page = {
    id: "op_demo", owner_id: "demo", slug: "studioarlo", title: "Studio Arlo", bio: "Wheel thrown stoneware from a small studio",
    avatar_url: pic("bio-avatar"), theme: opTheme, settings: { ...defaultSettings }, seller_id: "seller_demo",
    social_links: {}, draft_blocks: blocks, status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
  } as unknown as OnePage
  const shape = publicOnePage(page as never, { source: "published" })
  return <PublicOnePage onepage={shape as never} />
}

/* ── The dashboard: Marrow & Oat's week, as demo data ───────────────────── */

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

/**
 * A demo week. TARGET is what the period shows; the week before is a little
 * lower, so the changes read as a store growing slowly. Rows are spread over
 * the days with a weekday shape and a fixed seed, so the picture is the same
 * every run, and counted by buildReports exactly as the route counts real rows.
 */
const TARGET = { visitors: 1284, orders: 46, cents: 342000 }
const BEFORE = { visitors: 1137, orders: 39, cents: 291500 }

function seeded(seed: number) {
  let a = seed >>> 0
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

function demoRows(span: { start: number; end: number }, want: { visitors: number; orders: number; cents: number }, seed: number) {
  const r = seeded(seed)
  const len = span.end - span.start
  const at = () => new Date(span.start + Math.min(0.999, Math.pow(r(), 0.92)) * len).toISOString()
  const views: ViewRow[] = []
  for (let v = 0; v < want.visitors; v++) {
    const visitor = `demo-${seed}-${v}`
    const n = r() < 0.38 ? 2 : 1
    const when = at()
    for (let k = 0; k < n; k++) views.push({ id: `${visitor}-${k}`, visitor_id: visitor, session_id: visitor, created_at: when, product_id: MARROW_ITEMS[Math.floor(r() * MARROW_ITEMS.length)].id, property_type: "website", path: "/" } as ViewRow)
  }
  const orders: OrderRow[] = []
  let left = want.cents
  for (let o = 0; o < want.orders; o++) {
    const item = MARROW_ITEMS[o % MARROW_ITEMS.length]
    const qty = o % 7 === 3 ? 3 : o % 3 === 0 ? 2 : 1
    let cents = item.price * qty
    if (o === want.orders - 1) cents = left
    left -= cents
    orders.push({ id: `order-${seed}-${o}`, product_id: item.id, amount_cents: cents, fee_cents: 0, status: "paid", created_at: at(), currency: "USD", refund_amount_cents: 0, stripe_session_id: `cs_${seed}_${o}` } as OrderRow)
  }
  return { views, orders }
}

function answerReports(url: string) {
  const p = new URL(url, location.origin).searchParams
  const span = { start: Date.parse(p.get("start")!), end: Date.parse(p.get("end")!) }
  const previous = p.get("cstart") ? { start: Date.parse(p.get("cstart")!), end: Date.parse(p.get("cend")!) } : null
  const now = demoRows(span, TARGET, 7)
  const before = previous ? demoRows(previous, BEFORE, 11) : { views: [], orders: [] }
  const reports = buildReports({
    views: [...now.views, ...before.views], steps: [], orders: [...now.orders, ...before.orders],
    window: span, previous, timeZone: p.get("tz") || "America/New_York", mainDomain: "", productTitles: Object.fromEntries(MARROW_ITEMS.map((i) => [i.id, i.title])),
  })
  return { reports, allTime: { orders: 412, salesCents: 2986400, views: 21840 } }
}

function Dashboard() {
  const props = {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Nadia",
    initialProgress: { ...NO_FACTS, products: 5, publishedProducts: 5, paymentsReady: true, websiteLive: true, domainConnected: false, sales: 412, revenueCents: 2986400, guideOpened: true, pro: false, subscribers: 318, emailsSent: 6, automationsOn: 2 },
    productIds: MARROW_ITEMS.map((p) => p.id),
    initialOrders: [],
    creatorHandle: "marrowandoat",
    connectedDomain: null,
    websitePublished: true,
    subscriptionPlanId: "free",
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

if (shot === "dashboard") {
  const real = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.includes("/api/analytics/reports")) return new Response(JSON.stringify(answerReports(url)), { status: 200, headers: { "content-type": "application/json" } })
    return real(input, init)
  }) as typeof window.fetch
}

const SHOTS: Record<string, () => React.ReactElement> = { watch: Watch, pet: Pet, meal: Meal, presets: Presets, course: Course, onepage: OnePageShot, dashboard: Dashboard }
const Shot = SHOTS[shot] ?? Watch
createRoot(document.getElementById("app")!).render(<Shot />)
;(window as unknown as { __ready: boolean }).__ready = true

/* The meal kit's page and theme, for the website builder's picture (hero-shots.mjs hands them to the editor probe). */
;(window as unknown as { __demoEditor: unknown }).__demoEditor = { theme: FENNEL, page: [header("Fennel & Fig", ["Menu", "Plans", "Gift cards", "Help"], { cta_text: "Get started" }), ...FENNEL_PAGE, footer("Fennel & Fig", "Meal kits from our kitchen to yours.")], items: FENNEL_ITEMS.map((p) => ({ id: p.id, type: "product", settings: { title: p.title, price: money(p.price), compare_price: "", image: pic(p.image), url: "#", tag: p.tag ?? "" } })) }
