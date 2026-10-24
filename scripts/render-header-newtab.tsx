/**
 * The real website header, as a published page draws it (no editor), for
 * scripts/check-wb-ux-r12.mjs NEWTAB: its links come from the store's Main
 * menu, where "Blog" and "Help" (a dropdown link) are marked "Open in a new
 * tab" in Navigation (the `#_blank` mark, lib/website-builder/new-tab.ts).
 * The page's own link listeners are mounted as on a website (site-links.tsx,
 * new-tab-links.tsx), so a click goes through everything a visitor's does.
 */
import { createRoot } from "react-dom/client"
import { createElement, useEffect } from "react"

import { HeaderSection } from "@/components/website-builder/sections/renderers/HeaderSection"
import { SiteCartProvider } from "@/components/website-builder/site-cart"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { NewTabLinks } from "@/components/website-builder/new-tab-links"
import { SiteLinks } from "@/components/website-builder/site-links"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = {
  ...Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))),
  brand_name: "Atelier Nord",
  menus: {
    "main-menu": {
      title: "Main menu",
      links: [
        { title: "Shop", url: "/products" },
        { title: "Blog", url: "/blog-page#_blank" },
        { title: "More", url: "/more", links: [{ title: "Help", url: "/help#_blank" }, { title: "About", url: "/about" }] },
      ],
    },
  },
} as unknown as ThemeSettingsValues

declare global {
  interface Window { __headerProbeReady?: boolean }
}

function Mount() {
  useEffect(() => { window.__headerProbeReady = true }, [])
  const section = { id: "header", type: "header", settings: { menu: "main-menu", header_sticky_enabled: true, show_cta_button: true, cta_text: "Book a fitting", cta_url: "/fitting#_blank", mobile_menu_style: "left" }, blocks: [] } as unknown as SectionInstance
  return createElement(StorefrontProvider, {
    value: { installId: "00000000-0000-4000-8000-000000000000", inEditor: false },
    children: createElement(SiteCartProvider, {
      shopId: "probe-shop",
      children: [createElement(HeaderSection, { key: "h", section, theme }), createElement(NewTabLinks, { key: "n" }), createElement(SiteLinks, { key: "s" })],
    }),
  })
}

createRoot(document.getElementById("mount")!).render(createElement(Mount))
