/**
 * ===========================================================================
 *  A SHOPIFY THEME, IMPORTED WHOLE
 * ===========================================================================
 * The ZIP Shopify's admin hands out (or a GitHub download of one: Dawn,
 * Horizon, a commercial theme) becomes a Storelib website that draws the
 * theme's own markup, with the theme's own CSS and scripts, on Storelib's
 * engine. Nothing is rewritten into something else and nothing is thrown
 * away to make it fit:
 *
 *   layout/*.liquid      layout/<name>.storelib       the page shell
 *   sections/*.liquid    sections/<type>.storelib     markup + schema
 *   blocks/*.liquid      blocks/<type>.storelib       markup + schema
 *   snippets/*.liquid    snippets/<name>.storelib     markup
 *   templates/*.json     the website's pages, one per template, each the
 *                        header group, the template's sections and the
 *                        footer group, editable in the builder
 *   sections/*.json      the header and footer groups, placed on every page
 *   config/*.json        the theme's settings, its values the install's
 *   locales/*.json       kept, for `| t`
 *   assets/*             stylesheets, scripts, icons and fonts kept as the
 *                        theme's files; pictures and videos stored as media
 *
 * Each `.storelib` file is in the compatible profile of the template
 * language (lib/storelib-theme/compat): `<template compat="shopify">`, the
 * markup as the theme wrote it, and a `<schema>` that is two schemas at
 * once. The Storelib one is what the builder's panel draws (the same
 * controls every section has); the theme's own, under `"shopify"`, is what
 * the page is drawn with, so a setting the panel cannot show still has its
 * value and its default on the page.
 *
 * NOTHING IS LEFT OUT SILENTLY. A file that is not part of a theme, a
 * setting the panel has no control for, a tag Storelib does not know, a
 * picture that lives in the Shopify store's own Files rather than in the
 * theme: each is a line in the report, with what was done about it.
 *
 * NEVER THROWS. A file that cannot be read is a line in the report; a ZIP
 * that is far too large is a refusal with the number.
 */
import { categoryFromHeading, type SchemeCategory } from "@/lib/storelib-theme/scheme-categories"
import JSZip from "jszip"

import { UNSUPPORTED_TYPES, controlFor, resolveControlType } from "../controls/registry"
import { readEntryCapped, readEntryTextCapped } from "../package"
import { validateBlockSchema, validateSectionSchema } from "../schema/validate"
import { LIMITS } from "../types"
import { CompatSyntaxError, lex } from "../compat/lexer"
import { parseCompat } from "../compat/parser"
import { COMPAT_PREFIX, compatPageKey, type CompatSettings } from "../compat/install"
import { SECTION_CSS_KEY, splitCompatFile, wrapCompatTemplate } from "../compat/theme"
import { floatsOverPage } from "../section-groups"
import { isReviewsAppBlock } from "../compat/storelib-reviews"
import { isSizeChartAppBlock } from "../compat/size-chart"
import { STORELIB_APP_SECTION_NAMES, isStorelibNativeSection } from "../compat/native-sections"

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ConversionReport {
  /** The Shopify files that became Storelib files, by their Shopify path. */
  converted: string[]
  /** Files that were left out, each with the reason. */
  skipped: { file: string; reason: string }[]
  /** What was changed, or could not be carried, inside files that did convert. */
  notes: { file: string; message: string }[]
}

export interface ConvertOptions {
  /** The name to use when config/settings_schema.json gives none: usually the uploaded file's. */
  fallbackName?: string
}

/** A picture, a video or a font from assets/, for the import to store. */
export interface ThemeBinary {
  /** Its name in assets/, which `asset_url` asks for. */
  name: string
  bytes: Uint8Array
}

/** A section on a page, in the shape the builder stores. */
export interface ImportedSection {
  id: string
  type: string
  name?: string
  group?: "header" | "footer" | "overlay"
  /** In the Overlay group: the theme's group file it is drawn in (overlay-group). */
  slot?: string
  hidden?: boolean
  settings: Record<string, unknown>
  blocks?: ImportedBlock[]
}
export interface ImportedBlock {
  id: string
  type: string
  settings: Record<string, unknown>
  static?: boolean
  hidden?: boolean
  blocks?: ImportedBlock[]
}

export interface ImportedTheme {
  name: string
  version: string
  author?: string
  /** Every text file, by the path it is stored under: the .storelib files and the theme's own under `shopify/`. */
  files: Record<string, string>
  /** assets/ files stored as media; the import writes their addresses to shopify/config/assets.json. */
  binaries: ThemeBinary[]
  /** One per page the theme's templates make. */
  pages: { page_key: string; template: string; sections: ImportedSection[] }[]
  /** The install's theme settings. */
  settings: { compat: CompatSettings; shopify: Record<string, unknown> }
}

export type ConvertResult = { ok: true; theme: ImportedTheme; report: ConversionReport } | { ok: false; error: string }

/** Said once, wherever a Shopify theme is imported: the route's answer and the docs. */
export const SHOPIFY_LICENSE_NOTICE =
  "A theme's license decides where it may be used. Many store themes are licensed only for the platform they were made for. Import only a theme you have the right to use."

// ── Recognising one ─────────────────────────────────────────────────────────

/**
 * Where the theme's folders start inside the ZIP: "" when they are at the
 * top, as Shopify's own download has them, or one folder down, as a
 * GitHub download has them (`dawn-main/sections/…`). Null when this is not
 * laid out like a Shopify theme at all.
 */
export function shopifyRoot(zip: JSZip): string | null {
  const names = Object.keys(zip.files)
  const candidates = new Set<string>([""])
  for (const n of names) {
    const m = n.match(/^([^/]+\/)(?:sections\/|layout\/theme\.liquid$)/)
    if (m) candidates.add(m[1])
  }
  for (const root of candidates) {
    if (zip.file(`${root}theme.json`)) continue
    const hasSections = names.some((n) => n.startsWith(`${root}sections/`) && n.endsWith(".liquid") && !n.slice(root.length + 9).includes("/"))
    const hasShell = !!zip.file(`${root}config/settings_schema.json`) || !!zip.file(`${root}layout/theme.liquid`)
    if (hasSections && hasShell) return root
    /*
      A THEME WITH NO SECTIONS AT ALL. Shopify's newest themes (Skeleton)
      compose the header and footer as blocks in the layout
      (`{% block 'header' %}`) and each page as blocks in a Liquid template;
      an older one (Timber) writes them into the layout as markup. A layout
      and a home page template make it a theme.
    */
    const hasHome = !!zip.file(`${root}templates/index.liquid`) || !!zip.file(`${root}templates/index.json`)
    if (zip.file(`${root}layout/theme.liquid`) && hasHome) return root
  }
  return null
}

/** A Shopify Online Store theme, and not a Storelib package. */
export function isShopifyTheme(zip: JSZip): boolean {
  if (zip.file("theme.json")) return false
  return shopifyRoot(zip) !== null
}

/** "42 sections, 95 blocks and 9 pages came across. 3 files were left out." */
export function conversionSummary(report: ConversionReport): string {
  const count = (re: RegExp) => report.converted.filter((f) => re.test(f)).length
  const sections = count(/^sections\/[^/]+\.liquid$/)
  const blocks = count(/^blocks\//)
  /* A page from a JSON template or from one written in Liquid (Skeleton, an older theme): both are pages of the website. */
  const pages = count(/^templates\/[^/]+\.(json|liquid)$/)
  const parts = [`${sections} section${sections === 1 ? "" : "s"}`]
  if (blocks) parts.push(`${blocks} block${blocks === 1 ? "" : "s"}`)
  parts.push(`${pages} page${pages === 1 ? "" : "s"}`)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]
  const left = report.skipped.length
  const tail = left === 0 ? "" : left === 1 ? " 1 file was left out." : ` ${left} files were left out.`
  return `${list} came across.${tail}`
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** A Shopify theme is a few hundred files. Twice a package's limit is far beyond any real one. */
const MAX_ENTRIES = LIMITS.filesPerPackage * 2
/** Unpacked, as the archive declares it, before a byte is read. */
const MAX_UNPACKED = LIMITS.packageBytes * 4
/** Report lines per file, past which they are counted rather than listed. */
const NOTES_PER_FILE = 12

/** Kept as media: stored once, served from storage. */
const MEDIA_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "mp4", "webm", "mov"])
/** Kept as text files of the theme, served from the website itself. */
const TEXT_EXT = new Set(["css", "js", "mjs", "json", "svg", "txt", "map", "liquid", "md", "xml"])
/** Kept as files of the theme too, written as base64 because they are not text. */
const FONT_EXT = new Set(["woff", "woff2", "ttf", "otf", "eot"])

