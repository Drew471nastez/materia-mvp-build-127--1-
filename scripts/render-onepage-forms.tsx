/**
 * The harness of scripts/check-onepage-forms.mjs: a OnePage whose blocks open
 * forms, drawn the three ways a creator and a visitor see it.
 *
 *   /app?host           the editor's preview as the editor draws it: the real
 *                       LivePreviewFrame (components/onepage/live-preview),
 *                       which reads the creator's forms (/api/forms, answered by
 *                       the probe) and hands them to its frame with the page.
 *                       window.__edit(id, definition) is the builder changing a
 *                       form (lib/forms/preview-forms noteBuilderDraft),
 *                       window.__close(id) the builder closing.
 *   /onepage-preview    the frame itself (the real OnePagePreviewDocument)
 *   /app?live           the published page (PublicOnePage): the forms are read
 *                       as a visitor reads them, /api/forms/<id>/public
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { LivePreviewFrame } from "@/components/onepage/live-preview"
import { noteBuilderDraft } from "@/lib/forms/preview-forms"
import { defaultTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
document.documentElement.classList.remove("app-layout")

export const FORM_ID = "6f1c2d3e-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
export const BOOKING_ID = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const block = (id: string, type: string, data: Record<string, unknown>, i: number) => ({ id, type, enabled: true, sort_order: i, data })

const theme = {
  ...defaultTheme,
  header_layout: "classic",
  background_type: "solid",
  background_color: "#111113",
  text_color: "#f4f4f5",
  button_style: "filled",
  button_color: "#f4f4f5",
  button_text_color: "#111113",
  button_border_radius: 14,
  font_family: "Inter",
}

export const PAGE = {
  id: "forms-page",
  title: "Coach Andrei",
  bio: "Antrenamente personale",
  slug: "andrei",
  avatar_url: null,
  avatar_video_url: null,
  avatar_video_crop: null,
  theme,
  blocks: [
    block("h", "header", { show_avatar: false, show_name: true, show_bio: true }, 0),
    block("coaching", "link_button", { label: "Antrenamente 1:1", action: { type: "form", form_id: FORM_ID } }, 1),
    block("book", "link_button", { label: "Programează o sesiune", action: { type: "booking", form_id: BOOKING_ID } }, 2),
  ],
  social_links: {},
  settings: { show_branding: false, share_enabled: false, subscribe_enabled: false },
  seller_id: null,
}

const app = document.getElementById("app")!
const w = window as unknown as { __edit: (id: string, d: unknown) => void; __close: (id: string) => void; __drawn: boolean }
if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(app).render(<OnePagePreviewDocument />)
} else if (params.has("host")) {
  document.documentElement.style.cssText = "margin:0;height:100%"
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden"
  w.__drawn = false
  w.__edit = (id, d) => noteBuilderDraft(id, d as never)
  w.__close = (id) => noteBuilderDraft(id, null)
  createRoot(app).render(<LivePreviewFrame page={PAGE as never} width={390} height={844} onDrawn={() => (w.__drawn = true)} />)
} else {
  createRoot(app).render(<PublicOnePage onepage={PAGE as never} />)
}
