/**
 * Every block type on the live page, for scripts/check-onepage-sweep.mjs
 * (round AN): one of each block the editor makes (lib/onepage/types
 * createDefaultBlock, given an address where it needs one), one app block
 * for each service (lib/onepage/app-blocks), and the Instagram post in
 * place, in a carousel and in a group.
 *
 *   ?dark      a dark page (else a light one)
 *   ?preview   drawn as the editor's preview draws it (the preview's sandbox flag set)
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { createDefaultBlock, defaultTheme, defaultSettings, type OnePageBlock, type OnePageBlockType } from "@/lib/onepage/types"
import { APP_PROVIDER_IDS, appBlockDefaults, type AppProviderId } from "@/lib/onepage/app-blocks"

const q = new URLSearchParams(location.search)
const dark = q.has("dark")
if (q.has("preview")) (window as unknown as { __onepagePreviewSandbox?: boolean }).__onepagePreviewSandbox = true

const IMG = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="hsl(${n * 47},55%,62%)"/></svg>`)}`
const PDF = "https://files.example.com/guide.pdf"

/* What each block needs beyond its defaults to draw something. */
const FILL: Partial<Record<OnePageBlockType, Record<string, unknown>>> = {
  link_button: { label: "Shop the prints", url: "https://example.com/shop" },
  image: { image_url: IMG(1), images: [{ image_url: IMG(1) }, { image_url: IMG(2) }] },
  text: { content: "Prints, posters and a newsletter." },
  pdf_document: { pdf_file_url: PDF, title: "The print guide" },
  food_menu: { pdf_file_url: PDF, title: "Menu" },
  calendly: { calendly_url: "https://calendly.com/probe/30min", title: "Book a call" },
  heading: { text: "Work with me" },
  map: { address: "Lisbon", title: "Studio" },
  video: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Studio tour" },
  music: { url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", title: "Late night mix" },
  embed: { url: "https://www.instagram.com/p/TALL01/", title: "" },
  contact_form: { title: "Get in touch" },
  countdown: { title: "Launch", target_date: "2030-01-01T00:00:00.000Z" },
  faq: { items: [{ question: "Do you ship?", answer: "Yes, worldwide." }] },
  promo_code: { code: "SATORI10", title: "10% off" },
}

const APP_URL: Partial<Record<AppProviderId, Record<string, unknown>>> = {
  instagram: { url: "https://www.instagram.com/p/TALL01/", layout: "single" },
  tiktok: { url: "https://www.tiktok.com/@satori/video/7300000000000000000" },
  x: { url: "https://x.com/satori/status/1700000000000000000" },
  threads: { url: "https://www.threads.net/@satori" },
  facebook: { url: "https://facebook.com/satori" },
  snapchat: { url: "https://snapchat.com/add/satori" },
  pinterest: { url: "https://pinterest.com/satori" },
  twitch: { url: "https://twitch.tv/satori" },
  reddit: { url: "https://reddit.com/user/satori" },
  rss: { url: "https://satori.example.com/feed.xml" },
  cameo: { url: "https://cameo.com/satori" },
  google_reviews: { url: "https://maps.app.goo.gl/abc", rating: 4.8, reviews_count: 120 },
  audiomack: { url: "https://audiomack.com/satori/song/night" },
  podcasts: { url: "https://podcasts.apple.com/us/podcast/satori/id1234567890" },
  typeform: { url: "https://form.typeform.com/to/abc123" },
  discord: { url: "https://discord.gg/satori" },
  whatsapp_group: { url: "https://chat.whatsapp.com/abcdefg" },
  bonfire: { url: "https://bonfire.com/store/satori", items: [{ id: "i1", title: "Tee", url: "https://bonfire.com/tee", image_url: IMG(3) }] },
  fourthwall: { url: "https://satori.fourthwall.com", items: [{ id: "i1", title: "Hoodie", url: "https://satori.fourthwall.com/hoodie", image_url: IMG(4) }] },
  books: { url: "https://amazon.com/dp/B000000000", items: [{ id: "i1", title: "The book", url: "https://amazon.com/dp/B000000000", image_url: IMG(5) }] },
  affiliate: { url: "https://example.com", items: [{ id: "i1", title: "Camera", url: "https://example.com/camera", image_url: IMG(6) }] },
  tips: { url: "https://ko-fi.com/satori" },
  mobile_app: { ios_url: "https://apps.apple.com/app/id123", android_url: "https://play.google.com/store/apps/details?id=x" },
  events: { items: [{ id: "e1", title: "Lisbon show", date: "2030-03-02", url: "https://tickets.example.com/1" }] },
  stats: { items: [{ id: "s1", title: "Followers", value: "12k" }] },
  poll: { poll_question: "Next print?", poll_options: [{ id: "a", label: "Waves" }, { id: "b", label: "Hills" }] },
  contact: { contact: { name: "Satori", email: "hi@satori.example.com" } },
  email: { email: "hi@satori.example.com" },
  note: { text: "Open Tuesday to Saturday." },
}

const TYPES: OnePageBlockType[] = ["link_button", "text", "image", "divider", "email_capture", "pdf_document", "food_menu", "calendly", "heading", "faq", "countdown", "map", "video", "music", "testimonials", "contact_form", "embed", "promo_code", "followers", "social_posts", "lead_magnet", "storelib_shelf", "form_quiz", "social_row", "product", "course"]

let order = 0
const make = (type: OnePageBlockType, id: string, extra: Record<string, unknown> = {}): OnePageBlock => {
  const b = createDefaultBlock(type)
  return { ...b, id, sort_order: order++, enabled: true, data: { ...(b.data as object), ...(FILL[type] ?? {}), ...extra } as never }
}

const blocks: OnePageBlock[] = [
  ...TYPES.map((t) => make(t, `t_${t}`)),
  /* The pop-ups this round moved onto the sheet, in each of their choices. */
  make("pdf_document", "pdf_direct", { open_mode: "direct" }),
  make("pdf_document", "pdf_inline", { open_mode: "inline" }),
  make("link_button", "spotify_sheet", { label: "Spotify sheet", url: "https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3", spotify_mode: "audio_preview" }),
  make("link_button", "spotify_streaming", { label: "Spotify services", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", spotify_mode: "show_streaming", streaming_services: [{ platform: "apple_music", url: "https://music.apple.com/us/song/1", found: true }, { platform: "deezer", url: "https://deezer.com/track/1", found: true }] }),
  make("link_button", "spotify_page", { label: "Spotify on the page", url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", spotify_mode: "on_page" }),
  make("link_button", "apple_sheet", { label: "Apple Music sheet", url: "https://music.apple.com/us/album/x/1440857781", apple_music_mode: "audio_preview" }),
  make("link_button", "apple_page", { label: "Apple Music on the page", url: "https://music.apple.com/us/album/x/1440857781?i=1440857782", apple_music_mode: "on_page" }),
  ...APP_PROVIDER_IDS.map((p) => {
    const b = createDefaultBlock("app")
    return { ...b, id: `app_${p}`, sort_order: order++, enabled: true, data: { ...appBlockDefaults(p), title: "", ...(APP_URL[p] ?? {}) } as never }
  }),
]

/* The Instagram post in a carousel and in a group. */
const post = (id: string) => make("embed", id, { url: "https://www.instagram.com/p/TALL01/", open_mode: "inline" })
const group = (id: string, carousel: boolean) => {
  const g = createDefaultBlock("group")
  return { ...g, id, sort_order: order++, enabled: true, data: { ...(g.data as object), title: carousel ? "In a carousel" : "In a group", layout: carousel ? "carousel" : "stack", carousel_view: "1.2", children: [post(`${id}_a`), post(`${id}_b`)] } as never }
}
blocks.push(post("post_inline"), group("post_carousel", true), group("post_group", false))

const theme = dark
  ? { ...defaultTheme, background_type: "solid" as const, background_color: "#0e0e10", text_color: "#f4f4f5", secondary_text_color: "#a1a1aa", button_style: "filled" as const, button_color: "#f4f4f5", button_text_color: "#111113", button_border_radius: 999 }
  : { ...defaultTheme, background_type: "solid" as const, background_color: "#f6f4ef", text_color: "#1a1a2e", button_style: "filled" as const, button_color: "#1a1a2e", button_text_color: "#ffffff", button_border_radius: 14 }

const header = { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }
const onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: IMG(7),
  theme,
  settings: defaultSettings,
  social_links: { instagram: "https://instagram.com/satori" },
  blocks: [header, ...blocks],
  draft_blocks: blocks,
  status: "published",
  seller_id: "seller_probe",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}
;(window as unknown as { PROBE_SWEEP_BLOCKS: unknown }).PROBE_SWEEP_BLOCKS = blocks.map((b) => ({ id: b.id, type: b.type, provider: (b.data as { provider?: string }).provider ?? null }))
createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={onepage as never} />)