const ID = /^[a-z][a-z0-9_]*$/
const TYPE = /^[a-z][a-z0-9_-]*$/
const SECTION_TYPE = /^[a-z][a-z0-9_-]{0,63}$/
const BLOCK_REF = /^_?[a-z][a-z0-9_-]*$/
/** Shopify names its header and footer sections `header` and `footer`; in Storelib those names are the built-in ones. */
const RENAMED: Record<string, string> = { header: "theme-header", footer: "theme-footer" }

function declaredSize(file: JSZip.JSZipObject): number {
  const internal = (file as unknown as { _data?: { uncompressedSize?: number } })._data
  return typeof internal?.uncompressedSize === "number" ? internal.uncompressedSize : 0
}

// ── Words: locales and names ────────────────────────────────────────────────

type Tree = Record<string, unknown>

function lookupKey(tree: Tree | null, key: string): string | null {
  if (!tree) return null
  let cur: unknown = tree
  for (const part of key.split(".")) {
    if (!cur || typeof cur !== "object") return null
    cur = (cur as Tree)[part]
  }
  if (cur && typeof cur === "object") cur = (cur as Tree).other ?? (cur as Tree).one
  return typeof cur === "string" ? cur.replace(/\{\{[\s\S]*?\}\}/g, "").replace(/\s{2,}/g, " ").trim() : null
}

/** A Shopify setting id as a Storelib one: `padding-block-start` is `padding_block_start`. The page reads either. */
export function settingId(id: string): string {
  return id.replace(/-/g, "_")
}

