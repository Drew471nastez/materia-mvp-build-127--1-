/**
 * ===========================================================================
 *  VALIDATE: WHAT A FINISHED WEBSITE MUST BE, CHECKED IN CODE
 * ===========================================================================
 * Per file (an ai_ component):
 *   compile.*   the real compiler, the agent integration rules and a draw of
 *               every placed instance (compile-feedback.ts checkSectionSource)
 *   manifest.*  the <schema> names the file's own type, every setting has a
 *               label, ids are unique, a binding uses a control that exists
 *   import.*    nothing remote: no <script src>, no <link>, no @import, no
 *               http(s) address in the template or style, no iframe
 *   script.*    capabilities beyond the agent defaults need a person's yes
 *   token.*     raw colours outside var() fallbacks (warning)
 *
 * Per site:
 *   binding.*   every picker value is an id list_capabilities returned
 *   route.*     every internal link (url settings, menus) is a page or an
 *               address the platform serves
 *   chrome.*    blank mode: no built-in header or footer
 *   page.*      every section type exists; an ai_ type has its file
 *
 * Pure apart from what it is handed.
 */
import { checkSectionSource, plainCompileErrors } from "@/lib/website-builder/agent/compile-feedback"
import { compileSection, compileThemeFile } from "@/lib/storelib-theme/storelib/compile"
import { controlFor } from "@/lib/storelib-theme/controls/registry"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { pagePath } from "@/lib/website-builder/site-pages"
import type { SectionInstance } from "@/lib/website-builder/types"
import type { RuntimeCapabilities } from "../runtime-contract"
import { AGENT_DEFAULT_CAPABILITIES } from "../runtime-contract"
import { WRITABLE_PATH } from "../agent-tools"
import { isAiComponentType, type GenerationMode, type ValidationIssue } from "../types"
import { schemaProblem, sourceProblems } from "@/lib/website-builder/ai-site/gate"
import { schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { declaredChromeKind } from "@/lib/website-builder/agent/operations"

/* ── one file ─────────────────────────────────────────────────────────── */

export interface FileCheckContext {
  /** Sections already placed that use this file's type, drawn with their own settings. */
  instances?: SectionInstance[]
  theme?: Record<string, unknown>
  /** Every other file of the install. */
  sources?: Record<string, string>
  before?: string | null
  /** After two refusals a quality heuristic is let through; facts still refuse (compile-feedback.ts). */
  lenient?: boolean
  formPicker?: boolean
  /** The creator's own words: the anti-slop gate allows a look only they may ask for (round O). */
  brief?: string
}

export function typeOfPath(path: string): string {
  return path.replace(/^(sections|blocks|snippets)\//, "").replace(/\.storelib$/, "")
}

/** Remote loads and code the runtime does not allow. */
export function importIssues(path: string, text: string): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const at = (re: RegExp) => {
    const m = re.exec(text)
    return m ? text.slice(0, m.index).split("\n").length : undefined
  }
  const err = (code: string, message: string, re: RegExp) => out.push({ severity: "error", code, message, path, line: at(re) })
  if (/<script\b[^>]*\bsrc\s*=/i.test(text)) err("import.script_src", "A <script src> loads remote code. Write behaviour in the file's own <script>, which runs in the sandbox.", /<script\b[^>]*\bsrc\s*=/i)
  if (/<link\b/i.test(text)) err("import.link", "A <link> loads a remote stylesheet or font. Fonts come from Theme settings (font_heading, font_body) and a font setting.", /<link\b/i)
  if (/@import\b/i.test(text)) err("import.css_import", "@import loads a remote stylesheet. Keep every rule in <style scoped>.", /@import\b/i)
  if (/<iframe\b/i.test(text)) err("import.iframe", "An iframe embeds another site. Not allowed in a generated component.", /<iframe\b/i)
  const remote = /(?:src|href|srcset|poster|action)\s*=\s*["']\s*(?:https?:)?\/\/|url\(\s*["']?\s*(?:https?:)?\/\//i
  if (remote.test(text)) err("import.remote_url", "A remote address is typed into the file. Pictures are image settings (| asset), links are url settings (| url).", remote)
  if (/\b(?:eval|Function)\s*\(|\bimport\s*\(/.test(text)) err("import.dynamic_code", "eval, Function() and import() are not allowed.", /\b(?:eval|Function)\s*\(|\bimport\s*\(/)
  return out
}

/** The schema facts the editor depends on. */
function manifestIssues(path: string, schema: { type?: string; name?: string; settings?: { id?: string; type?: string; label?: string }[]; blocks?: { type?: string; settings?: { id?: string; type?: string; label?: string }[] }[]; capabilities?: unknown }, formPicker: boolean): ValidationIssue[] {
  const out: ValidationIssue[] = []
  const type = typeOfPath(path)
  const err = (code: string, message: string) => out.push({ severity: "error", code, message, path })
  if (!schema.name || !String(schema.name).trim()) err("manifest.name", "The schema needs a name: it is what Add section and the sidebar show.")
  if (schema.type && schema.type !== type) err("manifest.type", `The schema says "type": "${schema.type}" but the file is ${type}. Make them the same.`)
  const lists: { where: string; settings: { id?: string; type?: string; label?: string }[] }[] = [{ where: "section", settings: schema.settings ?? [] }, ...(schema.blocks ?? []).map((b) => ({ where: `block ${b.type}`, settings: b.settings ?? [] }))]
  for (const { where, settings } of lists) {
    const seen = new Set<string>()
    for (const s of settings) {
      if (!s?.type || s.type === "header" || s.type === "paragraph") continue
      if (s.id && seen.has(s.id)) err("manifest.duplicate_id", `${where}: two settings are called "${s.id}".`)
      if (s.id) seen.add(s.id)
      if (!s.label || !String(s.label).trim()) err("manifest.label", `${where}: "${s.id}" has no label, so the sidebar shows nothing a person can read.`)
      if (s.type === "form_picker" && !formPicker) err("binding.form_unavailable", `${where}: form_picker is not drawn by the editor yet. Link to the form's page with a url setting instead.`)
      else if (s.type !== "form_picker" && !controlFor(s.type)) err("manifest.control", `${where}: "${s.id}" uses "${s.type}", which is not a control the editor has.`)
    }
  }
  const caps = Array.isArray(schema.capabilities) ? (schema.capabilities as string[]) : []
  const extra = caps.filter((c) => !(AGENT_DEFAULT_CAPABILITIES as readonly string[]).includes(c))
  if (extra.length) err("script.capability", `The script asks for ${extra.join(", ")}. A generated component may use ${AGENT_DEFAULT_CAPABILITIES.join(", ")} only; cart, checkout, forms and menus work through data-storelib-* attributes without script.`)
  return out
}

/** Raw colours outside var() fallbacks in the style: tokens are CSS variables (D3). Warnings. */
function tokenIssues(path: string, text: string): ValidationIssue[] {
  const style = /<style[^>]*>([\s\S]*?)<\/style>/i.exec(text)?.[1] ?? ""
  const stripped = style.replace(/\/\*[\s\S]*?\*\//g, "").replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "VAR")
  const raw = stripped.match(/#[0-9a-f]{3,8}\b/gi)?.filter((h) => !/^#(?:fff|ffffff|000|000000)$/i.test(h)) ?? []
  return raw.length ? [{ severity: "warning", code: "token.raw_color", message: `${raw.length} raw colour${raw.length === 1 ? "" : "s"} (${[...new Set(raw)].slice(0, 3).join(", ")}) in the style. Read colours from the scheme (var(--s-*), {{ scheme.* }}) or tokens (var(--t-*)).`, path }] : []
}

/** One component file, as it is now. Compile errors carry the compiler's plain lines. */
export function validateFile(path: string, text: string, ctx: FileCheckContext = {}): ValidationIssue[] {
  if (!WRITABLE_PATH.test(path)) return [{ severity: "error", code: "path.forbidden", message: `${path} is not a path the agent writes (sections/ai_*.storelib, blocks/ai_*.storelib, snippets/ai_*.storelib).`, path }]
  const issues: ValidationIssue[] = [...importIssues(path, text)]
  /* Round AQ: the classic job's gate, the same words (lib/website-builder/ai-site/gate.ts). A remote script and a typed picture are importIssues' already. */
  for (const p of sourceProblems(text)) if (p.code === "secret" || p.code === "endless_motion") issues.push({ severity: "error", code: `gate.${p.code}`, message: p.message, path })
  const type = typeOfPath(path)
  if (path.startsWith("sections/")) {
    const checked = checkSectionSource({ path, type, source: text, instances: ctx.instances, theme: ctx.theme, sources: ctx.sources, before: ctx.before ?? null, strict: true, lenient: ctx.lenient, ...(ctx.brief !== undefined ? { brief: ctx.brief } : {}) })
    if (checked.ok === false) {
      issues.push({ severity: "error", code: `compile.${checked.reason}`, message: checked.feedback.slice(0, 2000), path, line: checked.errors?.[0]?.line })
      return issues
    }
    for (const n of checked.notes ?? []) issues.push({ severity: "warning", code: `render.${n.id}`, message: n.message, path })
    const compiled = compileSection(text, { file: path, expectType: type })
    if (compiled.ok) issues.push(...manifestIssues(path, compiled.value.schema as never, !!ctx.formPicker))
    /*
      THE SAME GATE AS THE CLASSIC JOB'S CODE STEP (round AQ). A section with no settings could not be edited; a header
      reads the site's menu; picture defaults are empty or https; every default is the site's final words, with no
      placeholder slot, no banned word and no em dash. The agent may design a footer without a menu, as a person might.
    */
    const schema = compiled.ok ? schemasFromSources({ [path]: text })[type] : undefined
    if (schema) {
      const held = schemaProblem(schema, { role: declaredChromeKind(schema) ?? "section", menuFor: ["header"], source: text })
      if (held) issues.push({ severity: "error", code: `gate.${held.code}`, message: held.message, path })
    }
  } else {
    const compiled = compileThemeFile(text, { file: path })
    if (compiled.ok === false) {
      issues.push({ severity: "error", code: "compile.compile", message: `${path} did not compile:\n${plainCompileErrors(compiled.errors, text)}`, path, line: compiled.errors[0]?.line })
      return issues
    }
    if (path.startsWith("blocks/")) issues.push(...manifestIssues(path, compiled.value.schema as never, !!ctx.formPicker))
  }
  issues.push(...tokenIssues(path, text))
  return issues
}

/* ── the site ─────────────────────────────────────────────────────────── */

/** Addresses the platform serves on every website, besides its pages. */
const PLATFORM_PATHS = ["/", "/products", "/collections", "/cart", "/search", "/account", "/account/login", "/wishlist", "/blogs", "/contact"]

export function siteRoutes(pageKeys: string[], caps: RuntimeCapabilities | null): Set<string> {
  const routes = new Set<string>(PLATFORM_PATHS)
  for (const key of pageKeys) routes.add(pagePath(key))
  for (const p of caps?.products ?? []) if (p.url?.startsWith("/")) routes.add(p.url.split(/[?#]/)[0])
  for (const c of caps?.collections ?? []) if (c.url?.startsWith("/")) routes.add(c.url.split(/[?#]/)[0])
  for (const c of caps?.communities ?? []) if (c.url?.startsWith("/")) routes.add(c.url.split(/[?#]/)[0])
  for (const f of caps?.forms ?? []) if (f.url?.startsWith("/")) routes.add(f.url.split(/[?#]/)[0])
  return routes
}

/** An internal address that is not one of the site's. Null when fine (external, anchor, mailto, tel, empty). */
export function brokenRoute(href: unknown, routes: Set<string>): string | null {
  if (typeof href !== "string") return null
  const h = href.trim()
  if (!h.startsWith("/") || h.startsWith("//")) return null
  const path = h.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  /* A product, collection or community page by its own address is in `routes` from list_capabilities. */
  return routes.has(path) ? null : path
}

export interface SchemaInfo {
  settings: { id: string; type: string }[]
  blocks: Record<string, { id: string; type: string }[]>
  kind?: string
  groups?: string[]
}

/** The setting ids and types of a section type: the install's file, else the theme's. Null when there is no such type. */
export function schemaInfo(type: string, sources: Record<string, string>): SchemaInfo | null {
  const path = `sections/${type}.storelib`
  const text = sources[path] ?? (isAiComponentType(type) ? undefined : DEFAULT_THEME_SOURCES[path as keyof typeof DEFAULT_THEME_SOURCES])
  if (text) {
    const compiled = compileSection(text, { file: path })
    if (compiled.ok === false) return null
    const s = compiled.value.schema as unknown as { settings?: { id: string; type: string }[]; blocks?: { type: string; settings?: { id: string; type: string }[] }[]; kind?: string; enabled_on?: { groups?: string[] } }
    const blocks: SchemaInfo["blocks"] = {}
    for (const b of s.blocks ?? []) blocks[b.type] = (b.settings ?? []).filter((x) => x?.id)
    return { settings: (s.settings ?? []).filter((x) => x?.id), blocks, kind: s.kind, groups: s.enabled_on?.groups }
  }
  if (isAiComponentType(type)) return null
  const legacy = (SECTION_SCHEMAS as Record<string, { fields?: { id: string; type: string }[]; blocks?: { type: string; fields?: { id: string; type: string }[] }[] }>)[type]
  if (!legacy) return null
  const blocks: SchemaInfo["blocks"] = {}
  for (const b of legacy.blocks ?? []) blocks[b.type] = (b.fields ?? []).map((f) => ({ id: f.id, type: f.type }))
  return { settings: (legacy.fields ?? []).map((f) => ({ id: f.id, type: f.type })), blocks }
}

const BINDING_TYPES = new Set(["product_picker", "product_list", "collection_picker", "collection_list", "community_picker", "page_picker", "link_list", "form_picker"])

/** Whether a binding value names only real things. Returns the ids that are not. */
export function unknownBindingIds(control: string, value: unknown, caps: RuntimeCapabilities | null, pageKeys: string[], menus: string[]): string[] {
  if (!BINDING_TYPES.has(control)) return []
  const ids = (Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === "string" && v.trim() !== "")
  if (!ids.length) return []
  const known = new Set<string>(
    control === "product_picker" || control === "product_list"
      ? (caps?.products ?? []).flatMap((p) => [p.id, p.url])
      : control === "collection_picker" || control === "collection_list"
        ? (caps?.collections ?? []).map((c) => String(c.id).toLowerCase())
        : control === "community_picker"
          ? (caps?.communities ?? []).map((c) => String(c.id).toLowerCase())
          : control === "page_picker"
            ? pageKeys
            : control === "link_list"
              ? menus
              : control === "form_picker"
                ? (caps?.forms ?? []).map((f) => f.id)
                : [],
  )
  const norm = (v: string) => (control === "collection_picker" || control === "collection_list" || control === "community_picker" ? v.trim().toLowerCase() : v.trim())
  /* "current" is the page's own product or collection on its template. */
  return ids.filter((v) => norm(v) !== "current" && !known.has(norm(v)))
}

export interface SiteCheckInput {
  pages: { key: string; sections: SectionInstance[] }[]
  sources: Record<string, string>
  settings: Record<string, unknown>
  caps: RuntimeCapabilities | null
  mode: GenerationMode
  /** Only these pages (an edit job checks what it touched). Absent: all. */
  only?: Set<string>
}

/** Every page: types exist, bindings are real, internal links resolve, no built-in chrome in blank mode. */
export function validateSite(input: SiteCheckInput): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const pageKeys = input.pages.map((p) => p.key)
  const routes = siteRoutes(pageKeys, input.caps)
  const menus = input.settings.menus && typeof input.settings.menus === "object" ? (input.settings.menus as Record<string, { links?: { title?: string; url?: string; links?: unknown[] }[] }>) : {}
  const menuHandles = Object.keys(menus)
  for (const [handle, menu] of Object.entries(menus)) {
    const walk = (links: { title?: string; url?: string; links?: unknown[] }[] | undefined) => {
      for (const l of links ?? []) {
        const bad = brokenRoute(l.url, routes)
        if (bad) issues.push({ severity: "error", code: "route.menu", message: `The menu "${handle}" links "${l.title ?? ""}" to ${bad}, which is not a page of this site. Add the page or change the link.` })
        walk(l.links as never)
      }
    }
    walk(menu.links)
  }
  for (const page of input.pages) {
    if (input.only && !input.only.has(page.key)) continue
    for (const s of page.sections) {
      const where = { sectionId: s.id }
      if (input.mode === "blank" && (s.type === "header" || s.type === "footer")) {
        issues.push({ severity: "error", code: "chrome.builtin", message: `The page ${page.key} has the theme's built-in ${s.type}. In a blank website write your own ${s.type} component, or have none.`, ...where })
      }
      const info = schemaInfo(s.type, input.sources)
      if (!info) {
        issues.push({ severity: "error", code: "page.unknown_type", message: `${page.key}: section ${s.id} is "${s.type}", which has no file. Write sections/${s.type}.storelib or remove the section.`, ...where })
        continue
      }
      const check = (fields: { id: string; type: string }[], values: Record<string, unknown> | undefined, label: string) => {
        for (const f of fields) {
          const v = values?.[f.id]
          if (v === undefined) continue
          if (BINDING_TYPES.has(f.type)) {
            const bad = unknownBindingIds(f.type, v, input.caps, pageKeys, menuHandles)
            if (bad.length) issues.push({ severity: "error", code: "binding.unknown_id", message: `${page.key} › ${label} "${f.id}" names ${bad.join(", ")}, which this store does not have. Use an id from list_capabilities or clear it.`, ...where })
          } else if (f.type === "url") {
            const bad = brokenRoute(v, routes)
            if (bad) issues.push({ severity: "error", code: "route.link", message: `${page.key} › ${label} "${f.id}" links to ${bad}, which is not a page of this site.`, ...where })
          }
        }
      }
      check(info.settings, s.settings, s.type)
      for (const b of s.blocks ?? []) check(info.blocks[b.type] ?? [], b.settings, `${s.type} block ${b.type}`)
    }
  }
  return issues
}

/** Errors only, for the finish gate. */
export const errorsOf = (issues: ValidationIssue[]) => issues.filter((i) => i.severity === "error")
