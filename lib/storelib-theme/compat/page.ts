/**
 * ===========================================================================
 *  ONE PAGE OF AN IMPORTED THEME, THE SAME EVERYWHERE
 * ===========================================================================
 * The published site, the preview and the builder's canvas all draw a page
 * through `drawPage`, from the same files, the same settings and the same
 * sections, so the three cannot disagree. What differs is only what each
 * asks for: the builder's canvas carries its own small script for selecting
 * and editing (./canvas-bridge.ts) and marks the page as design mode, as
 * Shopify's theme editor does.
 */
import type { Ctx } from "./runtime"
import { renderTree } from "./runtime"
import { parseCompat } from "./parser"
import { CompatTheme, splitCompatFile, isCompatSource, type CompatBlockInstance, type CompatPage, type CompatSectionInstance, type CompatThemeOptions } from "./theme"
import { compatOf, compatValues, engineFiles, templateOfPage } from "./install"
import { overrideCss } from "./overrides"
import { withShopifyModules } from "./shims"
import { withStorelibReviewsSection } from "./storelib-reviews"

/** A section as a page row stores it. */
export interface StoredSection {
  id: string
  type: string
  name?: string
  group?: unknown
  hidden?: boolean
  settings?: Record<string, unknown>
  blocks?: StoredBlock[]
  /** In the Overlay group: the theme's group file it is drawn in. */
  slot?: string
}
export interface StoredBlock {
  id: string
  type: string
  settings?: Record<string, unknown>
  static?: boolean
  hidden?: boolean
  blocks?: StoredBlock[]
}

function block(b: StoredBlock): CompatBlockInstance {
  return { id: b.id, type: b.type, settings: b.settings ?? {}, static: b.static === true, hidden: b.hidden === true, blocks: (b.blocks ?? []).map(block) }
}

export function instanceOf(s: StoredSection): CompatSectionInstance {
  return { id: s.id, type: s.type, settings: s.settings ?? {}, hidden: s.hidden === true, blocks: (s.blocks ?? []).map(block), ...(typeof s.slot === "string" ? { slot: s.slot } : {}) }
}

/** A page row's sections in their parts. */
export function pageParts(sections: readonly StoredSection[]): { header: StoredSection[]; template: StoredSection[]; footer: StoredSection[]; overlay: StoredSection[] } {
  const out = { header: [] as StoredSection[], template: [] as StoredSection[], footer: [] as StoredSection[], overlay: [] as StoredSection[] }
  for (const s of sections) {
    if (s.group === "header") out.header.push(s)
    else if (s.group === "footer") out.footer.push(s)
    else if (s.group === "overlay") out.overlay.push(s)
    else out.template.push(s)
  }
  return out
}

/**
 * A section's place as the page draws it, from 0: among the shown sections
 * of its own part (the template's, the header group's, the footer group's,
 * its overlay group file's). `section.index` is that place plus one, and a
 * theme draws by it (`if section.index == 1`: the hero's picture first, a
 * header made transparent over it). Drawn again in the builder at its place
 * in the whole page, the first section of a page was the fourth: a change to
 * one value redrew it as another section would be.
 */
export function sectionIndexIn(list: readonly StoredSection[], section: StoredSection): number {
  const chrome = (g: unknown) => g === "header" || g === "footer" || g === "overlay"
  const same = list.filter((s) => !s.hidden && (chrome(section.group) ? s.group === section.group && (section.group !== "overlay" || (s.slot ?? "") === (section.slot ?? "")) : !chrome(s.group)))
  return Math.max(0, same.indexOf(section))
}

/** The theme an install's files and settings make. */
export function themeOfInstall(rows: Record<string, string>, settings: unknown, opts: Omit<CompatThemeOptions, "renamed" | "themeName">): CompatTheme {
  const compat = compatOf(settings)
  /* With Storelib Reviews' own section, unless the theme has one by that name (./storelib-reviews.ts). */
  return new CompatTheme(withStorelibReviewsSection(engineFiles(rows)), compatValues(settings), { ...opts, renamed: compat?.renamed, themeName: compat?.theme, slots: compat?.slots, chromeGroups: compat?.chrome_groups })
}

export interface DrawOptions {
  /** The theme's own scripts: on the website, and in the builder's canvas, which is a sandbox of its own. */
  scripts: boolean
  /** The page's content, drawn in the theme's layout instead of the page's own sections (a policy, the account pages). */
  content?: string
  extraHead?: string
  extraBodyEnd?: string
}

export interface DrawnPage {
  html: string
  /** Problems while drawing, by section id. */
  errors: Record<string, string[]>
  ctx: Ctx
}

/**
 * The page's context: the theme's settings, the shop, the products, and the
 * page's own header and footer groups.
 */
export function pageContextFor(theme: CompatTheme, page: CompatPage, sections: readonly StoredSection[]): Ctx {
  const parts = pageParts(sections)
  return theme.pageContext({ ...page, groups: { header: parts.header.map(instanceOf), footer: parts.footer.map(instanceOf), overlay: parts.overlay.map(instanceOf) } })
}

