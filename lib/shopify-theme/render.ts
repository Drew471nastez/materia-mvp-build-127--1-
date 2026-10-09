/**
 * Render one Shopify Online Store 2.0 section with its snippets.
 *
 * Horizon's resource-list (and a lot of the rest of that theme) refuses to
 * draw unless `{% render %}` passes `settings`. A render that drops the
 * argument prints the error comment and nothing else, which is what an
 * uploaded theme showed in the editor.
 */
import { Liquid, Tag, type TagToken, type TopLevelToken, type Context, type Template } from "liquidjs"

export type ShopifyFiles = Map<string, string>

export interface ShopifySectionInput {
  id: string
  type: string
  settings?: Record<string, unknown>
  blocks?: Record<string, { type?: string; settings?: Record<string, unknown>; disabled?: boolean }>
  block_order?: string[]
}

const sheets: string[] = []

function memoryFs(files: ShopifyFiles) {
  const read = (filepath: string) => {
    const key = filepath.replace(/^\.\//, "").replace(/\.liquid$/i, "")
    const hit =
      files.get(key) ??
      files.get(`${key}.liquid`) ??
      files.get(`snippets/${key}.liquid`) ??
      files.get(`snippets/${key}`) ??
      files.get(`sections/${key}.liquid`) ??
      files.get(`blocks/${key}.liquid`)
    if (hit == null) throw new Error(`Missing ${filepath}`)
    return hit
  }
  return {
    sep: "/",
    dirname: (file: string) => file.split("/").slice(0, -1).join("/"),
    exists: async (filepath: string) => {
      try {
        read(filepath)
        return true
      } catch {
        return false
      }
    },
    existsSync: (filepath: string) => {
      try {
        read(filepath)
        return true
      } catch {
        return false
      }
    },
    readFile: async (filepath: string) => read(filepath),
    readFileSync: (filepath: string) => read(filepath),
    resolve: (_dir: string, file: string, ext: string) => (file.endsWith(ext) ? file : `${file}${ext}`),
    contains: async () => true,
    containsSync: () => true,
  }
}

/** Tags Shopify strips or treats as a side channel, not as markup. */
function registerShopifyTags(engine: Liquid) {
  const block = (name: string, onBody?: (body: string) => void) => {
    engine.registerTag(name, {
      parse(this: Tag & { body: Template[] }, _token: TagToken, remain: TopLevelToken[]) {
        this.body = []
        const stream = this.liquid.parser.parseStream(remain)
        stream
          .on(`tag:end${name}`, () => stream.stop())
          .on("template", (tpl: Template) => this.body.push(tpl))
          .on("end", () => { throw new Error(`Unclosed {% ${name} %}`) })
        stream.start()
      },
      *render(this: Tag & { body: Template[] }, ctx: Context) {
        const text = yield this.liquid.renderer.renderTemplates(this.body, ctx)
        onBody?.(String(text ?? ""))
        return ""
      },
    })
  }
  block("doc")
  block("schema")
  block("javascript")
  block("stylesheet", (body) => {
    if (body.trim()) sheets.push(body)
  })
  block("style", (body) => {
    if (body.trim()) sheets.push(body)
  })

  engine.registerTag("content_for", {
    parse(this: Tag & { what: string }, token: TagToken) {
      const raw = token.args.replace(/^['"]|['"]$/g, "").trim()
      this.what = raw.split(/[,\s]/)[0]?.replace(/['"]/g, "") || "blocks"
    },
    *render(this: Tag & { what: string }, ctx: Context) {
      if (this.what !== "blocks") return ""
      const section = ctx.getSync(["section"]) as { blocks?: { type?: string; settings?: Record<string, unknown>; id?: string }[] } | undefined
      const blocks = section?.blocks ?? []
      let html = ""
      for (const block of blocks) {
        if (!block?.type) continue
        try {
          const file = `blocks/${block.type}`
          html += yield this.liquid.renderFile(file, { ...ctx.getAll(), block, section, settings: block.settings ?? {} })
        } catch {
          /* A block with no file is skipped, not a reason to blank the section. */
        }
      }
      return html
    },
  })
}

function stripSchema(source: string): string {
  return source.replace(/\{%-?\s*schema\s*-?%\}[\s\S]*?\{%-?\s*endschema\s*-?%\}/gi, "")
}

function sectionName(source: string, fallback: string): string {
  const m = source.match(/\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/i)
  if (!m) return fallback
  try {
    const schema = JSON.parse(m[1]) as { name?: string }
    if (typeof schema.name === "string" && schema.name.trim()) return schema.name.trim()
  } catch {
    /* The name is cosmetic. */
  }
  return fallback
}

export function isShopifyTheme(files: ShopifyFiles): boolean {
  const hasLayout = files.has("layout/theme.liquid")
  const hasSection = [...files.keys()].some((p) => p.startsWith("sections/") && p.endsWith(".liquid"))
  return hasLayout && hasSection
}

export function readZipTextFiles(entries: { path: string; text: string | null }[]): ShopifyFiles {
  const files: ShopifyFiles = new Map()
  for (const entry of entries) {
    if (entry.text == null) continue
    const path = entry.path.replace(/^\/+/, "")
    files.set(path, entry.text)
  }
  return files
}

function blocksOf(section: ShopifySectionInput) {
  const order = section.block_order ?? Object.keys(section.blocks ?? {})
  return order
    .map((id) => {
      const block = section.blocks?.[id]
      if (!block || block.disabled) return null
      return { id, type: block.type, settings: block.settings ?? {} }
    })
    .filter((b): b is { id: string; type: string | undefined; settings: Record<string, unknown> } => !!b)
}

/** Markup the template language must not try to run again. */
function freeze(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\{[{%]/g, (m) => (m === "{{" ? "&#123;&#123;" : "&#123;%"))
}

/** A section file the editor can draw: the rendered Shopify markup, plus the CSS its snippets emitted. */
export function storelibFromRendered(rendered: RenderedShopifySection, type: string): string {
  const name = rendered.name.replace(/"/g, "'")
  return `<template>\n${freeze(rendered.html)}\n</template>\n<style>\n${freeze(rendered.css)}\n</style>\n<schema>\n${JSON.stringify({ name, type, settings: [] }, null, 2)}\n</schema>\n`
}

export interface RenderedShopifySection {
  id: string
  type: string
  name: string
  html: string
  css: string
  group: "header" | "footer" | null
}

const HEADER_TYPES = new Set(["header", "announcement-bar", "announcement_bar"])
const FOOTER_TYPES = new Set(["footer"])

export async function renderShopifySection(
  files: ShopifyFiles,
  section: ShopifySectionInput,
  themeSettings: Record<string, unknown>,
): Promise<RenderedShopifySection> {
  const sourcePath = `sections/${section.type}.liquid`
  const source = files.get(sourcePath)
  const name = source ? sectionName(source, section.type) : section.type
  const group = HEADER_TYPES.has(section.type) ? "header" : FOOTER_TYPES.has(section.type) ? "footer" : null
  if (!source) {
    return { id: section.id, type: section.type, name, html: "", css: "", group }
  }

  sheets.length = 0
  const engine = new Liquid({ fs: memoryFs(files) as never, extname: ".liquid", relativeReference: false })
  registerShopifyTags(engine)
  engine.registerFilter("asset_url", (input: unknown) => (typeof input === "string" ? input : ""))
  engine.registerFilter("image_url", () => "")
  engine.registerFilter("image_tag", () => "")
  engine.registerFilter("placeholder_svg_tag", () => "")
  engine.registerFilter("money", (v: unknown) => (v == null ? "" : String(v)))
  engine.registerFilter("t", (key: unknown) => (typeof key === "string" ? key : ""))

  const settings = section.settings && Object.keys(section.settings).length > 0 ? section.settings : { layout_type: "grid" }
  let html = ""
  try {
    html = await engine.parseAndRender(stripSchema(source), {
      section: { id: section.id, settings, blocks: blocksOf(section) },
      settings: themeSettings,
    })
  } catch (e) {
    html = ""
    const message = e instanceof Error ? e.message : "Could not render this section"
    return { id: section.id, type: section.type, name, html: `<!-- ${message} -->`, css: "", group }
  }
  return { id: section.id, type: section.type, name, html, css: sheets.join("\n"), group }
}

function parseGroup(raw: string | undefined): ShopifySectionInput[] {
  if (!raw) return []
  try {
    const json = JSON.parse(raw) as { order?: string[]; sections?: Record<string, ShopifySectionInput> }
    const order = json.order ?? Object.keys(json.sections ?? {})
    return order
      .map((id) => {
        const section = json.sections?.[id]
        if (!section) return null
        return { ...section, id, type: section.type }
      })
      .filter((s): s is ShopifySectionInput => !!s && !!s.type)
  } catch {
    return []
  }
}

export function themeSettingsFrom(files: ShopifyFiles): Record<string, unknown> {
  const raw = files.get("config/settings_data.json")
  if (!raw) return {}
  try {
    const json = JSON.parse(raw) as { current?: Record<string, unknown> | string }
    return json.current && typeof json.current === "object" ? json.current : {}
  } catch {
    return {}
  }
}

/** Header group, the index template, then the footer group. */
export function homeSections(files: ShopifyFiles): ShopifySectionInput[] {
  const index = parseGroup(files.get("templates/index.json"))
  return [
    ...parseGroup(files.get("sections/header-group.json")),
    ...index,
    ...parseGroup(files.get("sections/footer-group.json")),
  ]
}
