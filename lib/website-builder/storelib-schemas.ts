/**
 * ===========================================================================
 *  THE SIDEBAR'S SCHEMA, FROM THE SECTION'S FILE
 * ===========================================================================
 * The editor draws a section's settings panel from `SECTION_SCHEMAS[type]`:
 * a list of fields, each with a control type, and the blocks and presets the
 * section declares. For a section that lives in a `.storelib` file, that
 * schema is the file's own `<schema>` block — read here, validated by the
 * engine, and handed to the editor in the shape it already understands.
 *
 * Nothing is invented on the way through. A setting's control type is the
 * registry's name for it (`url`, `image_picker`…) and the editor's
 * FieldEditor resolves those through the same registry, so the file, the
 * validator, the AI's reference and the panel all describe one control.
 */
import { DESIGN_SUPPORT_KEYS } from "./design-support"
import { chromeRoleOf } from "@/lib/storelib-theme/chrome"
import { COMPILE_CACHE_LIMIT, createLru } from "@/lib/storelib-theme/storelib/compile"
import { parseStorelib, parseSchemaJson } from "@/lib/storelib-theme/storelib/parse"
import { acceptsType, validateBlockSchema, validateSectionSchema } from "@/lib/storelib-theme/schema/validate"
import { compileTemplate, contentForRefs } from "@/lib/storelib-theme/storelib/template"
import { compileBlock } from "@/lib/storelib-theme/storelib/compile"
import { blockTypeFromPath, isPrivateBlock, listFromPreset, presetTree } from "@/lib/storelib-theme/blocks"
import type { SectionPreset as EnginePreset, SectionSchema as EngineSchema, SettingDefinition } from "@/lib/storelib-theme/types"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import { isCompatSource, splitCompatFile } from "@/lib/storelib-theme/compat/theme"
import { contentForStatics } from "./product-details-rule"
import type { BlockInstance, BlockSchema, SchemaField, SchemaFieldType, SectionPreset, SectionSchema } from "./types"

