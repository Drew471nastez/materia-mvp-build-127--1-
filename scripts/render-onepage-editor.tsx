/**
 * The whole OnePage editor (components/onepage/onepage-editor.tsx), mounted
 * with a filled page for scripts/check-onepage-editor.mjs. The network and
 * Supabase are stubs; nothing in the editor is.
 */
import React from "react"
import { createRoot } from "react-dom/client"
import { watchLeaveGuard } from "@/lib/ui/leave-guard"
import { OnePageEditor } from "@/components/onepage/onepage-editor"
import { PublicOnePage } from "@/components/onepage/public-onepage"
import { OnePagePreviewDocument } from "@/components/onepage/preview-document"
import { THEME_TEMPLATES } from "@/components/onepage/tabs/design-tab"
import { ViewportVars } from "@/components/viewport-vars"
import { KeyboardGuard } from "@/components/platform/keyboard-guard"
import { defaultTheme, defaultSettings, type OnePage } from "@/lib/onepage/types"
import { slotsFor } from "@/components/onepage/themes/theme-preview"
import { previewAccountOf } from "@/components/onepage/themes/preview-account"
import { themeProductLayoutOf } from "@/lib/onepage/theme-layout"

/**
 * Round AT (scripts/check-onepage-theme-previews-as1.mjs): ?live&template=x&creator draws the live page the
 * theme's card draws: this page's own name, photo and blocks (components/onepage/themes/preview-account),
 * with the samples a card fills in, in the card's order. A probe can hand its own page (PROBE_ACCOUNT).
 */
function creatorPage(page: Record<string, any>, theme: Record<string, unknown>) {
  const money = (cents: number) => `$${(cents / 100).toFixed(2)}`
  const who = previewAccountOf(page as never, money)
  const products = themeProductLayoutOf(theme)
  const blocks: any[] = [{ id: "s", type: "social_row", enabled: true, sort_order: 0, data: { platforms: who.socials.map((p) => ({ platform: p, url: `https://example.com/${p}` })) } }]
  const add = (type: string, data: Record<string, unknown>) => blocks.push({ id: `b${blocks.length}`, type, enabled: true, sort_order: blocks.length, data })
  for (const s of slotsFor(who)) {
    if (s.kind === "link") { const l = who.links[s.at]; add("link_button", { label: l.label, url: "https://example.com/l", thumbnail_url: l.picture }) }
    else if (s.kind === "news") add("email_capture", { headline: who.news.headline, description: who.news.desc, placeholder: "Email", button_preset: "custom", custom_button_text: who.news.button })
    else for (const p of products === "own" ? who.products.slice(0, 1) : who.products) add("product", { product_id: `p${blocks.length}`, product_slug: `p${blocks.length}`, product_title: p.title, product_price_cents: Math.round(parseFloat(p.price.replace(/[^0-9.]/g, "")) * 100), product_thumbnail: p.picture, cta_text: p.cta, show_description: false })
  }
  return { title: who.name, bio: who.bio, avatar_url: who.avatar, blocks }
}

const px = (n: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${n * 47},55%,62%)"/></svg>`)}`

/* The listener a page with unsaved work holds Back with, added before the app
   as instrumentation-client.ts adds it (lib/ui/leave-guard.ts). It holds
   nothing until the editor sets a guard. */
watchLeaveGuard()

/* The onboarding wizard has been done, so the editor opens on its tabs. */
try { localStorage.setItem("onepage-onboarding-completed", "true") } catch {}

