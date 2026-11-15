/**
 * ===========================================================================
 *  AN IMPORTED SHOPIFY THEME, EXPORTED AS ONE
 * ===========================================================================
 * Export hands back what came in, with every change made in the builder:
 * the folders a Shopify theme has (layout, templates, sections, blocks,
 * snippets, assets, config, locales), each file at its own path and under
 * the theme's own names, the pages written back as templates/*.json and the
 * header and footer groups as sections/*-group.json, the theme's settings as
 * config/settings_data.json. Importing the result again gives the same site.
 *
 * WHAT SHOPIFY ACCEPTS. The result is meant to be uploaded to a Shopify store
 * (Online Store › Themes › Add theme › Upload zip file), so it is held to what
 * Shopify's upload and its Theme Check refuse:
 *
 *   sections     every section a template or group names has its file.
 *                Storelib's own newsletter is written out as a real Shopify
 *                section (it is plain {% form 'customer' %} Liquid); Storelib
 *                Reviews have nothing to draw with on Shopify, so they are
 *                left out of the template and said in `notes`.
 *   app blocks   Storelib's own (reviews, offers, stock, delivery, size
 *                chart, personalisation) name an app Shopify does not have:
 *                left out and said.
 *   presets      a {% schema %}'s presets under the theme's own setting ids:
 *                an import before round AW wrote the builder's ids into the
 *                theme's schema (padding_block_start for padding-block-start)
 *                and Shopify refuses every one of them.
 *   custom CSS   a section's Custom CSS goes back to Shopify's own
 *                `custom_css`, one rule per entry, as its editor keeps it.
 *   pictures     a picture uploaded in the builder is a Storelib address,
 *                which a Shopify image setting can't hold. It is written as
 *                `shopify://shop_images/<name>` and the picture rides in
 *                assets/ under that name: upload it once to Content › Files
 *                in Shopify and the setting finds it (`notes` lists them).
 *   products     a product picked in the builder is Storelib's id; Shopify
 *                reads a product setting by its handle, so the handle goes
 *                (`opts.productHandles`, the product's slug).
 *
 * AS IT CAME. A section keeps the name the theme gave it, a group keeps its
 * own name and type, settings_data.json keeps its presets, and a section file
 * is the theme's file byte for byte when nothing in it changed.
 *
 * Pure: the export route fetches the pictures (`media`) and zips the result.
 */
import { COMPAT_PREFIX, compatOf, compatValues, templateOfPage, binaryOf, ASSET_MAP_PATH } from "./install"
import { isCompatSource, splitCompatFile, SECTION_CSS_KEY } from "./theme"
import { pageParts, type StoredBlock, type StoredSection } from "./page"
import { NEWSLETTER_SECTION_TYPE, REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE, STORELIB_APP_SECTION_NAMES, isStorelibAppBlock } from "./native-sections"
import { newsletterSectionSource } from "./storelib-newsletter"

type O = Record<string, unknown>

/** Files kept beside the theme's own that are Storelib's, not the theme's. */
const OURS = new Set([ASSET_MAP_PATH, `${COMPAT_PREFIX}config/settings_panel.json`, `${COMPAT_PREFIX}import-report.json`])

/** Storelib's sections that have nothing to draw with on Shopify: left out of the export. */
const LEFT_OUT_SECTIONS = new Set([REVIEWS_SECTION_TYPE, REVIEW_WIDGET_SECTION_TYPE])

export interface ExportedTheme {
  files: Record<string, string | Uint8Array>
  /** Pictures and videos to fetch into assets/, by name. */
  media: Record<string, string>
  /** What a person should know before uploading it to Shopify, in plain words. */
  notes: string[]
}