function field(s: SettingDefinition): SchemaField {
  const f: SchemaField = { id: s.id, label: s.label ?? "", type: s.type as SchemaFieldType }
  if (s.default !== undefined) f.default = s.default
  if (s.options) f.options = s.options
  if (s.min !== undefined) f.min = s.min
  if (s.max !== undefined) f.max = s.max
  if (s.step !== undefined) f.step = s.step
  if (s.unit !== undefined) f.unit = s.unit
  if (s.placeholder !== undefined) f.placeholder = s.placeholder
  if (s.info !== undefined) f.info = s.info
  if (s.responsive) f.responsive = true
  /* The keys the newer controls read, carried to the panel rather than dropped on the way. */
  if (typeof s.limit === "number") f.limit = s.limit
  if (Array.isArray(s.accept)) f.accept = (s.accept as unknown[]).filter((x): x is string => typeof x === "string")
  if (typeof s.image === "string") f.image = s.image
  if (typeof s.content === "string") f.content = s.content
  if (typeof s.visible_if === "string") f.visible_if = s.visible_if
  if (typeof s.from === "string") f.from = s.from
  return f
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

/** The engine's schema in the editor's shape. Pure. */
export function editorSchema(schema: EngineSchema): SectionSchema {
  const out: SectionSchema = {
    type: schema.type,
    name: schema.name,
    fields: schema.settings.map(field),
  }
  if (schema.description !== undefined) out.description = schema.description
  if (schema.icon !== undefined) out.icon = schema.icon
  if (schema.category !== undefined) out.category = schema.category
  if (schema.blocks) {
    out.blocks = schema.blocks.map((b): BlockSchema => {
      const block: BlockSchema = { type: b.type, name: b.name, fields: b.settings.map(field) }
      if (b.limit !== undefined) block.limit = b.limit
      return block
    })
  }
  if (schema.accepts?.length) out.accepts = [...schema.accepts]
  if (schema.max_blocks !== undefined) out.max_blocks = schema.max_blocks
  // What the panel may change about the section's design. See design-support.ts.
  for (const key of DESIGN_SUPPORT_KEYS) if (schema[key] !== undefined) (out as unknown as Record<string, unknown>)[key] = schema[key]
  // Where it may go, and whether it is the site's own header or footer.
  if (schema.enabled_on) out.enabled_on = schema.enabled_on as SectionSchema["enabled_on"]
  if (schema.disabled_on) out.disabled_on = schema.disabled_on as SectionSchema["disabled_on"]
  if (schema.kind === "header" || schema.kind === "footer") out.kind = schema.kind
  if (schema.presets) out.presets = editorPresets(schema.type, schema.presets)
  return out
}

/**
 * Presets in the editor's shape: a tree of blocks with ids. The ids here are
 * stable placeholders; a block is given its own id the moment the preset is
 * placed on a page (block-tree.ts, freshBlocks), except a static block,
 * whose id is how its template finds it.
 */
function editorPresets(type: string, presets: EnginePreset[]): SectionPreset[] {
  return presets.map((p): SectionPreset => {
    const preset: SectionPreset = { name: p.name, settings: p.settings ?? {} }
    if (p.category) preset.category = p.category
    const tree = presetTree(p)
    if (p.blocks !== undefined) {
      let n = 0
      preset.blocks = listFromPreset(tree, () => `${type}-${slug(p.name)}-${n++}`) as BlockInstance[]
    }
    return preset
  })
}

/**
 * The static blocks an imported theme's markup places: `{% content_for
 * 'block', type: 'x', id: 'y' %}`, read from the text, since that markup is
 * the compatible profile (lib/storelib-theme/compat) and not Storelib's own.
 */
function compatStatics(markup: string): { type: string; id: string }[] {
  return contentForStatics(markup)
}

/** The static blocks a template places, read from the template without compiling the rest of the file. */
function staticsIn(templateText: string, file: string): { type: string; id: string }[] {
  const t = compileTemplate(templateText, { file, lenient: true })
  if (t.ok === false) return []
  const out: { type: string; id: string }[] = []
  for (const ref of contentForRefs(t.value)) {
    if (ref.what === "block" && !out.some((o) => o.id === ref.id)) out.push({ type: ref.type, id: ref.id })
  }
  return out
}

export type StorelibSchemaResult = { ok: true; schema: SectionSchema } | { ok: false; errors: string[] }

/** Bounded for the same reason the compile cache is: the key is the file's text. */
const cache = createLru<StorelibSchemaResult>(COMPILE_CACHE_LIMIT)

/** The `<schema>` of a `.storelib` source, as the editor's schema. Cached per source text. */
export function schemaFromStorelib(source: string, file: string): StorelibSchemaResult {
  const hit = cache.get(source)
  if (hit) return hit
  /**
   * `file:line key message`. The key matters: zod says "Required" and means
   * one particular missing field, and without its path a creator reading
   * "sections/hero.storelib:2 Required" is told a line that holds the whole
   * schema and not which key is missing from it.
   */
  const describe = (errors: { line?: number; path?: string; message: string }[]) =>
    errors.map((e) => `${file}${e.line ? `:${e.line}` : ""} ${e.path && e.path !== "(root)" ? `${e.path}: ` : ""}${e.message}`)
  let result: StorelibSchemaResult
  const parsed = parseStorelib(source, file)
  if (parsed.ok === false) result = { ok: false, errors: describe(parsed.errors) }
  else {
    const json = parseSchemaJson(parsed.value.schema, file)
    if (json.ok === false) result = { ok: false, errors: describe(json.errors) }
    else {
      const valid = validateSectionSchema(json.value, { file, line: parsed.value.schema.line, text: parsed.value.schema.text })
      if (valid.ok === false) result = { ok: false, errors: describe(valid.errors) }
      else {
        const schema = editorSchema(valid.value)
        const statics = isCompatSource(source) ? compatStatics(splitCompatFile(source).markup) : staticsIn(parsed.value.template.text, file)
        if (statics.length) schema.statics = statics
        /* From an imported theme: each placed section's own name comes first in the sidebar (section-name.ts). */
        if (isCompatSource(source)) schema.imported = true
        result = { ok: true, schema }
      }
    }
  }
  cache.set(source, result)
  return result
}

/*
  ═══════════════════════════════════════════════════════════════════════════
   READ WHEN ASKED FOR, NOT WHEN THE MODULE LOADS (round 1023)
  ═══════════════════════════════════════════════════════════════════════════
  Every one of the default theme's forty-odd section schemas was parsed,
  validated and turned into the editor's shape as this module loaded: 88ms
  of the editor's first second, measured (scripts/check-canvas-load.mjs
  PROFILE=1, schemaFromStorelib), in the task that draws the first canvas,
  and on an imported theme's editor, which shows none of them. Each is now
  read the first time it is asked for, and kept: the same record, the same
  keys in the same order, the same objects every time after the first.
  Spreading it or listing its values reads them all, as before.
*/
export function lazyRecord<T>(keys: readonly string[], make: (key: string) => T): Record<string, T> {
  const out = {} as Record<string, T>
  for (const key of keys) {
    Object.defineProperty(out, key, {
      enumerable: true,
      configurable: true,
      get(this: Record<string, T>) {
        const value = make(key)
        Object.defineProperty(this, key, { value, enumerable: true, configurable: true, writable: true })
        return value
      },
      set(this: Record<string, T>, value: T) {
        Object.defineProperty(this, key, { value, enumerable: true, configurable: true, writable: true })
      },
    })
  }
  return out
}

/** `{ ...a, ...b }` that keeps a lazy record's entries lazy: the same keys, in the same order, the later record winning (READ WHEN ASKED FOR). */
export function mergeLazy<T>(...records: Record<string, T>[]): Record<string, T> {
  const out = {} as Record<string, T>
  for (const r of records) Object.defineProperties(out, Object.getOwnPropertyDescriptors(r))
  return out
}

/** An array whose items are worked out the first time anything reads it (READ WHEN ASKED FOR). */
export function lazyList<T>(make: () => T[]): T[] {
  const list: T[] = []
  let made = false
  const fill = () => {
    if (made) return
    made = true
    list.push(...make())
  }
  return new Proxy(list, {
    get(t, k, r) { fill(); return Reflect.get(t, k, r) },
    has(t, k) { fill(); return Reflect.has(t, k) },
    ownKeys(t) { fill(); return Reflect.ownKeys(t) },
    getOwnPropertyDescriptor(t, k) { fill(); return Reflect.getOwnPropertyDescriptor(t, k) },
    set(t, k, v, r) { fill(); return Reflect.set(t, k, v, r) },
  })
}

/** Every section type the default theme defines in a `.storelib` file. */
export const STORELIB_SECTION_TYPES: string[] = Object.keys(DEFAULT_THEME_SOURCES)
  .filter((p) => /^sections\/[a-z0-9_-]+\.storelib$/.test(p))
  .map((p) => p.slice("sections/".length, -".storelib".length))

/**
 * The default theme's `.storelib` schemas, keyed by type. A file that does
 * not validate gets a schema with its type and no fields rather than a
 * crash, and tests/storelib-theme.test.ts fails on the file itself.
 */
export const STORELIB_SCHEMAS: Record<string, SectionSchema> = lazyRecord(STORELIB_SECTION_TYPES, (type) => {
  const path = `sections/${type}.storelib`
  const r = schemaFromStorelib(DEFAULT_THEME_SOURCES[path], path)
  if (r.ok === true) return r.schema
  if (typeof console !== "undefined") console.error(`${path} did not validate:\n  ${r.errors.join("\n  ")}`)
  return { type, name: type, fields: [] }
})

/**
 * WHAT ADD SECTION OFFERS, from the theme's own list and the theme's own
 * files, which have to agree.
 *
 * The manifest decides which of the theme's sections are offered and in what
 * order: that list is the library, and a theme that ships a section without
 * listing it has retired it rather than forgotten it. The files decide
 * whether a listed section can actually be offered: no preset means nothing
 * to put on the page, so it is dropped however the list reads.
 *
 * A section a creator wrote is not the theme's and is not here — see
 * customSectionSchemas, which files it under "Created".
 */
export function addableSections(manifestList: readonly string[], storelib: Record<string, SectionSchema>): string[] {
  const hasPreset = (type: string) => (storelib[type]?.presets?.length ?? 0) > 0
  return manifestList.filter((type) => !(type in storelib) || hasPreset(type))
}

/**
 * The schema the sidebar should draw for a type: the person's saved
 * sections/<type>.storelib when there is one, else the default theme's, else
 * the JSON schema. A saved file that does not validate falls back to the
 * default rather than to nothing, so a half-edited schema does not empty
 * the panel; the code editor is where its errors are shown.
 */
export function schemaFor(type: string, sources: Record<string, string> | undefined, fallback: Record<string, SectionSchema>): SectionSchema | undefined {
  const path = `sections/${type}.storelib`
  const saved = sources?.[path]
  if (saved !== undefined) {
    const r = schemaFromStorelib(saved, path)
    if (r.ok === true) return platformShape(type, r.schema)
  }
  return platformShape(type, fallback[type])
}

/**
 * SECTIONS WHOSE CONTENT THE SHOP OWNS. The search results list the shop's
 * own products, the ones the words matched; there is nothing to pick and
 * nothing to add. A theme that carries an older copy of the file (one saved
 * in the code editor, or brought in with an imported theme) still offered
 * "The ones I pick" and product blocks, so the shape is the platform's here,
 * whatever copy a theme has: no blocks and no source switch.
 */
function platformShape(type: string, schema: SectionSchema | undefined): SectionSchema | undefined {
  if (!schema || type !== "search") return schema
  return { ...schema, fields: (schema.fields ?? []).filter((f) => f.id !== "source"), blocks: [], accepts: undefined, statics: undefined }
}

/** Where a section somebody wrote themselves is filed in Add Section. */
export const CUSTOM_SECTION_CATEGORY = "yours"

/**
 * The sections this creator wrote. A `sections/<type>.storelib` saved in the
 * code editor that the theme does not ship is theirs, and it belongs in the
 * library beside the built-in ones — under its own heading, so it is
 * findable, and offered only when its schema declares a preset, which is the
 * same rule every other section answers to.
 *
 * A file that does not compile is left out rather than crashing the modal;
 * the code editor is where its errors belong.
 */
export function customSectionSchemas(sources: Record<string, string> | undefined): Record<string, SectionSchema> {
  const out: Record<string, SectionSchema> = {}
  for (const [path, source] of Object.entries(sources ?? {})) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (!m || path in DEFAULT_THEME_SOURCES) continue
    const r = schemaFromStorelib(source, path)
    /**
     * Filed under "Created" whatever the file says. A creator's first
     * section is usually a copy of one of the theme's, and that copy carries
     * `category: "hero"` — which would file the thing they just wrote in
     * among the thirty they did not, in the one place they are looking for
     * it. The declared category is the theme's way of organising its own
     * sections; whose section it is comes first.
     */
    /**
     * And the filename is the type. What a page stores is the name of the
     * file that draws it, so a copy of hero_centered.storelib saved as
     * drewwww.storelib is a section called drewwww — even though the line
     * `"type": "hero_centered"` came along with the copy. Taking the file at
     * its word there would give two different sections the same name.
     */
    if (r.ok === true) out[m[1]] = { ...r.schema, type: m[1], category: CUSTOM_SECTION_CATEGORY }
  }
  return out
}

