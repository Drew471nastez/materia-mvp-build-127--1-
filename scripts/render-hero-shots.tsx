/**
 * ===========================================================================
 *  STORELIB'S OWN SCREENS, AS DEMO STORES, FOR THE FRONT PAGE HERO
 * ===========================================================================
 * Served by scripts/hero-shots.mjs, which photographs each one for the hero's
 * slider and its backdrop (public/marketing/hero/). Every screen is the real
 * component a visitor or a creator sees, on Storelib's real theme with each
 * store's own theme settings (colours, fonts, buttons, announcement bar).
 * Only the content is invented: made up brands and people, their made up
 * products and posts, and pictures scripts/hero-demo-art.mjs draws
 * (/demo/*.png). No real creator's name, page or photo is in any of them,
 * and no face: people are their initials or their own work.
 *
 *   ?shot=street      Pale Hours, streetwear basics: the front page
 *   ?shot=skin        Ferne, skincare: the front page
 *   ?shot=presets     Halcyon, Lightroom presets: the front page (a dark theme)
 *   ?shot=course      Wheel & Kiln, a pottery course: its landing page
 *   ?shot=creator     Theo Lindqvist's creator page (Halcyon's photographer)
 *   ?shot=community   Kiln Club, Wheel & Kiln's community: its feed
 *   ?shot=onepage     a link in bio, &who=noor|theo|ana, three people in three themes
 *   ?shot=dashboard   Ferne's /app home, with a demo week of visits and orders
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
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
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
import { ProfileSocial } from "@/components/profile/profile-social"
import { StorefrontTabs, type StorefrontTab } from "@/components/storefront/storefront-tabs"
import { AllProductsGrid } from "@/components/storefront/all-products-grid"
import { UnifiedShopHeader, UnifiedSectionRenderer } from "@/components/store-builder/unified-section-renderer"
import { SellerFooter } from "@/components/storefront/seller-footer"
import { resolveStorefrontChrome } from "@/lib/store-builder/storefront-chrome"
import { defaultAboutSettings, defaultGlobalStoreSettings, defaultShopHeaderSettings } from "@/lib/store-builder/defaults"
import { ShellFrame } from "@/components/community/member/shell-frame"
import { FeedColumns } from "@/components/community/member/columns"
import { CommunityFeed } from "@/components/community/member/feed"
import { LocaleProvider } from "@/components/locale-provider"
import { allowedActions } from "@/lib/communities/permissions"
import type { FeedPostView, PostMedia, ViewerView } from "@/lib/communities/types"
import type { ShellCommunity, SpaceView, TopBarData } from "@/components/community/member/view-types"

const q = new URLSearchParams(location.search)
const shot = q.get("shot") ?? "street"
const pic = (name: string) => `${location.origin}/demo/${name}.png`
const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 })}`
const NOW = Date.now()
const HOUR = 3_600_000
const iso = (ms: number) => new Date(ms).toISOString()

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

/* ── Pale Hours: streetwear basics ──────────────────────────────────────── */

