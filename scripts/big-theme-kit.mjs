/**
 * A STORE THEME AT A STORE'S SIZE, for the editor probes.
 *
 * The Materia fixture (tests/fixtures/shopify-materia) has 11 sections and a
 * short page: one pass of the canvas costs little there, so a stutter that
 * comes from doing a pass too often does not show. This takes Dawn's own
 * zip (BIG_THEME_ZIP, a Shopify theme export) and makes it larger the way
 * stores do: copies of its sections under their own names (CLONES of them,
 * 160 sections or so in all), and a home page of LONG sections, each with
 * the blocks its preset gives it. Then it is converted as an import is
 * (lib/storelib-theme/shopify/convert.ts).
 *
 * Also a Storelib theme with a long home page, for the same probes.
 */
import { readFileSync } from "node:fs"
import JSZip from "jszip"

const schemaOf = (liquid) => {
  const m = /\{%-?\s*schema\s*-?%\}([\s\S]*?)\{%-?\s*endschema\s*-?%\}/.exec(liquid)
  try { return m ? JSON.parse(m[1]) : null } catch { return null }
}

/** Dawn's sections a home page is made of, with presets: the ones copied and put on the page. */
const PAGE_TYPES = ["image-banner", "rich-text", "featured-collection", "image-with-text", "multicolumn", "collapsible-content", "collage", "multirow", "newsletter", "slideshow", "email-signup-banner", "featured-blog", "collection-list", "video", "custom-liquid"]

export async function bigImportedTheme({ zipPath = process.env.BIG_THEME_ZIP, clones = Number(process.env.CLONES ?? 110), long = Number(process.env.LONG ?? 36), edit = null } = {}) {
  if (!zipPath) throw new Error("BIG_THEME_ZIP: the path of a Shopify theme's zip (Dawn's export)")
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const sources = {}
  for (const t of PAGE_TYPES) {
    const f = zip.file(`sections/${t}.liquid`)
    if (f) sources[t] = await f.async("string")
  }
  const types = Object.keys(sources)
  /* Copies under their own names, as a store's theme gains them: each its own file, its own schema name. */
  const made = []
  for (let k = 0; k < clones; k++) {
    const base = types[k % types.length]
    const name = `${base}-v${k}`
    const text = sources[base].replace(/("name"\s*:\s*")([^"]*)(")/, `$1$2 ${k}$3`)
    zip.file(`sections/${name}.liquid`, text)
    made.push(name)
  }
  /* A long home page: the page's sections, copies among them, each with its preset's blocks. */
  const sections = {}
  const order = []
  const all = [...types, ...made]
  for (let k = 0; k < long; k++) {
    const type = all[(k * 7) % all.length]
    const base = type.replace(/-v\d+$/, "")
    const schema = schemaOf(sources[base]) ?? {}
    const preset = schema.presets?.[0] ?? {}
    const blocks = {}
    const blockOrder = []
    const presetBlocks = Array.isArray(preset.blocks) ? preset.blocks : Object.values(preset.blocks ?? {})
    presetBlocks.forEach((b, j) => {
      const id = `b${k}_${j}`
      blocks[id] = { type: b.type, settings: { ...(b.settings ?? {}) } }
      blockOrder.push(id)
    })
    const id = `s${k}_${base.replace(/-/g, "_")}`
    sections[id] = { type, settings: { ...(preset.settings ?? {}) }, ...(blockOrder.length ? { blocks, block_order: blockOrder } : {}) }
    order.push(id)
  }
  zip.file("templates/index.json", JSON.stringify({ sections, order }, null, 2))
  if (edit) await edit(zip)
  const { convertShopifyTheme } = await import("../lib/storelib-theme/shopify/convert.ts")
  const r = await convertShopifyTheme(zip)
  if (!r.ok) throw new Error(r.error)
  const t = r.theme
  const src = Object.fromEntries(Object.entries(t.files).filter(([p]) => p.endsWith(".storelib")))
  const files = Object.fromEntries(Object.entries(t.files).filter(([p, x]) => p.startsWith("shopify/") && !x.startsWith("base64:") && !/^shopify\/locales\/(?!.*\.default(\.schema)?\.json$)/.test(p)))
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections]))
  if (!pages.page && pages.home) pages.page = pages.home.slice(0, 6)
  return { settings: t.settings, pages, sources: src, files, all: t.files }
}

/** A Storelib theme's long home page: the built-in sections, again and again, `n` of them between the header and the footer. */
export function longStorelibPage(n = Number(process.env.LONG ?? 36)) {
  const kinds = ["hero_centered", "features_grid", "text_rich", "faq_accordion", "promo_newsletter", "cta_simple", "text_image", "gallery", "stats", "proof_testimonials", "logo_bar", "process_steps", "about_image", "image_banner", "product_grid"]
  return ["header", ...Array.from({ length: n }, (_, k) => kinds[k % kinds.length]), "footer"]
}
