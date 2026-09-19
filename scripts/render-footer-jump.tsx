/**
 * Mounts the real footer at the bottom of a real canvas scroller, so a
 * browser can press one of its links and watch what the scroll does between
 * the press and the navigation. Bundled and driven by
 * scripts/check-footer-jump.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { PIN_WHILE_OPENING_MS, pinScroll } from "@/lib/website-builder/canvas-scroll"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

/* A footer with the link columns every site ships with, including the three
   policy pages, which are the links in the report. */
const section: SectionInstance = {
  id: "footer",
  type: "footer",
  settings: { logo_text: "Acme", show_social: true },
  blocks: [
    { id: "c1", type: "footer_column", settings: { heading: "Shop" } },
    { id: "l1", type: "footer_link", settings: { label: "All products", url: "/products" } },
    { id: "l2", type: "footer_link", settings: { label: "About", url: "/about" } },
    { id: "c2", type: "footer_column", settings: { heading: "Help" } },
    { id: "l3", type: "footer_link", settings: { label: "Contact", url: "/contact" } },
    { id: "l4", type: "footer_link", settings: { label: "Refund Policy", url: "/refund-policy" } },
    { id: "l5", type: "footer_link", settings: { label: "Privacy Policy", url: "/privacy-policy" } },
  ],
} as unknown as SectionInstance

createRoot(document.getElementById("footer")!).render(
  createElement(FooterSection, {
    section,
    theme,
    deviceMode: "desktop",
    insideEditor: true,
    onEditorNavigate: (href: string) => {
      const w = window as unknown as { __nav?: { href: string; at: number; scrollTop: number }[] }
      const scroller = document.getElementById("wb-preview-root")
      ;(w.__nav ??= []).push({ href, at: Math.round(performance.now()), scrollTop: scroller?.scrollTop ?? -1 })
    },
  }),
)

/*
  The real pin, exposed so the probe measures the function that ships rather
  than a copy of it. `released` is a flag the probe owns, standing in for the
  editor's "a finger is on the canvas, or the new page has arrived".
*/
const w = window as unknown as {
  __pin?: () => void
  __release?: boolean
  __pinMs?: number
}
w.__release = false
w.__pinMs = PIN_WHILE_OPENING_MS
w.__pin = () => {
  const el = document.getElementById("wb-preview-root")
  if (!el) return
  pinScroll(el, PIN_WHILE_OPENING_MS, (cb) => window.requestAnimationFrame(cb), () => Date.now(), () => !!w.__release)
}
