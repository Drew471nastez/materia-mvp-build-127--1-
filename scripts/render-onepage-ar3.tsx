/**
 * Round AR3's harness (scripts/check-onepage-ar3.mjs): every block type and
 * every Layout choice it offers, drawn by the real live page component
 * (components/onepage/public-onepage) on its own (?live) and as the editor's
 * preview draws it (?preview, inside ExtraBlockPreviewContext), and the real
 * editor with one block of every type (/app/onepage) for the settings check.
 *
 * Each matrix row is a block with a known title ("T <id>") and description
 * ("D <id>") so the probe can ask whether both are drawn, and whether the
 * layouts of one block draw differently from each other.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { ExtraBlockPreviewContext } from "@/components/onepage/extra-blocks"
import { LINK_LAYOUTS, linkLayoutPatch } from "@/lib/onepage/block-presentation"
import { PRODUCT_LAYOUTS } from "@/lib/onepage/product-block"
import { APP_PROVIDERS, appBlockDefaults, type AppProviderId } from "@/lib/onepage/app-blocks"
import { MUSIC_LAYOUTS, VIDEO_LAYOUTS } from "@/lib/onepage/media-layout"
import { createDefaultBlock, defaultSettings, defaultTheme, type OnePage, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
/* Pictures from a host the probe answers itself (scripts/check-onepage-ar3.mjs): a card only draws an https or same-site picture. */
const pic = (n: number, w = 400, h = 400) => `https://pics.probe.test/${n}-${w}x${h}.svg`

type Row = { id: string; group: string; layout: string; block: OnePageBlock }
const rows: Row[] = []
let order = 0
const add = (group: string, layout: string, type: OnePageBlockType, data: Record<string, unknown>, presentation: Record<string, unknown> = {}) => {
  const id = `${group}__${layout}`.replace(/[^\w-]/g, "_")
  rows.push({
    id,
    group,
    layout,
    block: { id, type, enabled: true, sort_order: order++, data: data as never, style: { presentation: { subtitle: `D ${id}`, ...presentation } } } as OnePageBlock,
  })
  return id
}
const T = (group: string, layout: string) => `T ${`${group}__${layout}`.replace(/[^\w-]/g, "_")}`

/* Links: a website, a YouTube video, a Spotify track, an Instagram post and a TikTok video, in every link layout. */
const LINK_URLS: Record<string, string> = {
  website: "https://example.com/shop",
  youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  spotify: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  instagram: "https://www.instagram.com/p/C0abcdEFGhi/",
  tiktok: "https://www.tiktok.com/@satori/video/7300000000000000000",
  vimeo: "https://vimeo.com/76979871",
}
for (const [name, url] of Object.entries(LINK_URLS)) {
  for (const layout of LINK_LAYOUTS) {
    const patch = linkLayoutPatch(layout)
    add(`link_${name}`, layout, "link_button", { label: T(`link_${name}`, layout), url, thumbnail_url: pic(1, 800, 500), layout_type: patch.layout_type }, patch.variant ? { variant: patch.variant } : {})
  }
}
/* A link shown in place ("Show it here"): the services the owner named, each in its own frame. */
const EMBED_LINKS: Record<string, string> = {
  calendly: "https://calendly.com/satori/intro",
  typeform: "https://form.typeform.com/to/abcDEF12",
  canva: "https://www.canva.com/design/DAFabcdEFGH/xyz123/view",
  maps: "https://www.google.com/maps/place/Time+Out+Market+Lisboa",
  podcast: "https://podcasts.apple.com/us/podcast/the-show/id1234567890",
  instagram: "https://www.instagram.com/p/C0abcdEFGhi/",
  youtube: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
}
for (const [name, url] of Object.entries(EMBED_LINKS)) add("link_embed", name, "link_button", { label: T("link_embed", name), url, layout_type: "default" }, { variant: "image-first", media_mode: "native" })
/* Picture fit on a link card (round AR3): Cover, Contain, Full. */
for (const fit of ["cover", "contain", "full"]) add("link_fit", fit, "link_button", { label: T("link_fit", fit), url: "https://example.com/fit", thumbnail_url: pic(2, 300, 900), display_mode: fit, layout_type: "default" }, { variant: "visual" })

