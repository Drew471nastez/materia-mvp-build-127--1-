/**
 * ===========================================================================
 *  A SHOPIFY THEME, READ AS A STORELIB THEME
 * ===========================================================================
 * The ZIP Shopify's admin hands out (assets/, config/, layout/, locales/,
 * sections/, snippets/, templates/, blocks/) turned into the folder a
 * `.storelib-theme` package holds (docs/theme/01), so the import route can
 * hand it to readPackage and every check a package gets, this gets too.
 *
 *   sections/<name>.liquid   sections/<name>.storelib: the schema, the
 *                            markup (./liquid.ts), the CSS it used
 *   blocks/<name>.liquid     blocks/<name>.storelib, a theme block
 *   snippets/*.liquid        written into whatever renders them
 *   templates/<page>.json    the pages Storelib has: index is home
 *   config/settings_data.json the theme's own values, under
 *                            theme.settings.shopify
 *   assets/*.png and the like the pictures a section points at
 *
 * LIQUID IS NEVER RUN. Not here, not by the compiler, not on a page. Every
 * file is text that is rewritten, and what comes out is compiled by
 * compileSection and compileBlock exactly as a file somebody typed into the
 * code editor would be. A section that does not compile after the rewrite,
 * and after the fallbacks below, is left out and the report says why, with
 * the line.
 *
 * NOTHING IS LEFT OUT SILENTLY. Every dropped setting, tag, filter, script,
 * section and template is a line in the report, in words a person can act
 * on. The report is what tells somebody why their slideshow is missing,
 * so it is specific rather than reassuring.
 *
 * NEVER THROWS. A file that cannot be read is a line in the report; a ZIP
 * that is far too large is a refusal with the number.
 */
import { LAYOUT_PATH, compileThemeStylesheet, layoutFile } from "../theme-stylesheet"
import { StaticLiquid, liquidSettings, parseFont, resolveSettingReferences } from "./static-liquid"
import JSZip from "jszip"
import postcss, { type Rule } from "postcss"

import { UNSUPPORTED_TYPES, controlFor, holdsValue, resolveControlType } from "../controls/registry"
import { mimeForExt, readEntryCapped, readEntryTextCapped, sha256, type PackageAsset, type ThemePackage } from "../package"
import { validateBlockSchema, validateSectionSchema } from "../schema/validate"
import { compileBlock, compileSection } from "../storelib/compile"
import { scopeCss } from "../storelib/css"
import { LIMITS, THEME_FORMAT, THEME_FORMAT_VERSION, type ThemeError, type ThemeFiles, type ThemeManifest } from "../types"
import { convertLiquid, type CssChunk, type Declared, type LiquidContext } from "./liquid"

// ── Shapes ──────────────────────────────────────────────────────────────────

export interface ConversionReport {
  /** The Shopify files that became Storelib files, by their Shopify path. */
  converted: string[]
  /** Files that were left out, each with the reason. */
  skipped: { file: string; reason: string }[]
  /** What was changed or removed inside files that did convert. */
  notes: { file: string; message: string }[]
}

export interface ConvertOptions {
  /** Section types the account already draws itself; a converted section is renamed rather than replacing one. */
  reservedTypes?: readonly string[]
  /** The name to use when config/settings_schema.json gives none: usually the uploaded file's. */
  fallbackName?: string
}

export type ConvertResult = { ok: true; pkg: ThemePackage; report: ConversionReport } | { ok: false; error: string }

/** Said once, wherever a Shopify theme is imported: the route's answer and the docs. */
export const SHOPIFY_LICENSE_NOTICE =
  "A Shopify theme's license decides whether it may be used outside Shopify. Shopify's own themes, such as Dawn and Horizon, are licensed for Shopify stores. Import only a theme you have the right to use."

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
    const m = n.match(/^([^/]+\/)sections\//)
    if (m) candidates.add(m[1])
  }
  for (const root of candidates) {
    if (zip.file(`${root}theme.json`)) continue
    const hasSections = names.some((n) => n.startsWith(`${root}sections/`) && n.endsWith(".liquid") && !n.slice(root.length + 9).includes("/"))
    const hasShell = !!zip.file(`${root}config/settings_schema.json`) || !!zip.file(`${root}layout/theme.liquid`)
    if (hasSections && hasShell) return root
  }
  return null
}

/** A Shopify Online Store 2.0 theme, and not a Storelib package. */
export function isShopifyTheme(zip: JSZip): boolean {
  if (zip.file("theme.json")) return false
  return shopifyRoot(zip) !== null
}

/** "Converted 18 of 23 sections from Shopify. 5 were left out." */
export function conversionSummary(report: ConversionReport): string {
  const done = report.converted.filter((f) => f.startsWith("sections/")).length
  const left = report.skipped.filter((s) => /^sections\/[^/]+\.liquid$/.test(s.file)).length
  const total = done + left
  const blocksDone = report.converted.filter((f) => f.startsWith("blocks/")).length
  const blocksTotal = blocksDone + report.skipped.filter((s) => s.file.startsWith("blocks/")).length
  const blocks = blocksTotal ? ` and ${blocksDone} of ${blocksTotal} blocks` : ""
  const tail = left === 0 ? "" : left === 1 ? " 1 was left out." : ` ${left} were left out.`
  return `Converted ${done} of ${total} sections${blocks} from Shopify.${tail}`
}

// ── Limits ──────────────────────────────────────────────────────────────────

/** A Shopify theme is a few hundred files. Twice a package's limit is far beyond any real one. */
const MAX_ENTRIES = LIMITS.filesPerPackage * 2
/** Unpacked, as the archive declares it, before a byte is read. */
const MAX_UNPACKED = LIMITS.packageBytes * 4
/** How much one section may grow by through the snippets written into it. */
const SNIPPET_BUDGET = 1536 * 1024
/** How much CSS one section may carry from the theme's stylesheets. */
const CSS_BUDGET = 1024 * 1024
/** Report lines per file, past which they are counted rather than listed. */
const NOTES_PER_FILE = 12

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"])
const ID = /^[a-z][a-z0-9_]*$/
const TYPE = /^[a-z][a-z0-9_-]*$/
const BLOCK_REF = /^_?[a-z][a-z0-9_-]*$/

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
  if (cur && typeof cur === "object") {
    /* Plural forms: the one for many. */
    const other = (cur as Tree).other ?? (cur as Tree).one
    cur = other
  }
  return typeof cur === "string" ? cur.replace(/\{\{[\s\S]*?\}\}/g, "").replace(/\s{2,}/g, " ").trim() : null
}

/** A Shopify setting id as a Storelib one: `padding-block-start` is `padding_block_start`. Read by ./liquid.ts too. */
export function settingId(id: string): string {
  return id.replace(/-/g, "_")
}

/** "desktop_content_position" as "Desktop content position". */
function humanise(id: string): string {
  const s = id.replace(/^_+/, "").replace(/[_-]+/g, " ").trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Untitled"
}

/** Strip JSON's comments, which Shopify's own files allow in config and templates. */
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

// ── The conversion ──────────────────────────────────────────────────────────

