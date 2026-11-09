/**
 * Round AP's button controls harness (scripts/check-onepage-button-controls-ap.mjs):
 * the real editor, its preview frame and the real published page, with the
 * buttons of every kind a page draws in the page's button style: a plain
 * link, a link with an icon, a booking (Calendly) button, a video set to open
 * in the sheet (the sheet's button) and an email signup's button. One look
 * per ?v=N from window.PROBE_VARIANTS.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"

try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const params = new URLSearchParams(location.search)
const variants = ((globalThis as any).PROBE_VARIANTS || [{}]) as Record<string, unknown>[]
const variant = variants[Number(params.get("v") || 0)] || {}

const blocks: OnePage["draft_blocks"] = [
  { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: false, show_name: true, show_bio: false } as any },
  { id: "b1", type: "link_button", enabled: true, sort_order: 1, data: { label: "Shop the prints", url: "https://example.com/shop" } as any },
  { id: "b2", type: "link_button", enabled: true, sort_order: 2, data: { label: "Follow on Instagram", url: "https://instagram.com/satori.shop", icon: "instagram" } as any },
  { id: "c1", type: "calendly", enabled: true, sort_order: 3, data: { title: "Book a call", button_text: "Pick a time", calendly_url: "https://calendly.com/satori/30min", open_mode: "sheet" } as any },
  { id: "v1", type: "video", enabled: true, sort_order: 4, data: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "Watch the tour", open_mode: "sheet" } as any },
]

const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  title: "Satori Studio",
  bio: "",
  avatar_url: null as any,
  theme: { ...defaultTheme, ...variant } as any,
  settings: defaultSettings,
  social_links: {},
  draft_blocks: blocks,
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
}

if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(document.getElementById("app")!).render(<OnePagePreviewDocument />)
} else if (params.has("live")) {
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={{ ...onepage, blocks, seller_id: "seller_probe" } as any} />)
} else {
  createRoot(document.getElementById("app")!).render(<OnePageEditor initialOnePage={onepage} />)
}