/**
 * EVERY SECTION THIS INSTALL'S OWN FILES DEFINE, including the ones that
 * replace a section the theme ships.
 *
 * Not the same question as customSectionSchemas above, which asks "which of
 * these did the creator WRITE" and rightly says that editing the theme's FAQ
 * is not writing a section of your own. This asks "what is the truth about
 * this type here", and a file that shadows the theme's is the truth: a
 * creator who deleted a setting from their copy of the FAQ has a section
 * without it, and anything still describing the shipped one is describing a
 * section that does not exist on their site.
 */
export function schemasFromSources(sources: Record<string, string> | undefined): Record<string, SectionSchema> {
  const out: Record<string, SectionSchema> = {}
  for (const [path, source] of Object.entries(sources ?? {})) {
    const m = path.match(/^sections\/([a-z0-9_-]+)\.storelib$/)
    if (!m) continue
    const r = schemaFromStorelib(source, path)
    if (r.ok === true) out[m[1]] = { ...r.schema, type: m[1] }
  }
  return out
}

/** Their types, offered only when the file says how the section first appears. */
export function customAddableSections(custom: Record<string, SectionSchema>): string[] {
  return Object.keys(custom)
    .filter((t) => (custom[t].presets?.length ?? 0) > 0)
    /* A header or footer written as a section, saved before that was refused, is not offered for a page body. */
    .filter((t) => !chromeRoleOf({ schema: custom[t] as unknown as Record<string, unknown>, type: t }))
    /* Nor is one that declares it IS the header or footer: its place is that group, never the page. */
    .filter((t) => !custom[t].kind)
    .sort()
}