interface SourceFiles {
  text: Map<string, string>
  binary: Map<string, Uint8Array>
}

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

  /** Notes about a file that was then left out say nothing useful: the skip says it. */
  forget(file: string) {
    this.notes.delete(file)
    this.extra.delete(file)
  }

  done(): ConversionReport {
    const notes: { file: string; message: string }[] = []
    for (const [file, list] of this.notes) {
      for (const message of list) notes.push({ file, message })
      const more = this.extra.get(file)
      if (more) notes.push({ file, message: `and ${more} more change${more === 1 ? "" : "s"} like these` })
    }
    return { converted: this.converted, skipped: this.skipped, notes }
  }
}

export async function convertShopifyTheme(zip: JSZip, opts: ConvertOptions = {}): Promise<ConvertResult> {
  try {
    return await convertUnguarded(zip, opts)
  } catch (e) {
    const why = e instanceof Error && e.message ? e.message.split("\n")[0].slice(0, 200) : "it is not in a shape Storelib can read"
    return { ok: false, error: `This Shopify theme could not be converted: ${why}` }
  }
}

async function convertUnguarded(zip: JSZip, opts: ConvertOptions): Promise<ConvertResult> {
  const root = shopifyRoot(zip)
  if (root === null) return { ok: false, error: "This is not a Shopify theme: it needs sections/*.liquid and config/settings_schema.json or layout/theme.liquid" }

  const entries = Object.values(zip.files).filter((f) => !f.dir && f.name.startsWith(root))
  if (entries.length > MAX_ENTRIES) return { ok: false, error: `This theme has ${entries.length} files; the most Storelib reads is ${MAX_ENTRIES}` }
  const unpacked = entries.reduce((n, f) => n + declaredSize(f), 0)
  if (unpacked > MAX_UNPACKED) return { ok: false, error: `This theme unpacks to ${Math.round(unpacked / 1024 / 1024)} MB; the most Storelib reads is ${MAX_UNPACKED / 1024 / 1024} MB` }

  const report = new Report()
  const src = await readSources(entries, root, report)

  const schemaLocale = (parseJson(src.text.get("locales/en.default.schema.json") ?? "") as Tree | undefined) ?? null
  const textLocale = (parseJson(src.text.get("locales/en.default.json") ?? "") as Tree | undefined) ?? null
  const tr = (value: unknown, fallback: string): string => {
    if (typeof value !== "string") return fallback
    if (!value.startsWith("t:")) return value
    const key = value.slice(2)
    return lookupKey(schemaLocale, key) ?? lookupKey(textLocale, key) ?? fallback
  }

  /* Pictures in assets/, made into package assets only when a section points at one. */
  const assets: Record<string, PackageAsset> = {}
  const assetRef = new Map<string, string>()
  const assetLookup = (name: string): ReturnType<LiquidContext["asset"]> => {
    const clean = name.replace(/^\/+/, "")
    const ext = clean.split(".").pop()?.toLowerCase() ?? ""
    if (IMAGE_EXT.has(ext)) {
      const bytes = src.binary.get(`assets/${clean}`)
      if (!bytes) return null
      let hash = assetRef.get(clean)
      if (!hash) {
        hash = sha256(bytes)
        assetRef.set(clean, hash)
        assets[hash] = { bytes, filename: clean, mime_type: mimeForExt(ext === "jpeg" ? "jpg" : ext) }
      }
      return { kind: "image", ref: `asset://${hash}` }
    }
    if (ext === "css") {
      const text = src.text.get(`assets/${clean}`)
      return text === undefined ? null : { kind: "css", text }
    }
    if (ext === "js") return { kind: "script" }
    return null
  }
  const snippet = (name: string) => src.text.get(`snippets/${name}.liquid`) ?? null
  /* An icon the theme inlines (`'icon-caret.svg' | inline_asset_content`), cleaned once and kept. */
  const svgCache = new Map<string, string | null>()
  const inlineSvg = (name: string): string | null => {
    const clean = name.replace(/^\/+/, "")
    if (svgCache.has(clean)) return svgCache.get(clean) ?? null
    const bytes = src.binary.get(`assets/${clean}`)
    const out = bytes && bytes.byteLength <= 64 * 1024 ? cleanSvg(new TextDecoder().decode(bytes)) : null
    svgCache.set(clean, out)
    return out
  }

  const files: ThemeFiles = {}
  const reserved = new Set([...(opts.reservedTypes ?? []), "header", "footer"])

  /* ── theme blocks first, so sections know which exist ── */
  const blockSchemas = new Map<string, Setting[]>()
  for (const [path, text] of [...src.text].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const m = path.match(/^blocks\/([^/]+)\.liquid$/)
    if (!m) continue
    const type = m[1].toLowerCase()
    if (!BLOCK_REF.test(type)) {
      report.skip(path, `"${m[1]}" is not a name a Storelib block can have: lowercase letters, digits, - and _`)
      continue
    }
    const out = convertFile(text, { path, mode: "block", type, tr, translate: (k) => lookupKey(textLocale, k), snippet, asset: assetLookup, inlineSvg, report, blockTypes: null })
    if (!out) continue
    files[`blocks/${type}.storelib`] = out.source
    blockSchemas.set(type, out.settings)
    report.converted.push(path)
  }

  /* ── sections ── */
  const sectionTypes = new Map<string, { type: string; settings: Setting[]; blocks: Map<string, Setting[]> | null }>()
  for (const [path, text] of [...src.text].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const m = path.match(/^sections\/([^/]+)\.(liquid|json)$/)
    if (!m) continue
    if (m[2] === "json") {
      report.skip(path, `Header and footer groups are not imported: a Storelib site draws its own header and footer, set in Theme settings`)
      continue
    }
    const base = m[1]
    if (base === "header" || base === "footer") {
      report.skip(path, `A Storelib site draws its own ${base}, set in Theme settings › ${humanise(base)}`)
      continue
    }
    let type = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "_")
    if (!/^[a-z]/.test(type)) type = `s_${type}`
    if (reserved.has(type)) type = `${type}-shopify`
    if (!TYPE.test(type)) {
      report.skip(path, `"${base}" cannot be made into a section name`)
      continue
    }
    const out = convertFile(text, { path, mode: "section", type, tr, translate: (k) => lookupKey(textLocale, k), snippet, asset: assetLookup, inlineSvg, report, blockTypes: new Set(blockSchemas.keys()) })
    if (!out) continue
    files[`sections/${type}.storelib`] = out.source
    sectionTypes.set(base, { type, settings: out.settings, blocks: out.localBlocks })
    report.converted.push(path)
  }

  if (sectionTypes.size === 0) {
    const first = report.skipped.find((s) => s.file.startsWith("sections/") && s.file.endsWith(".liquid"))
    return { ok: false, error: `No section of this Shopify theme could be converted${first ? `. ${first.file}: ${first.reason}` : ""}` }
  }

  /* ── templates ── */
  convertTemplates(src, sectionTypes, blockSchemas, files, report)

  /* ── theme settings ── */
  const schemaSettings = parseJson(src.text.get("config/settings_schema.json") ?? "")
  const info = Array.isArray(schemaSettings) ? (schemaSettings.find((g) => g && typeof g === "object" && (g as Tree).name === "theme_info") as Tree | undefined) : undefined
  const settingsData = parseJson(src.text.get("config/settings_data.json") ?? "")
  const carried = themeValues(settingsData)
  /*
    THE THEME'S LOOK, WORKED OUT ONCE (./static-liquid.ts). The layout is
    evaluated against the theme's own saved settings: the stylesheets it
    links, the CSS variables its snippets build from fonts and colour
    schemes, and the classes on its <body>. What comes out is plain CSS,
    kept as layout/theme.storelib and drawn on every page
    (theme-stylesheet.ts layoutStylesheet); no Liquid runs on the site.
  */
  const look = themeLook(src, schemaSettings, settingsData, report, assetLookup)
  files["config/settings.json"] = JSON.stringify({ shopify: carried.values, ...look.settings }, null, 2) + "\n"
  if (look.layout) files[LAYOUT_PATH] = layoutFile(look.layout)
  if (src.text.has("config/settings_data.json")) {
    report.note("config/settings_data.json", `${carried.kept} theme setting${carried.kept === 1 ? "" : "s"} carried over for the sections that read them${look.settings.font_heading ? `; fonts ${[look.settings.font_heading, look.settings.font_body].filter(Boolean).join(" and ")} set in Theme settings › Typography` : ""}`)
  }
  for (const p of src.text.keys()) {
    if (p === "layout/theme.liquid" && look.layout) continue
    if (p.startsWith("layout/")) report.skip(p, `The page shell is Storelib's own; only the theme's styles were taken from it`)
  }
  const scripts = [...src.binary.keys(), ...src.text.keys()].filter((p) => /^assets\/.*\.(js|mjs|ts)$/.test(p)).length
  if (scripts) report.skip("assets/", `${scripts} script${scripts === 1 ? " was" : "s were"} left out: a Shopify theme's scripts call Shopify's own storefront`)

  const name = (typeof info?.theme_name === "string" && info.theme_name.trim()) || opts.fallbackName || "Shopify theme"
  const version = typeof info?.theme_version === "string" && /^\d+(\.\d+){0,2}/.test(info.theme_version) ? info.theme_version : "1.0.0"
  const theme: ThemeManifest = {
    format: THEME_FORMAT,
    format_version: THEME_FORMAT_VERSION,
    name: name.slice(0, 80),
    version,
    engine: { min: 1 },
    description: `Converted from the Shopify theme ${name.slice(0, 80)}.`,
    converted_from: "shopify",
  }
  if (typeof info?.theme_author === "string" && info.theme_author.trim()) theme.author = info.theme_author.trim().slice(0, 80)

  return { ok: true, pkg: { theme, files, assets }, report: report.done() }
}