/** "desktop_content_position" as "Desktop content position". */
function humanise(id: string): string {
  const s = id.replace(/^_+/, "").replace(/[_-]+/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Untitled"
}

/** JSON as Shopify writes it: comments allowed, a byte order mark allowed. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    try {
      return JSON.parse(text.replace(/^﻿/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""))
    } catch {
      return undefined
    }
  }
}

// ── The report ──────────────────────────────────────────────────────────────

class Report {
  converted: string[] = []
  skipped: { file: string; reason: string }[] = []
  private notes = new Map<string, string[]>()
  private extra = new Map<string, number>()

  note(file: string, message: string) {
    const list = this.notes.get(file) ?? []
    if (list.includes(message)) return
    if (list.length >= NOTES_PER_FILE) {
      this.extra.set(file, (this.extra.get(file) ?? 0) + 1)
      return
    }
    list.push(message)
    this.notes.set(file, list)
  }

  skip(file: string, reason: string) {
    this.skipped.push({ file, reason })
  }

  done(): ConversionReport {
    const notes: { file: string; message: string }[] = []
    for (const [file, list] of this.notes) {
      for (const message of list) notes.push({ file, message })
      const more = this.extra.get(file)
      if (more) notes.push({ file, message: `and ${more} more like these` })
    }
    return { converted: this.converted, skipped: this.skipped, notes }
  }
}

// ── The conversion ──────────────────────────────────────────────────────────

export async function convertShopifyTheme(zip: JSZip, opts: ConvertOptions = {}): Promise<ConvertResult> {
  try {
    return await convertUnguarded(zip, opts)
  } catch (e) {
    const why = e instanceof Error && e.message ? e.message.split("\n")[0].slice(0, 200) : "it is not in a shape Storelib can read"
    return { ok: false, error: `This theme could not be imported: ${why}` }
  }
}

interface SourceFiles {
  text: Map<string, string>
  binary: Map<string, Uint8Array>
}

async function convertUnguarded(zip: JSZip, opts: ConvertOptions): Promise<ConvertResult> {
  const root = shopifyRoot(zip)
  if (root === null) return { ok: false, error: "This theme can't be imported: it needs its layout (the layout folder's theme file) and a home page (the templates folder's index file)" }

  const entries = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith(root))
  if (entries.length > MAX_ENTRIES) return { ok: false, error: `This theme has ${entries.length} files; the most Storelib reads is ${MAX_ENTRIES}` }
  const unpacked = entries.reduce((n, f) => n + declaredSize(f), 0)
  if (unpacked > MAX_UNPACKED) return { ok: false, error: `This theme unpacks to ${Math.round(unpacked / 1024 / 1024)} MB; the most Storelib reads is ${MAX_UNPACKED / 1024 / 1024} MB` }

  const report = new Report()
  const src = await readSources(entries, root, report)
  if (!src.text.has("layout/theme.liquid")) return { ok: false, error: "This theme has no layout (the layout folder's theme file), the shell every page is drawn in" }

  const tr = wordsOf(src)

  const files: Record<string, string> = {}
  const binaries: ThemeBinary[] = []

  /* ── the theme's own files, kept as they are, under shopify/ ── */
  for (const [path, text] of src.text) {
    if (/^(sections|blocks|snippets|layout)\/[^/]+\.liquid$/.test(path)) continue
    files[`${COMPAT_PREFIX}${path}`] = text
  }

  /* ── the files the engine draws ── */
  const blockTypes = new Set<string>()
  for (const path of src.text.keys()) {
    const m = path.match(/^blocks\/([^/]+)\.liquid$/)
    if (m && BLOCK_REF.test(m[1])) blockTypes.add(m[1])
  }
  const sectionTypes = new Map<string, string>()
  for (const path of [...src.text.keys()].sort()) {
    const m = path.match(/^(layout|snippets|sections|blocks)\/([^/]+)\.liquid$/)
    if (!m) continue
    const [, folder, base] = m
    const text = src.text.get(path)!
    if (folder === "layout" || folder === "snippets") {
      if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(base)) { report.skip(path, `"${base}" is not a file name Storelib can store`); continue }
      checkSyntax(text, (msg) => report.note(path, msg))
      files[`${folder}/${base}.storelib`] = wrapCompatTemplate(text)
      report.converted.push(path)
      continue
    }
    const mode = folder === "sections" ? "section" : "block"
    let type = mode === "block" ? base : base.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
    if (mode === "section") {
      if (RENAMED[type]) type = RENAMED[type]
      /* `_blocks`: a section's name starts with a letter in Storelib. */
      if (!/^[a-z]/.test(type)) type = `s${type.startsWith("_") || type.startsWith("-") ? "" : "-"}${type}`
      if (!SECTION_TYPE.test(type)) { report.skip(path, `"${base}" cannot be made into a section name`); continue }
      if (RENAMED[base]) report.note(path, `Stored as sections/${type}.storelib: "${base}" is the name of Storelib's own ${base}`)
      else if (type !== base) report.note(path, `Stored as sections/${type}.storelib: a section's name starts with a letter and is lowercase letters, digits, - and _`)
      sectionTypes.set(base, type)
    } else if (!BLOCK_REF.test(type)) {
      report.skip(path, `"${base}" is not a name a block can have: lowercase letters, digits, - and _`)
      continue
    }
    const out = themeFile(text, { path, mode, type, original: base, tr, blockTypes, note: (msg) => report.note(path, msg) })
    files[`${folder}/${type}.storelib`] = out
    report.converted.push(path)
  }
  /* A theme drawn by its layout and Liquid templates alone (Skeleton, Timber) has no sections, and needs none. */
  if (sectionTypes.size === 0 && !src.text.has("layout/theme.liquid")) return { ok: false, error: "No section of this theme could be read" }
  /* Each section's own name, in the theme's words, for the sections placed on its pages. */
  const names = new Map<string, string>()
  for (const type of sectionTypes.values()) {
    const name = splitCompatFile(files[`sections/${type}.storelib`] ?? "").schema?.name
    if (typeof name === "string" && name.trim()) names.set(type, name.trim())
  }
  SECTION_NAMES.set(sectionTypes, names)
  SECTION_WORDS.set(sectionTypes, tr)

  /* ── assets ── */
  for (const [path, bytes] of src.binary) {
    const name = path.slice("assets/".length)
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    if (MEDIA_EXT.has(ext)) binaries.push({ name, bytes })
    else if (FONT_EXT.has(ext)) files[`${COMPAT_PREFIX}${path}`] = `base64:${toBase64(bytes)}`
  }

  /* ── pages, from the templates and the groups ── */
  const groups = {
    header: groupList(src.text.get("sections/header-group.json"), "header", sectionTypes, report, "sections/header-group.json"),
    footer: groupList(src.text.get("sections/footer-group.json"), "footer", sectionTypes, report, "sections/footer-group.json"),
    overlay: [] as ImportedSection[],
  }
  const layout = src.text.get("layout/theme.liquid") ?? ""
  /*
    WHAT THE LAYOUT DRAWS, READ AS TAGS. {% sections 'overlay-group' %} and
    {% section 'mobile-nav' %} are as often lines of a {% liquid %} block
    (`sections 'overlay-group'`) as tags of their own, and a theme written
    that way had its whole Overlay group left out. Each in order, and
    whether it comes after the page's content.
  */
  const drawn = layoutDraws(layout)
  /*
    THE THEME'S OTHER GROUPS: an overlay, an aside, a custom group the layout
    draws with {% sections %}. Popups, drawers and bars fixed to the screen
    live there. Each comes into the builder's Overlay group, every section
    remembering the group file it is drawn in.
  */
  const slots: string[] = []
  const chromeGroups: Record<string, "header" | "footer"> = {}
  for (const slot of drawn.groups) {
    if (slot === "header-group" || slot === "footer-group" || slots.includes(slot) || chromeGroups[slot] || !src.text.has(`sections/${slot}.json`)) continue
    /* A header or footer group under a name of the theme's own: its file's `type` says which. */
    const said = (parseJson(src.text.get(`sections/${slot}.json`) ?? "") as Tree | undefined)?.type
    if ((said === "header" || said === "footer") && groups[said].length === 0) {
      chromeGroups[slot] = said
      groups[said].push(...groupList(src.text.get(`sections/${slot}.json`), said, sectionTypes, report, `sections/${slot}.json`))
      continue
    }
    slots.push(slot)
    groups.overlay.push(...groupList(src.text.get(`sections/${slot}.json`), "overlay", sectionTypes, report, `sections/${slot}.json`).map((x) => ({ ...x, slot })))
  }
  /*
    AN OLDER THEME'S HEADER AND FOOTER are static: {% section 'header' %} in
    the layout, their values in settings_data.json's `sections`. Each comes
    into the Header group (above the page's content) or the Footer group
    (below it) under its own name, so it is selected and edited like any
    other; the engine draws the page's copy where the tag stands.
  */
  const currentValues = themeValues(parseJson(src.text.get("config/settings_data.json") ?? ""))
  const staticValues = (() => {
    const v = currentValues.sections
    return v && typeof v === "object" ? (v as Record<string, Tree>) : {}
  })()
  for (const { name, afterContent, afterFooter } of drawn.sections) {
    const type = sectionTypes.get(name)
    /*
      A popup, a phone tab bar or back to top is the Overlay group's, wherever
      the layout draws it; so is a section the layout draws after its footer
      group (Posturex's Custom Color Swatches), which Shopify's editor lists
      below the overlay group, not in the footer. It still draws where the
      tag stands, by its name.
    */
    const part = type && (floatsOverPage(name) || floatsOverPage(type) || afterFooter) ? "overlay" : afterContent ? "footer" : "header"
    if (!type || groups.header.some((x) => x.id === name) || groups.footer.some((x) => x.id === name) || groups.overlay.some((x) => x.id === name)) continue
    /* Already in the Overlay group from its group file (a phone tab bar both places draw): the group's is the one to edit. */
    if (part === "overlay" && groups.overlay.some((x) => x.type === type)) continue
    const stored = staticValues[name] && typeof staticValues[name] === "object" ? staticValues[name] : {}
    const section: ImportedSection = { id: name, type, name: humanise(name), group: part, settings: idsOf((stored.settings as Tree) ?? {}, (v, f) => (typeof v === "string" ? v : f)) }
    const blocks = blockList(stored.blocks as Record<string, Tree> | undefined, stored.block_order, 1)
    if (blocks.length) section.blocks = blocks
    groups[part].push(section)
  }
  const pages: ImportedTheme["pages"] = []
  for (const [path, text] of [...src.text].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const m = path.match(/^templates\/(.+)\.(json|liquid)$/)
    if (!m) continue
    const name = m[1]
    if (m[2] === "liquid") {
      const key = compatPageKey(name)
      if (key && !pages.some((p) => p.page_key === key) && !src.text.has(`templates/${name}.json`)) {
        checkSyntax(text, (msg) => report.note(path, msg))
        /*
          AN OLDER THEME'S HOME PAGE (Debut, Brooklyn, Slate's starter):
          templates/index.liquid writes {{ content_for_index }}, and the
          sections it stands for are settings_data.json's `content_for_index`,
          in that order, their values beside the static ones in `sections`.
          They are the home page's sections, edited in the builder like a
          JSON template's; the template still draws around them.
        */
        const homeIds = name === "index" && /\bcontent_for_index\b/.test(text) ? indexSectionIds(currentValues) : []
        if (homeIds.length) {
          const all = (currentValues.sections ?? {}) as Record<string, Tree>
          const home = templateSections({ sections: Object.fromEntries(homeIds.filter((id) => all[id]).map((id) => [id, all[id]])), order: homeIds }, sectionTypes, report, "config/settings_data.json")
          pages.push({ page_key: key, template: name, sections: [...groups.header, ...home, ...groups.footer, ...groups.overlay] })
          report.converted.push(path)
          report.note(path, `Its home page sections (content_for_index in settings_data.json) are the page's sections, edited in the builder`)
          continue
        }
        pages.push({ page_key: key, template: name, sections: [...groups.header, ...groups.footer, ...groups.overlay] })
        report.converted.push(path)
        report.note(path, `A template written as code rather than JSON draws as written; it has no sections to edit in the builder`)
      } else if (!key) {
        report.note(path, `Kept with the theme's files; ${name.startsWith("customers/") ? "a visitor's account pages are Storelib's own" : "Storelib has no page for it"}`)
      }
      continue
    }
    if (name.startsWith("customers/")) {
      report.note(path, `Kept with the theme's files; a visitor's account pages are Storelib's own`)
      continue
    }
    const key = compatPageKey(name)
    if (!key) {
      report.note(path, `Kept with the theme's files as an alternate template; Storelib draws each kind of page with its main template`)
      continue
    }
    const t = parseJson(text) as Tree | undefined
    if (!t || typeof t.sections !== "object" || t.sections === null) {
      report.skip(path, `It is not a JSON template with "sections"`)
      continue
    }
    const sections = templateSections(t, sectionTypes, report, path)
    pages.push({ page_key: key, template: name, sections: [...groups.header, ...sections, ...groups.footer, ...groups.overlay] })
    report.converted.push(path)
  }
  if (!pages.some((p) => p.page_key === "home")) return { ok: false, error: "This theme has no home page template (the templates folder's index file), so there is no home page to draw" }

  /* ── what the layout reaches for, and nothing missing without a word ── */
  for (const [path, text] of src.text) {
    if (!path.endsWith(".liquid")) continue
    for (const g of layoutDraws(text).groups.map((x) => [x, x])) {
      if (g[1] !== "header-group" && g[1] !== "footer-group" && !src.text.has(`sections/${g[1]}.json`)) report.note(path, `It draws the section group "${g[1]}", which the theme does not have`)
      else if (g[1] !== "header-group" && g[1] !== "footer-group" && !slots.includes(g[1]) && !chromeGroups[g[1]]) report.note(path, `The section group "${g[1]}" is drawn as the theme set it; the builder edits the groups the layout draws`)
    }
  }

  /* ── theme settings ── */
  const schemaSettings = parseJson(src.text.get("config/settings_schema.json") ?? "")
  const info = Array.isArray(schemaSettings) ? (schemaSettings.find((g) => g && typeof g === "object" && (g as Tree).name === "theme_info") as Tree | undefined) : undefined
  const values = themeValues(parseJson(src.text.get("config/settings_data.json") ?? ""))
  const embeds = values.blocks && typeof values.blocks === "object" ? Object.values(values.blocks as Record<string, Tree>).filter((b) => b && typeof b === "object" && b.disabled !== true).map((b) => ({ type: String(b.type ?? "") })) : []
  noteAppBlocks(embeds, report, "config/settings_data.json", "switches on")
  for (const [k, v] of Object.entries(values)) {
    if (typeof v === "string" && v.startsWith("shopify://shop_images/")) {
      report.note("config/settings_data.json", `"${k}" is a picture from the old store's files, which is not part of the theme; choose it again in Theme settings`)
    }
  }

  files[`${COMPAT_PREFIX}config/settings_panel.json`] = JSON.stringify(settingsPanel(schemaSettings, values, tr, (m) => report.note("config/settings_schema.json", m)), null, 1)

  const name = (typeof info?.theme_name === "string" && info.theme_name.trim()) || opts.fallbackName || "Imported theme"
  const version = typeof info?.theme_version === "string" && /^\d+(\.\d+){0,2}/.test(info.theme_version) ? info.theme_version : "1.0.0"
  const theme: ImportedTheme = {
    name: name.slice(0, 80),
    version,
    files,
    binaries,
    pages,
    settings: {
      compat: { kind: "shopify", version: 1, theme: name.slice(0, 80), theme_version: version, renamed: Object.fromEntries([...sectionTypes].filter(([a, b]) => a !== b)), ...(slots.length ? { slots } : {}), ...(Object.keys(chromeGroups).length ? { chrome_groups: chromeGroups } : {}) },
      shopify: values,
    },
  }
  if (typeof info?.theme_author === "string" && info.theme_author.trim()) theme.author = info.theme_author.trim().slice(0, 80)
  return { ok: true, theme, report: report.done() }
}