/* ══════════════════════════════════════════════════════════════════════════
 *  THEME BLOCKS, FOR THE SIDEBAR
 * ══════════════════════════════════════════════════════════════════════════
 * Every blocks/<type>.storelib the theme ships, and every one this install
 * saved (which wins for its type), as the editor's BlockSchema: its fields,
 * what it holds, its presets for Add block, and the blocks its template
 * places itself. A file that does not compile is left out; the code editor
 * is where its errors are shown.
 */
const blockCache = createLru<BlockSchema | null>(COMPILE_CACHE_LIMIT)

export function themeBlockSchema(source: string, path: string): BlockSchema | null {
  const type = blockTypeFromPath(path)
  if (!type) return null
  const key = `${type}\0${source}`
  const hit = blockCache.get(key)
  if (hit !== undefined) return hit
  if (isCompatSource(source)) {
    const out = compatBlockSchema(source, path, type)
    blockCache.set(key, out)
    return out
  }
  const r = compileBlock(source, { file: path, type, lenient: true })
  let out: BlockSchema | null = null
  if (r.ok === true) {
    const s = r.value.schema
    out = { type, name: s.name, fields: s.settings.map(field), theme: true }
    if (isPrivateBlock(type)) out.private = true
    if (s.accepts?.length) out.accepts = [...s.accepts]
    if (s.max_blocks !== undefined) out.max_blocks = s.max_blocks
    if (s.presets?.length) out.presets = editorPresets(type, s.presets)
    if (r.value.statics.length) out.statics = r.value.statics
  }
  blockCache.set(key, out)
  return out
}