async function readSources(entries: JSZip.JSZipObject[], root: string, report: Report): Promise<SourceFiles> {
  const text = new Map<string, string>()
  const binary = new Map<string, Uint8Array>()
  for (const f of entries) {
    const path = f.name.slice(root.length)
    const folder = path.split("/")[0]
    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    if (folder === "assets" && IMAGE_EXT.has(ext)) {
      const read = await readEntryCapped(f, LIMITS.assetBytes)
      if (read.bytes) binary.set(path, read.bytes)
      else report.skip(path, read.reason === "too_large" ? `Over ${LIMITS.assetBytes / 1024 / 1024} MB` : `Could not be read`)
      continue
    }
    if (folder === "assets" && /^(js|mjs|ts)$/.test(ext)) {
      binary.set(path, new Uint8Array(0))
      continue
    }
    const wanted =
      (["sections", "blocks", "snippets", "layout"].includes(folder) && ext === "liquid") ||
      (["sections", "templates", "config", "locales"].includes(folder) && ext === "json") ||
      (folder === "assets" && ext === "css")
    if (!wanted) continue
    const read = await readEntryTextCapped(f, LIMITS.sourceBytes)
    if (read.reason) report.skip(path, read.reason === "too_large" ? `Over ${LIMITS.sourceBytes / 1024} KB` : `Could not be read`)
    else text.set(path, read.text)
  }
  return { text, binary }
}

// ── One file ────────────────────────────────────────────────────────────────

type Setting = Record<string, unknown> & { type: string; id: string }

interface FileJob {
  path: string
  mode: "section" | "block"
  type: string
  tr: (value: unknown, fallback: string) => string
  translate: (key: string) => string | null
  snippet: (name: string) => string | null
  asset: LiquidContext["asset"]
  inlineSvg?: LiquidContext["inlineSvg"]
  report: Report
  /** The theme block files that converted; null while converting those files themselves. */
  blockTypes: Set<string> | null
}

const SCHEMA_TAG = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/

/**
 * One section or block file: its schema made Storelib's, then its markup,
 * then the compiler, with fallbacks. Null when it is left out, which the
 * report already says.
 */