/** A schema's words as the theme's default locales say them: a `t:` key looked up, any other text as it is. */
export type SchemaWords = (value: unknown, fallback: string) => string

function wordsOf(src: SourceFiles): SchemaWords {
  const schemaLocale = (parseJson(src.text.get(defaultLocale(src, true) ?? "") ?? "") as Tree | undefined) ?? null
  const textLocale = (parseJson(src.text.get(defaultLocale(src, false) ?? "") ?? "") as Tree | undefined) ?? null
  return (value: unknown, fallback: string): string => {
    if (typeof value !== "string") return fallback
    if (!value.startsWith("t:")) return value
    const key = value.slice(2)
    return lookupKey(schemaLocale, key) ?? lookupKey(textLocale, key) ?? fallback
  }
}

/** locales/en.default.json, or whichever locale the theme marks as its default. */
function defaultLocale(src: SourceFiles, schema: boolean): string | null {
  const suffix = schema ? ".default.schema.json" : ".default.json"
  const all = [...src.text.keys()].filter((p) => p.startsWith("locales/") && p.endsWith(suffix) && (schema || !p.endsWith(".schema.json")))
  return all.find((p) => p === `locales/en${suffix}`) ?? all[0] ?? null
}

async function readSources(entries: JSZip.JSZipObject[], root: string, report: Report): Promise<SourceFiles> {
  const text = new Map<string, string>()
  const binary = new Map<string, Uint8Array>()
  const THEME_FOLDERS = new Set(["assets", "blocks", "config", "layout", "locales", "sections", "snippets", "templates"])
  for (const f of entries) {
    const path = f.name.slice(root.length)
    const parts = path.split("/")
    const folder = parts[0]
    const base = parts[parts.length - 1]
    if (base.startsWith(".") || parts.some((p) => p === "__MACOSX")) continue
    if (!THEME_FOLDERS.has(folder) || parts.length < 2) {
      report.skip(path, `It is not in one of a theme's folders (assets, blocks, config, layout, locales, sections, snippets, templates)`)
      continue
    }
    const ext = base.includes(".") ? base.split(".").pop()!.toLowerCase() : ""
    if (folder === "assets") {
      if (parts.length > 2) { report.skip(path, `A folder inside assets/ is not part of a theme; asset_url reads assets/ itself`); continue }
      if (MEDIA_EXT.has(ext)) {
        const read = await readEntryCapped(f, LIMITS.assetBytes)
        if (read.bytes) binary.set(path, read.bytes)
        else report.skip(path, read.reason === "too_large" ? `Over ${LIMITS.assetBytes / 1024 / 1024} MB` : `Could not be read`)
        continue
      }
      if (FONT_EXT.has(ext)) {
        const read = await readEntryCapped(f, 2 * 1024 * 1024)
        if (read.bytes) binary.set(path, read.bytes)
        else report.skip(path, read.reason === "too_large" ? `A font over 2 MB` : `Could not be read`)
        continue
      }
      if (!TEXT_EXT.has(ext)) {
        report.skip(path, `".${ext}" is not a kind of file a page loads: pictures, videos, fonts, stylesheets, scripts and text are kept`)
        continue
      }
      const read = await readEntryTextCapped(f, LIMITS.sourceBytes)
      if (read.reason) report.skip(path, read.reason === "too_large" ? `Over ${LIMITS.sourceBytes / 1024} KB` : `Could not be read`)
      else text.set(path, read.text)
      continue
    }
    const wanted = (["sections", "blocks", "snippets", "layout", "templates"].includes(folder) && ext === "liquid") || (["sections", "templates", "config", "locales"].includes(folder) && ext === "json")
    if (!wanted) {
      report.skip(path, `A ${folder}/ folder holds ${folder === "config" || folder === "locales" ? "JSON" : "template"} files`)
      continue
    }
    if (parts.length > 2 && !(folder === "templates" && parts.length === 3 && parts[1] === "customers")) {
      report.skip(path, `A folder inside ${folder}/ is not read by the theme either`)
      continue
    }
    const read = await readEntryTextCapped(f, LIMITS.sourceBytes)
    if (read.reason) report.skip(path, read.reason === "too_large" ? `Over ${LIMITS.sourceBytes / 1024} KB` : `Could not be read`)
    else text.set(path, read.text)
  }
  return { text, binary }
}

function toBase64(bytes: Uint8Array): string {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** A file that does not read as the template language is still kept; the report names the line, and the page shows the problem there. */
function checkSyntax(text: string, note: (m: string) => void): void {
  try {
    const parsed = parseCompat(text)
    const unknown = [...new Set(parsed.unknown.map((u) => u.name))]
    if (unknown.length) note(`Tags Storelib does not know draw nothing: ${unknown.map((n) => `{% ${n} %}`).join(", ")}`)
  } catch (e) {
    const line = e instanceof CompatSyntaxError ? ` (line ${e.line})` : ""
    note(`It does not read as a template${line}: ${(e as Error).message}. Kept; fix it in the code editor`)
  }
}

/**
 * THE OVERLAY GROUP OF A THEME IMPORTED BEFORE IT WAS READ. A theme whose
 * layout draws its overlay group from a {% liquid %} block came in with an
 * empty Overlay group: its phone tab bar, popups and back to top drew on the
 * site (from the group file) but could not be edited. From the install's own
 * files (the layout, the group files, the section files), the sections the
 * import would make now, each remembering its group file. Empty when the
 * layout draws no other group.
 */
export function overlayFromFiles(rows: Record<string, string>, renamed: Record<string, string> = {}): { slots: string[]; sections: ImportedSection[] } {
  const out = { slots: [] as string[], sections: [] as ImportedSection[] }
  const raw = rows["layout/theme.storelib"] ?? rows[`${COMPAT_PREFIX}layout/theme.liquid`] ?? ""
  const layout = raw.includes("<template") ? splitCompatFile(raw).markup : raw
  if (!layout) return out
  const types = new Map<string, string>()
  for (const path of Object.keys(rows)) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (m) types.set(m[1], m[1])
  }
  for (const [original, stored] of Object.entries(renamed)) if (types.has(stored)) types.set(original, stored)
  const report = new Report()
  for (const slot of layoutDraws(layout).groups) {
    if (slot === "header-group" || slot === "footer-group") continue
    const json = rows[`${COMPAT_PREFIX}sections/${slot}.json`]
    if (!json) continue
    const said = (parseJson(json) as Tree | undefined)?.type
    if (said === "header" || said === "footer") continue
    out.slots.push(slot)
    out.sections.push(...groupList(json, "overlay", types, report, `sections/${slot}.json`).map((x) => ({ ...x, slot })))
  }
  return out
}

