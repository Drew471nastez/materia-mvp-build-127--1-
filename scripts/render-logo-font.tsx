/**
 * The same header, the same theme, drawn the way a published page draws it
 * and the way the editor's canvas draws it, so a browser can read the font
 * off the logo in each. Bundled by scripts/check-logo-font.mjs.
 */
import { createRoot } from "react-dom/client"
import { createElement } from "react"

import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const defaults = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) =>
    (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  ),
) as Record<string, unknown>

/*
  A theme with a serif chosen, because the report is a serif logo on the
  published site and a sans one in the canvas. Whatever the answer is, it has
  to be the same answer on both sides of this file.
*/
const theme = {
  ...defaults,
  font_heading: "Playfair Display",
  font_body: "DM Sans",
  font_accent: "Playfair Display",
} as unknown as ThemeSettingsValues

const sections: SectionInstance[] = [
  {
    id: "header",
    type: "header",
    settings: { logo_text: "THE CHAIR", menu_items: [{ label: "Shop", url: "/products", open_in_new: false }] },
  } as unknown as SectionInstance,
]

createRoot(document.getElementById("published")!).render(
  createElement(ThemePage, { sections, theme, storefront: { creatorId: "probe" } }),
)

createRoot(document.getElementById("canvas")!).render(
  createElement(ThemePage, {
    sections,
    theme,
    storefront: { inEditor: true, installId: "00000000-0000-4000-8000-000000000000" },
  }),
)

/* So the probe can tell "rendered nothing" from "never ran at all", which is
   what an inline bundle carrying the characters that close a script tag
   looks like. */
;(window as unknown as { __ran?: boolean }).__ran = true
