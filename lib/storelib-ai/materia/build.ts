/**
 * ===========================================================================
 *  THE MATERIA CATALOGUE, BUILT FROM THE THEME'S OWN FILES
 * ===========================================================================
 * The AI website builder builds the way Storelib's templates are built: on
 * the Materia theme's sections and blocks, with a small edge of custom work.
 * For that the model needs to know what Materia has, compactly and exactly,
 * and how the shipped templates use it. This turns the theme package into
 * that knowledge:
 *
 *   sections   every theme-packages/materia/base/sections/*.liquid schema:
 *              its type, name, what it is for (a purpose read from its type
 *              and name), its key settings (content, pictures, links, data,
 *              layout choices) and its blocks; every setting id is kept too,
 *              so output can be checked against the real schema.
 *   blocks     the theme blocks in base/blocks.
 *   templates  every template in CODE_TEMPLATES (lib/themes/marketplace-
 *              shared.ts): its brief (the comment written above it, and the
 *              one at the top of its home page), its sample shop (scripts/
 *              theme-templates/shops.ts), its fonts and colour schemes, and
 *              each page's section order with the style settings it uses.
 *
 * Pure: the caller hands in the file texts (scripts/build-materia-catalogue.ts
 * reads them with fs and writes ./catalogue.generated.ts; the test rebuilds
 * it and compares, so the generated file can never drift from the theme).
 * Nothing of a section's code is kept: the theme is sold, its files stay out
 * of public/ and only this summary reaches a prompt.
 */

export interface MateriaSetting {
  id: string
  type: string
  /** A select's or radio's values, at most eight. */
  options?: string[]
}

export interface MateriaBlockEntry {
  type: string
  name: string
  /** Every setting id of the block, space separated (validation). */
  ids: string
  /** Its key settings, at most four, "id:type" space separated. */
  key: string
  /** Its selects with their values, "id=a|b|c" space separated. */
  selects?: string
}

export interface MateriaSectionEntry {
  type: string
  name: string
  /** What it is for, one of PURPOSES. */
  purpose: string
  /** The template it was made for, when its type says so (course2-cta: "course2"). */
  madeFor?: string
  /** It has presets, so Add section offers it. */
  addable: boolean
  /** Its key settings, at most eight, in schema order, "id:type" space separated (a select's values are in `selects`). */
  key: string
  /** Every setting id, space separated (validation). */
  ids: string
  /** Every select setting with its values, "id=a|b|c" joined by spaces, for repairs. */
  selects: string
  /** Its block types, as indexes into MateriaCatalogue.blockDefs (the same block in many sections is kept once). */
  blocks: number[]
  /** It takes theme blocks (@theme). */
  themeBlocks?: boolean
  max_blocks?: number
  /** The templates whose pages place it. */
  usedBy: string[]
}

export interface MateriaTemplateSection {
  type: string
  /** The style settings this template gives it (scheme, width, layout choices), at most six. */
  style?: Record<string, string | number | boolean>
  /** Its block types in order, repeated types counted: "question x6". */
  blocks?: string[]
}

export interface MateriaTemplatePage {
  key: string
  sections: MateriaTemplateSection[]
}

export interface MateriaTemplateEntry {
  template: string
  slug: string
  name: string
  category: string
  /** The template's brief: the comment above it in CODE_TEMPLATES and the one at the top of its home page. */
  brief: string
  shop?: string
  products?: string[]
  fonts: { heading?: string; body?: string; headingWeight?: string | number; headingScale?: number }
  /** Its colour schemes: background / text / button, at most four. */
  schemes: { id: string; background?: string; text?: string; button?: string }[]
  header: string[]
  footer: string[]
  pages: MateriaTemplatePage[]
}

export interface MateriaCatalogue {
  sections: MateriaSectionEntry[]
  /** The blocks sections declare, each distinct definition once. */
  blockDefs: MateriaBlockEntry[]
  /** The theme blocks (base/blocks). */
  blocks: MateriaBlockEntry[]
  templates: MateriaTemplateEntry[]
}