export interface ExportOptions {
  /** A Storelib product id to its handle (the product's slug), for product settings picked in the builder. */
  productHandles?: Record<string, string>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One rule per entry, as Shopify's editor keeps a section's Custom CSS: split at the top level only, an @media rule whole. */
export function cssRules(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const c = css[i]
    if (c === "{") depth++
    else if (c === "}") {
      depth = Math.max(0, depth - 1)
      if (depth === 0) {
        const rule = css.slice(start, i + 1).trim()
        if (rule) out.push(rule)
        start = i + 1
      }
    }
  }
  const rest = css.slice(start).trim()
  if (rest) out.push(rest)
  return out
}

/** A short, stable name for a picture uploaded in the builder: its own file name, with a few characters of its address in front so two never meet. */
export function shopImageNameFor(url: string): string {
  let h = 2166136261
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 16777619) >>> 0
  let base = "picture.jpg"
  try {
    base = decodeURIComponent(new URL(url).pathname.split("/").pop() || base)
  } catch {
    /* not an address: the default name */
  }
  base = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-60) || "picture.jpg"
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) base = `${base}.jpg`
  return `storelib-${h.toString(16).padStart(8, "0").slice(0, 8)}-${base}`
}

/* As the import reads it: a byte order mark, block and line comments allowed (Horizon's locales have them). */
const uncomment = (text: string) => text.replace(/^\uFEFF/, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

function readJson(text: string | undefined): O | null {
  if (!text) return null
  try {
    const v = JSON.parse(uncomment(text))
    return v && typeof v === "object" && !Array.isArray(v) ? (v as O) : null
  } catch {
    return null
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) return a.length === (b as unknown[]).length && a.every((x, i) => deepEqual(x, (b as unknown[])[i]))
  const ka = Object.keys(a as O)
  const kb = Object.keys(b as O)
  return ka.length === kb.length && ka.every((k) => deepEqual((a as O)[k], (b as O)[k]))
}

export function exportShopifyTheme(rows: Record<string, string>, settings: unknown, pages: Record<string, StoredSection[]>, opts: ExportOptions = {}): ExportedTheme {
  const compat = compatOf(settings)
  /* Storelib's name for a section back to the theme's: theme-header is header again. */
  const original = new Map(Object.entries(compat?.renamed ?? {}).map(([theirs, ours]) => [ours, theirs]))
  const nameOf = (type: string) => original.get(type) ?? type
  const files: Record<string, string | Uint8Array> = {}
  const notes: string[] = []
  const say = (line: string) => { if (!notes.includes(line)) notes.push(line) }

  let media: Record<string, string> = {}
  try {
    media = JSON.parse(rows[ASSET_MAP_PATH] ?? "{}") as Record<string, string>
  } catch {
    media = {}
  }
  const uploaded = new Map<string, string>()

  /* ── the theme's own files, and its section and block schemas ── */
  const schemas = new Map<string, O>()
  /* What the builder named each section (its panel's schema name), for telling a rename from the default. */
  const shownNames = new Map<string, string>()
  const liquid: { path: string; key: string; markup: string; theirs: O | null }[] = []
  for (const [path, text] of Object.entries(rows)) {
    if (path.startsWith(COMPAT_PREFIX)) {
      if (OURS.has(path)) continue
      files[path.slice(COMPAT_PREFIX.length)] = binaryOf(text) ?? text
      continue
    }
    const m = path.match(/^(layout|snippets|sections|blocks)\/([^/]+)\.storelib$/)
    if (!m || !isCompatSource(text)) continue
    const [, folder, name] = m
    const { markup, schema } = splitCompatFile(text)
    if (folder === "layout" || folder === "snippets") {
      files[`${folder}/${name}.liquid`] = markup
      continue
    }
    const theirs = (schema?.shopify ?? null) as O | null
    const type = folder === "sections" ? nameOf(name) : name
    if (theirs) schemas.set(`${folder}/${name}`, theirs)
    if (folder === "sections" && typeof schema?.name === "string") shownNames.set(name, schema.name)
    liquid.push({ path: `${folder}/${type}.liquid`, key: `${folder}/${name}`, markup, theirs })
  }

  /* A value saved by the builder's id (padding_block_start) under the theme's own (padding-block-start). */
  const settingIds = (schema: O | undefined | null): Map<string, string> => {
    const out = new Map<string, string>()
    for (const s of (schema?.settings as O[] | undefined) ?? []) if (s && typeof s.id === "string") out.set(s.id.replace(/-/g, "_"), s.id)
    return out
  }
  const settingTypes = (schema: O | undefined | null): Map<string, string> => {
    const out = new Map<string, string>()
    for (const s of (schema?.settings as O[] | undefined) ?? []) if (s && typeof s.id === "string" && typeof s.type === "string") out.set(s.id, s.type)
    return out
  }
  /* A block's definition: one of the section's own (blocks with settings in its schema), else a theme block's file. */
  const blockDef = (type: string, local: O[]): O | undefined => local.find((d) => d.type === type) ?? schemas.get(`blocks/${type}`)
  const localBlocks = (schema: O | undefined | null): O[] => ((schema?.blocks as O[] | undefined) ?? []).filter((b) => b && typeof b === "object" && b.settings !== undefined)

  /**
   * A setting's value as Shopify reads it: a picture uploaded in the builder
   * named as a file of the shop, a product picked in the builder by its
   * handle. Anything else exactly as it was.
   */
  const shopifyValue = (type: string | undefined, value: unknown): unknown => {
    if (type === "image_picker" && typeof value === "string" && /^https?:\/\//i.test(value)) {
      const name = shopImageNameFor(value)
      uploaded.set(name, value)
      media[name] = value
      return `shopify://shop_images/${name}`
    }
    const handle = (v: unknown) => (typeof v === "string" && UUID.test(v) ? (opts.productHandles?.[v] ?? v) : v)
    if (type === "product") {
      const out = handle(value)
      if (typeof out === "string" && UUID.test(out)) say("A product picked in the builder is no longer in Storelib, so its setting is empty in Shopify. Choose it again there.")
      return out
    }
    if (type === "product_list" && Array.isArray(value)) return value.map(handle)
    return value
  }
  const valuesOf = (stored: O | undefined, schema: O | undefined | null): O => {
    const ids = settingIds(schema)
    const types = settingTypes(schema)
    const out: O = {}
    for (const [k, v] of Object.entries(stored ?? {})) {
      if (k === SECTION_CSS_KEY) continue
      const id = ids.get(k) ?? k
      out[id] = shopifyValue(types.get(id), v)
    }
    return out
  }

  /* ── presets under the theme's own ids again ── */
  const presetValues = (values: unknown, schema: O | undefined | null): unknown => {
    if (!values || typeof values !== "object" || Array.isArray(values)) return values
    const ids = settingIds(schema)
    const out: O = {}
    for (const [k, v] of Object.entries(values as O)) out[ids.get(k) ?? k] = v
    return out
  }
  const presetBlocks = (node: O, local: O[]): void => {
    const blocks = node.blocks
    if (!blocks || typeof blocks !== "object") return
    const fix = (b: O) => {
      if (!b || typeof b !== "object") return
      const def = blockDef(String(b.type ?? ""), local)
      if (b.settings !== undefined) b.settings = presetValues(b.settings, def)
      /* A block's own blocks are that block's: its file's blocks, or the theme's. */
      presetBlocks(b, localBlocks(def))
    }
    if (Array.isArray(blocks)) for (const b of blocks as O[]) fix(b)
    else for (const b of Object.values(blocks as O)) fix(b as O)
  }
  const repairPresets = (schema: O): O => {
    if (!Array.isArray(schema.presets)) return schema
    const copy = structuredClone(schema)
    const local = localBlocks(copy)
    for (const p of copy.presets as O[]) {
      if (!p || typeof p !== "object") continue
      if (p.settings !== undefined) p.settings = presetValues(p.settings, copy)
      presetBlocks(p, local)
    }
    return copy
  }

  for (const f of liquid) {
    const theirs = f.theirs && Object.keys(f.theirs).length ? repairPresets(f.theirs) : null
    if (!theirs) {
      files[f.path] = f.markup
      continue
    }
    /*
      The schema where the theme had it: after the markup, with the newline
      the theme's file ended on after it, so an untouched file is the theme's
      own byte for byte.
    */
    const ends = /\n\n$/.test(f.markup)
    files[f.path] = `${ends ? f.markup.slice(0, -1) : f.markup}{% schema %}\n${JSON.stringify(theirs, null, 2)}\n{% endschema %}${ends ? "\n" : ""}`
  }

  /* ── the words the theme's schema names things by (t: keys), for keeping a name the theme gave ── */
  const localeName = Object.keys(rows).find((p) => /^shopify\/locales\/[^/]+\.default\.schema\.json$/.test(p))
  const schemaWords = readJson(localeName ? rows[localeName] : undefined)
  const words = (v: unknown): string | null => {
    if (typeof v !== "string") return null
    if (!v.startsWith("t:")) return v
    let at: unknown = schemaWords
    for (const part of v.slice(2).split(".")) at = at && typeof at === "object" ? (at as O)[part] : undefined
    return typeof at === "string" ? at : null
  }

  const blocksOf = (list: StoredBlock[] | undefined, local: O[], where: string): { blocks: O; block_order: string[] } => {
    const blocks: O = {}
    const order: string[] = []
    for (const b of list ?? []) {
      /* An app block of Storelib's own names an app Shopify doesn't have. */
      if (isStorelibAppBlock(b.type)) {
        say(`Storelib's own blocks (reviews, offers, stock, delivery time, size chart, personalisation) are left out: Shopify draws them with an app of its own. ${where} had one.`)
        continue
      }
      const def = blockDef(b.type, local)
      const inner = blocksOf(b.blocks, localBlocks(def), where)
      const out: O = { type: b.type, settings: valuesOf(b.settings, def) }
      if (b.static) out.static = true
      if (b.hidden) out.disabled = true
      if (Object.keys(inner.blocks).length) { out.blocks = inner.blocks; out.block_order = inner.block_order }
      blocks[b.id] = out
      if (!b.static) order.push(b.id)
    }
    return { blocks, block_order: order }
  }

  let newsletter = false
  const template = (list: StoredSection[], before: O | null, where: string): O => {
    const sections: O = {}
    const order: string[] = []
    const was = (before?.sections ?? {}) as Record<string, O>
    for (const s of list) {
      if (LEFT_OUT_SECTIONS.has(s.type)) {
        say(`Storelib Reviews are left out: Shopify has no reviews of its own to show there. Add a reviews app in Shopify for them. ${where} had them.`)
        continue
      }
      if (s.type === NEWSLETTER_SECTION_TYPE) newsletter = true
      const schema = s.type === NEWSLETTER_SECTION_TYPE ? newsletterSchema() : schemas.get(`sections/${s.type}`)
      const { blocks, block_order } = blocksOf(s.blocks, localBlocks(schema), where)
      const out: O = { type: nameOf(s.type), settings: valuesOf(s.settings, schema) }
      /*
        A NAME ONLY WHERE THERE IS ONE. Shopify reads a section's `name` as a
        name somebody gave it; the import names every section, so writing them
        all back renamed every section in Shopify's editor, in English.
      */
      const theirs = was[s.id]?.name
      const shown = shownNames.get(s.type) ?? STORELIB_APP_SECTION_NAMES[s.type]
      if (typeof theirs === "string" && (s.name === words(theirs) || s.name === theirs || !s.name)) out.name = theirs
      else if (s.name && s.name !== shown) out.name = s.name
      if (s.hidden) out.disabled = true
      if (Object.keys(blocks).length) { out.blocks = blocks; out.block_order = block_order }
      /* Custom CSS where Shopify keeps it. */
      const css = typeof s.settings?.[SECTION_CSS_KEY] === "string" ? cssRules(String(s.settings[SECTION_CSS_KEY])) : []
      if (css.length) out.custom_css = css
      sections[s.id] = keepShape(out, was[s.id])
      order.push(s.id)
    }
    return { sections, order }
  }

  for (const [key, list] of Object.entries(pages)) {
    const { template: name, suffix } = templateOfPage(key)
    const path = `templates/${suffix ? `${name}.${suffix}` : name}.json`
    const parts = pageParts(list)
    const before = readJson(rows[`${COMPAT_PREFIX}${path}`])
    const out = template(parts.template, before, `The ${name}${suffix ? ` (${suffix})` : ""} page`)
    /* What else the theme's template held (a layout of its own, wrapper): kept. */
    for (const k of ["layout", "wrapper"]) if (before && before[k] !== undefined) out[k] = before[k]
    files[path] = JSON.stringify(out, null, 2)
  }
  const home = pageParts(pages.home ?? [])
  /*
    A static section (an older theme's `{% section 'header' %}`) was imported
    into a group under its own name; it goes back where that theme reads it,
    settings_data.json's `sections`, and not into a group file it never draws.
  */
  const values = compatValues(settings) as O
  const statics = values.sections && typeof values.sections === "object" ? { ...(values.sections as O) } : null
  if (statics) {
    for (const part of ["header", "footer"] as const) {
      home[part] = home[part].filter((s) => {
        if (!(s.id in statics)) return true
        statics[s.id] = (template([s], null, "The header or footer").sections as O)[s.id]
        return false
      })
    }
  }
  /* A group keeps the name and type the theme gave it. */
  const group = (file: string, fallback: O, list: StoredSection[], where: string) => {
    const before = readJson(rows[`${COMPAT_PREFIX}sections/${file}`])
    const head: O = { type: before?.type ?? fallback.type, name: before?.name ?? fallback.name }
    files[`sections/${file}`] = JSON.stringify({ ...head, ...template(list, before, where) }, null, 2)
  }
  if (home.header.length) group("header-group.json", { type: "header", name: "Header group" }, home.header, "The header")
  if (home.footer.length) group("footer-group.json", { type: "footer", name: "Footer group" }, home.footer, "The footer")
  /* The Overlay group goes back to the group files it came from. */
  for (const slot of new Set(home.overlay.map((s) => s.slot).filter((x): x is string => typeof x === "string" && /^[a-z0-9_-]+$/i.test(x)))) {
    const key = slot.replace(/-group$/, "")
    group(`${slot}.json`, { type: key === "aside" ? "aside" : `custom.${key}`, name: `${key.replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase())} group` }, home.overlay.filter((s) => s.slot === slot), "An overlay")
  }

  /* Storelib's newsletter, placed somewhere: written out as the Shopify section it already is. */
  if (newsletter) files[`sections/${NEWSLETTER_SECTION_TYPE}.liquid`] = newsletterForShopify()

  /*
    THE THEME'S SETTINGS. Values under the theme's own ids and in Shopify's
    shapes; the presets the theme came with kept (a Materia theme sells its
    styles as presets); and, when nothing was changed, `current` named as the
    theme named it.
  */
  const themeSchema = (() => {
    try {
      const list = JSON.parse(uncomment(rows[`${COMPAT_PREFIX}config/settings_schema.json`] ?? "[]")) as O[]
      return { settings: list.flatMap((g) => (Array.isArray(g?.settings) ? (g.settings as O[]) : [])) } as O
    } catch {
      return { settings: [] } as O
    }
  })()
  const types = settingTypes(themeSchema)
  const current: O = {}
  for (const [k, v] of Object.entries(values)) current[k] = k === "sections" ? v : shopifyValue(types.get(k), v)
  if (statics) current.sections = statics
  const data = readJson(rows[`${COMPAT_PREFIX}config/settings_data.json`])
  const presets = data?.presets && typeof data.presets === "object" ? (data.presets as O) : null
  const named = typeof data?.current === "string" && presets ? presets[data.current] : undefined
  const sameAsNamed = named !== undefined && deepEqual(named, current)
  files["config/settings_data.json"] = JSON.stringify({ current: sameAsNamed ? data!.current : current, ...(presets ? { presets } : {}) }, null, 2)

  if (uploaded.size) say(`${uploaded.size === 1 ? "A picture" : `${uploaded.size} pictures`} you uploaded in Storelib ${uploaded.size === 1 ? "is" : "are"} in the theme's assets folder, named storelib-…. Upload ${uploaded.size === 1 ? "it" : "them"} once to Content › Files in Shopify and the theme shows ${uploaded.size === 1 ? "it" : "them"} where you placed ${uploaded.size === 1 ? "it" : "them"}.`)
  return { files, media, notes }

  function newsletterSchema(): O | undefined {
    return (splitCompatFile(newsletterSectionSource()).schema?.shopify ?? undefined) as O | undefined
  }
}

/**
 * THE THEME'S OWN SHAPE, KEPT. A section or block the template already held
 * is written back the way that template wrote it: an empty `settings` it left
 * out stays out, an empty `blocks` or `block_order` it wrote stays, and the
 * name it gave a block (Horizon's `t:names.heading`) stays. Shopify reads both
 * shapes the same; keeping theirs means an untouched theme comes back as it was.
 */
export function keepShape(out: O, was: unknown, block = false): O {
  if (!was || typeof was !== "object" || Array.isArray(was)) return out
  const before = was as O
  if (before.type !== out.type) return out
  if (before.settings === undefined && isEmpty(out.settings)) delete out.settings
  if (out.blocks === undefined && isEmpty(before.blocks)) out.blocks = {}
  if (out.block_order === undefined && Array.isArray(before.block_order) && !before.block_order.length) out.block_order = []
  if (before.block_order === undefined && Array.isArray(out.block_order) && !out.block_order.length) delete out.block_order
  /* A block has no name in the builder to change, so the one the theme gave it comes back. */
  if (block && typeof before.name === "string") out.name = before.name
  const inner = out.blocks && typeof out.blocks === "object" ? (out.blocks as O) : null
  const theirs = before.blocks && typeof before.blocks === "object" ? (before.blocks as O) : null
  if (inner && theirs) for (const id of Object.keys(inner)) inner[id] = keepShape(inner[id] as O, theirs[id], true)
  return out
}
const isEmpty = (v: unknown) => !!v && typeof v === "object" && !Array.isArray(v) && !Object.keys(v as O).length

/**
 * STORELIB'S NEWSLETTER AS A SHOPIFY SECTION. It is Shopify Liquid already
 * ({% form 'customer' %}); three things are Storelib's and are said Shopify's
 * way here: the builder's canvas is Shopify's theme editor
 * (`request.design_mode`, where the bar and the popup show open to edit), a
 * heading in the settings is `content` alone, and a background picture
 * carries its width and height.
 */
export function newsletterForShopify(): string {
  const { markup, schema } = splitCompatFile(newsletterSectionSource())
  const theirs = structuredClone((schema?.shopify ?? {}) as O)
  if (Array.isArray(theirs.settings)) {
    theirs.settings = (theirs.settings as O[]).map((s) => (s && s.type === "header" ? { type: "header", content: s.content ?? s.label } : s))
  }
  const liquid = markup
    .replace(/\n+$/, "\n")
    .replace(/\bstorelib_in_builder\b/g, "request.design_mode")
    .replace(/<img class="slnl__bg" src="(\{\{ section\.settings\.image \| image_url: width: \d+ \}\})"/g, '<img class="slnl__bg" src="$1" width="{{ section.settings.image.width }}" height="{{ section.settings.image.height }}"')
  return `${liquid}{% schema %}\n${JSON.stringify(theirs, null, 2)}\n{% endschema %}\n`
}
