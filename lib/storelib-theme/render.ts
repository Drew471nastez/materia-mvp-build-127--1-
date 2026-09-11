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
import { resolveInstance, themeTokens } from "./resolve"
import { cssForInstance } from "./storelib/css"
import { renderTemplate, type CompiledTemplate } from "./storelib/template"
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
  const schemeSetting = compiled.schema.settings.find((s) => s.type === "color_scheme" || s.id === "color_scheme")
  const schemes = (theme.schemes ?? {}) as Record<string, Record<string, unknown>>
  const schemeName = schemeSetting ? String(settings[schemeSetting.id] ?? "") : ""
  const ctx: RenderContext = {
    settings,
    blocks,
    theme,
    scheme: schemes[schemeName] ?? schemes.white ?? {},
    page: input.page,
    section: { id, type: compiled.type },
    assets,
  }
  const inner = renderTemplate(compiled.template as CompiledTemplate, ctx)
  const html = `<div data-section-id="${escapeAttr(id)}" data-section-type="${escapeAttr(compiled.type)}">${inner}</div>`
  return {
    html,
    css: compiled.css
      ? cssForInstance(
          compiled.cssTemplate ? renderTemplate(compiled.cssTemplate as CompiledTemplate, ctx, { mode: "css" }) : compiled.css,
          id,
        )
      : "",
    script: compiled.script,
  }
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}