const PALE = brandTheme({
  palette: { bg: "#f3f1ec", bg2: "#e9e6df", text: "#3d3b37", muted: "#76726b", heading: "#151515", accent: "#151515", border: "#dcd8d0", button: "#151515", buttonText: "#f3f1ec" },
  heading: "Bebas Neue", body: "Inter", shape: "square", radius: 0, cardRadius: 0,
  announcement: ["Free returns for 30 days  ·  Ships in 2 working days", "#151515", "#f3f1ec"],
})
const PALE_ITEMS: Item[] = [
  { id: uuid(11), slug: "heavyweight-hoodie-black", title: "Heavyweight hoodie, washed black", price: 8800, image: "street-hoodie", tag: "Bestseller" },
  { id: uuid(12), slug: "boxy-tee-bone", title: "Boxy tee, bone", price: 3800, image: "street-tee" },
  { id: uuid(13), slug: "crew-sweat-heather", title: "Crew sweat, heather grey", price: 7200, image: "street-sweat" },
  { id: uuid(14), slug: "boxy-tee-olive", title: "Boxy tee, olive", price: 3800, compare: 4400, image: "street-olive" },
  { id: uuid(15), slug: "rib-beanie-moss", title: "Rib beanie, moss", price: 2800, image: "street-beanie" },
  { id: uuid(16), slug: "canvas-tote", title: "Canvas tote", price: 2400, image: "street-tote" },
]
const PALE_CHROME = [header("PALE HOURS", ["Shop all", "New in", "Basics", "Journal"], { logo_font: "Bebas Neue" }), footer("Pale Hours", "Heavyweight basics, cut and sewn in Porto.")]
const PALE_PAGE = [
  section("hero", "hero", {
    layout: "left", bg_type: "image", bg_image: pic("street-hero"), text_color: "#151515", max_width: "wide",
    eyebrow: "Autumn basics", heading: "Heavyweight basics, made to be worn in.", subheading: "Cotton tees, hoodies and sweats cut and sewn in Porto. Restocked every Friday.",
    button_text: "Shop new in", button2_text: "The basics", button_border_radius: 0, button_color: "#151515", button_text_color: "#f3f1ec", scroll_indicator: false, bg_overlay_color: "#f3f1ec", bg_overlay_opacity: 22, font_size_heading: 72, padding_top: 120, padding_bottom: 140,
  }),
  section("grid", "product_grid", { source: "picked", heading: "New in", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, shape: "4 / 5", padding_top: 48 }, cardsOf(PALE_ITEMS.slice(0, 4)) as SectionInstance["blocks"]),
]

function Street() {
  return <Site theme={PALE} items={PALE_ITEMS} chrome={PALE_CHROME} body={PALE_PAGE} />
}

/* ── Ferne: skincare ────────────────────────────────────────────────────── */

const FERNE = brandTheme({
  palette: { bg: "#f6f3ee", bg2: "#ece7df", text: "#4a4d45", muted: "#7d8076", heading: "#262b24", accent: "#5d6b52", border: "#e0dacf", button: "#323b2e", buttonText: "#f6f3ee" },
  alt: { bg: "#e9ece3", bg2: "#f6f3ee", text: "#4a4d45", muted: "#7d8076", heading: "#262b24", accent: "#5d6b52", border: "#d6dacd", button: "#323b2e", buttonText: "#f6f3ee" },
  heading: "EB Garamond", body: "DM Sans", shape: "pill", radius: 999, cardRadius: 14,
  announcement: ["Free delivery over $50  ·  Samples in every order", "#323b2e", "#eef0e8"],
})
const FERNE_ITEMS: Item[] = [
  { id: uuid(21), slug: "barrier-serum", title: "Barrier serum, 30 ml", price: 3400, image: "skin-serum", tag: "Bestseller" },
  { id: uuid(22), slug: "night-cream", title: "Night cream, 50 ml", price: 4200, image: "skin-cream" },
  { id: uuid(23), slug: "oat-cleanser", title: "Oat cleanser, 150 ml", price: 2400, image: "skin-cleanser" },
  { id: uuid(24), slug: "daily-spf-30", title: "Daily SPF 30, 50 ml", price: 2900, image: "skin-spf" },
  { id: uuid(25), slug: "evening-set", title: "The evening set", price: 8800, compare: 10500, image: "skin-set" },
]
const FERNE_PAGE = [
  section("hero", "hero_split", { eyebrow: "Fragrance free skincare", heading: "Fewer steps, calmer skin.", subheading: "Four products with short ingredient lists, made in small batches and tested on sensitive skin.", button_text: "Shop the routine", button2_text: "Ingredients", list_1: "", image: pic("skin-hero"), padding_top: 64, padding_bottom: 64 }),
  section("grid", "product_grid", { source: "picked", heading: "The routine", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, shape: "4 / 5", padding_top: 40 }, cardsOf(FERNE_ITEMS.slice(0, 4)) as SectionInstance["blocks"]),
]

function Skin() {
  return <Site theme={FERNE} items={FERNE_ITEMS} chrome={[header("FERNE", ["Shop", "Sets", "Ingredients", "Journal"], { logo_font: "EB Garamond", cta_text: "Find your routine" }), footer("Ferne", "Skincare with short ingredient lists.")]} body={FERNE_PAGE} />
}

