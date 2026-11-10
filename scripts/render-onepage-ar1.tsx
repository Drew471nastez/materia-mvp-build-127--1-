/**
 * Round AR1's harness (scripts/check-onepage-ar1.mjs): how a OnePage feels.
 *
 *   /app?live            the published page (PublicOnePage), with the app's
 *                        keyboard publishers (ViewportVars, KeyboardGuard), a
 *                        full picture Hero, link buttons in every attention
 *                        animation, a contact block that opens in the sheet, a
 *                        Storelib form behind a button, a shelf, a long page
 *                        and the legal footer
 *   /app?host            the editor's preview as the editor draws it: a frame
 *                        on /onepage-preview (the real OnePagePreviewDocument)
 *                        answered with the page; window.__post(page) sends the
 *                        next one, as the editor does on every edit
 *   /onepage-preview     the frame itself
 *
 * window.__PAGE is the page; a probe edits a copy and posts it.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { ViewportVars } from "@/components/viewport-vars"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { defaultTheme } from "@/lib/onepage/types"

const params = new URLSearchParams(location.search)
/* The probe server's page is /app's (html.app-layout, which fixes the document); the live page and the preview frame never carry it. */
document.documentElement.classList.remove("app-layout")
const FORM_ID = "6f1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d"
const block = (id: string, type: string, data: Record<string, unknown>, i: number) => ({ id, type, enabled: true, sort_order: i, data })
const hero = !params.has("classic")
const dark = params.has("dark")

const theme = {
  ...defaultTheme,
  header_layout: hero ? "hero" : "classic",
  background_type: "solid",
  background_color: dark ? "#101014" : "#f6f1ea",
  text_color: dark ? "#f4f4f5" : "#1d1a16",
  button_style: "filled",
  button_color: dark ? "#f4f4f5" : "#1d1a16",
  button_text_color: dark ? "#101014" : "#ffffff",
  button_border_radius: 14,
  font_family: "Inter",
}

const ANIMS = ["none", "pulse", "bounce", "shake", "glow", "swipe"]
let n = 0
const blocks = [
  block("h", "header", { show_avatar: true, show_name: true, show_bio: true }, n++),
  ...ANIMS.map((a) => block(`link-${a}`, "link_button", { label: `Link ${a}`, url: `https://example.com/${a}`, animation_type: a }, n++)),
  block("link-featured", "link_button", { label: "Featured glow", url: "https://example.com/f", layout: "featured", animation_type: "glow", thumbnail_url: "/images/onepage-themes/fusion.webp" }, n++),
  block("contact", "contact_form", { title: "Get in touch", open_mode: "sheet" }, n++),
  block("form", "form_quiz", { form_id: FORM_ID, title: "Work with me", presentation: "modal" }, n++),
  block("shelf", "storelib_shelf", { title: "Shop", source: "all", layout: "list", limit: 3 }, n++),
  block("pdf", "pdf_document", { title: "Price list", pdf_file_url: "/probe.pdf", animation_type: "pulse", open_mode: "direct" }, n++),
  block("email", "email_capture", { title: "Join the list", animation_type: "bounce" }, n++),
  ...Array.from({ length: 10 }, (_, i) => block(`text-${i}`, "text", { content: `Paragraph ${i + 1}. Prints, posters and notes from the studio, written long enough to wrap onto a second line.` }, n++)),
]

export const PAGE = {
  id: "ar1-page",
  title: "Ana Studio",
  bio: "Prints, posters and a newsletter",
  slug: "ana",
  avatar_url: "/images/onepage-themes/nature.webp",
  avatar_video_url: null,
  avatar_video_crop: null,
  theme,
  blocks,
  social_links: {},
  settings: { show_branding: false, share_enabled: true, subscribe_enabled: false },
  seller_id: "seller_probe",
}
;(window as unknown as { __PAGE: typeof PAGE }).__PAGE = PAGE

const app = document.getElementById("app")!
if (location.pathname.startsWith("/onepage-preview")) {
  createRoot(app).render(<OnePagePreviewDocument />)
} else if (params.has("host")) {
  document.documentElement.style.cssText = "margin:0;height:100%"
  document.body.style.cssText = "margin:0;height:100%;overflow:hidden"
  const f = document.createElement("iframe")
  f.src = "/onepage-preview?embedded=1"
  f.setAttribute("data-host-frame", "")
  f.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0"
  const w = window as unknown as { __post: (p: unknown) => void; __drawn: boolean }
  w.__drawn = false
  w.__post = (page) => f.contentWindow?.postMessage({ channel: "storelib-onepage-preview", kind: "page", page, currency: "USD" }, location.origin)
  window.addEventListener("message", (e) => {
    if (e.data?.channel !== "storelib-onepage-preview") return
    if (e.data.kind === "ready") w.__post(PAGE)
    if (e.data.kind === "drawn") w.__drawn = true
  })
  document.body.appendChild(f)
} else {
  createRoot(app).render(
    <>
      <ViewportVars />
      <KeyboardGuard />
      <PublicOnePage onepage={PAGE as never} />
    </>,
  )
}