function convertFile(text: string, job: FileJob): { source: string; settings: Setting[]; localBlocks: Map<string, Setting[]> | null } | null {
  const { path, report } = job
  const note = (m: string) => report.note(path, m)
  const leave = (reason: string) => {
    report.forget(path)
    report.skip(path, reason)
    return null
  }

  const found = text.match(SCHEMA_TAG)
  if (!found) return leave(`It has no {% schema %}, so there is nothing to say what it is or what can be changed`)
  const raw = parseJson(found[1])
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return leave(`Its {% schema %} is not a JSON object`)

  const schema = job.mode === "section" ? sectionSchema(raw as Tree, job, note) : blockSchema(raw as Tree, job, note)
  const valid = settle(schema, job, note)
  if (!valid) return leave(`Its schema could not be made one Storelib accepts`)

  const settings = (valid.settings as Setting[]) ?? []
  const local = Array.isArray(valid.blocks) ? (valid.blocks as Tree[]).filter((b) => b.name !== undefined || b.settings !== undefined) : []
  const refs = Array.isArray(valid.blocks) ? (valid.blocks as Tree[]).filter((b) => b.name === undefined && b.settings === undefined) : []
  const declared: Declared = {
    mode: job.mode,
    settings: valueTypes(settings),
    blockSettings: valueTypes(local.flatMap((b) => (b.settings as Setting[]) ?? [])),
    localBlocks: local.length > 0,
    themeBlocks: job.mode === "block" ? refs.length > 0 : refs.length > 0 && local.length === 0,
  }

  const ctx: LiquidContext = {
    declared,
    translate: job.translate,
    snippet: job.snippet,
    asset: job.asset,
    inlineSvg: job.inlineSvg,
    note,
    styles: [],
    script: null,
    seen: new Set(),
    budget: { chars: SNIPPET_BUDGET },
    unread: new Map(),
    /* Gathered into layout/theme.storelib for the whole theme (gatheredStylesheets). */
    stylesheetsGlobal: true,
  }
  let template = cleanMarkup(convertLiquid(text.replace(SCHEMA_TAG, ""), ctx), ctx)
  if (ctx.unread?.size) {
    const names = [...ctx.unread].sort((a, b) => b[1] - a[1]).map(([n]) => n)
    note(`${names.length} name${names.length === 1 ? "" : "s"} it reads ${names.length === 1 ? "has" : "have"} no meaning in Storelib and ${names.length === 1 ? "is" : "are"} read as nothing: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ", …" : ""}`)
  }

  /* A theme block that prints its own attributes is not wrapped by the engine, as on Shopify. */
  if (job.mode === "block") {
    if (template.includes("block.storelib_attributes")) valid.tag = null
    else delete valid.tag
  }

  let styles = usableCss(budgetCss(ctx.styles, note), job, note)
  let script = job.mode === "section" ? ctx.script : null
  const file = `${job.mode === "section" ? "sections" : "blocks"}/${job.type}.storelib`
  const compile = (s: string): ThemeError[] => {
    const r = job.mode === "section" ? compileSection(s, { file, expectType: job.type }) : compileBlock(s, { file, type: job.type })
    return r.ok === false ? r.errors : []
  }

  /*
    THE FALLBACKS, IN ORDER. The script first, because a Shopify script
    almost never passes (it reaches for `document` and Shopify's globals),
    then the CSS that carried Liquid, then all CSS, then the markup line
    by line: a line the compiler names is emptied of everything but its
    tags, so the blocks around it still open and close.
  */
  let errors = compile(assemble(template, styles, script, valid))
  if (errors.some((e) => e.stage === "script") && script) {
    script = null
    note(`{% javascript %} was left out: a Storelib section's script runs in a sandbox with its own API (docs/theme/09), and this one reaches past it`)
    errors = compile(assemble(template, styles, script, valid))
  } else if (script && !errors.length) {
    note(`{% javascript %} was kept as the section's script; check that it still does what it did`)
  }
  const cssWhy = () => errors.find((e) => e.stage === "css")?.message ?? ""
  if (errors.some((e) => e.stage === "css") && styles.some((c) => c.dynamic)) {
    note(`CSS written with Liquid ({% style %}) was left out: ${cssWhy()}`)
    styles = styles.filter((c) => !c.dynamic)
    errors = compile(assemble(template, styles, script, valid))
  }
  if (errors.some((e) => e.stage === "css") && styles.length) {
    note(`The ${job.mode}'s CSS was left out: ${cssWhy()}`)
    styles = []
    errors = compile(assemble(template, styles, script, valid))
  }
  for (let round = 0; round < 8 && errors.length && errors.every((e) => e.stage === "template"); round++) {
    const next = emptyLines(template, errors, TEMPLATE_FIRST_LINE)
    if (next === template) break
    note(`A line the compiler could not accept was emptied: ${errors[0].message}`)
    template = next
    errors = compile(assemble(template, styles, script, valid))
  }
  if (job.mode === "block" && errors.some((e) => /storelib_attributes/.test(e.message))) {
    delete valid.tag
    errors = compile(assemble(template, styles, script, valid))
  }
  if (errors.length) {
    const e = errors[0]
    return leave(`It did not compile after conversion: ${e.file ?? file}${e.line ? ` line ${e.line}` : ""}: ${e.message}`)
  }
  const blocks = local.length ? new Map(local.map((b) => [String(b.type), (b.settings as Setting[]) ?? []])) : null
  return { source: assemble(template, styles, script, valid), settings, localBlocks: blocks }
}

function valueTypes(list: Setting[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const s of list) if (holdsValue(s.type)) out.set(s.id, resolveControlType(s.type) ?? s.type)
  return out
}

/**
 * The .storelib file. A line of the template that is only `</template>` (an
 * HTML <template> element, which Shopify themes use) would end the block, so
 * it starts with a `{# #}` comment, which draws nothing.
 */
function assemble(template: string, styles: CssChunk[], script: string | null, schema: Tree): string {
  const tpl = template.replace(/^([ \t]*<\/(?:template|style|script|schema)>[ \t]*)$/gm, "{# #}$1")
  const css = styles.map((c) => c.css).join("\n").replace(/\n([ \t]*<\/style>[ \t]*)(?=\n|$)/g, " $1")
  const parts = [`<template>\n${tpl}\n</template>`]
  if (css.trim()) parts.push(`<style>\n${css}\n</style>`)
  if (script && script.trim()) parts.push(`<script>\n${script.replace(/\n([ \t]*<\/script>[ \t]*)(?=\n|$)/g, " $1")}\n</script>`)
  parts.push(`<schema>\n${JSON.stringify(schema, null, 2)}\n</schema>`)
  return parts.join("\n\n") + "\n"
}

/** assemble() writes `<template>` on line 1, so the template's first line is the file's second. */
const TEMPLATE_FIRST_LINE = 2

function emptyLines(template: string, errors: ThemeError[], first: number): string {
  const lines = template.split("\n")
  let changed = false
  for (const e of errors) {
    if (e.line === undefined) continue
    const i = e.line - first
    if (i < 0 || i >= lines.length) continue
    const tags = lines[i].match(/\{%[\s\S]*?%\}/g) ?? []
    const kept = tags.join("")
    if (kept !== lines[i]) {
      lines[i] = kept
      changed = true
    }
  }
  return changed ? lines.join("\n") : template
}

/** The CSS a section carries, within what one section may hold. */
function budgetCss(chunks: CssChunk[], note: (m: string) => void): CssChunk[] {
  let total = 0
  const out: CssChunk[] = []
  for (const c of chunks) {
    total += c.css.length
    if (total > CSS_BUDGET) {
      note(`Some of the theme's CSS was left out: a section carries at most ${CSS_BUDGET / 1024} KB of it here`)
      break
    }
    out.push({ ...c, css: c.css.replace(/@import[^;]*;/gi, "") })
  }
  return out
}

/**
 * Each piece of CSS on its own, so one piece Storelib cannot read costs that
 * piece and not the section's whole stylesheet. Liquid tags between rules
 * (`{% if %}` around a rule in a `{% style %}`) are the usual one: no
 * stylesheet parser reads them, so that piece is left out and said.
 */
function usableCss(chunks: CssChunk[], job: FileJob, note: (m: string) => void): CssChunk[] {
  const file = `${job.mode === "section" ? "sections" : "blocks"}/${job.type}.storelib`
  const type = job.mode === "section" ? job.type : `b-${job.type}`
  const out: CssChunk[] = []
  for (const chunk of chunks) {
    const css = labelFilledButtons(chunk.css, note)
    const r = scopeCss(css, { file, type })
    if (r.ok === true) out.push({ ...chunk, css })
    else note(`${chunk.dynamic ? "CSS written with Liquid ({% style %})" : "Part of the CSS"} was left out: ${r.errors[0]?.message ?? "it is not CSS Storelib reads"}`)
  }
  return out
}

/**
 * A rule that fills a button and never names its label's colour is refused
 * by the compiler (storelib/css.ts), which says to add
 * `color: var(--s-btn-text)`, the label colour the scheme chose for a filled
 * button. Shopify themes set that colour elsewhere, through classes this
 * import does not carry, so it is added here exactly as the compiler asks.
 * The same narrow test as the compiler's: a selector that says button, not
 * a state, a background that is a fill.
 */