/** The purposes, in the order the catalogue lists them. */
export const PURPOSES = [
  "hero",
  "products",
  "product page",
  "collections",
  "text and story",
  "image with text",
  "features and benefits",
  "steps and timeline",
  "testimonials and reviews",
  "faq",
  "comparison and pricing",
  "media and gallery",
  "video",
  "marquee and logos",
  "call to action",
  "newsletter and contact",
  "blog",
  "countdown",
  "header and footer",
  "announcement",
  "popup",
  "store pages",
  "utility",
  "other",
] as const

/** Purpose rules, first match wins, read against "type name" in lower case. */
const PURPOSE_RULES: [RegExp, (typeof PURPOSES)[number]][] = [
  [/popup|modal|spin-wheel|fake-order/, "popup"],
  [/announc|annoucment|top-bar|promobanner/, "announcement"],
  [/^(header|footer)\b|mobile-navigation|mega-?menu|social-icons/, "header and footer"],
  [/countdown|timer/, "countdown"],
  [/^main-(product|collection|cart|search|blog|article|list|password|page|account|login|register|order|addresses|activate)|^page-404|^page-default|^page-heading|^page-wishlist|cart-|minicart|search-|password|coming-soon|store-location/, "store pages"],
  [/^blog|blog-|article|journal/, "blog"],
  [/faq|question/, "faq"],
  [/testimon|\breviews?\b|-reviews?\b|quote/, "testimonials and reviews"],
  [/compar|pricing|price|plan|offer|dynamic-pricing|bundle/, "comparison and pricing"],
  [/hero|slideshow/, "hero"],
  [/^products|best-?sell|new-arrival|product-grid|product-list|shelf|pack-row|pack-cards|track-table|audio-tracks|shop window|-shop\b/, "products"],
  [/^product|featured-product|related-product|recently|upsell|buy-?box|shop-the-look|try-the-look|product-|addtocart/, "product page"],
  [/collection|categor|lookbook|merch-look|rail\b/, "collections"],
  [/image-with-text|image-and|image-text|text-with-image|dual-image|multirow|teacher|instructor|about|story|creator-|author|maker|-creator\b/, "image with text"],
  [/step|timeline|process|how-it|how-to|curriculum|module/, "steps and timeline"],
  [/benefit|feature|icon|usp|trust|value|why|stat-counter|progress/, "features and benefits"],
  [/newsletter|subscribe|signup|sign-up|contact|form|book|map/, "newsletter and contact"],
  [/video|vsl|youtube|reels/, "video"],
  [/marquee|ticker|scroll(ing)?-text|logo|press|partner/, "marquee and logos"],
  [/gallery|image|media|instagram|slider|carousel|before-and-after|mosaic|grid|cards|tour|window|tiles|desktop|starfield/, "media and gallery"],
  [/banner|cta|call-to-action|promo|bonus/, "call to action"],
  [/text|rich|heading|statement|letter|brand|columns|content|tabs|hello|help|title/, "text and story"],
  [/custom|divider|spacer|back-to-top|breadcrumb|liquid|html|spacing|colors|embed|size-chart|clock|statusbar/, "utility"],
]

export function purposeOf(type: string, name: string): (typeof PURPOSES)[number] {
  const text = `${type} ${name}`.toLowerCase()
  for (const [re, p] of PURPOSE_RULES) if (re.test(text)) return p
  return "other"
}

/* ── reading the theme's files ───────────────────────────────────────── */

/** JSON with /* comments *\/ (Shopify's template files), parsed. Comments inside strings are kept. Null when it does not parse. */
export function parseCommentedJson(text: string): unknown {
  let out = ""
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      out += c
      if (c === "\\") {
        out += text[i + 1] ?? ""
        i++
      } else if (c === '"') inString = false
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      continue
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2)
      i = end < 0 ? text.length : end + 1
      continue
    }
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i)
      i = end < 0 ? text.length : end - 1
      continue
    }
    out += c
  }
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