const PROBE_THEME = (globalThis as any).PROBE_THEME || {}
/* A probe that needs a longer list (scripts/check-onepage-reorder.mjs) hands its own. */
const PROBE_BLOCKS = (globalThis as any).PROBE_BLOCKS as OnePage["draft_blocks"] | undefined
const onepage: OnePage = {
  id: "op_probe",
  owner_id: "probe-user",
  slug: "satori",
  /* A probe can name the page (scripts/check-onepage-theme-previews.mjs draws each theme under its own name). */
  title: (globalThis as any).PROBE_TITLE ?? "Satori Studio",
  bio: "Prints, posters and a newsletter",
  /* A probe that needs a real https photo, or none (scripts/check-onepage-share-image.mjs), hands its own. */
  avatar_url: "PROBE_AVATAR" in globalThis ? (globalThis as any).PROBE_AVATAR : px(3),
  theme: { ...defaultTheme, ...PROBE_THEME },
  settings: defaultSettings,
  social_links: { instagram: "https://instagram.com/satori" },
  draft_blocks: PROBE_BLOCKS ?? [
    { id: "b1", type: "link_button", enabled: true, sort_order: 0, data: { label: "Shop the prints", url: "https://example.com/shop" } as any },
    { id: "b2", type: "link_button", enabled: true, sort_order: 1, data: { label: "Late night mix", url: "https://example.com/mix" } as any, schedule: { start_at: "2030-01-02T18:00:00.000Z", end_at: null } },
    { id: "b3", type: "heading", enabled: true, sort_order: 2, data: { text: "Work with me", size: "medium", alignment: "center" } as any },
  ],
  status: "published",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  onboarding_completed: true,
  /* Round AU (scripts/check-onepage-au2.mjs): the server's fingerprint of the copy opened, when a probe names one. */
  edit_version: (globalThis as any).PROBE_EDIT_VERSION ?? null,
}

/*
  ?live renders the published page instead, with a theme that exercises
  what the Design tab sets: a gradient with grain, a texture over it, a
  serif body font and no title colour or title font of its own (so both
  must fall back to the text colour and the body font, as the preview does).
*/
if (location.pathname.startsWith("/onepage-preview")) {
  /* The preview's own frame (components/onepage/live-preview): the live page, drawn from what the editor posts. */
  createRoot(document.getElementById("app")!).render(<OnePagePreviewDocument />)
} else if (location.search.includes("live")) {
  const theme = {
    ...defaultTheme,
    background_type: "gradient",
    background_gradient: "linear-gradient(180deg, #1a1a2e 0%, #3b2f5c 100%)",
    background_color: "#1a1a2e",
    gradient_noise: true,
    noise_strength: 20,
    background_pattern: "dots",
    pattern_color: "#ffffff90",
    pattern_opacity: "medium",
    font_family: "'Playfair Display', serif",
    title_font: null,
    title_color: null,
    text_color: "#f4efe9",
    button_style: "filled",
    button_color: "#f4efe9",
    button_text_color: "#1a1a2e",
  }
  /* A probe can hand a whole theme of its own, or name a Design tab template (?live&template=riso): scripts/check-onepage-design.mjs. */
  const named = new URLSearchParams(location.search).get("template")
  const template = named ? THEME_TEMPLATES.find((t) => t.id === named) : null
  const live_theme = template
    ? { ...defaultTheme, ...template.theme_config, template_id: template.id }
    : (globalThis as any).PROBE_LIVE_THEME ? { ...defaultTheme, ...(globalThis as any).PROBE_LIVE_THEME } : theme
  /* One header, whoever supplies it: a probe that hands its own blocks may
     already have the one the editor gives a real page (PROBE_BLOCKS), and
     two would draw the avatar, the name and the bio twice. */
  const header = { id: "h", type: "header", enabled: true, sort_order: -1, data: { show_avatar: true, show_name: true, show_bio: true } }
  const own = onepage.draft_blocks.filter((b) => !b.schedule && b.type !== "header")
  const made = template && new URLSearchParams(location.search).has("creator") ? creatorPage((globalThis as any).PROBE_ACCOUNT ?? onepage, live_theme) : null
  const live = made
    ? { ...onepage, title: made.title, bio: made.bio, avatar_url: made.avatar_url, theme: live_theme, blocks: [header, ...made.blocks], seller_id: "seller_probe" }
    : { ...onepage, theme: live_theme, blocks: [header, ...own], seller_id: "seller_probe" }
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={live as any} />)
} else {
  /* A probe of the keyboard (scripts/check-onepage-addblock-r11.mjs) asks for app/(storelib)/layout.tsx's two publishers of it, so a sheet reads --kb-inset and --vv-h as in the app. */
  const keyboard = (globalThis as any).PROBE_KEYBOARD ? <><ViewportVars /><KeyboardGuard /></> : null
  createRoot(document.getElementById("app")!).render(<>{keyboard}<OnePageEditor initialOnePage={onepage} /></>)
}