/* ── Halcyon: Lightroom presets, a dark theme ───────────────────────────── */

const HALCYON = brandTheme({
  palette: { bg: "#0f1111", bg2: "#181b1a", text: "#b9bfbb", muted: "#8a908c", heading: "#f2f4f1", accent: "#d7f36b", border: "#262a28", button: "#d7f36b", buttonText: "#101210" },
  heading: "Space Grotesk", body: "Inter", shape: "rounded", radius: 8, cardRadius: 10,
})
/* Round AD5: pack names a photographer would give them, and copy that claims only what a preset pack is. */
const HALCYON_ITEMS: Item[] = [
  { id: uuid(31), slug: "harbour", title: "Harbour, 12 presets", price: 2400, image: "preset-harbour", tag: "Bestseller" },
  { id: uuid(32), slug: "late-summer", title: "Late Summer, 10 presets", price: 2400, image: "preset-late-summer" },
  { id: uuid(33), slug: "overcast", title: "Overcast, 8 presets", price: 1900, image: "preset-overcast" },
  { id: uuid(34), slug: "tungsten-nights", title: "Tungsten Nights, 10 presets and 3 LUTs", price: 2900, compare: 3900, image: "preset-tungsten" },
]

function Presets() {
  return (
    <Site
      theme={HALCYON}
      items={HALCYON_ITEMS}
      chrome={[header("HALCYON", ["Presets", "LUTs", "Course", "Prints"], { cta_text: "Shop all" }), footer("Halcyon", "Presets and prints by Theo Lindqvist.")]}
      body={[
        section("hero", "hero_split", { eyebrow: "Lightroom presets  ·  Desktop and mobile", heading: "Colour that holds up in every light.", subheading: "My own grades from ten years of shooting the coast, as presets. They work on raw and JPEG files, and every one has a before and after.", button_text: "Shop the presets", button2_text: "See before and after", image: pic("preset-compare"), padding_top: 64, padding_bottom: 64 }),
        section("grid", "product_grid", { source: "picked", heading: "The packs", align: "left", columns: { desktop: 4, tablet: 2, mobile: 2 }, padding_top: 40 }, cardsOf(HALCYON_ITEMS) as SectionInstance["blocks"]),
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

/* ── Theo Lindqvist's creator page ──────────────────────────────────────── */

/*
  Storelib's creator page as app/(marketing)/u/[username]/page.tsx composes
  it: the cover and profile (UnifiedShopHeader) with Follow, the tabs with the
  catalogue as real product cards, and About under them. Theo is the
  photographer behind Halcyon; his picture is one of his own landscapes.
*/
function CreatorPage() {
  const chrome = resolveStorefrontChrome("default")
  const avatar = pic("avatar-landscape")
  const products = [
    { id: uuid(41), slug: "harbour", title: "Harbour, 12 Lightroom presets", thumbnail_url: pic("preset-harbour"), price_cents: 2400, compare_at_cents: null, sales_count: 412, categories: [{ id: "c1", name: "Presets" }] },
    { id: uuid(42), slug: "editing-a-landscape", title: "Editing a landscape, start to finish", thumbnail_url: pic("preset-compare"), price_cents: 7900, compare_at_cents: null, sales_count: 96, categories: [{ id: "c2", name: "Courses" }] },
    { id: uuid(43), slug: "late-summer", title: "Late Summer, 10 Lightroom presets", thumbnail_url: pic("preset-late-summer"), price_cents: 2400, compare_at_cents: null, sales_count: 281, categories: [{ id: "c1", name: "Presets" }] },
    { id: uuid(44), slug: "print-harbour-at-dawn", title: "Print: Harbour at dawn, A3", thumbnail_url: pic("landscape-cover"), price_cents: 6500, compare_at_cents: null, sales_count: 38, categories: [{ id: "c3", name: "Prints" }] },
    { id: uuid(45), slug: "tungsten-nights", title: "Tungsten Nights, presets and LUTs", thumbnail_url: pic("preset-tungsten"), price_cents: 2900, compare_at_cents: 3900, sales_count: 154, categories: [{ id: "c1", name: "Presets" }] },
    { id: uuid(46), slug: "overcast", title: "Overcast, 8 Lightroom presets", thumbnail_url: pic("preset-overcast"), price_cents: 1900, compare_at_cents: null, sales_count: 120, categories: [{ id: "c1", name: "Presets" }] },
  ]
  const grid = (
    <AllProductsGrid products={products as never} creatorName="Theo Lindqvist" creatorUsername="theolindqvist" creatorAvatarUrl={avatar} isOwner={false} />
  )
  const tabs: StorefrontTab[] = [
    { id: "home", label: "Home", panel: grid },
    { id: "products", label: "Products", panel: grid },
    { id: "about", label: "About", panel: null as never },
  ].filter((t) => t.panel) as StorefrontTab[]
  const settings = { ...defaultShopHeaderSettings, showBio: true, bio: "Landscape photographer on the west coast of Sweden. Presets, prints and one long course on editing.", showStats: true, coverImageUrl: pic("landscape-cover") } as never
  return (
    <div data-storefront-root="" style={{ background: chrome.pageBackground, minHeight: "100vh", color: chrome.text, ...(chrome.tokens as React.CSSProperties) }}>
      <UnifiedShopHeader
        settings={settings}
        creator={{ cover_url: pic("landscape-cover"), bio: null, show_total_sales_badge: true } as never}
        profile={{ display_name: "Theo Lindqvist", avatar_url: avatar, username: "theolindqvist", created_at: "2023-03-01" } as never}
        productCount={products.length}
        globalSettings={defaultGlobalStoreSettings as never}
        surface={{ textColor: chrome.text, mutedColor: chrome.muted, avatarBorderColor: chrome.avatarBorder }}
        followRow={<ProfileSocial tone="storefront" scheme={chrome.action} userId="00000000-0000-4000-8000-0000000000c4" name="Theo Lindqvist" showCounts={false} viewerFollowing={false} signedIn isSelf={false} />}
      />
      <StorefrontTabs tabs={tabs} surface={{ textColor: chrome.text, mutedColor: chrome.muted, borderColor: chrome.border }} />
      <UnifiedSectionRenderer
        section={{ id: "about", type: "about", order: 0, settings: { ...defaultAboutSettings, colors: { textColor: chrome.text } } } as never}
        creatorName="Theo Lindqvist"
        sellerMemberSince="2023-03-01T00:00:00Z"
        sellerTotalSales={1101}
        sellerProductsCount={products.length}
        globalSettings={defaultGlobalStoreSettings as never}
      />
      <SellerFooter surface={{ backgroundColor: chrome.footerBackground, textColor: chrome.footerText, mutedColor: chrome.footerMuted, borderColor: chrome.border }} />
    </div>
  )
}

/* ── Kiln Club: Wheel & Kiln's community, from inside ───────────────────── */

/*
  The member's feed as app/(marketing)/community/[slug]/(member) draws it:
  the community's own bar, the spaces, the composer and the posts. Invented
  members, shown by their initials as Storelib shows anyone without a photo;
  their pictures are their pots and glaze tests.
*/
const CID = "6f1c2a1e-0000-4000-8000-0000000000ad"
const KILN_CLUB: ShellCommunity = {
  id: CID, slug: "kiln-club", name: "Kiln Club", tagline: "Weekly firings, glaze tests and feedback on your pots.",
  logoUrl: pic("bio-avatar"), coverUrl: null, memberCount: 1240, postCount: 812,
  classroomEnabled: true, eventsEnabled: true, directoryEnabled: true, chatEnabled: false, gamificationEnabled: true, archived: false,
} as ShellCommunity
const member = (id: string, name: string, username: string, role: "owner" | "member" = "member", level = 2, avatarUrl: string | null = null) => ({ id, name, username, avatarUrl, role, level })
const PEOPLE = {
  ana: member("u-ana", "Ana Ribeiro", "anaribeiro", "owner", 7, pic("bio-avatar")),
  jonas: member("u-jonas", "Jonas Berg", "jonasberg", "member", 4),
  priya: member("u-priya", "Priya Natarajan", "priyan", "member", 3),
  sam: member("u-sam", "Sam Okafor", "samokafor", "member", 2),
  me: member("u-me", "Lena Fischer", "lenaf", "member", 3),
}
const SPACE = (id: string, name: string, icon: string): SpaceView => ({ id: `s-${id}`, slug: id, name, description: null, icon, kind: "feed", canPost: true, commentsEnabled: true, unread: 0 }) as SpaceView
const SPACES: SpaceView[] = [SPACE("general", "General", "messages-square"), SPACE("glazes", "Glazes", "🎨"), SPACE("firing", "Firing logs", "🔥"), SPACE("critique", "Critique", "🎯"), SPACE("wins", "Wins", "🏆")]
const image = (name: string, w = 1200, h = 900): PostMedia => ({ type: "image", url: pic(name), w, h }) as PostMedia
function post(i: number, o: { space: SpaceView; author: typeof PEOPLE.ana; title: string; text: string; media?: PostMedia[]; reactions: number; comments: number; hoursAgo: number; pinned?: boolean }): FeedPostView {
  return {
    id: `p-${i}`, communityId: CID, space: { id: o.space.id, slug: o.space.slug, name: o.space.name, icon: o.space.icon, kind: "feed" }, kind: "post",
    title: o.title, body: `<p>${o.text}</p>`, bodyText: o.text, media: o.media ?? [], pinned: !!o.pinned, featured: false, locked: false, status: "published",
    author: o.author as never, reactionCount: o.reactions, commentCount: o.comments, reacted: i === 2, bookmarked: false, poll: null,
    createdAt: iso(NOW - o.hoursAgo * HOUR), editedAt: null, lastActivityAt: iso(NOW - o.hoursAgo * HOUR), canEdit: false, canModerate: false,
    recentCommenters: [PEOPLE.jonas, PEOPLE.priya, PEOPLE.sam].slice(0, Math.min(3, o.comments)).map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl })), lastCommentAt: iso(NOW - (o.hoursAgo - 0.5) * HOUR), showLevel: true,
  } as FeedPostView
}
const POSTS: FeedPostView[] = [
  post(1, { space: SPACES[1], author: PEOPLE.priya, title: "Glaze test tiles, round two", text: "Twelve glazes over the same stoneware, cone 6 with a slow cool. B3 and C3 pooled the way I hoped. A3 crawled on the edge again, so thinner next time.", media: [image("glaze-tiles")], reactions: 48, comments: 14, hoursAgo: 2 }),
  post(2, { space: SPACES[3], author: PEOPLE.jonas, title: "First set of bowls I would actually use", text: "Lesson 11 finally clicked. Trimmed the feet a day later than usual and the walls stayed even. Notes on the rims welcome.", media: [image("lesson-0", 1000, 700), image("lesson-2", 1000, 700)], reactions: 36, comments: 9, hoursAgo: 5 }),
  post(3, { space: SPACES[2], author: PEOPLE.sam, title: "Kiln log: Saturday's bisque", text: "Candled overnight at 90°C, then 100°C an hour to 600°C. No blowouts this time, the slow start made the difference.", reactions: 21, comments: 6, hoursAgo: 9 }),
  post(4, { space: SPACES[0], author: PEOPLE.ana, title: "Open studio call, Thursday 7pm", text: "Bring one pot you are stuck on. We will look at it together on camera, and the recording goes into the Classroom after.", reactions: 64, comments: 18, hoursAgo: 26 }),
]

function Community() {
  const viewer: ViewerView = { userId: PEOPLE.me.id, signedIn: true, role: "member", status: "active", active: true, tierId: null, level: 3, points: 84, isOwner: false, isCreatorAccount: false, mutedUntil: null, can: allowedActions("member") } as ViewerView
  const topBar: TopBarData = {
    community: { id: CID, slug: KILN_CLUB.slug, name: KILN_CLUB.name, logoUrl: KILN_CLUB.logoUrl },
    creator: { name: "Ana Ribeiro", href: "/anaribeiro" },
    me: { name: PEOPLE.me.name, avatarUrl: null, profileHref: "/@lenaf" },
    communities: [{ id: CID, slug: KILN_CLUB.slug, name: KILN_CLUB.name, logoUrl: KILN_CLUB.logoUrl }],
    manageHref: null,
  } as TopBarData
  return (
    <LocaleProvider>
      <ShellFrame
        community={KILN_CLUB}
        viewer={viewer}
        topBar={topBar}
        unreadMessages={null}
        wall={{
          card: { stats: { members: KILN_CLUB.memberCount, online: 23, admins: 2 }, faces: [], more: 0, settingsHref: null },
          upcoming: { id: "e1", title: "Open studio call", startsAt: iso(NOW + 52 * HOUR), endsAt: iso(NOW + 53.5 * HOUR), going: 41 },
          contributors: null,
        } as never}
      >
        <FeedColumns
          main={
            <CommunityFeed
              communityId={CID}
              slug={KILN_CLUB.slug}
              viewer={viewer}
              spaces={SPACES}
              start={{ kind: "all" } as never}
              initial={{ pinned: [], posts: POSTS, nextCursor: null } as never}
              servedAt={NOW}
              compose={{ userId: PEOPLE.me.id, me: { name: PEOPLE.me.name, avatarUrl: null }, fileProductId: null } as never}
            />
          }
        />
      </ShellFrame>
    </LocaleProvider>
  )
}

/* ── Three people's link in bio pages ───────────────────────────────────── */

type Bio = { name: string; slug: string; bio: string; avatar: string; theme: string; product: [string, string, string, number, string]; links: [string, string][]; social: string[]; letter?: [string, string] }
/* Three different people, three themes; no name appears twice across the hero (scripts/check-home-hero.mjs). */
const BIOS: Record<string, Bio> = {
  noor: {
    name: "Noor Haddad", slug: "noorhaddad", bio: "Interior stylist in Lisbon. Rooms that feel lived in.", avatar: "avatar-stems", theme: "cream",
    product: ["The rental refresh guide", "36 pages, PDF", "avatar-stems", 1900, "rental-refresh"],
    links: [["Book a styling call", "skin-hero"], ["My paint colour list", "landscape-cover"], ["Shop my living room", "avatar-stems"]],
    social: ["instagram", "pinterest"],
  },
  theo: {
    name: "Theo Lindqvist", slug: "theolindqvist", bio: "Landscape photographer. Presets, prints and a course.", avatar: "avatar-landscape", theme: "night",
    product: ["Harbour, 12 Lightroom presets", "Desktop and mobile", "preset-harbour", 2400, "harbour"],
    links: [["Editing a landscape, the course", "preset-compare"], ["Prints from the coast", "landscape-cover"], ["How I shoot in fog", "preset-overcast"]],
    social: ["instagram", "youtube"],
  },
  ana: {
    name: "Ana Ribeiro", slug: "anaribeiro", bio: "Potter. Wheel thrown stoneware from a small studio.", avatar: "bio-avatar", theme: "sage",
    product: ["Speckled mug, set of two", "Thrown and glazed in the studio", "mugs", 6400, "speckled-mugs"],
    links: [["Wheel & Kiln, the online course", "course-hero"], ["Join Kiln Club", "glaze-tiles"], ["Studio sale, Saturday 10am", "lesson-2"]],
    social: ["instagram", "tiktok", "youtube"],
    letter: ["Kiln opening letter", "First look at every firing, once a month"],
  },
}

function OnePageShot() {
  const who = BIOS[q.get("who") || "ana"] ?? BIOS.ana
  const template = THEME_TEMPLATES.find((t) => t.id === (q.get("theme") || who.theme))
  const opTheme = { ...defaultTheme, ...(template?.theme_config || {}), template_id: template?.id || "default" } as OnePage["theme"]
  let order = 0
  const b = (type: string, data: Record<string, unknown>) => ({ id: `${type}_${order}`, type, enabled: true, sort_order: order++, data }) as never
  const [title, desc, thumb, cents, slug] = who.product
  const blocks = [
    b("header", { show_avatar: true, show_name: true, show_bio: true }),
    b("product", { product_id: uuid(51), show_price: true, show_description: true, cta_text: "Buy now", style: "callout", product_title: title, product_thumbnail: pic(thumb), product_description: desc, product_price_cents: cents, product_slug: slug }),
    ...who.links.map(([label, picName], i) => b("link_button", { label, url: `https://example.com/${i}`, thumbnail_url: pic(picName) })),
    b("social_row", { platforms: who.social.map((platform) => ({ platform, url: `https://${platform}.com/` })), style: "icons" }),
    ...(who.letter ? [b("email_capture", { headline: who.letter[0], description: who.letter[1], placeholder: "Your email", button_text: "Subscribe", success_message: "Thanks" })] : []),
  ]
  const page = {
    id: `op_${who.slug}`, owner_id: "demo", slug: who.slug, title: who.name, bio: who.bio,
    avatar_url: pic(who.avatar), theme: opTheme, settings: { ...defaultSettings }, seller_id: "seller_demo",
    social_links: {}, draft_blocks: blocks, status: "published", created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", onboarding_completed: true,
  } as unknown as OnePage
  const shape = publicOnePage(page as never, { source: "published" })
  return <PublicOnePage onepage={shape as never} />
}

/* ── The dashboard: Ferne's week, as demo data ──────────────────────────── */

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
    for (let k = 0; k < n; k++) views.push({ id: `${visitor}-${k}`, visitor_id: visitor, session_id: visitor, created_at: when, product_id: FERNE_ITEMS[Math.floor(r() * FERNE_ITEMS.length)].id, property_type: "website", path: "/" } as ViewRow)
  }
  const orders: OrderRow[] = []
  let left = want.cents
  for (let o = 0; o < want.orders; o++) {
    const item = FERNE_ITEMS[o % FERNE_ITEMS.length]
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
    window: span, previous, timeZone: p.get("tz") || "America/New_York", mainDomain: "", productTitles: Object.fromEntries(FERNE_ITEMS.map((i) => [i.id, i.title])),
  })
  return { reports, allTime: { orders: 412, salesCents: 2986400, views: 21840 } }
}