/* A product, in each of its layouts. */
for (const style of PRODUCT_LAYOUTS) {
  add("product", style, "product", { product_id: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01", product_title: T("product", style), product_thumbnail: pic(3), product_description: "A guide", product_price_cents: 1900, product_type: "digital", product_slug: "p1", show_price: true, show_description: true, style, style_chosen: true, cta_text: "Get it" })
}
for (const fit of ["cover", "contain", "full"]) add("product_fit", fit, "product", { product_id: "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c02", product_title: T("product_fit", fit), product_thumbnail: pic(4, 300, 900), product_price_cents: 900, product_type: "digital", product_slug: "p2", show_price: true, style: "preview", style_chosen: true, cta_text: "Get it", image_fit: fit })

/* A shelf of digital products: each arrangement, with plain cards and with product cards. */
const shelfItems = [1, 2, 3].map((n) => ({ id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c1${n}`, kind: "digital", title: `Product ${n}`, href: `/p/${n}`, image: pic(n + 4), price_cents: 1000 * n }))
for (const arrange of ["list", "grid", "carousel"]) {
  for (const cards of ["simple", "callout"]) {
    const layout = `${arrange}_${cards}`
    add("shelf", layout, "storelib_shelf", { source: "digital", title: T("shelf", layout), layout: arrange, items: shelfItems, ...(cards === "simple" ? { card_style: "simple" } : { product_settings: { style: "callout", style_chosen: true } }) })
  }
}

/* The app blocks the owner named, in every layout their provider offers. */
const APP_DATA: Partial<Record<AppProviderId, Record<string, unknown>>> = {
  tiktok: { url: "https://www.tiktok.com/@satori", posts: ["https://www.tiktok.com/@satori/video/7300000000000000001", "https://www.tiktok.com/@satori/video/7300000000000000002"] },
  instagram: { url: "https://www.instagram.com/satori", posts: ["https://www.instagram.com/p/C0abcdEFGh1/", "https://www.instagram.com/p/C0abcdEFGh2/"] },
  x: { url: "https://x.com/satori" },
  threads: { url: "https://www.threads.net/@satori" },
  affiliate: { url: "https://example.com/picks", items: [1, 2, 3].map((n) => ({ id: `a${n}`, title: `Pick ${n}`, note: `$${n}9`, url: `https://example.com/p${n}`, image_url: pic(n + 7) })) },
  books: { items: [1, 2, 3].map((n) => ({ id: `b${n}`, title: `Book ${n}`, note: "Author", url: `https://amazon.com/dp/B0000000${n}`, image_url: pic(n + 9, 200, 300) })) },
  podcasts: { url: "https://podcasts.apple.com/us/podcast/the-show/id1234567890" },
  typeform: { url: "https://form.typeform.com/to/abcDEF12" },
  twitch: { url: "https://www.twitch.tv/satori" },
  events: { items: [{ id: "e1", title: "Live in Lisbon", date: "2099-05-01", venue: "Lisbon", url: "https://example.com/t1" }, { id: "e2", title: "Live in Porto", date: "2099-06-01", venue: "Porto", url: "https://example.com/t2" }] },
  stats: { items: [{ id: "s1", title: "Students", value: "12k" }, { id: "s2", title: "Rating", value: "4.9" }, { id: "s3", title: "Countries", value: "40" }] },
  contact: { contact: { name: "Satori", phone: "+351 900 000 000", email: "hi@example.com" } },
  google_reviews: { url: "https://maps.app.goo.gl/abc", rating: 4.8, reviews_count: 120 },
  tips: { url: "https://ko-fi.com/satori" },
  discord: { url: "https://discord.gg/satori" },
}
for (const [provider, extra] of Object.entries(APP_DATA) as [AppProviderId, Record<string, unknown>][]) {
  for (const layout of APP_PROVIDERS[provider].layouts) {
    const title = T(`app_${provider}`, layout)
    add(`app_${provider}`, layout, "app", { ...appBlockDefaults(provider), ...extra, title, layout, ...(provider === "contact" ? { contact: { ...(extra.contact as object), name: title } } : {}) })
  }
}
/* A TikTok and an Instagram profile with no post given: the case the owner hit. */
for (const provider of ["tiktok", "instagram"] as const) {
  for (const layout of APP_PROVIDERS[provider].layouts) {
    add(`app_${provider}_profile`, layout, "app", { ...appBlockDefaults(provider), url: provider === "tiktok" ? "https://www.tiktok.com/@satori" : "https://www.instagram.com/satori", title: T(`app_${provider}_profile`, layout), layout })
  }
}

/* Music and video: each layout (round AR3). */
for (const [name, url] of [["spotify", "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC"], ["soundcloud", "https://soundcloud.com/satori/song"], ["apple", "https://music.apple.com/us/album/name/123456789?i=987654321"]] as const) {
  for (const layout of MUSIC_LAYOUTS) add(`music_${name}`, layout, "music", { url, title: T(`music_${name}`, layout), layout, open_mode: layout === "player" ? "inline" : "sheet" })
}
for (const [name, url] of [["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"], ["vimeo", "https://vimeo.com/76979871"], ["upload", "/images/probe-video.mp4"]] as const) {
  for (const layout of VIDEO_LAYOUTS) add(`video_${name}`, layout, "video", { url, title: T(`video_${name}`, layout), layout, open_mode: layout === "player" ? "inline" : "sheet", ...(name === "upload" ? { poster_url: pic(12, 1280, 720) } : {}) })
}

/* A document, a menu and a booking: Classic and Featured. */
for (const type of ["pdf_document", "food_menu", "calendly"] as const) {
  for (const layout of ["default", "pro"]) add(type, layout, type, { title: T(type, layout), pdf_file_url: "/images/probe.pdf", calendly_url: "https://calendly.com/satori", thumbnail_url: pic(13), layout_type: layout, button_text: "Open" })
}

/* An email signup in each of its layouts. */
for (const layout of ["default", "pro", "cover", "bold", "minimal", "connect", "letter", "bar"]) {
  add("email_capture", layout, "email_capture", { headline: T("email_capture", layout), description: "", placeholder: "Your email", button_text: "Join", success_message: "Thanks", layout_type: layout, product_image: pic(14) })
}

/* A group of three links: stack, grid, carousel. */
for (const layout of ["stack", "grid", "carousel"]) {
  const gid = `group__${layout}`
  add("group", layout, "group", {
    title: T("group", layout),
    layout,
    children: [1, 2, 3].map((n) => ({ id: `${gid}_c${n}`, type: "link_button", enabled: true, sort_order: n, data: { label: `Child ${n}`, url: `https://example.com/c${n}`, thumbnail_url: pic(n + 15) } })),
  })
}

;(globalThis as any).__MATRIX = rows.map(({ id, group, layout, block }) => ({ id, group, layout, type: block.type }))

const theme = { ...defaultTheme, background_color: "#f6f5f2", text_color: "#1a1a2e", button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 14 }
const only = params.get("only")
const matrixBlocks = rows.filter((r) => !only || r.group === only || r.group.startsWith(`${only}`)).map((r) => r.block)

/* The editor: one block of every type the Add block sheet can add, as a creator adds it. */
const ALL_TYPES: OnePageBlockType[] = ["form_quiz", "link_button", "product", "social_row", "text", "image", "divider", "email_capture", "group", "pdf_document", "food_menu", "calendly", "heading", "faq", "countdown", "map", "video", "course", "music", "testimonials", "contact_form", "embed", "storelib_shelf", "lead_magnet", "social_posts", "followers", "promo_code", "app"]
const editorBlocks: OnePageBlock[] = [
  ...ALL_TYPES.map((type, i) => ({ ...createDefaultBlock(type), id: `e_${type}`, sort_order: i })),
  { ...createDefaultBlock("storelib_shelf"), id: "e_shelf_digital", sort_order: 100, data: { source: "digital", title: "", layout: "carousel", limit: 6 } } as OnePageBlock,
  ...(Object.keys(APP_PROVIDERS) as AppProviderId[]).map((p, i) => ({ ...createDefaultBlock("app"), id: `e_app_${p}`, sort_order: 200 + i, data: appBlockDefaults(p) }) as OnePageBlock),
]
;(globalThis as any).__EDITOR_BLOCKS = editorBlocks.map((b) => ({ id: b.id, type: b.type, provider: (b.data as { provider?: string }).provider ?? null }))

const onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  seller_id: "seller_probe",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints and posters",
  avatar_url: pic(3),
  theme: theme as any,
  settings: { ...defaultSettings } as any,
  social_links: { instagram: "https://instagram.com/satori" },
  draft_blocks: params.has("live") || params.has("preview") ? matrixBlocks : editorBlocks,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as OnePage

const root = createRoot(document.getElementById("app")!)
if (params.has("live")) {
  root.render(<PublicOnePage onepage={{ ...onepage, blocks: matrixBlocks } as any} />)
} else if (params.has("preview")) {
  root.render(
    <ExtraBlockPreviewContext.Provider value={true}>
      <PublicOnePage onepage={{ ...onepage, blocks: matrixBlocks } as any} />
    </ExtraBlockPreviewContext.Provider>,
  )
} else {
  root.render(<OnePageEditor initialOnePage={onepage} />)
}
