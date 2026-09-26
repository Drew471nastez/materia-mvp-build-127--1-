/**
 * A published website's page, mounted the way the site route mounts it, for
 * scripts/check-storefront-mobile-drawer.mjs: the real ThemePage with the
 * real header, a page tall enough to scroll, and the guard the root layout
 * mounts on every page (StuckLayerGuard), because that guard is part of
 * what decides whether the menu's scroll lock survives a touch.
 *
 * The header is set from the address, so one bundle draws every variant:
 *
 *   ?links=14        how many menu links (the second one has children)
 *   &sticky=1        Header › Sticky
 *   &reveal=1        Header › Show on scroll up (hides on scroll down)
 *   &transparent=1   Header › Transparent
 *   &style=left      Header › Menu on phones: left, right or full
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { StuckLayerGuard } from "@/components/platform/stuck-layer-guard"
import { SiteDocument } from "@/components/website-builder/site-document"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const params = new URLSearchParams(location.search)
const flag = (k: string) => params.get(k) === "1"
const links = Number(params.get("links") ?? "4")

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as unknown as ThemeSettingsValues

const navBlocks = Array.from({ length: links }, (_, i) => ({
  id: `nav-${i}`,
  type: "nav_link",
  settings: { label: i === 1 ? "Services" : `Page ${i + 1}`, url: `#page-${i + 1}`, link_type: "custom" },
}))
/* The second link opens a submenu, like "Services" in the recording. */
if (links > 1) {
  for (let j = 0; j < 3; j++) {
    navBlocks.push({ id: `nav-1-${j}`, type: "nav_link", settings: { label: `Service ${j + 1}`, url: `#service-${j + 1}`, link_type: "custom", parent_id: "nav-1" } as never })
  }
}

const header: SectionInstance = {
  id: "hdr",
  type: "header",
  name: "Header",
  settings: {
    color_scheme: "black",
    header_sticky_enabled: flag("sticky") || flag("reveal"),
    header_sticky_on_scroll_up: flag("reveal"),
    header_transparent: flag("transparent"),
    mobile_menu_style: params.get("style") ?? "left",
    show_cta_button: true,
    cta_text: "Contact",
    cta_url: "#contact",
  },
  blocks: navBlocks,
} as unknown as SectionInstance

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#d9dce3"/></svg>')
function instance(type: string, i: number): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const preset = schema.presets?.[0]
  const settings: Record<string, unknown> = { ...(preset?.settings ?? {}) }
  for (const f of schema.fields ?? []) {
    if ((f.type === "image_picker" || f.type === "image_gallery") && settings[f.id] === undefined) settings[f.id] = PLACEHOLDER
    if (!settings[f.id] && (f.id === "heading" || f.id === "title")) settings[f.id] = `Section ${i}`
  }
  const blocks = (preset?.blocks ?? []).map((b, j) => ({ id: `${type}-${i}-b${j}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  return { id: `${type}-${i}`, type, name: schema.name, settings, blocks } as SectionInstance
}
const body = ["image_banner", "rich_text", "feature_grid", "faq", "cta", "rich_text", "feature_grid", "cta"].map((t, i) => instance(t, i + 1))

createRoot(document.getElementById("app")!).render(
  createElement("div", null,
    /* A marker at the top of the page, read by its rect: it moves when the
       page moves, whichever way the page is being held still. */
    createElement("div", { id: "page-marker", style: { height: 0 } }),
    createElement(ThemePage, {
      theme,
      sections: [header, ...body, instance("footer", 99)],
      storefront: { creatorId: "probe-creator", installId: "00000000-0000-4000-8000-000000000000" },
    }),
    createElement("div", { style: { height: 1600 } }),
    createElement(StuckLayerGuard),
    createElement(SiteDocument),
  ),
)