/** The section groups and the sections a layout draws, in order, read as tags whether written {% sections 'x' %} or as a line of {% liquid %}. */
function layoutDraws(text: string): { groups: string[]; sections: { name: string; afterContent: boolean; afterFooter: boolean }[] } {
  const out = { groups: [] as string[], sections: [] as { name: string; afterContent: boolean; afterFooter: boolean }[] }
  let toks: ReturnType<typeof lex> = []
  try {
    toks = lex(text, true)
  } catch {
    return out
  }
  const nameOf = (args: string) => args.trim().match(/^['"]([^'"]+)['"]/)?.[1] ?? null
  let afterContent = false
  let afterFooter = false
  for (const t of toks) {
    if (t.kind === "output" && /^content_for_layout\b/.test(t.value)) afterContent = true
    if (t.kind !== "tag") continue
    const name = nameOf(t.args)
    if (!name) continue
    if (t.name === "sections" && !out.groups.includes(name)) out.groups.push(name)
    if (t.name === "section" && !out.sections.some((x) => x.name === name)) out.sections.push({ name, afterContent, afterFooter })
    if (t.name === "sections" && /footer/.test(name)) afterFooter = true
  }
  return out
}

// ── One section or block file ───────────────────────────────────────────────

const SCHEMA_TAG = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/

type Setting = Record<string, unknown> & { type: string; id: string }

interface FileJob {
  path: string
  mode: "section" | "block"
  /** The name Storelib stores it under. */
  type: string
  /** The name the theme gave it. */
  original: string
  tr: (value: unknown, fallback: string) => string
  blockTypes: Set<string>
  note: (m: string) => void
}

/**
 * The file as Storelib keeps it: the markup as the theme wrote it, then one
 * schema that is both the panel's and the theme's.
 */
function themeFile(text: string, job: FileJob): string {
  const found = text.match(SCHEMA_TAG)
  let raw: Tree = {}
  if (!found) job.note(`It has no {% schema %}; it draws, and has nothing to change in the builder`)
  else {
    const parsed = parseJson(found[1])
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Tree
    else job.note(`Its {% schema %} is not a JSON object; it draws with no settings`)
  }
  checkSyntax(text, job.note)
  /*
    THE THEME'S OWN SCHEMA IS KEPT AS IT CAME. The panel's schema is built from
    a copy: building it renames preset values to the builder's ids and drops
    what the panel can't show, and it did that inside the theme's schema too,
    which is what an export to Shopify writes back. A theme built on presets
    (Horizon) came back with hundreds of settings Shopify refuses.
  */
  const editor = editorSchema(structuredClone(raw), job)
  const schema = { ...editor, shopify: raw }
  const markup = found ? text.replace(SCHEMA_TAG, "") : text
  return `${wrapCompatTemplate(markup)}\n\n<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>\n`
}

/** The panel's schema: every setting the builder has a control for, validated. Never null: at worst a name and nothing to change. */
function editorSchema(raw: Tree, job: FileJob): Tree {
  const draft = job.mode === "section" ? sectionSchema(raw, job) : blockSchema(raw, job)
  const settled = settle(draft, job)
  if (settled) return settled
  job.note(`Its settings could not be shown in the builder; it draws with the values the theme gave it`)
  const bare: Tree = { name: draft.name }
  if (job.mode === "section") {
    bare.type = job.type
    if (draft.kind) bare.kind = draft.kind
  }
  return bare
}

/** A Shopify setting as a Storelib one, or null when the panel has nothing to show it with. The page still reads it. */
function cleanSetting(raw: unknown, i: number, job: FileJob): Setting | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Tree
  const type = String(s.type ?? "")
  if (type === "header" || type === "paragraph") {
    const raw = job.tr(s.content ?? s.label, "")
    /* A line that only links to Shopify's own admin says nothing on Storelib. Other Markdown links keep their words. */
    if (/^\s*\[[^\]]+\]\(\/admin[^)]*\)\s*$/.test(raw)) return null
    const words = raw.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    if (!words) return null
    const out: Setting = { type, id: `${type === "header" ? "hdr" : "para"}_${i + 1}`, label: words.slice(0, 200) }
    if (type === "paragraph") out.content = words
    return out
  }
  const id = settingId(String(s.id ?? ""))
  const canonical = resolveControlType(type)
  if (!canonical) {
    const why = UNSUPPORTED_TYPES[type] ?? `the builder has no "${type}" control yet`
    job.note(`Setting "${s.id}" (${type}) keeps the theme's value and is not shown in the builder: ${why}`)
    return null
  }
  if (!ID.test(id)) {
    job.note(`Setting "${s.id}" keeps the theme's value and is not shown in the builder: its id is not one the builder can store`)
    return null
  }
  const out: Setting = { ...(s as Tree), type, id, label: job.tr(s.label, humanise(id)).slice(0, 200) }
  for (const key of ["info", "placeholder"] as const) {
    if (s[key] === undefined) continue
    /* Shopify's help text links with Markdown, to its own admin: the words stay, the link to Shopify does not. */
    const v = job.tr(s[key], "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    if (v) out[key] = v
    else delete out[key]
  }
  if (typeof s.unit === "string") {
    const unit = job.tr(s.unit, "")
    if (unit && unit.length <= 8) out.unit = unit
    else delete out.unit
  }
  if (Array.isArray(s.options)) {
    out.options = (s.options as Tree[]).filter((o) => o && typeof o === "object").map((o) => ({ value: String(o.value ?? ""), label: job.tr(o.label, humanise(String(o.value ?? ""))) }))
  }
  if (typeof s.default === "string" && s.default.startsWith("t:")) out.default = job.tr(s.default, "")
  if (typeof s.visible_if === "string") out.visible_if = s.visible_if.replace(/(settings\.)([A-Za-z0-9_-]+)/g, (_m, a: string, b: string) => a + settingId(b))
  if (out.default !== undefined) {
    const control = controlFor(type)
    const ok = control?.schema.safeParse(out.default).success && (!(out.options as unknown[] | undefined) || (out.options as { value: string }[]).some((o) => o.value === out.default))
    if (!ok) delete out.default
  }
  return out
}

function cleanSettings(list: unknown, job: FileJob): Setting[] {
  if (!Array.isArray(list)) return []
  const out: Setting[] = []
  const seen = new Set<string>()
  list.forEach((raw, i) => {
    const s = cleanSetting(raw, i, job)
    if (!s || seen.has(s.id)) return
    seen.add(s.id)
    out.push(s)
  })
  if (out.length > LIMITS.settingsPerSchema) {
    job.note(`The builder shows the first ${LIMITS.settingsPerSchema} settings; the rest keep the theme's values`)
    out.length = LIMITS.settingsPerSchema
  }
  return out
}

function sectionSchema(raw: Tree, job: FileJob): Tree {
  const out: Tree = { type: job.type, name: job.tr(raw.name, humanise(job.original)).slice(0, 80) || humanise(job.original) }
  out.settings = cleanSettings(raw.settings, job)
  const local: Tree[] = []
  const refs: Tree[] = []
  if (Array.isArray(raw.blocks)) {
    for (const b of raw.blocks as Tree[]) {
      if (!b || typeof b !== "object") continue
      const t = String(b.type ?? "")
      if (t === "@app") {
        job.note(`It accepts app blocks from outside apps, which Storelib does not have, so none can be added`)
        continue
      }
      if (b.name === undefined && b.settings === undefined) {
        if (t === "@theme" || job.blockTypes.has(t)) refs.push({ type: t })
        else job.note(`It accepts the block "${t}", which the theme does not have`)
        continue
      }
      if (!TYPE.test(t)) {
        job.note(`Its block "${t}" draws, and cannot be added in the builder: its name is not one the builder can store`)
        continue
      }
      const block: Tree = { type: t, name: job.tr(b.name, humanise(t)).slice(0, 80) || humanise(t), settings: cleanSettings(b.settings, job) }
      if (typeof b.limit === "number" && Number.isInteger(b.limit) && b.limit > 0) block.limit = b.limit
      local.push(block)
    }
  }
  if (local.length && refs.length) job.note(`It holds its own blocks and theme blocks; the builder adds its own blocks, and theme blocks already on the page still draw`)
  const blocks = local.length ? local : refs
  if (blocks.length) out.blocks = blocks
  if (typeof raw.max_blocks === "number" && raw.max_blocks > 0) out.max_blocks = Math.min(Math.floor(raw.max_blocks), LIMITS.blocksPerSection)
  if (Array.isArray(raw.presets)) out.presets = cleanPresets(raw.presets as Tree[], out, job, local.length > 0)
  if (job.original === "header") out.kind = "header"
  if (job.original === "footer") out.kind = "footer"
  placement(raw, out, job)
  return out
}

