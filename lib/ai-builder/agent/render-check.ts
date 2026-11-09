/**
 * ===========================================================================
 *  RENDER CHECK: THE PAGE DRAWN BY THE TEMPLATE ENGINE, THEN READ
 * ===========================================================================
 * Every .storelib section on the page is drawn on the server by Storelib's
 * own template interpreter (renderStorelibSection: data in, escaped markup
 * out; no generated code is executed), and the markup is read for what a
 * visitor would hit:
 *
 *   render.empty        a section that draws nothing
 *   render.unresolved   {{ }} or {% %} left in the output
 *   render.throw        the template failed on its real settings
 *   a11y.img_alt        a picture with no alt attribute
 *   a11y.h1             no h1, or more than one, on the page
 *   a11y.heading_order  a heading level skipped (h2 then h4)
 *   route.href          an internal link to an address the site does not have
 *
 * Client runtime errors (the sandbox's) are not here: the editor bridge
 * posts them to the job (L4/L2) and the loop reads them through
 * AgentDeps.previewErrors.
 *
 * TODO(L4 merge): L4 owns the render check helper; AgentDeps.renderCheck
 * takes it. This is the default until then.
 */
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { templateForPage } from "@/lib/website-builder/site-pages"
import { isStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { cleanMenus } from "@/lib/storelib-theme/values"
import type { ThemeSettingsValues } from "@/lib/website-builder/types"
import type { StorefrontData } from "@/lib/storelib-theme/types"
import type { ValidationIssue } from "../types"
import type { RenderChecker } from "./ports"
import { brokenRoute } from "./validate"

export const renderCheckPage: RenderChecker = async ({ page, sections, settings, sources, routes }) => {
  const issues: ValidationIssue[] = []
  let html = ""
  const data = { menus: cleanMenus(settings.menus) } as unknown as StorefrontData
  for (const s of sections) {
    if (s.hidden) continue
    if (!isStorelibSection(s.type, sources)) continue
    try {
      const drawn = renderStorelibSection(s, settings as unknown as ThemeSettingsValues, { template: templateForPage(page), in_editor: false }, sources, undefined, data)
      if (drawn.ok === false) {
        issues.push({ severity: "error", code: "render.throw", message: `${s.type} [${s.id}] did not draw: ${drawn.errors.map((e) => e.message).join("; ").slice(0, 300)}`, sectionId: s.id })
        continue
      }
      const text = drawn.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
      if (!text.replace(/<[^>]+>/g, "").trim() && !/<(img|video|svg|picture|iframe|input|button)\b/i.test(text)) {
        issues.push({ severity: "error", code: "render.empty", message: `${s.type} [${s.id}] draws nothing with its current settings.`, sectionId: s.id })
      }
      if (/\{\{|\{%/.test(text)) issues.push({ severity: "error", code: "render.unresolved", message: `${s.type} [${s.id}] prints template code ({{ or {%) as text.`, sectionId: s.id })
      for (const img of text.match(/<img\b[^>]*>/gi) ?? []) {
        if (!/\balt\s*=/i.test(img)) issues.push({ severity: "error", code: "a11y.img_alt", message: `${s.type} [${s.id}] has a picture with no alt attribute. Give it an alt text setting.`, sectionId: s.id })
      }
      for (const m of text.matchAll(/<a\b[^>]*\bhref\s*=\s*"([^"]*)"/gi)) {
        const bad = brokenRoute(m[1].replace(/&amp;/g, "&"), routes)
        if (bad) issues.push({ severity: "error", code: "route.href", message: `${s.type} [${s.id}] links to ${bad}, which is not a page of this site.`, sectionId: s.id })
      }
      html += text
    } catch (thrown) {
      issues.push({ severity: "error", code: "render.throw", message: `${s.type} [${s.id}] failed to draw: ${(thrown instanceof Error ? thrown.message : String(thrown)).slice(0, 240)}`, sectionId: s.id })
    }
  }
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]))
  const h1 = levels.filter((l) => l === 1).length
  if (levels.length && h1 !== 1) issues.push({ severity: "warning", code: "a11y.h1", message: `The page ${page} has ${h1} h1 headings. It should have exactly one.` })
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) {
      issues.push({ severity: "warning", code: "a11y.heading_order", message: `The page ${page} goes from h${levels[i - 1]} to h${levels[i]}, skipping a level.` })
      break
    }
  }
  return { ok: !issues.some((i) => i.severity === "error"), issues, htmlBytes: Buffer.byteLength(html) }
}