function labelFilledButtons(css: string, note: (m: string) => void): string {
  if (!/btn|button/i.test(css) || /\{\{|\{%/.test(css)) return css
  let root
  try {
    root = postcss.parse(css)
  } catch {
    return css
  }
  let changed = false
  root.walkRules((rule: Rule) => {
    const parent = rule.parent as { type?: string; name?: string } | undefined
    if (parent?.type === "atrule" && /keyframes$/i.test(parent.name ?? "")) return
    const selector = rule.selector.toLowerCase()
    if (!/(^|[\s.#\[>+~])[a-z0-9_-]*(btn|button)/.test(selector)) return
    if (/:(hover|focus|active|visited|disabled|focus-visible|focus-within)|::/.test(selector)) return
    let fills = false
    let names = false
    rule.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase()
      if (prop === "color") names = true
      if (prop !== "background" && prop !== "background-color") return
      const v = decl.value.trim().toLowerCase()
      if (!["transparent", "none", "inherit", "unset", "initial"].includes(v)) fills = true
    })
    if (fills && !names) {
      rule.append({ prop: "color", value: "var(--s-btn-text)" })
      changed = true
    }
  })
  if (!changed) return css
  note(`Buttons with a background and no label colour were given color: var(--s-btn-text), the colour scheme's label colour for a filled button`)
  return root.toString()
}

/**
 * What the template compiler refuses outright, taken out with a word
 * rather than refusing the whole section: scripts, handlers, frames,
 * document tags. A `<style>` element's CSS moves to the style block.
 */
function cleanMarkup(html: string, ctx: LiquidContext): string {
  let out = html
  const take = (re: RegExp, message: string, to = "") => {
    if (re.test(out)) {
      ctx.note(message)
      re.lastIndex = 0
      out = out.replace(re, to)
    }
  }
  /* An attribute rule, on the markup between template tags only: `assign onboarding = false` is not an onclick. */
  const takeAttr = (re: RegExp, message: string, to = "") => {
    let hit = false
    out = out
      .split(/(\{%[\s\S]*?%\}|\{\{[\s\S]*?\}\})/)
      .map((part, i) => {
        if (i % 2 === 1) return part
        re.lastIndex = 0
        if (!re.test(part)) return part
        hit = true
        re.lastIndex = 0
        return part.replace(re, to)
      })
      .join("")
    if (hit) ctx.note(message)
  }
  take(/<script\b[\s\S]*?<\/script\s*>/gi, `A <script> in the markup was removed: a Storelib section's markup holds no scripts`)
  take(/<script\b[^>]*>/gi, `A <script> in the markup was removed: a Storelib section's markup holds no scripts`)
  out = out.replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_m, css: string) => {
    /* Tags inside it are masked for the scoper and run with the rest (storelib/css.ts). */
    ctx.styles.push({ css, dynamic: css.includes("{{") || css.includes("{%") })
    return ""
  })
  take(/<\/?(?:link|meta|base)\b[^>]*>/gi, `<link>, <meta> and <base> tags were removed: they belong to the page, not a section`)
  take(/<iframe\b[\s\S]*?<\/iframe\s*>|<iframe\b[^>]*>/gi, `An <iframe> was removed: a Storelib section opens a frame only through the embed filter`)
  take(/<object\b[\s\S]*?<\/object\s*>|<embed\b[^>]*>/gi, `An <object> or <embed> was removed`)
  takeAttr(/([\s/"'])on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, `on…= attributes were removed: a section's behaviour goes in its <script> block`, "$1")
  takeAttr(/([\s/"'])srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, `A srcdoc attribute was removed`, "$1")
  takeAttr(/\s(?:v-[a-z-]+|@[a-z][\w.:-]*|:[a-z-]+)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, `Framework attributes (v-…, @…, :…) were removed`)
  takeAttr(/javascript:[^"'\s>]*/gi, `A javascript: address was replaced with #`, "#")
  return out
}

// ── Schemas ─────────────────────────────────────────────────────────────────

/** A Shopify setting as a Storelib one, or null when Storelib has nothing to hold it. */
function cleanSetting(raw: unknown, i: number, job: FileJob, note: (m: string) => void): Setting | null {
  if (!raw || typeof raw !== "object") return null
  const s = raw as Tree
  const type = String(s.type ?? "")
  if (type === "header" || type === "paragraph") {
    const words = job.tr(s.content ?? s.label, "")
    if (!words) return null
    const out: Setting = { type, id: `${type === "header" ? "hdr" : "para"}_${i + 1}`, label: words.slice(0, 200) }
    if (type === "paragraph") out.content = words
    return out
  }
  /* Horizon's ids are written padding-block-start; the same name with _ is the Storelib one (settingId). */
  const id = settingId(String(s.id ?? ""))
  const canonical = resolveControlType(type)
  if (!canonical) {
    const why = UNSUPPORTED_TYPES[type] ?? `Storelib has no "${type}" control.`
    note(`Setting "${id}" (${type}) was dropped. ${why}`)
    return null
  }
  if (!ID.test(id)) {
    note(`Setting "${id}" was dropped: a Storelib setting id is lowercase letters, digits and _`)
    return null
  }
  const out: Setting = { ...(s as Tree), type, id, label: job.tr(s.label, humanise(id)).slice(0, 200) }
  for (const key of ["info", "placeholder"] as const) {
    if (s[key] === undefined) continue
    const v = job.tr(s[key], "")
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

function cleanSettings(list: unknown, job: FileJob, note: (m: string) => void): Setting[] {
  if (!Array.isArray(list)) return []
  const out: Setting[] = []
  const seen = new Set<string>()
  list.forEach((raw, i) => {
    const s = cleanSetting(raw, i, job, note)
    if (!s || seen.has(s.id)) return
    seen.add(s.id)
    out.push(s)
  })
  if (out.length > LIMITS.settingsPerSchema) {
    note(`Only the first ${LIMITS.settingsPerSchema} settings were kept`)
    out.length = LIMITS.settingsPerSchema
  }
  return out
}

function sectionSchema(raw: Tree, job: FileJob, note: (m: string) => void): Tree {
  const out: Tree = { type: job.type, name: job.tr(raw.name, humanise(job.type)).slice(0, 80) || humanise(job.type) }
  out.settings = cleanSettings(raw.settings, job, note)
  const local: Tree[] = []
  const refs: Tree[] = []
  if (Array.isArray(raw.blocks)) {
    for (const b of raw.blocks as Tree[]) {
      if (!b || typeof b !== "object") continue
      const t = String(b.type ?? "")
      if (t === "@app") {
        note(`App blocks were dropped: Storelib has no Shopify apps`)
        continue
      }
      if (b.name === undefined && b.settings === undefined) {
        if (t === "@theme" || (job.blockTypes?.has(t) ?? false)) refs.push({ type: t })
        else note(`The theme block "${t}" it accepts did not convert, so it is not offered`)
        continue
      }
      if (!TYPE.test(t)) {
        note(`Block "${t}" was dropped: a block type is lowercase letters, digits, - and _`)
        continue
      }
      const block: Tree = { type: t, name: job.tr(b.name, humanise(t)).slice(0, 80) || humanise(t), settings: cleanSettings(b.settings, job, note) }
      if (typeof b.limit === "number" && Number.isInteger(b.limit) && b.limit > 0) block.limit = b.limit
      local.push(block)
    }
  }
  if (local.length && refs.length) note(`The theme blocks it accepts were dropped: a Storelib section holds its own blocks or theme blocks, not both`)
  const blocks = local.length ? local : refs
  if (blocks.length) out.blocks = blocks
  if (typeof raw.max_blocks === "number" && raw.max_blocks > 0) out.max_blocks = Math.min(Math.floor(raw.max_blocks), LIMITS.blocksPerSection)
  if (Array.isArray(raw.presets)) out.presets = cleanPresets(raw.presets as Tree[], out, job, local.length > 0)
  placement(raw, out, note)
  return out
}

function blockSchema(raw: Tree, job: FileJob, note: (m: string) => void): Tree {
  const out: Tree = { name: job.tr(raw.name, humanise(job.type)).slice(0, 80) || humanise(job.type) }
  out.settings = cleanSettings(raw.settings, job, note)
  if (Array.isArray(raw.blocks)) {
    const refs = (raw.blocks as Tree[]).filter((b) => b && typeof b === "object" && (b.type === "@theme" || BLOCK_REF.test(String(b.type))) && b.name === undefined && b.settings === undefined).map((b) => ({ type: String(b.type) }))
    if (refs.length) out.blocks = refs
  }
  if (typeof raw.max_blocks === "number" && raw.max_blocks > 0) out.max_blocks = Math.min(Math.floor(raw.max_blocks), LIMITS.blocksPerSection)
  if (Array.isArray(raw.presets)) out.presets = cleanPresets(raw.presets as Tree[], out, job, false)
  return out
}

/** Presets that only set settings the section has and only add blocks it can hold. */
function cleanPresets(list: Tree[], schema: Tree, job: FileJob, local: boolean): Tree[] {
  const ids = new Set(((schema.settings as Setting[]) ?? []).filter((s) => holdsValue(s.type)).map((s) => s.id))
  const localTypes = new Set(((schema.blocks as Tree[]) ?? []).map((b) => String(b.type)))
  const accepts = ((schema.blocks as Tree[]) ?? []).map((b) => String(b.type))
  const okType = (t: string, top: boolean) => {
    if (local) return top && localTypes.has(t)
    if (!BLOCK_REF.test(t)) return false
    if (job.blockTypes && !job.blockTypes.has(t)) return false
    if (!top) return true
    return accepts.includes(t) || (accepts.includes("@theme") && !t.startsWith("_"))
  }
  const blocksOf = (node: Tree, top: boolean, depth: number): void => {
    const blocks = node.blocks
    if (blocks === undefined) {
      delete node.block_order
      return
    }
    if (depth > 4) {
      delete node.blocks
      delete node.block_order
      return
    }
    if (Array.isArray(blocks)) {
      node.blocks = (blocks as Tree[]).filter((b) => b && typeof b === "object" && (okType(String(b.type), top) || (b.static === true && !local && BLOCK_REF.test(String(b.type)))))
      for (const b of node.blocks as Tree[]) {
        if (local) { delete b.blocks; delete b.static }
        else blocksOf(b, false, depth + 1)
      }
      delete node.block_order
      return
    }
    if (typeof blocks !== "object" || blocks === null) {
      delete node.blocks
      return
    }
    const kept: Record<string, Tree> = {}
    for (const [id, b] of Object.entries(blocks as Record<string, Tree>)) {
      if (!b || typeof b !== "object" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue
      const isStatic = b.static === true
      if (local && isStatic) continue
      if (!okType(String(b.type), top) && !(isStatic && BLOCK_REF.test(String(b.type)))) continue
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
    if (p.settings && typeof p.settings === "object") {
      preset.settings = Object.fromEntries(Object.entries(p.settings as Tree).map(([k, v]) => [settingId(k), v] as [string, unknown]).filter(([k, v]) => ids.has(k) && !shopifyOnly(v)).map(([k, v]) => [k, typeof v === "string" && v.startsWith("t:") ? job.tr(v, "") : v]))
    }
    if ((schema.blocks as Tree[] | undefined)?.length) {
      blocksOf(preset, true, 1)
      dropShopifyValues(preset.blocks)
    } else {
      delete preset.blocks
      delete preset.block_order
    }
    out.push(preset)
  }
  return out
}

/** The preset's blocks, at every depth, without values that only mean something on Shopify. */
function dropShopifyValues(blocks: unknown): void {
  const list = Array.isArray(blocks) ? blocks : blocks && typeof blocks === "object" ? Object.values(blocks as Tree) : []
  for (const b of list as Tree[]) {
    if (!b || typeof b !== "object") continue
    if (b.settings && typeof b.settings === "object") b.settings = Object.fromEntries(Object.entries(b.settings as Tree).filter(([, v]) => !shopifyOnly(v)))
    dropShopifyValues(b.blocks)
  }
}

/** `enabled_on` / `disabled_on`: the groups Storelib has, and the templates as allowed_templates / disabled_templates. */
function placement(raw: Tree, out: Tree, note: (m: string) => void) {
  const key = raw.enabled_on ? "enabled_on" : raw.disabled_on ? "disabled_on" : null
  if (!key) return
  const v = raw[key] as Tree
  if (!v || typeof v !== "object") return
  const groups = Array.isArray(v.groups) ? (v.groups as unknown[]).filter((g): g is string => g === "*" || g === "header" || g === "footer" || g === "template") : []
  const templates = Array.isArray(v.templates) ? (v.templates as unknown[]).filter((t): t is string => typeof t === "string" && t !== "*") : []
  if (groups.length) out[key] = { groups }
  else if (Array.isArray(v.groups) && v.groups.length) note(`Its ${key} groups were dropped: Storelib has the header, footer and page groups only`)
  if (templates.length) out[key === "enabled_on" ? "allowed_templates" : "disabled_templates"] = templates
}

/**
 * The validator's word is final; this only answers it. Each refusal names a
 * path, and the thing at that path is removed (a setting, a default, a
 * preset) until the schema validates or nothing more can be removed.
 */
function settle(schema: Tree, job: FileJob, note: (m: string) => void): Tree | null {
  for (let round = 0; round < 8; round++) {
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
      if ((m = p.match(/^(?:blocks\[(\d+)\]\.)?settings\[(\d+)\]\.(default|visible_if|accept|limit|image|responsive|unit)$/))) {
        const list = m[1] !== undefined ? ((schema.blocks as Tree[])?.[Number(m[1])]?.settings as unknown) : schema.settings
        const s = settingAt(list, Number(m[2]))
        if (s && m[3] in s) {
          delete s[m[3]]
          changed = true
        }
      } else if ((m = p.match(/^(?:blocks\[(\d+)\]\.)?settings\[(\d+)\]/))) {
        const list = m[1] !== undefined ? ((schema.blocks as Tree[])?.[Number(m[1])]?.settings as unknown) : schema.settings
        const s = settingAt(list, Number(m[2]))
        if (s) note(`Setting "${s.id}" was dropped: ${e.message}`)
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
      } else if (/^(enabled_on|disabled_on|allowed_templates|disabled_templates|kind|tag|class|capabilities|max_blocks|blocks)/.test(p)) {
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

// ── Templates ───────────────────────────────────────────────────────────────

/** Shopify's template names that have a Storelib page of the same purpose. */
function pageKeyFor(name: string): string | null {
  if (name === "index") return "home"
  if (name === "product") return "product"
  if (name === "page.contact") return "contact"
  if (/^page\.about/.test(name)) return "about"
  return null
}

const WHY_NO_PAGE: [RegExp, string][] = [
  [/^collection/, "Storelib has no collection template; the shop at /products is generated"],
  [/^(blog|article)/, "A Storelib website has no blog of its own yet"],
  [/^cart/, "The cart is Storelib's own and is not made of sections"],
  [/^search/, "Search is a page Storelib generates"],
  [/^404/, "The 404 page is generated; edit it in the editor"],
  [/^password/, "A Storelib site is published or not; there is no password page"],
  [/^gift_card|^list-collections|^customers/, "Storelib has no such page"],
]

function convertTemplates(
  src: SourceFiles,
  sections: Map<string, { type: string; settings: Setting[]; blocks: Map<string, Setting[]> | null }>,
  blockSchemas: Map<string, Setting[]>,
  files: ThemeFiles,
  report: Report,
) {
  for (const [path, text] of [...src.text].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const m = path.match(/^templates\/(.+)\.json$/)
    if (!m) continue
    const key = m[1].includes("/") ? null : pageKeyFor(m[1])
    if (!key) {
      report.skip(path, WHY_NO_PAGE.find(([re]) => re.test(m[1]))?.[1] ?? `Storelib has no page for the "${m[1]}" template`)
      continue
    }
    if (files[`templates/${key}.json`]) {
      report.skip(path, `The ${key} page was already made from another template`)
      continue
    }
    const t = parseJson(text) as Tree | undefined
    if (!t || typeof t.sections !== "object" || t.sections === null) {
      report.skip(path, `It is not a JSON template with "sections"`)
      continue
    }
    const all = t.sections as Record<string, Tree>
    const order = (Array.isArray(t.order) ? (t.order as unknown[]) : Object.keys(all)).filter((id): id is string => typeof id === "string")
    const outSections: Tree = {}
    const outOrder: string[] = []
    const left = new Set<string>()
    for (const id of order) {
      const s = all[id]
      if (!s || typeof s !== "object") continue
      const conv = sections.get(String(s.type))
      if (!conv) {
        left.add(String(s.type))
        continue
      }
      if (outOrder.length >= LIMITS.sectionsPerTemplate) break
      const data: Tree = { type: conv.type, settings: values(s.settings, conv.settings) }
      if (s.disabled === true) data.hidden = true
      if (s.blocks && typeof s.blocks === "object") {
        const counter = { n: 0 }
        const kb = instanceBlocks(s.blocks as Record<string, Tree>, s.block_order, (type) => (conv.blocks ? conv.blocks.get(type) ?? null : blockSchemas.get(type) ?? null), !conv.blocks, counter, 1)
        if (Object.keys(kb.blocks).length) {
          data.blocks = kb.blocks
          data.block_order = kb.order
        }
      }
      outSections[id] = data
      outOrder.push(id)
    }
    if (left.size) report.note(path, `Sections that did not convert were left off this page: ${[...left].join(", ")}`)
    if (!outOrder.length) {
      report.skip(path, `None of its sections converted`)
      continue
    }
    files[`templates/${key}.json`] = JSON.stringify({ sections: outSections, order: outOrder }, null, 2) + "\n"
    report.converted.push(path)
  }
}

/**
 * A value that only means something on Shopify: a `shopify://` address, or a
 * dynamic source such as "{{ product.vendor }}", which here would print as
 * those characters.
 */
function shopifyOnly(v: unknown): boolean {
  return typeof v === "string" && (v.startsWith("shopify://") || v.includes("{{"))
}

/** A section's or block's saved values: only settings it still has, each a value its control accepts. */
function values(raw: unknown, defs: Setting[]): Tree {
  if (!raw || typeof raw !== "object") return {}
  const out: Tree = {}
  for (const [key, v] of Object.entries(raw as Tree)) {
    const k = settingId(key)
    const def = defs.find((d) => d.id === k)
    if (!def || !holdsValue(def.type)) continue
    if (shopifyOnly(v)) continue
    const control = controlFor(def.type)
    if (!control || !control.schema.safeParse(v).success) continue
    if (Array.isArray(def.options) && !(def.options as { value: string }[]).some((o) => o.value === v)) continue
    out[k] = v
  }
  return out
}

function instanceBlocks(
  blocks: Record<string, Tree>,
  order: unknown,
  schemaOf: (type: string) => Setting[] | null,
  nested: boolean,
  counter: { n: number },
  depth: number,
): { blocks: Tree; order: string[] } {
  const out: Tree = {}
  for (const [id, b] of Object.entries(blocks)) {
    if (!b || typeof b !== "object" || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue
    const defs = schemaOf(String(b.type))
    if (!defs) continue
    if (++counter.n > LIMITS.blocksPerSection) break
    const data: Tree = { type: String(b.type), settings: values(b.settings, defs) }
    if (b.static === true) data.static = true
    if (b.disabled === true) data.hidden = true
    if (nested && depth < 4 && b.blocks && typeof b.blocks === "object") {
      const inner = instanceBlocks(b.blocks as Record<string, Tree>, b.block_order, schemaOf, true, counter, depth + 1)
      if (Object.keys(inner.blocks).length) {
        data.blocks = inner.blocks
        data.block_order = inner.order
      }
    }
    out[id] = data
  }
  const listed = (Array.isArray(order) ? (order as unknown[]) : []).filter((id): id is string => typeof id === "string" && !!out[id] && !(out[id] as Tree).static)
  for (const id of Object.keys(out)) if (!(out[id] as Tree).static && !listed.includes(id)) listed.push(id)
  return { blocks: out, order: listed }
}

// ── The theme's look ────────────────────────────────────────────────────────

/** Most characters of theme stylesheet kept; a theme past it keeps the start and says so. */
export const THEME_STYLESHEET_MAX = 1_200_000

/**
 * Every {% stylesheet %} in the theme, in one: Shopify puts them all into one
 * styles.css drawn on every page, whether or not the section is on it, so a
 * rule in one snippet may style what another file draws. Each once, in file
 * order. They hold no Liquid; Shopify refuses one that does.
 */
function gatheredStylesheets(src: { text: Map<string, string> }): string {
  const seen = new Set<string>()
  const out: string[] = []
  const paths = [...src.text.keys()].filter((p) => /^(sections|blocks|snippets)\/[^/]+\.liquid$/.test(p)).sort()
  for (const p of paths) {
    for (const m of (src.text.get(p) ?? "").matchAll(/\{%-?\s*stylesheet\s*-?%\}([\s\S]*?)\{%-?\s*endstylesheet\s*-?%\}/g)) {
      const css = m[1].trim()
      if (!css || seen.has(css) || css.includes("{{") || css.includes("{%")) continue
      seen.add(css)
      out.push(css)
    }
  }
  return out.join("\n\n")
}

function themeLook(src: { text: Map<string, string> }, schemaSettings: unknown, settingsData: unknown, report: { note: (file: string, m: string) => void }, asset: LiquidContext["asset"]): { settings: Tree; layout: string } {
  const layout = src.text.get("layout/theme.liquid") ?? ""
  const d = settingsData && typeof settingsData === "object" ? (settingsData as Tree) : {}
  let current = d.current
  if (typeof current === "string" && d.presets && typeof d.presets === "object") current = (d.presets as Tree)[current]
  const types = new Map<string, string>()
  if (Array.isArray(schemaSettings)) {
    for (const group of schemaSettings) for (const st of ((group as Tree)?.settings as Tree[] | undefined) ?? []) if (typeof st?.id === "string" && typeof st?.type === "string") types.set(st.id, st.type)
  }
  /* A setting the theme declares and the saved data leaves out is its default, as on Shopify. */
  const values: Tree = {}
  if (Array.isArray(schemaSettings)) {
    for (const group of schemaSettings) for (const st of ((group as Tree)?.settings as Tree[] | undefined) ?? []) if (typeof st?.id === "string" && st.default !== undefined) values[st.id] = st.default
  }
  Object.assign(values, current && typeof current === "object" ? (current as Tree) : {})
  const settings = liquidSettings(values, types)
  resolveSettingReferences(settings, (name) => src.text.get(`snippets/${name}.liquid`) ?? null)
  const evaluator = new StaticLiquid({
    settings,
    snippet: (name) => src.text.get(`snippets/${name}.liquid`) ?? null,
    stylesheet: (name) => src.text.get(`assets/${name.replace(/^\/+/, "")}`) ?? null,
    asset: (name) => { const a = asset(name); return a && a.kind === "image" ? a.ref : null },
  })
  let html = ""
  if (layout) try {
    html = evaluator.render(layout, { request: { design_mode: false, locale: { iso_code: "en", direction: "ltr" }, page_type: "index" }, content_for_header: "", content_for_layout: "", template: { name: "index" } })
  } catch {
    report.note("layout/theme.liquid", "The theme's styles could not be worked out from its layout, so only its {% stylesheet %} rules are drawn")
    html = ""
  }
  const bodyClass = (html.match(/<body\b[^>]*\bclass="([^"]*)"/i)?.[1] ?? "").split(/\s+/).filter((c) => /^[A-Za-z][\w-]{0,60}$/.test(c)).slice(0, 12).join(" ")
  let css = [...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim()), gatheredStylesheets(src)].filter(Boolean).join("\n\n")
  if (css.length > THEME_STYLESHEET_MAX) {
    report.note("layout/theme.liquid", `The theme's stylesheet is ${Math.round(css.length / 1024)} KB; the first ${THEME_STYLESHEET_MAX / 1000} KB were kept`)
    /* At the end of a rule, so what is kept still reads as CSS. */
    css = css.slice(0, css.lastIndexOf("}", THEME_STYLESHEET_MAX) + 1)
  }
  /* Compiled to the page root here, so the report can say what was left out (../theme-stylesheet.ts). */
  if (css) {
    const compiled = compileThemeStylesheet(css, undefined, { rootClasses: bodyClass.split(" ").filter(Boolean) })
    if (compiled.failed) report.note("layout/theme.liquid", "The theme's stylesheet could not be read as CSS, so its sections draw with Storelib's theme instead")
    const { atRules, declarations, rules } = compiled.dropped
    if (atRules) report.note("layout/theme.liquid", `${atRules} @import, @font-face or similar rule${atRules === 1 ? " was" : "s were"} left out of the theme's stylesheet; its fonts load through Theme settings › Typography`)
    if (declarations || rules) report.note("layout/theme.liquid", `${declarations + rules} rule${declarations + rules === 1 ? "" : "s"} in the theme's stylesheet ${declarations + rules === 1 ? "was" : "were"} left out: page layout set on <body> or <html>, or an address that is not https`)
    css = compiled.css
  }
  const out: Tree = {}
  if (bodyClass) out.theme_root_class = bodyClass
  /* The theme's fonts, as Storelib's typography loads them. */
  const font = (id: string) => { const f = parseFont(values[id]); return f && !f.system ? f.family : "" }
  const heading = font("type_heading_font") || font("heading_font")
  const body = font("type_body_font") || font("body_font")
  const accent = font("type_accent_font") || font("type_subheading_font")
  if (heading) out.font_heading = heading
  if (body) out.font_body = body
  if (accent) out.font_accent = accent
  if (evaluator.unknownFilters.size) report.note("layout/theme.liquid", `While working out the theme's styles, ${[...evaluator.unknownFilters].slice(0, 8).map((f) => `"${f}"`).join(", ")} had no meaning here and printed the value as it was`)
  if (css) report.note("layout/theme.liquid", `The theme's stylesheet (${Math.round(css.length / 1024)} KB: its CSS variables, colour schemes, stylesheets and every {% stylesheet %}) is kept as layout/theme.storelib and drawn on every page`)
  return { settings: out, layout: css }
}

// ── Theme settings ──────────────────────────────────────────────────────────

/**
 * settings_data.json's current values, the plain ones: true and false,
 * numbers, short words. They are what `{% if settings.x %}` read on Shopify,
 * and the converted sections read them as `theme.settings.shopify.x`.
 * Colour schemes and the like are objects in Shopify's own shape, which
 * Storelib's theme settings do not share, so they stay behind.
 */
function themeValues(data: unknown): { values: Tree; kept: number } {
  if (!data || typeof data !== "object") return { values: {}, kept: 0 }
  const d = data as Tree
  let current = d.current
  if (typeof current === "string" && d.presets && typeof d.presets === "object") current = (d.presets as Tree)[current]
  if (!current || typeof current !== "object") return { values: {}, kept: 0 }
  const values: Tree = {}
  for (const [k, v] of Object.entries(current as Tree)) {
    if (!ID.test(k)) continue
    if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) values[k] = v
    else if (typeof v === "string" && v.length <= 200 && !v.startsWith("shopify://") && !/[<>]/.test(v)) values[k] = v
  }
  return { values, kept: Object.keys(values).length }
}

/**
 * An SVG icon as it may sit in a section's markup: the <svg> element and
 * what draws, nothing that runs or reaches out. Scripts, foreignObject,
 * on…= handlers, javascript: and outside href/xlink:href are taken out, and
 * the prolog, comments and doctype go. Anything that is not an <svg> at its
 * root is refused.
 */
export function cleanSvg(text: string): string | null {
  let s = text.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!DOCTYPE[\s\S]*?>/gi, "").replace(/<!--[\s\S]*?-->/g, "").trim()
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null
  s = s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(?:xlink:)?href\s*=\s*("(?!#)[^"]*"|'(?!#)[^']*')/gi, "")
    .replace(/javascript:/gi, "")
    .replace(/\s*\n\s*/g, " ")
  return /<script|on[a-z]+\s*=|javascript:/i.test(s) ? null : s
}
