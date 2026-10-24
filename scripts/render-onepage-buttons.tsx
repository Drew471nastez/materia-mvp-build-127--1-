/**
 * The OnePage editor and its published page, for scripts/check-onepage-buttons.mjs:
 * the same page (link buttons with and without an icon, a thumbnail, a long
 * label, a featured Pro link, the social icons) in one of several button
 * looks, picked by ?v=N from window.PROBE_VARIANTS. The editor, its preview
 * frame and the live page all come from this one bundle, so a look can be
 * compared across the three without bundling again.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const thumb = (n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="hsl(${150 + n * 12},45%,62%)"/><stop offset="1" stop-color="hsl(${190 + n * 6},45%,38%)"/></linearGradient></defs><rect width="400" height="200" fill="url(#g)"/></svg>`)}`

const params = new URLSearchParams(location.search)
const variants = ((globalThis as any).PROBE_VARIANTS || [{}]) as Record<string, unknown>[]
const variant = variants[Number(params.get("v") || 0)] || {}

const blocks: OnePage["draft_blocks"] = [
  { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } as any },
  { id: "s", type: "social_row", enabled: true, sort_order: 0, data: { platforms: [] } as any },
  { id: "b1", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } as any },
  { id: "b2", type: "link_button", enabled: true, sort_order: 2, data: { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" } as any },
  { id: "b3", type: "link_button", enabled: true, sort_order: 3, data: { label: "New poster drop", url: "https://example.com/drop", thumbnail_url: thumb(2) } as any },
  { id: "b4", type: "link_button", enabled: true, sort_order: 4, data: { label: "A much longer link label that has to wrap onto a second line on a phone", url: "https://example.com/long" } as any },
  { id: "b5", type: "link_button", enabled: true, sort_order: 5, data: { label: "Studio tour", url: "https://example.com/tour", thumbnail_url: thumb(5), layout_type: "pro" } as any },
]

const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: thumb(3),
  theme: { ...defaultTheme, ...variant } as any,
  settings: defaultSettings,
  social_links: {
    instagram: "https://instagram.com/satori",
    tiktok: "@satori",
    youtube: "https://youtube.com/@satori",
    email: "mailto:hi@satori.studio",
    whatsapp: "https://wa.me/447700900123",
  },
  draft_blocks: blocks,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(document.getElementById("app")!).render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  /* The live page gets the social row's platforms the way a saved page has them (the editor fills them in). */
  const platforms = Object.entries(onepage.social_links).filter(([, url]) => url).map(([platform, url]) => ({ platform, url }))
  const live = {
    ...onepage,
    blocks: blocks.map((b) => (b.type === "social_row" ? { ...b, data: { ...(b.data as any), platforms } } : b)),
    seller_id: "seller_probe",
  }
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={live as any} />)
} else {
  createRoot(document.getElementById("app")!).render(<OnePageEditor initialOnePage={onepage} />)
}
