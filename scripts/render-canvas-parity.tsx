/**
 * One page, drawn the two ways Storelib draws it: as the live site does
 * (ThemePage's own renderer) and as the editor's canvas does (the renderer
 * the editor hands ThemePage: inside the editor, told the device). Bundled
 * by scripts/check-canvas-parity.mjs, which lays both out in a browser and
 * compares every section.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

const OUT = process.env.OUT_DIR!
const theme = {
  ...Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))),
  /* The two settings the reported band came from: sections that animate in, and a gap between them. */
  animations_enabled: true,
  section_gap: 24,
} as unknown as ThemeSettingsValues

function preset(type: string, id: string, extra: Record<string, unknown> = {}): SectionInstance {
  const schema = SECTION_SCHEMAS[type]
  const p = schema.presets?.[0]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  Object.assign(settings, p?.settings ?? {}, extra)
  const blocks = (p?.blocks ?? []).map((b, i) => ({ id: `${id}-b${i}`, type: b.type, settings: { ...(b.settings ?? {}) } }))
  return { id, type, name: schema.name, settings, blocks }
}
const sections: SectionInstance[] = [
  preset("header", "hdr", { color_scheme: "black", header_sticky_enabled: true }),
  preset("hero_centered", "hero", { color_scheme: "black", full_height: true }),
  preset("rich_text", "text"),
  preset("cta_simple", "cta"),
  preset("footer", "ftr"),
]

for (const device of ["mobile", "desktop"] as const) {
  const live = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(ThemePage, { theme, sections, storefront: { inEditor: false } } as never),
    } as never),
  )
  const canvas = renderToStaticMarkup(
    createElement(StorelibLiveProvider, {
      sources: {},
      children: createElement(ThemePage, {
        theme,
        sections,
        storefront: { inEditor: true },
        renderSection: (section: SectionInstance, role: string) =>
          createElement(SectionRenderer, {
            key: section.id,
            section,
            theme,
            insideEditor: true,
            isEditing: false,
            isSelected: false,
            deviceMode: device,
            wrapperId: `wb-section-${section.id}`,
            ...(role === "header" ? {} : {}),
          } as never),
      } as never),
    } as never),
  )
  writeFileSync(join(OUT, `live-${device}.html`), live)
  writeFileSync(join(OUT, `canvas-${device}.html`), canvas)
}