/** The whole document. */
export function drawPage(theme: CompatTheme, page: CompatPage, sections: readonly StoredSection[], opts: DrawOptions): DrawnPage {
  const ctx = pageContextFor(theme, page, sections)
  const errors: Record<string, string[]> = {}
  const parts = pageParts(sections)
  let content = ""
  const liquidTemplate = theme.files[`templates/${page.suffix ? `${page.template}.${page.suffix}` : page.template}.liquid`] ?? (page.suffix ? undefined : theme.files[`templates/${page.template}.liquid`])
  if (opts.content !== undefined) {
    content = opts.content
  } else if (liquidTemplate !== undefined && (parts.template.length === 0 || /\bcontent_for_index\b/.test(liquidTemplate))) {
    /* An older theme's index.liquid: its {{ content_for_index }} is the page's sections, drawn where it says. */
    if (parts.template.length) {
      ctx.globals.content_for_index = parts.template
        .filter((s) => !s.hidden)
        .map((s, i) => {
          const r = theme.renderSection(ctx, instanceOf(s), i)
          if (r.errors.length) errors[s.id] = r.errors
          return r.html
        })
        .join("")
    }
    /* A template written in Liquid (gift_card.liquid, an older theme's product.liquid) is the page's content itself. */
    try {
      content = renderTree(parseCompat(isCompatSource(liquidTemplate) ? splitCompatFile(liquidTemplate).markup : liquidTemplate, { lax: true }), ctx)
    } catch (e) {
      errors.template = [(e as Error).message]
    }
  } else {
    content = parts.template
      .filter((s) => !s.hidden)
      .map((s, i) => {
        const r = theme.renderSection(ctx, instanceOf(s), i)
        if (r.errors.length) errors[s.id] = r.errors
        return r.html
      })
      .join("")
  }
  /* The fonts the theme's settings name, from a public font library (font_face draws no rule of its own). */
  const fonts = theme.fontStylesheets(ctx).map((href) => `<link rel="stylesheet" href="${href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}" data-storelib-font>`).join("")
  const head = `${fonts ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${fonts}` : ""}<style data-storelib-bundle>${theme.stylesheetBundle()}</style>${opts.extraHead ?? ""}<style data-storelib-overrides>${overrideCss(theme.settingsValues)}</style>`
  /*
    `{% layout none %}`: the template is the whole answer, as an older
    theme's ajax views are (`/cart?view=drawer`, `/search?view=json`). No
    layout, no head, nothing added: a script reads it as markup or JSON.
  */
  const layout = typeof ctx.registers.layout === "string" ? ctx.registers.layout : opts.content === undefined ? theme.templateLayout(page.template, page.suffix) : undefined
  if (layout === "none" && opts.content === undefined) return { html: theme.finish(content), errors, ctx }
  const js = opts.scripts ? theme.javascriptBundle() : ""
  const tail = `${js ? `<script data-storelib-bundle>${js.replace(/<\/script/gi, "<\\/script")}</script>` : ""}${opts.extraBodyEnd ?? ""}`
  let html = theme.renderDocument(ctx, content, { extraHead: head, extraBodyEnd: tail, layout })
  /* A theme preloads its font files by font_url; a font library's address is a stylesheet, which the head above already loads. */
  html = html.replace(/<link\b[^>]*rel=["']?preload["']?[^>]*as=["']?font["']?[^>]*href=["']https:\/\/fonts\.googleapis\.com[^>]*>|<link\b[^>]*href=["']https:\/\/fonts\.googleapis\.com[^"']*["'][^>]*rel=["']?preload["']?[^>]*>/gi, "")
  if (!opts.scripts) html = withoutScripts(html)
  else html = withShopifyModules(html)
  return { html, errors, ctx }
}

/** One section, wrapped as on Shopify, for the section rendering API and for the builder's live edits. */
export function drawSection(theme: CompatTheme, ctx: Ctx, section: StoredSection, index = 0, group?: string): { html: string; errors: string[] } {
  /* An Overlay group section is drawn as a section of the theme's group it came from. */
  return theme.renderSection(ctx, instanceOf(section), index, section.group === "overlay" ? section.slot || "overlay-group" : group)
}

/**
 * A page with none of its scripts: for a surface that must not run the
 * theme's code. A stylesheet a theme loads late with `media="print"
 * onload="this.media='all'"` (Dawn's way) is loaded outright, since the
 * handler that would switch it on cannot run here, and every other inline
 * handler goes for the same reason.
 */
export function withoutScripts(html: string): string {
  return html
    .replace(/<script\b(?![^>]*type=["']?(?:application\/(?:ld\+)?json|text\/template)["']?)[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<link\b[^>]*rel=["']?modulepreload["']?[^>]*>/gi, "")
    .replace(/<link\b[^>]*\bonload\s*=\s*(["'])[^"']*this\.media\s*=[^>]*>/gi, (tag) => tag.replace(/\smedia\s*=\s*(["'])print\1/i, ' media="all"'))
    .replace(/<[a-z][a-z0-9-]*\b[^>]*\son[a-z]+\s*=[^>]*>/gi, (tag) => tag.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ""))
}

/** The template and suffix a page key is drawn as. */
export { templateOfPage }