function blockSchema(raw: Tree, job: FileJob): Tree {
  const out: Tree = { name: job.tr(raw.name, humanise(job.type)).slice(0, 80) || humanise(job.type) }
  out.settings = cleanSettings(raw.settings, job)
  if (Array.isArray(raw.blocks)) {
    const refs = (raw.blocks as Tree[]).filter((b) => b && typeof b === "object" && (b.type === "@theme" || BLOCK_REF.test(String(b.type))) && b.name === undefined && b.settings === undefined).map((b) => ({ type: String(b.type) }))
    if (refs.length) out.blocks = refs
  }
  if (typeof raw.max_blocks === "number" && raw.max_blocks > 0) out.max_blocks = Math.min(Math.floor(raw.max_blocks), LIMITS.blocksPerSection)
  if (Array.isArray(raw.presets)) out.presets = cleanPresets(raw.presets as Tree[], out, job, false)
  return out
}

/** Presets with the builder's ids, in the shape Add section places. Values are the theme's, untouched. */
function cleanPresets(list: Tree[], schema: Tree, job: FileJob, local: boolean): Tree[] {
  const localTypes = new Set(((schema.blocks as Tree[]) ?? []).map((b) => String(b.type)))
  const okType = (t: string, top: boolean) => (local ? top && localTypes.has(t) : BLOCK_REF.test(t) && job.blockTypes.has(t))
  const blocksOf = (node: Tree, top: boolean, depth: number): void => {
    const blocks = node.blocks
    if (blocks === undefined) { delete node.block_order; return }
    if (depth > 4 || typeof blocks !== "object" || blocks === null) { delete node.blocks; delete node.block_order; return }
    if (Array.isArray(blocks)) {
      node.blocks = (blocks as Tree[]).filter((b) => b && typeof b === "object" && okType(String(b.type), top))
      for (const b of node.blocks as Tree[]) {
        if (b.settings && typeof b.settings === "object") b.settings = idsOf(b.settings as Tree, job.tr)
        if (local) { delete b.blocks; delete b.static } else blocksOf(b, false, depth + 1)
      }
      delete node.block_order
      return
    }
    const kept: Record<string, Tree> = {}
    for (const [id, b] of Object.entries(blocks as Record<string, Tree>)) {
      if (!b || typeof b !== "object" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue
      if (!okType(String(b.type), top)) continue
      if (b.settings && typeof b.settings === "object") b.settings = idsOf(b.settings as Tree, job.tr)
      if (local) delete b.blocks
      else blocksOf(b, false, depth + 1)
      kept[id] = b
    }
    node.blocks = kept
    const order = (Array.isArray(node.block_order) ? (node.block_order as unknown[]) : []).filter((id): id is string => typeof id === "string" && !!kept[id] && kept[id].static !== true)
    for (const id of Object.keys(kept)) if (kept[id].static !== true && !order.includes(id)) order.push(id)
    node.block_order = order
  }
  const out: Tree[] = []
  for (const p of list) {
    if (!p || typeof p !== "object") continue
    const preset: Tree = { ...p, name: job.tr(p.name, String(schema.name ?? "Preset")).slice(0, 80) }
    if (p.settings && typeof p.settings === "object") preset.settings = idsOf(p.settings as Tree, job.tr)
    blocksOf(preset, true, 1)
    const kept = preset.blocks
    const any = Array.isArray(kept) ? kept.length > 0 : !!kept && typeof kept === "object" && Object.keys(kept as Tree).length > 0
    if (!any) { delete preset.blocks; delete preset.block_order }
    out.push(preset)
  }
  return out
}

/** A preset's or a placed section's values, under the builder's ids. Words written as `t:` keys are the words. */
function idsOf(settings: Tree, tr: (value: unknown, fallback: string) => string): Tree {
  const out: Tree = {}
  for (const [k, v] of Object.entries(settings)) out[settingId(k)] = translateSetting(v, tr)
  return out
}

function translateSetting(v: unknown, tr: (value: unknown, fallback: string) => string): unknown {
  if (typeof v !== "string" || !v.includes("t:")) return v
  if (v.startsWith("t:")) return tr(v, "") || v
  return v.replace(/\bt:([a-z0-9_.]+)/gi, (whole, key: string) => tr(`t:${key}`, "") || whole)
}

/** `enabled_on` / `disabled_on`: the groups Storelib has, and the templates as allowed_templates / disabled_templates. */
function placement(raw: Tree, out: Tree, job: FileJob) {
  const key = raw.enabled_on ? "enabled_on" : raw.disabled_on ? "disabled_on" : null
  if (!key) return
  const v = raw[key] as Tree
  if (!v || typeof v !== "object") return
  /* Shopify's floating groups (aside, custom.<name>) are the builder's Overlay group: a phone tab bar or a popup limited to them lands there. */
  const named = Array.isArray(v.groups) ? (v.groups as unknown[]).filter((g): g is string => typeof g === "string") : []
  const groups = [...new Set(named.map((g) => (g === "aside" || /^custom\.[a-z0-9_-]+$/i.test(g) ? "overlay" : g)).filter((g) => g === "*" || g === "header" || g === "footer" || g === "template" || g === "overlay"))]
  const templates = Array.isArray(v.templates) ? (v.templates as unknown[]).filter((t): t is string => typeof t === "string" && t !== "*") : []
  if (groups.length) out[key] = { groups }
  else if (Array.isArray(v.groups) && v.groups.length) job.note(`Its ${key} names groups the builder does not have; it can be added to a page`)
  if (templates.length) out[key === "enabled_on" ? "allowed_templates" : "disabled_templates"] = templates
}

/**
 * The validator's word is final; this only answers it. Each refusal names a
 * path, and the thing at that path is removed from the PANEL's schema (a
 * setting, a default, a preset) until it validates. The theme's own schema,
 * which the page is drawn with, is not touched.
 */
function settle(schema: Tree, job: FileJob): Tree | null {
  for (let round = 0; round < 10; round++) {
    const r = job.mode === "section" ? validateSectionSchema(schema) : validateBlockSchema(schema, { type: job.type })
    if (r.ok === true) return schema
    let changed = false
    const drop = new Map<unknown[], Set<number>>()
    const remove = (list: unknown, i: number) => {
      if (!Array.isArray(list)) return
      const set = drop.get(list) ?? new Set<number>()
      set.add(i)
      drop.set(list, set)
    }
    for (const e of r.errors) {
      const p = e.path ?? ""
      let m: RegExpMatchArray | null
      const settingAt = (list: unknown, i: number): Setting | undefined => (Array.isArray(list) ? (list[i] as Setting) : undefined)
      if ((m = p.match(/^(?:blocks\[(\d+)\]\.)?settings\[(\d+)\]\.(default|visible_if|accept|limit|image|responsive|unit|min|max|step)$/))) {
        const list = m[1] !== undefined ? ((schema.blocks as Tree[])?.[Number(m[1])]?.settings as unknown) : schema.settings
        const s = settingAt(list, Number(m[2]))
        if (s && m[3] in s) {
          delete s[m[3]]
          changed = true
        }
      } else if ((m = p.match(/^(?:blocks\[(\d+)\]\.)?settings\[(\d+)\]/))) {
        const list = m[1] !== undefined ? ((schema.blocks as Tree[])?.[Number(m[1])]?.settings as unknown) : schema.settings
        const s = settingAt(list, Number(m[2]))
        if (s) job.note(`Setting "${s.id}" keeps the theme's value and is not shown in the builder: ${e.message}`)
        remove(list, Number(m[2]))
      } else if ((m = p.match(/^presets\[(\d+)\]\.settings\.(\w+)/))) {
        const pr = (schema.presets as Tree[])?.[Number(m[1])]
        if (pr?.settings) {
          delete (pr.settings as Tree)[m[2]]
          changed = true
        }
      } else if ((m = p.match(/^(?:block )?presets\[(\d+)\]/))) {
        remove(schema.presets, Number(m[1]))
      } else if ((m = p.match(/^blocks\[(\d+)\]/))) {
        remove(schema.blocks, Number(m[1]))
      } else if (/^(enabled_on|disabled_on|allowed_templates|disabled_templates|kind|tag|class|capabilities|max_blocks|blocks|presets)/.test(p)) {
        const k = p.split(/[.[]/)[0]
        if (k in schema) {
          delete schema[k]
          changed = true
        }
      } else if (p === "settings" && Array.isArray(schema.settings)) {
        ;(schema.settings as unknown[]).length = LIMITS.settingsPerSchema
        changed = true
      }
    }
    for (const [list, set] of drop) {
      for (const i of [...set].sort((a, b) => b - a)) list.splice(i, 1)
      changed = true
    }
    if (!changed) return null
  }
  return null
}

// ── Pages ───────────────────────────────────────────────────────────────────

function groupList(json: string | undefined, group: "header" | "footer" | "overlay", types: Map<string, string>, report: Report, path: string): ImportedSection[] {
  if (!json) return []
  const g = parseJson(json) as Tree | undefined
  if (!g || typeof g.sections !== "object" || g.sections === null) {
    report.skip(path, `It is not a JSON section group with "sections"`)
    return []
  }
  report.converted.push(path)
  return templateSections(g, types, report, path).map((s) => ({ ...s, group }))
}

/** The theme's name for each section type, beside the map of its types (set once the section files are written). */
const SECTION_NAMES = new WeakMap<Map<string, string>, Map<string, string>>()
/** The theme's locale, for a page's own section names written as t: keys ("t:names.hero"). */
const SECTION_WORDS = new WeakMap<Map<string, string>, (value: unknown, fallback: string) => string>()

function templateSections(t: Tree, types: Map<string, string>, report: Report, path: string): ImportedSection[] {
  const all = t.sections as Record<string, Tree>
  const order = (Array.isArray(t.order) ? (t.order as unknown[]) : Object.keys(all)).filter((id): id is string => typeof id === "string")
  for (const id of Object.keys(all)) if (!order.includes(id)) order.push(id)
  const out: ImportedSection[] = []
  const missing = new Set<string>()
  const native = new Set<string>()
  for (const id of order) {
    const s = all[id]
    if (!s || typeof s !== "object") continue
    /* A Storelib section (../compat/native-sections.ts) needs no file of the theme's: Storelib draws it, as an app draws its own on Shopify. */
    const own = types.get(String(s.type))
    const type = own ?? (isStorelibNativeSection(s.type) ? String(s.type) : undefined)
    if (!own && type) native.add(type)
    if (!type) { missing.add(String(s.type)); continue }
    if (out.length >= LIMITS.sectionsPerTemplate) {
      report.note(path, `The builder holds ${LIMITS.sectionsPerTemplate} sections a page; the rest were left off`)
      break
    }
    const section: ImportedSection = { id, type, settings: idsOf((s.settings as Tree) ?? {}, (v, f) => (typeof v === "string" ? v : f)) }
    /* Every save route reads a section's name; a group's sections usually come without one. */
    /* What the page calls it, else what the theme calls the section, as Shopify's editor names it. */
    const ownName = typeof s.name === "string" && s.name.trim() ? (SECTION_WORDS.get(types)?.(s.name, "") ?? (s.name.startsWith("t:") ? "" : s.name)) : ""
    section.name = (ownName || SECTION_NAMES.get(types)?.get(type) || STORELIB_APP_SECTION_NAMES[type] || humanise(String(s.type))).slice(0, 80)
    if (s.disabled === true) section.hidden = true
    /* The section's Custom CSS from Shopify's editor, kept with its settings and drawn for that section alone (compat/theme.ts sectionCss). */
    const customCss = (Array.isArray(s.custom_css) ? (s.custom_css as unknown[]) : []).filter((x): x is string => typeof x === "string").join("\n").trim()
    if (customCss) section.settings[SECTION_CSS_KEY] = customCss.slice(0, 20000)
    const blocks = blockList(s.blocks as Record<string, Tree> | undefined, s.block_order, 1)
    if (blocks.length) section.blocks = blocks
    noteShopifyValues(section.settings, report, path)
    out.push(section)
  }
  if (missing.size) report.note(path, `It names sections the theme does not have, which were left off: ${[...missing].join(", ")}`)
  if (native.size) report.note(path, `It places Storelib's own ${[...native].join(", ")}, kept with its settings and drawn by Storelib`)
  noteAppBlocks(out.flatMap((s) => s.blocks ?? []), report, path, "places")
  return out
}

/*
  A SHOPIFY APP'S BLOCK, placed on a page (a review badge, an upsell) or
  switched on for the whole theme as an app embed (settings_data.json's
  `blocks`), comes with the theme's files but not the app: Shopify draws it
  from the app's own code. A review app's is drawn by Storelib Reviews, a
  size chart app's by Storelib's size charts (../compat/size-chart.ts); any
  other draws nothing, and the report says which, so the store owner knows
  what the page no longer has.
*/
const APP_BLOCK = /^shopify:\/\/apps\/([^/]+)\/blocks\/([^/]+)/
function noteAppBlocks(blocks: { type: string; blocks?: { type: string; blocks?: unknown[] }[] }[], report: Report, path: string, verb: "places" | "switches on"): void {
  const reviews = new Set<string>()
  const sizes = new Set<string>()
  const other = new Set<string>()
  const walk = (list: { type: string; blocks?: unknown[] }[]) => {
    for (const b of list) {
      const m = b.type.match(APP_BLOCK)
      if (m) (isReviewsAppBlock(b.type) ? reviews : isSizeChartAppBlock(b.type) ? sizes : other).add(`${m[1]} (${m[2]})`)
      if (Array.isArray(b.blocks)) walk(b.blocks as { type: string; blocks?: unknown[] }[])
    }
  }
  walk(blocks)
  const what = verb === "places" ? "app blocks" : "app embeds"
  if (other.size) report.note(path, `It ${verb} app ${what} that come with an app, not with the theme, and draw nothing on Storelib: ${[...other].join(", ")}`)
  if (reviews.size) report.note(path, `It ${verb} review ${what} (${[...reviews].join(", ")}); Storelib Reviews draws them with the shop's own reviews`)
  if (sizes.size) report.note(path, `It ${verb} size chart ${what} (${[...sizes].join(", ")}); Storelib draws each product's own size chart there (Products, Size charts)`)
}

function blockList(blocks: Record<string, Tree> | undefined, order: unknown, depth: number): ImportedBlock[] {
  if (!blocks || typeof blocks !== "object" || depth > 8) return []
  const listed = (Array.isArray(order) ? (order as unknown[]) : []).filter((id): id is string => typeof id === "string" && !!blocks[id])
  const ids = [...new Set([...listed, ...Object.keys(blocks)])]
  return ids.filter((id) => blocks[id] && typeof blocks[id] === "object").map((id) => {
    const b = blocks[id]
    const block: ImportedBlock = { id, type: String(b.type ?? ""), settings: idsOf((b.settings as Tree) ?? {}, (v, f) => (typeof v === "string" ? v : f)) }
    if (b.static === true) block.static = true
    if (b.disabled === true) block.hidden = true
    const inner = blockList(b.blocks as Record<string, Tree> | undefined, b.block_order, depth + 1)
    if (inner.length) block.blocks = inner
    return block
  })
}

/** A picture or a page that only the Shopify store had. The page draws without it; the report says which. */
function noteShopifyValues(settings: Tree, report: Report, path: string): void {
  for (const [k, v] of Object.entries(settings)) {
    if (typeof v !== "string") continue
    if (v.startsWith("shopify://shop_images/")) report.note(path, `"${k}" is a picture from the old store's files, which is not part of the theme; the theme's placeholder draws until one is chosen`)
    else if (/^shopify:\/\/(pages|blogs|articles|metaobjects)\//.test(v)) report.note(path, `"${k}" links to ${v.slice(10)}, which this website does not have yet`)
  }
}

// ── Theme settings ──────────────────────────────────────────────────────────

/**
 * THE THEME SETTINGS PANEL, from settings_schema.json: each group the theme
 * declares, with its settings as the builder's controls, words translated,
 * ids as the theme wrote them (the values are the theme's own, under
 * `shopify` in the install's settings). A setting the builder has no control
 * for keeps its value and is named in the report.
 */
/** A colour scheme's setting in the panel: its value lives at shopify[group][scheme].settings[id], which the id spells out. */
export const SCHEME_PATH = "::"

function settingsPanel(schema: unknown, current: Record<string, unknown>, tr: (value: unknown, fallback: string) => string, note: (m: string) => void): { name: string; settings: Setting[] }[] {
  if (!Array.isArray(schema)) return []
  const job: FileJob = { path: "config/settings_schema.json", mode: "section", type: "settings", original: "settings", tr, blockTypes: new Set(), note }
  const out: { name: string; settings: Setting[] }[] = []
  for (const g of schema as Tree[]) {
    if (!g || typeof g !== "object" || g.name === "theme_info" || !Array.isArray(g.settings)) continue
    const settings: Setting[] = []
    ;(g.settings as Tree[]).forEach((raw, i) => {
      if (raw && typeof raw === "object" && raw.type === "color_scheme_group") {
        /*
          EACH SCHEME'S COLOURS, as the builder's colour controls: a heading
          for the scheme, then every colour its definition names. Schemes are
          the ones the theme's settings hold.
        */
        const group = String((raw as Tree).id ?? "color_schemes")
        const schemes = current[group] && typeof current[group] === "object" ? Object.keys(current[group] as Tree) : []
        const definition = Array.isArray((raw as Tree).definition) ? ((raw as Tree).definition as Tree[]) : []
        schemes.forEach((scheme, n) => {
          /* Named as Shopify's editor names them, never by their key ("scheme-0302a2b1-…"). */
          settings.push({ type: "header", id: `scheme_${n + 1}_hdr`, label: `Scheme ${n + 1}` })
          /* A heading the definition writes ("Primary button", "Inputs") is kept as the group of the colours under it (lib/storelib-theme/scheme-categories.ts). */
          let heading: SchemeCategory | null = null
          definition.forEach((d, j) => {
            if (d && typeof d === "object" && (d.type === "header" || d.type === "paragraph")) {
              if (d.type === "header") heading = categoryFromHeading(job.tr(d.content ?? d.label, "")) ?? categoryFromHeading(d.content ?? d.label)
              return
            }
            const clean = cleanSetting(d, i * 1000 + j, job)
            if (!clean || clean.type === "header" || clean.type === "paragraph") return
            clean.id = [group, scheme, "settings", String(d.id)].join(SCHEME_PATH)
            delete clean.visible_if
            if (heading) (clean as Setting & { category?: string }).category = heading
            settings.push(clean)
          })
        })
        if (!schemes.length) note(`The colour schemes are drawn as the theme set them; it saved none to edit`)
        return
      }
      if (raw && typeof raw === "object" && raw.type === "color_palette") {
        /*
          ONE PALETTE, EACH OF ITS COLOURS A CONTROL (Horizon). Other settings
          name its colours ("{{ settings.color_palette.color2 }}"), so a change
          here reaches them too.
        */
        const id = String((raw as Tree).id ?? "color_palette")
        const saved = current[id] && typeof current[id] === "object" ? (current[id] as Tree) : null
        const palette = saved ?? ((raw as Tree).default && typeof (raw as Tree).default === "object" ? ((raw as Tree).default as Tree) : {})
        for (const [key, value] of Object.entries(palette)) {
          const n = /^color(\d+)$/.exec(key)
          settings.push({ type: "color", id: [id, key].join(SCHEME_PATH), label: n ? `Colour ${n[1]}` : humanise(key), default: typeof value === "string" ? value : "" })
        }
        return
      }
      const clean = cleanSetting(raw, i, job)
      if (!clean) return
      if (typeof (raw as Tree).id === "string") clean.id = String((raw as Tree).id)
      settings.push(clean)
    })
    if (settings.length) out.push({ name: tr(g.name, humanise(String(g.name ?? "Settings"))).slice(0, 60), settings })
  }
  return out
}

/** The ids of an older theme's home page sections, in order: settings_data.json's `content_for_index`. */
function indexSectionIds(current: Record<string, unknown>): string[] {
  const ids = Array.isArray(current.content_for_index) ? (current.content_for_index as unknown[]) : []
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id !== ""))]
}

