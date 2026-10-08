/**
 * ===========================================================================
 *  THE PAGE THE AGENT JUST MADE, AS ONE HTML DOCUMENT
 * ===========================================================================
 * The agent works on the editor's unsaved state, so there is no URL to open:
 * the published page is the last thing that was saved, and the canvas lives
 * in the creator's browser. To look at its own work it needs the page drawn
 * somewhere a headless browser can measure, from the state it holds.
 *
 * The pieces are the ones the live page is drawn with, not a re-creation:
 * every .storelib section goes through `renderStorelibSection` (the same pure
 * renderer the canvas and the published route use), inside a root carrying the
 * theme's own stylesheet and variables (lib/website-builder/theme-css) and
 * the fonts it names (lib/website-builder/font-link). Built-in React sections
 * (the product's own header and footer) are drawn as a block of their usual
 * height so the page around them is laid out as it will be, and are not
 * judged themselves.
 *
 * Drawn as the editor draws it (in_editor), so a picture slot the creator has
 * not filled yet shows its placeholder rather than reading as an empty band:
 * that is the page the creator is looking at.
 *
 * Section scripts are not run here: they run in a sandbox on the live page,
 * and what is measured is the layout at rest. Motion is settled to its end
 * state so an entrance animation does not read as an empty section.
 *
 * Pure: no browser, no network. ./visual-check.ts opens the result.
 */

import { renderStorelibSection, isStorelibSection } from "../storelib-runtime"
import { THEME_ROOT_ATTRIBUTE, themeStylesheet, themeVars } from "../theme-css"
import { fontStylesheetHref, sectionFamilies } from "../font-link"
import { schemaOf, type SchemaMap } from "./schemas"
import type { ThemeState } from "./operations"
import type { ThemeSettingsValues } from "../types"

/** Sections that draw the store's data, which this document does not have: never judged as empty. */
const DATA_CATEGORIES = new Set(["products", "community"])
/** And these by type: they draw the visitor's place in the site or a community, which a check has none of. */
const DATA_TYPES = new Set(["breadcrumbs", "community_card"])

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")

export interface PageDocument {
  html: string
  /** Sections drawn, by id, in order. */
  drawn: string[]
  /** Sections that could not be drawn, with why. */
  failed: { id: string; error: string }[]
}

export function composePageDocument(state: ThemeState, sources: Record<string, string>, schemas?: SchemaMap): PageDocument {
  const theme = state.settings as unknown as ThemeSettingsValues
  const drawn: string[] = []
  const failed: { id: string; error: string }[] = []
  const parts: string[] = []
  for (const section of state.sections) {
    if (section.hidden) continue
    const schema = schemaOf(schemas, section.type)
    const category = (schema as { category?: string } | undefined)?.category ?? ""
    const skipEmpty = DATA_CATEGORIES.has(category) || DATA_TYPES.has(section.type) ? ' data-check-skip-empty=""' : ""
    if (!isStorelibSection(section.type, sources)) {
      /* The product's own React sections: a stand-in of the usual height. */
      const height = section.type === "header" ? 72 : section.type === "footer" ? 220 : 120
      parts.push(`<div data-check-standin="${escapeAttr(section.type)}" style="height:${height}px;background:var(--theme-bg)"></div>`)
      continue
    }
    try {
      const out = renderStorelibSection(section, theme, { template: "index", in_editor: true }, sources)
      if (out.ok === false) {
        failed.push({ id: section.id, error: out.errors.map((e) => e.message).join("; ").slice(0, 300) })
        continue
      }
      drawn.push(section.id)
      /* The optimizer's addresses are the site's own (/_next/image): outside the site they resolve nowhere, so the original is drawn. */
      const html = out.html.replace(/\s(srcset|sizes)="[^"]*"/g, "")
      parts.push(`<div data-check-section="${escapeAttr(section.id)}" data-check-type="${escapeAttr(section.type)}"${skipEmpty}>${out.css ? `<style>${out.css}</style>` : ""}${html}</div>`)
    } catch (thrown) {
      failed.push({ id: section.id, error: thrown instanceof Error ? thrown.message.slice(0, 300) : "it threw while drawing" })
    }
  }
  const vars = Object.entries(themeVars(theme))
    .map(([k, v]) => `${k}:${String(v).replace(/[;"<>]/g, "")}`)
    .join(";")
  const font = fontStylesheetHref(state.settings, sectionFamilies(state.sections))
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${font ? `<link rel="stylesheet" href="${escapeAttr(font)}">` : ""}<style>html,body{margin:0;padding:0}*,*::before,*::after{animation-delay:0s!important;animation-duration:0.001s!important;animation-iteration-count:1!important;transition:none!important}</style></head><body><div ${THEME_ROOT_ATTRIBUTE}="" style="${escapeAttr(vars)};container-type:inline-size"><style>${themeStylesheet(theme)}</style>${parts.join("")}</div></body></html>`
  return { html, drawn, failed }
}
