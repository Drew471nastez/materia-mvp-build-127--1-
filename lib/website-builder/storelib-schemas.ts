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
import { parseStorelib, parseSchemaJson } from "@/lib/storelib-theme/storelib/parse"
import { validateSectionSchema } from "@/lib/storelib-theme/schema/validate"
import type { SectionSchema as EngineSchema, SettingDefinition } from "@/lib/storelib-theme/types"
import { DEFAULT_THEME_SOURCES } from "../../themes/default/sources.generated"
import type { BlockSchema, SchemaField, SchemaFieldType, SectionPreset, SectionSchema } from "./types"

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
    out.blocks = schema.blocks.map((b): BlockSchema => ({ type: b.type, name: b.name, fields: b.settings.map(field) }))
  }
  if (schema.max_blocks !== undefined) out.max_blocks = schema.max_blocks
  if (schema.presets) {
    out.presets = schema.presets.map((p): SectionPreset => {
      const preset: SectionPreset = { name: p.name, settings: p.settings ?? {} }
      if (p.blocks) {
        preset.blocks = p.blocks.map((b, i) => ({ id: `${schema.type}-${slug(p.name)}-${i}`, type: b.type, settings: b.settings ?? {} }))
      }
      return preset
    })
  }
  return out
}

export type StorelibSchemaResult = { ok: true; schema: SectionSchema } | { ok: false; errors: string[] }

const cache = new Map<string, StorelibSchemaResult>()

/** The `<schema>` of a `.storelib` source, as the editor's schema. Cached per source text. */
export function schemaFromStorelib(source: string, file: string): StorelibSchemaResult {
  const hit = cache.get(source)
  if (hit) return hit
  const describe = (errors: { line?: number; message: string }[]) => errors.map((e) => `${file}${e.line ? `:${e.line}` : ""} ${e.message}`)
  let result: StorelibSchemaResult
  const parsed = parseStorelib(source, file)
  if (parsed.ok === false) result = { ok: false, errors: describe(parsed.errors) }
  else {
    const json = parseSchemaJson(parsed.value.schema, file)
    if (json.ok === false) result = { ok: false, errors: describe(json.errors) }
    else {
      const valid = validateSectionSchema(json.value, { file, line: parsed.value.schema.line, text: parsed.value.schema.text })
      result = valid.ok === false ? { ok: false, errors: describe(valid.errors) } : { ok: true, schema: editorSchema(valid.value) }
    }
  }
  cache.set(source, result)
  return result
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
export const STORELIB_SCHEMAS: Record<string, SectionSchema> = Object.fromEntries(
  STORELIB_SECTION_TYPES.map((type) => {
    const path = `sections/${type}.storelib`
    const r = schemaFromStorelib(DEFAULT_THEME_SOURCES[path], path)
    if (r.ok === true) return [type, r.schema]
    if (typeof console !== "undefined") console.error(`${path} did not validate:\n  ${r.errors.join("\n  ")}`)
    return [type, { type, name: type, fields: [] }]
  }),
)