/** settings_data.json's current values, as the theme's settings, whole. */
function themeValues(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {}
  const d = data as Tree
  let current = d.current
  if (typeof current === "string" && d.presets && typeof d.presets === "object") current = (d.presets as Tree)[current]
  if (!current || typeof current !== "object") return {}
  return { ...(current as Tree) }
}

// ── The same reading, after the import ──────────────────────────────────────

/**
 * ===========================================================================
 *  A THEME'S SCHEMA CHANGED AFTER IT CAME IN, READ AS THE IMPORT READ IT
 * ===========================================================================
 * The builder's panel for a section, a block and the theme settings is made
 * from the theme's own schema by the functions above, at import. A schema
 * changed later (a push to the site's GitHub repository, the code editor,
 * Storelib AI) was refused, or kept while the panel went on showing the old
 * settings. These are the import's own functions, so the panel after a
 * change is exactly what an import of the changed theme would show, with the
 * same notes for what it cannot show (lib/storelib-theme/compat/schema-sync.ts).
 */

/** The theme's words, from an install's own files (shopify/locales/…). */
export function compatSchemaWords(files: Record<string, string>): SchemaWords {
  const text = new Map<string, string>()
  for (const [path, content] of Object.entries(files)) {
    if (path.startsWith(`${COMPAT_PREFIX}locales/`) && typeof content === "string") text.set(path.slice(COMPAT_PREFIX.length), content)
  }
  return wordsOf({ text, binary: new Map() })
}

