/**
 * The three footers that carry "Cookie preferences", mounted for real: the
 * creator page and product page footer (live, and both editor previews), a
 * built site's FooterSection, and the storelib.com footer. Bundled and
 * measured by scripts/check-footers.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement, Fragment } from "react"

import { SellerFooter } from "@/components/storefront/seller-footer"
import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { MarketingFooter } from "@/components/marketing/footer"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const section: SectionInstance = {
  id: "footer",
  type: "footer",
  settings: { logo_text: "Acme Goods", show_social: false },
  blocks: [
    { id: "c1", type: "footer_column", settings: { heading: "Shop" } },
    { id: "l1", type: "footer_link", settings: { label: "All products", url: "/products" } },
    { id: "c2", type: "footer_column", settings: { heading: "Help" } },
    { id: "l2", type: "footer_link", settings: { label: "Contact", url: "/contact" } },
  ],
} as unknown as SectionInstance

/* A long copyright line too, because a long one is what wrapped the link. */
const longSection: SectionInstance = {
  ...section,
  id: "footer-long",
  settings: {
    ...section.settings,
    copyright: "© 2026 Acme Goods Limited, registered in England and Wales, company number 01234567. All rights reserved.",
  },
} as unknown as SectionInstance

const mount = (id: string, node: ReturnType<typeof createElement>) => {
  const el = document.getElementById(id)
  if (el) createRoot(el).render(node)
}

mount("seller-live", createElement(SellerFooter))
mount("seller-desktop-preview", createElement(SellerFooter, { isMobile: false }))
mount("seller-phone-preview", createElement(SellerFooter, { isMobile: true }))
mount(
  "seller-dark",
  createElement(SellerFooter, {
    surface: { backgroundColor: "#111111", textColor: "#f5f5f5", mutedColor: "#a3a3a3", borderColor: "#262626" },
  }),
)
mount("site", createElement(Fragment, null, createElement(FooterSection, { section, theme, deviceMode: "desktop" } as never)))
mount("site-long", createElement(Fragment, null, createElement(FooterSection, { section: longSection, theme, deviceMode: "desktop" } as never)))
mount("marketing", createElement(MarketingFooter))