function Dashboard() {
  const props = {
    creatorId: "00000000-0000-4000-8000-000000000000",
    displayName: "Nadia",
    initialProgress: { ...NO_FACTS, products: 5, publishedProducts: 5, paymentsReady: true, websiteLive: true, domainConnected: false, sales: 412, revenueCents: 2986400, guideOpened: true, pro: false, subscribers: 318, emailsSent: 6, automationsOn: 2 },
    productIds: FERNE_ITEMS.map((p) => p.id),
    initialOrders: [],
    creatorHandle: "ferne",
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

/* Every /api request a screen makes is answered here: the reports for the dashboard, and an empty answer for the rest (a follow count, a community's live channel). */
{
  const real = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })
    if (url.includes("/api/analytics/reports")) return json(answerReports(url))
    if (url.includes("/api/community") && /\/posts(\?|$)/.test(url)) return json({ pinned: [], posts: POSTS, nextCursor: null })
    if (url.includes("/api/")) return json({ following: false, followers: 1240 })
    return real(input, init)
  }) as typeof window.fetch
}

const SHOTS: Record<string, () => React.ReactElement> = { street: Street, skin: Skin, presets: Presets, course: Course, creator: CreatorPage, community: Community, onepage: OnePageShot, dashboard: Dashboard }
const Shot = SHOTS[shot] ?? Street
try { localStorage.clear() } catch { /* fine */ }
createRoot(document.getElementById("app")!).render(<Shot />)
;(window as unknown as { __ready: boolean }).__ready = true

/* Pale Hours' page and theme, for the website builder's picture (hero-shots.mjs hands them to the editor probe). */
;(window as unknown as { __demoEditor: unknown }).__demoEditor = { theme: PALE, page: [PALE_CHROME[0], ...PALE_PAGE, PALE_CHROME[1]], items: PALE_ITEMS.map((p) => ({ id: p.id, type: "product", settings: { title: p.title, price: money(p.price), compare_price: p.compare ? money(p.compare) : "", image: pic(p.image), url: "#", tag: p.tag ?? "" } })) }