/** The name the theme gave a section Storelib stores under another one (theme-header is the theme's header). */
function originalName(type: string): string {
  return Object.keys(RENAMED).find((k) => RENAMED[k] === type) ?? type
}

/** A section's or block's panel schema from the theme's own schema, and every note the import would write about it. The theme's schema is not changed. */
export function compatPanelSchema(
  raw: Record<string, unknown>,
  opts: { path: string; mode: "section" | "block"; type: string; tr: SchemaWords; blockTypes: Iterable<string> },
): { schema: Record<string, unknown>; notes: string[] } {
  const notes: string[] = []
  const job: FileJob = {
    path: opts.path,
    mode: opts.mode,
    type: opts.type,
    original: opts.mode === "section" ? originalName(opts.type) : opts.type,
    tr: opts.tr,
    blockTypes: new Set(opts.blockTypes),
    note: (m) => {
      if (!notes.includes(m)) notes.push(m)
    },
  }
  return { schema: editorSchema(JSON.parse(JSON.stringify(raw)) as Tree, job), notes }
}

/** The theme settings panel from settings_schema.json and the theme's values: what the import writes to shopify/config/settings_panel.json. */
export function compatThemeSettingsPanel(
  schema: unknown,
  values: Record<string, unknown>,
  tr: SchemaWords,
): { panel: { name: string; settings: Record<string, unknown>[] }[]; notes: string[] } {
  const notes: string[] = []
  const panel = settingsPanel(schema, values, tr, (m) => {
    if (!notes.includes(m)) notes.push(m)
  })
  return { panel, notes }
}

/** JSON as a theme writes it (comments and a byte order mark allowed), or undefined. */
export function parseThemeJson(text: string): unknown {
  return parseJson(text)
}