/** The first /* comment *\/ of a file, flattened: a template page's brief. */
export function leadingComment(text: string): string {
  const m = /^\s*\/\*([\s\S]*?)\*\//.exec(text)
  return m ? m[1].replace(/\s+/g, " ").trim() : ""
}

type RawSetting = { type?: string; id?: string; options?: { value?: unknown }[] }
type RawBlock = { type?: string; name?: string; settings?: RawSetting[] }
type RawSchema = { name?: unknown; settings?: RawSetting[]; blocks?: RawBlock[]; presets?: unknown[]; max_blocks?: number }

/** The {% schema %} JSON of a Liquid file, or null. */
export function liquidSchema(text: string): RawSchema | null {
  const m = /{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema\s*-?%}/.exec(text)
  if (!m) return null
  const parsed = parseCommentedJson(m[1])
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RawSchema) : null
}

const nameText = (v: unknown, fallback: string): string => {
  if (typeof v === "string") return v.startsWith("t:") ? fallback : v
  if (v && typeof v === "object") {
    const en = (v as Record<string, unknown>).en
    if (typeof en === "string") return en
  }
  return fallback
}

const titleOf = (type: string) => type.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim()

/* A setting that carries no value of its own (a header, a paragraph). */
const isValued = (s: RawSetting): s is RawSetting & { id: string; type: string } => typeof s?.id === "string" && typeof s?.type === "string" && s.type !== "header" && s.type !== "paragraph"

/** How much a setting says about what the section shows, for the key list (lower first). */
function rank(s: { id: string; type: string }): number {
  const t = s.type
  /* Plumbing and type fine-tuning: real controls, never what a section is about. */
  if (/html|class|anchor|css|font|weight|^tag$|_tag$|transform|_case$|letter_spacing|line_height/.test(s.id)) return 9
  if (/^(text|inline_richtext|richtext|textarea|html)$/.test(t)) return /heading|title|text|subheading|caption|label|description|content/.test(s.id) ? 0 : 1
  if (/^(image_picker|video|video_url)$/.test(t)) return 2
  if (/^(product|product_list|collection|collection_list|blog|article|page|link_list)$/.test(t)) return 3
  if (t === "url") return 4
  if (t === "select" || t === "radio") return /layout|style|position|align|width|columns|direction|variant|ratio|size/.test(s.id) ? 5 : 7
  if (t === "color_scheme") return 6
  return 9
}

function keySettings(settings: RawSetting[], max: number): string {
  const valued = settings.filter(isValued)
  const picked = valued
    .map((s, i) => ({ s, i, r: rank(s) }))
    .filter((x) => x.r < 9)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
  return picked.map(({ s }) => `${s.id}:${s.type}`).join(" ")
}

/** "id:type" pairs back as settings, with a select's values from `selects`. */
export function readKey(key: string, selects = ""): MateriaSetting[] {
  const opts = new Map(selects.split(" ").filter(Boolean).map((x) => [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1).split("|").filter(Boolean)]))
  return key
    .split(" ")
    .filter(Boolean)
    .map((pair) => {
      const [id, type] = pair.split(":")
      const options = opts.get(id)
      return { id, type, ...(options?.length ? { options: options.slice(0, 8) } : {}) }
    })
}

const idsOf = (settings: RawSetting[] | undefined) => (settings ?? []).filter(isValued).map((s) => s.id).join(" ")

const selectsOf = (settings: RawSetting[] | undefined) =>
  (settings ?? [])
    .filter(isValued)
    .filter((s) => (s.type === "select" || s.type === "radio") && Array.isArray(s.options))
    .map((s) => `${s.id}=${(s.options ?? []).map((o) => String(o?.value ?? "")).filter(Boolean).join("|")}`)
    .join(" ")

/* ── templates ───────────────────────────────────────────────────────── */

export interface CodeTemplateRow {
  slug: string
  template: string
  name: string
  category: string
}