/** An imported theme's block: its panel schema, read and checked without compiling its markup. */
function compatBlockSchema(source: string, path: string, type: string): BlockSchema | null {
  const parsed = parseStorelib(source, path)
  if (parsed.ok === false) return null
  const json = parseSchemaJson(parsed.value.schema, path)
  if (json.ok === false) return null
  const { shopify: _theirs, ...panel } = json.value as Record<string, unknown>
  void _theirs
  const valid = validateBlockSchema(panel, { file: path, type })
  if (valid.ok === false) return null
  const s = valid.value
  const out: BlockSchema = { type, name: s.name, fields: s.settings.map(field), theme: true }
  if (isPrivateBlock(type)) out.private = true
  if (s.accepts?.length) out.accepts = [...s.accepts]
  if (s.max_blocks !== undefined) out.max_blocks = s.max_blocks
  if (s.presets?.length) out.presets = editorPresets(type, s.presets)
  const statics = compatStatics(splitCompatFile(source).markup)
  if (statics.length) out.statics = statics
  return out
}

/** The theme's blocks, then this install's own files over them. */
export function themeBlockCatalog(sources?: Record<string, string>, opts: { builtIn?: boolean } = {}): Record<string, BlockSchema> {
  const out: Record<string, BlockSchema> = {}
  /* An imported Shopify theme has its own blocks and draws no others: `builtIn: false`. */
  for (const all of [opts.builtIn === false ? {} : (DEFAULT_THEME_SOURCES as Record<string, string>), sources ?? {}]) {
    for (const [path, source] of Object.entries(all)) {
      if (!blockTypeFromPath(path) || typeof source !== "string") continue
      const b = themeBlockSchema(source, path)
      if (b) out[b.type] = b
    }
  }
  return out
}

/** The schema of a block in this section: one the section declares, else the theme's. */
export function blockSchemaIn(section: SectionSchema | undefined, catalog: Record<string, BlockSchema>, type: string): BlockSchema | undefined {
  return section?.blocks?.find((b) => b.type === type) ?? (section?.accepts?.length || !section?.blocks?.length ? catalog[type] : undefined)
}

/**
 * What may be added under an owner: a section's own block types, or the
 * theme blocks its `accepts` lets in. "@theme" is every public theme block;
 * a private one (`_slide`) only where it is named.
 */
export function addableBlocks(owner: { blocks?: BlockSchema[]; accepts?: string[] } | undefined, catalog: Record<string, BlockSchema>): BlockSchema[] {
  if (!owner) return []
  if (owner.blocks?.length) return owner.blocks
  const accepts = owner.accepts ?? []
  if (!accepts.length) return []
  return Object.values(catalog)
    .filter((b) => acceptsType(accepts, b.type))
    .sort((a, b) => a.name.localeCompare(b.name))
}
