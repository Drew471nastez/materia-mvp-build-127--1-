/**
 * Mounts the real built-site footer for scripts/check-footer-layout.mjs, in
 * the shapes a creator's footer comes in, each in a container as wide as the
 * page it is measured at (the footer lays itself out by its container).
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { FooterSection } from "@/components/website-builder/sections/renderers/FooterSection"
import { StorefrontProvider } from "@/components/website-builder/theme/storefront-context"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const theme = {
  ...Object.fromEntries(
    THEME_SETTINGS_GROUPS.flatMap((g) =>
      (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
    ),
  ),
  brand_name: "Luca Dragoste",
  social_instagram: "https://instagram.com/luca",
  social_linkedin: "https://linkedin.com/in/luca",
  social_threads: "https://threads.net/@luca",
  social_show_in_footer: true,
  menus: {
    services: { title: "Services", links: [
      { title: "Ghostwriting", url: "/ghostwriting" },
      { title: "Pricing", url: "/pricing" },
      { title: "Samples", url: "/samples" },
      { title: "Templates", url: "/templates" },
    ] },
    legal: { title: "Legal", links: [
      { title: "Refund Policy", url: "/refund-policy" },
      { title: "Privacy Policy", url: "/privacy-policy" },
      { title: "Terms Of Service", url: "/terms-of-service" },
    ] },
  },
} as unknown as ThemeSettingsValues

/* The footer in the report: a logo, a line, Services, Legal and Contact. */
const reported = {
  logo_text: "Luca Dragoste",
  tagline: "LinkedIn posts, written with you.",
  copyright: "© {{ date.year }} Luca Dragoste. All rights reserved.",
  color_scheme: "light",
  columns: "2",
  menu: "services",
  menu_2: "legal",
  contact_email: "contact@lucadragoste.ro",
  show_default_links: true,
  padding_top: 60,
  padding_bottom: 40,
}

const variants: Record<string, Record<string, unknown>> = {
  reported: { ...reported, show_newsletter: false },
  "with-signup": { ...reported, columns: "3", show_newsletter: true, show_payment_icons: true },
}

const section = (id: string, settings: Record<string, unknown>) =>
  ({ id, type: "footer", name: "Footer", settings, blocks: [] }) as unknown as SectionInstance

for (const [id, settings] of Object.entries(variants)) {
  const host = document.getElementById(id)
  if (!host) continue
  createRoot(host).render(
    createElement(StorefrontProvider, {
      value: { pages: ["home", "refund-policy", "privacy-policy", "terms-of-service"] },
      children: createElement(FooterSection, { section: section(id, settings), theme }),
    }),
  )
}
