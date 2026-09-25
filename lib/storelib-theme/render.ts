/**
 * ===========================================================================
 *  ONE INSTANCE, RENDERED
 * ===========================================================================
 * A compiled section and a template instance go in; HTML and CSS come out.
 * This is the whole of what the storefront and the editor canvas need, and
 * it has no React in it, because the output has to be the same whether it is
 * put on a page by React, written into a static file, or diffed in a test.
 *
 * The section's root carries `data-section-id`, which is what its CSS is
 * scoped to and what its script receives as `root`. The id is the
 * instance's — it came from the template JSON, and it survives every
 * render, which is the point of it.
 */
import { resolveSectionColors, styleAttr } from "./color-schemes"
import { resolveInstance, themeTokens } from "./resolve"
import { sectionTypography } from "./typography"
import { cssForInstance } from "./storelib/css"
import { guardSectionMarkup, guardStyleText } from "./storelib/raw-html"
import { renderTemplate, stripDocumentMarkup, type CompiledTemplate } from "./storelib/template"
import type { CompiledSection, RenderContext, SectionInstanceData } from "./types"

export interface RenderInput {
  compiled: CompiledSection
  /** The instance's persistent id. */
  id: string
  instance: SectionInstanceData
  /** The theme's settings; tokens are derived from them. */
  theme: Record<string, unknown>
  /** Which template this is on, and what it is about. */
  page: RenderContext["page"]
  /** asset://… → URL for this account. */
  assets?: Record<string, string>
  /**
   * The creator's published products, block-shaped. Absent means the surface
   * did not supply any, and a section that asks for them draws none.
   */
  products?: RenderContext["products"]
}

export interface Rendered {
  /** The section's markup, wrapped in its scoped root. */
  html: string
  /** Its CSS, scoped to this instance. Empty when the section has none. */
  css: string
  /** The script bundle, when the section has one. NOT executed here. */
  script: string | null
}

export function renderSection(input: RenderInput): Rendered {
  const { compiled, id, instance } = input
  const assets = input.assets ?? {}
  const { settings, blocks } = resolveInstance(compiled.schema, instance, { assets })
  const theme = themeTokens(input.theme)
  /**
   * The section's colours: its scheme, then its own overrides, resolved by
   * the same function the React renderers call. Exposed under both the
   * semantic names and the legacy ones.
   */
  const schemeSetting = compiled.schema.settings.find((s) => s.type === "color_scheme" || s.id === "color_scheme")
  const colorSettings = schemeSetting && schemeSetting.id !== "color_scheme" ? { ...settings, color_scheme: settings[schemeSetting.id] } : settings
  const colors = resolveSectionColors(input.theme, colorSettings)
  const ctx: RenderContext = {
    settings,
    blocks,
    theme,
    scheme: { ...colors.legacy, ...colors.scheme },
    page: input.page,
    products: input.products ?? [],
    section: { id, type: compiled.type },
    assets,
  }
  /* No tag here acts on the whole document, whatever the file or a richtext
     setting held: storelib/template.ts, DOCUMENT_MARKUP. And nothing drawn
     runs anything, however the template spelled it: storelib/raw-html.ts,
     guardSectionMarkup. */
  const inner = guardSectionMarkup(stripDocumentMarkup(renderTemplate(compiled.template as CompiledTemplate, ctx)))
  const typo = sectionTypography(settings)
  const attrs = [
    `data-section-id="${escapeAttr(id)}"`,
    `data-section-type="${escapeAttr(compiled.type)}"`,
    `data-color-scheme="${escapeAttr(colors.key)}"`,
  ]
  if (typo.heading) attrs.push(`data-heading-style="${escapeAttr(typo.heading)}"`)
  if (typo.body) attrs.push(`data-body-style="${escapeAttr(typo.body)}"`)
  const rootStyle: Record<string, string> = { ...colors.vars, ...typo.vars }
  if (colors.scheme.gradient) rootStyle.background = colors.scheme.gradient
  attrs.push(`style="${escapeAttr(styleAttr(rootStyle))}"`)
  const html = `<div ${attrs.join(" ")}>${inner}</div>`
  return {
    html,
    /* It is written into a <style> element, which a `</style` would end early. */
    css: compiled.css
      ? guardStyleText(
          cssForInstance(
            compiled.cssTemplate ? renderTemplate(compiled.cssTemplate as CompiledTemplate, ctx, { mode: "css" }) : compiled.css,
            id,
          ),
        )
      : "",
    script: compiled.script,
  }
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}
