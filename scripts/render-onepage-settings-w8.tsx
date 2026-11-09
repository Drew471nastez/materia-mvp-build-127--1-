/**
 * Round W8's settings matrix harness (scripts/check-onepage-settings-w8.mjs): the real published page, the real
 * editor and its preview frame, with a page that shows what Design › Layout, Buttons and Text change: the header
 * (photo, name, bio), three links (one with an icon, one that may wear the sparkle's animation), a heading, a text
 * block and two product blocks. One look per ?v=N from window.PROBE_VARIANTS: { theme, settings, anim }.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
type Variant = { theme?: Record<string, unknown>; settings?: Record<string, unknown>; anim?: string | null }
const variants = ((globalThis as any).PROBE_VARIANTS || [{}]) as Variant[]
const variant = variants[Number(params.get("v") || 0)] || {}
const pic = (n: number) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="hsl(${n * 67},55%,55%)"/></svg>`)}`
const product = (id: string, title: string, n: number) => ({
  id,
  type: "product",
  enabled: true,
  sort_order: 10 + n,
  data: { product_id: `6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c0${n}`, product_title: title, product_thumbnail: pic(n), product_price_cents: 1900 + n * 100, product_type: "digital", product_slug: `p${n}`, show_price: true, style: "callout", cta_text: "Get it", tap_action: "sheet", instant_checkout: true },
})

/* A probe can start from a theme (window.PROBE_TEMPLATE, a Design › Themes id): the controls must work over any theme. */
const template = THEME_TEMPLATES.find((t) => t.id === (globalThis as any).PROBE_TEMPLATE)
const theme = { ...defaultTheme, ...(template ? { ...template.theme_config, template_id: template.id } : {}), ...(variant.theme || {}) }
;(globalThis as any).__probeTheme = theme

const blocks = [
  { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } },
  { id: "b1", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } },
  { id: "b2", type: "link_button", enabled: true, sort_order: 2, data: { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" } },
  { id: "b3", type: "link_button", enabled: true, sort_order: 3, data: { label: "New drop", url: "https://example.com/drop", ...(variant.anim ? { animation_type: variant.anim } : {}) } },
  { id: "t1", type: "heading", enabled: true, sort_order: 4, data: { text: "Work with me", size: "medium", alignment: "center" } },
  { id: "x1", type: "text", enabled: true, sort_order: 5, data: { content: "Prints made by hand in small runs.", alignment: "center" } },
  product("p1", "Strength Blueprint", 1),
  product("p2", "Meal plan PDF", 2),
] as unknown as OnePage["draft_blocks"]

const onepage = {
  id: "op_probe",
  owner_id: "probe-user",
  /* As a real page row carries it: the Subscribe bell is drawn only for a page with a creator. */
  seller_id: "seller_probe",
  slug: "satori",
  title: "Satori Studio",
  bio: "Prints, posters and a newsletter",
  avatar_url: pic(3),
  theme: theme as any,
  settings: { ...defaultSettings, share_enabled: true, subscribe_enabled: true, ...(variant.settings || {}) } as any,
  social_links: {},
  draft_blocks: blocks,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
} as OnePage

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(document.getElementById("app")!).render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks, seller_id: "seller_probe" } as any} />)
} else {
  createRoot(document.getElementById("app")!).render(<OnePageEditor initialOnePage={onepage} />)
}