/** The comment written above each CODE_TEMPLATES entry, by its template folder: the template's brief. */
export function codeTemplateBriefs(marketplaceSharedText: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /\/\*((?:(?!\*\/)[\s\S])*?)\*\/\s*\n\s*\{\s*slug:\s*"[^"]*",\s*template:\s*"([^"]+)"/g
  for (const m of marketplaceSharedText.matchAll(re)) out[m[2]] = cleanBrief(m[1])
  return out
}

/** A brief without its bookkeeping: "Templates round 22:" and "after the owner's reference" say nothing to a model. */
export function cleanBrief(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\b(Templates )?[Rr]ound \d+[^:.]{0,160}:\s*/g, "")
    .replace(/,? after the owner's [A-Za-z0-9 ]*?reference( \([^)]*\))?/g, "")
    .replace(/\s+([.,;:])/g, "$1")
    .trim()
}

/** Settings that say how a template styles a section (not its words or pictures). */
const STYLE_ID = /^(color_scheme|section_width|layout|style|variant|content_align|text_align|alignment|image_position|position|columns|items_per_row|columns_desktop|card_style|heading_size|image_ratio|image_aspect|full_width|desktop_layout|direction|open_first|vertical_align)$/

function styleOf(settings: unknown): Record<string, string | number | boolean> | undefined {
  if (!settings || typeof settings !== "object") return undefined
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(settings as Record<string, unknown>)) {
    if (Object.keys(out).length >= 6) break
    if (!STYLE_ID.test(k)) continue
    if (typeof v === "string" && v.length <= 60) out[k] = v
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}

function blockRun(blocks: unknown, order: unknown): string[] | undefined {
  if (!blocks || typeof blocks !== "object") return undefined
  const map = blocks as Record<string, { type?: string }>
  const keys = Array.isArray(order) ? (order as string[]).filter((k) => map[k]) : Object.keys(map)
  const types = keys.map((k) => String(map[k]?.type ?? "")).filter(Boolean)
  const out: string[] = []
  for (const t of types) {
    const last = out[out.length - 1]
    const m = last ? /^(.*?)(?: x(\d+))?$/.exec(last) : null
    if (m && m[1] === t) out[out.length - 1] = `${t} x${Number(m[2] ?? 1) + 1}`
    else out.push(t)
  }
  return out.length ? out.slice(0, 10) : undefined
}

function pageSections(json: unknown): MateriaTemplateSection[] {
  if (!json || typeof json !== "object") return []
  const j = json as { sections?: Record<string, { type?: string; settings?: unknown; blocks?: unknown; block_order?: unknown; disabled?: boolean }>; order?: string[] }
  const sections = j.sections ?? {}
  const order = Array.isArray(j.order) ? j.order : Object.keys(sections)
  return order
    .map((k) => sections[k])
    .filter((s): s is NonNullable<typeof s> => !!s && typeof s.type === "string" && !s.disabled)
    .map((s) => {
      const style = styleOf(s.settings)
      const blocks = blockRun(s.blocks, s.block_order)
      return { type: String(s.type), ...(style ? { style } : {}), ...(blocks ? { blocks } : {}) }
    })
}

/** A page file name as the site's page key: index.json is home, page.about.json is about, product.json is product. */
export function pageKeyOf(file: string): string | null {
  const m = /^templates\/(.+)\.json$/.exec(file)
  if (!m) return null
  const base = m[1]
  if (base === "index") return "home"
  if (base === "page") return "page"
  if (base.startsWith("page.")) return base.slice(5)
  return base
}

/** Pages every template has in the same shape: the store's own, drawn from its data. */
const GENERIC_PAGES = new Set(["cart", "search", "404", "password", "blog", "article", "list-collections", "page", "shipping"])

/** The order the reference shows pages in: home, then pages, then the store's templates. */
const PAGE_ORDER = ["home", "about", "product", "collection", "list-collections", "contact", "faqs", "blog", "article", "cart", "search", "404", "password", "page"]
const pageRank = (k: string) => {
  const i = PAGE_ORDER.indexOf(k)
  return i < 0 ? 1.5 : i
}

/* ── the whole catalogue ─────────────────────────────────────────────── */

export interface CatalogueInput {
  /** base/sections/<file>.liquid → its text. */
  sections: Record<string, string>
  /** base/blocks/<file>.liquid → its text. */
  blocks: Record<string, string>
  /** The CODE_TEMPLATES rows, in their order. */
  codeTemplates: readonly CodeTemplateRow[]
  /** lib/themes/marketplace-shared.ts as text, for the comments above each row. */
  marketplaceSharedText: string
  /** templates/<template>/<path> → its text, for each template folder. */
  templateFiles: Record<string, Record<string, string>>
  /** The sample shop on each template's cover (scripts/theme-templates/shops.ts SAMPLE_SHOPS). */
  shops: Record<string, { name: string; products: { title: string }[] }>
}

const typeOfFile = (file: string) => file.replace(/^.*\//, "").replace(/\.liquid$/, "")

export function buildMateriaCatalogue(input: CatalogueInput): MateriaCatalogue {
  const templateIds = input.codeTemplates.map((t) => t.template)
  const briefs = codeTemplateBriefs(input.marketplaceSharedText)

  /* Templates first: which sections each places, for usedBy. */
  const templates: MateriaTemplateEntry[] = []
  const usedBy = new Map<string, Set<string>>()
  for (const t of input.codeTemplates) {
    const files = input.templateFiles[t.template] ?? {}
    const data = parseCommentedJson(files["config/settings_data.json"] ?? "") as { current?: Record<string, unknown> } | null
    const current = (data?.current && typeof data.current === "object" ? data.current : {}) as Record<string, unknown>
    const str = (k: string) => (typeof current[k] === "string" && current[k] ? (current[k] as string) : undefined)
    /* Its colour schemes, named by position (scheme 1 is the first), so a page's color_scheme reads short. */
    const schemesRaw = Object.entries((current.color_schemes ?? {}) as Record<string, { settings?: Record<string, unknown> }>)
    const schemeName = new Map(schemesRaw.map(([id], i) => [id, id === "default" ? "default" : `scheme ${i + 1}`]))
    const schemes = schemesRaw.slice(0, 4).map(([id, v]) => {
      const st = v?.settings ?? {}
      const c = (k: string) => (typeof st[k] === "string" && st[k] ? (st[k] as string) : undefined)
      const text = c("text_color") ?? c("text")
      return { id: schemeName.get(id) ?? id, ...(c("background") ? { background: c("background") } : {}), ...(text ? { text } : {}), ...(c("btn_primary_background") ? { button: c("btn_primary_background") } : {}) }
    })
    const short = (list: MateriaTemplateSection[]) =>
      list.map((x) => (x.style && typeof x.style.color_scheme === "string" ? { ...x, style: { ...x.style, color_scheme: schemeName.get(x.style.color_scheme) ?? x.style.color_scheme } } : x))
    const pages: MateriaTemplatePage[] = []
    let homeBrief = ""
    for (const [path, text] of Object.entries(files)) {
      const key = pageKeyOf(path)
      if (!key) continue
      if (key === "home") homeBrief = cleanBrief(leadingComment(text))
      const sections = short(pageSections(parseCommentedJson(text)))
      for (const x of sections) {
        if (!usedBy.has(x.type)) usedBy.set(x.type, new Set())
        usedBy.get(x.type)!.add(t.template)
      }
      /* The store's own pages (cart, search, 404, the blog's two...) are the same in every template: counted for usedBy, not listed. */
      /* Home in full (its style settings and blocks are the pattern); the other pages as their section order. */
      if (sections.length && !GENERIC_PAGES.has(key)) pages.push({ key, sections: key === "home" ? sections : sections.map((x) => ({ type: x.type })) })
    }
    pages.sort((a, b) => pageRank(a.key) - pageRank(b.key) || a.key.localeCompare(b.key))
    const group = (name: string) => pageSections(parseCommentedJson(files[`sections/${name}-group.json`] ?? "")).map((s) => s.type)
    const header = group("header")
    const footer = group("footer")
    for (const s of [...header, ...footer]) {
      if (!usedBy.has(s)) usedBy.set(s, new Set())
      usedBy.get(s)!.add(t.template)
    }
    const shop = input.shops[t.template]
    const brief = [briefs[t.template], homeBrief && homeBrief !== briefs[t.template] ? homeBrief : ""].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 900) || `${t.name}, a ${t.category} template.`
    templates.push({
      template: t.template,
      slug: t.slug,
      name: t.name,
      category: t.category,
      brief,
      ...(shop ? { shop: shop.name, products: shop.products.slice(0, 6).map((p) => p.title) } : {}),
      fonts: {
        ...(str("font_heading_google_family") ? { heading: str("font_heading_google_family") } : {}),
        ...(str("font_body_google_family") ? { body: str("font_body_google_family") } : {}),
        ...(current.heading_font_weight !== undefined ? { headingWeight: current.heading_font_weight as string | number } : {}),
        ...(typeof current.heading_font_scale === "number" ? { headingScale: current.heading_font_scale } : {}),
      },
      schemes,
      header,
      footer,
      pages,
    })
  }

  const blockDefs: MateriaBlockEntry[] = []
  const blockIndex = new Map<string, number>()
  const defOf = (b: MateriaBlockEntry) => {
    const sig = JSON.stringify(b)
    let i = blockIndex.get(sig)
    if (i === undefined) {
      i = blockDefs.length
      blockDefs.push(b)
      blockIndex.set(sig, i)
    }
    return i
  }
  const blockEntry = (b: RawBlock): MateriaBlockEntry => {
    const selects = selectsOf(b.settings)
    return { type: String(b.type), name: nameText(b.name, titleOf(String(b.type))), ids: idsOf(b.settings), key: keySettings(b.settings ?? [], 4), ...(selects ? { selects } : {}) }
  }
  const sections: MateriaSectionEntry[] = []
  for (const [file, text] of Object.entries(input.sections).sort(([a], [b]) => a.localeCompare(b))) {
    const schema = liquidSchema(text)
    if (!schema) continue
    const type = typeOfFile(file)
    const name = nameText(schema.name, titleOf(type))
    const madeFor = templateIds.find((t) => t !== "default" && type.toLowerCase().startsWith(`${t}-`))
    const blocks = (schema.blocks ?? []).filter((b) => typeof b?.type === "string" && !b.type.startsWith("@")).map((b) => defOf(blockEntry(b)))
    const themeBlocks = (schema.blocks ?? []).some((b) => b?.type === "@theme")
    sections.push({
      type,
      name,
      purpose: purposeOf(type, name),
      ...(madeFor ? { madeFor } : {}),
      addable: Array.isArray(schema.presets) && schema.presets.length > 0,
      key: keySettings(schema.settings ?? [], 8),
      ids: idsOf(schema.settings),
      selects: selectsOf(schema.settings),
      blocks,
      ...(themeBlocks ? { themeBlocks: true } : {}),
      ...(typeof schema.max_blocks === "number" ? { max_blocks: schema.max_blocks } : {}),
      usedBy: [...(usedBy.get(type) ?? [])].sort(),
    })
  }

  const blocks: MateriaBlockEntry[] = []
  for (const [file, text] of Object.entries(input.blocks).sort(([a], [b]) => a.localeCompare(b))) {
    const schema = liquidSchema(text)
    if (!schema) continue
    const type = typeOfFile(file)
    blocks.push(blockEntry({ ...schema, type, name: nameText(schema.name, titleOf(type)) } as RawBlock))
  }

  return { sections, blockDefs, blocks, templates }
}

/** The generated module's text: one exported constant, stable byte for byte for the same input. */
export function catalogueModuleText(catalogue: MateriaCatalogue): string {
  return [
    "/* GENERATED by scripts/build-materia-catalogue.ts from theme-packages/materia. Do not edit: run the script. */",
    'import type { MateriaCatalogue } from "./build"',
    "",
    `export const MATERIA_CATALOGUE: MateriaCatalogue = ${JSON.stringify(catalogue)}`,
    "",
  ].join("\n")
}
