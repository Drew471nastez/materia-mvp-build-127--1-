/**
 * The Storelib theme's newsletter sections, mounted for real in a browser by
 * scripts/check-newsletter-sections.mjs: Newsletter signup (`newsletter`,
 * drawn by React), Newsletter Signup (`promo_newsletter`, a .storelib file
 * drawn by the live engine) and the Popup's email box (`popup`), each from
 * its schema's defaults, its first preset and the settings a case gives it.
 *
 * `window.__nl` says what to draw: { cases: [{ id, type, settings }],
 * mode: "live" | "canvas", creator }. Live is the website (ThemePage with a
 * creator, so a sign up is sent); canvas is the editor's (inside the editor,
 * no creator, nothing sent).
 */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { ThemePage } from "@/components/website-builder/theme/ThemePage"
import SectionRenderer from "@/components/website-builder/sections/SectionRenderer"
import { StorelibLiveProvider } from "@/components/website-builder/sections/storelib-live"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

type Case = { id: string; type: string; settings?: Record<string, unknown> }
const d = (window as unknown as { __nl: { cases: Case[]; mode: "live" | "canvas"; creator: string } }).__nl

const theme = Object.fromEntries(
  THEME_SETTINGS_GROUPS.flatMap((g) => (g.fields ?? []).filter((f) => f.default !== undefined).map((f) => [f.id, f.default])),
) as unknown as ThemeSettingsValues

function instance(c: Case): SectionInstance {
  const schema = SECTION_SCHEMAS[c.type]
  const settings: Record<string, unknown> = {}
  for (const f of schema.fields ?? []) if (f.default !== undefined) settings[f.id] = f.default
  Object.assign(settings, schema.presets?.[0]?.settings ?? {}, c.settings ?? {})
  return { id: c.id, type: c.type, name: schema.name, settings, blocks: [] }
}
const sections = d.cases.map(instance)
const canvas = d.mode === "canvas"

createRoot(document.getElementById("app")!).render(
  <StorelibLiveProvider sources={{}} page={{ template: "index" }} inEditor={canvas}>
    <ThemePage
      theme={theme}
      sections={sections}
      storefront={canvas ? ({ inEditor: true } as never) : ({ inEditor: false, creatorId: d.creator } as never)}
      renderSection={
        canvas
          ? (section: SectionInstance) => (
              <div key={section.id} data-case={section.id}>
                <SectionRenderer section={section} theme={theme} insideEditor isEditing isSelected={false} wrapperId={`wb-section-${section.id}`} />
              </div>
            )
          : (section: SectionInstance) => (
              <div key={section.id} data-case={section.id}>
                <SectionRenderer section={section} theme={theme} />
              </div>
            )
      }
    />
  </StorelibLiveProvider>,
)
