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
 * Pure: the export route fetches the pictures (`media`) and zips the result.
 */
import { COMPAT_PREFIX, compatOf, compatValues, templateOfPage, binaryOf, ASSET_MAP_PATH } from "./install"
import { isCompatSource, splitCompatFile } from "./theme"
import { pageParts, type StoredBlock, type StoredSection } from "./page"

type O = Record<string, unknown>

/** Files kept beside the theme's own that are Storelib's, not the theme's. */
const OURS = new Set([ASSET_MAP_PATH, `${COMPAT_PREFIX}config/settings_panel.json`, `${COMPAT_PREFIX}import-report.json`])

export interface ExportedTheme {
  files: Record<string, string | Uint8Array>
  /** Pictures and videos to fetch into assets/, by name. */
  media: Record<string, string>
}

export function exportShopifyTheme(rows: Record<string, string>, settings: unknown, pages: Record<string, StoredSection[]>): ExportedTheme {
  const compat = compatOf(settings)
  /* Storelib's name for a section back to the theme's: theme-header is header again. */
  const original = new Map(Object.entries(compat?.renamed ?? {}).map(([theirs, ours]) => [ours, theirs]))
  const nameOf = (type: string) => original.get(type) ?? type
  const files: Record<string, string | Uint8Array> = {}
  const schemas = new Map<string, O>()

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
    /* The schema straight after the markup, so the markup reads back to the character. */
    files[`${folder}/${type}.liquid`] = theirs && Object.keys(theirs).length ? `${markup}{% schema %}\n${JSON.stringify(theirs, null, 2)}\n{% endschema %}` : markup
  }

  /* A value saved by the builder's id (padding_block_start) under the theme's own (padding-block-start). */
  const settingIds = (schema: O | undefined): Map<string, string> => {
    const out = new Map<string, string>()
    for (const s of (schema?.settings as O[] | undefined) ?? []) if (typeof s.id === "string") out.set(s.id.replace(/-/g, "_"), s.id)
    return out
  }
  const valuesOf = (stored: O | undefined, ids: Map<string, string>): O => {
    const out: O = {}
    for (const [k, v] of Object.entries(stored ?? {})) out[ids.get(k) ?? k] = v
    return out
  }
  const blocksOf = (list: StoredBlock[] | undefined, local: O[]): { blocks: O; block_order: string[] } => {
    const blocks: O = {}
    const order: string[] = []
    for (const b of list ?? []) {
      const def = local.find((d) => d.type === b.type) ?? schemas.get(`blocks/${b.type}`)
      const inner = blocksOf(b.blocks, [])
      const out: O = { type: b.type, settings: valuesOf(b.settings, settingIds(def)) }
      if (b.static) out.static = true
      if (b.hidden) out.disabled = true
      if (Object.keys(inner.blocks).length) { out.blocks = inner.blocks; out.block_order = inner.block_order }
      blocks[b.id] = out
      if (!b.static) order.push(b.id)
    }
    return { blocks, block_order: order }
  }
  const template = (list: StoredSection[]): O => {
    const sections: O = {}
    const order: string[] = []
    for (const s of list) {
      const schema = schemas.get(`sections/${s.type}`)
      const local = ((schema?.blocks as O[] | undefined) ?? []).filter((b) => b.settings !== undefined)
      const { blocks, block_order } = blocksOf(s.blocks, local)
      const out: O = { type: nameOf(s.type), settings: valuesOf(s.settings, settingIds(schema)) }
      if (s.name) out.name = s.name
      if (s.hidden) out.disabled = true
      if (Object.keys(blocks).length) { out.blocks = blocks; out.block_order = block_order }
      sections[s.id] = out
      order.push(s.id)
    }
    return { sections, order }
  }

  for (const [key, list] of Object.entries(pages)) {
    const { template: name, suffix } = templateOfPage(key)
    const parts = pageParts(list)
    files[`templates/${suffix ? `${name}.${suffix}` : name}.json`] = JSON.stringify(template(parts.template), null, 2)
  }
  const home = pageParts(pages.home ?? [])
  if (home.header.length) files["sections/header-group.json"] = JSON.stringify({ type: "header", name: "Header group", ...template(home.header) }, null, 2)
  if (home.footer.length) files["sections/footer-group.json"] = JSON.stringify({ type: "footer", name: "Footer group", ...template(home.footer) }, null, 2)
  files["config/settings_data.json"] = JSON.stringify({ current: compatValues(settings) }, null, 2)

  let media: Record<string, string> = {}
  try {
    media = JSON.parse(rows[ASSET_MAP_PATH] ?? "{}") as Record<string, string>
  } catch {
    media = {}
  }
  return { files, media }
}
