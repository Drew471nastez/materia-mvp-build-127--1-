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
  title: "Satori Studio",
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
  const live = { ...onepage, theme: live_theme, blocks: [header, ...own], seller_id: "seller_probe" }
  createRoot(document.getElementById("app")!).render(<PublicOnePage onepage={live as any} />)
} else {
  /* A probe of the keyboard (scripts/check-onepage-addblock-r11.mjs) asks for app/layout.tsx's two publishers of it, so a sheet reads --kb-inset and --vv-h as in the app. */
  const keyboard = (globalThis as any).PROBE_KEYBOARD ? <><ViewportVars /><KeyboardGuard /></> : null
  createRoot(document.getElementById("app")!).render(<>{keyboard}<OnePageEditor initialOnePage={onepage} /></>)
}
