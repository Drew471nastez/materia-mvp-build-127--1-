/**
 * ===========================================================================
 *  IS THIS SCHEMA A SCHEMA
 * ===========================================================================
 * The `<schema>` block, checked against the control registry. Every error
 * carries a dotted path (`settings[3].type`) and, when the schema came from a
 * `.storelib` file, the line it is on — because "invalid schema" with no
 * location is a message that sends somebody scrolling.
 *
 * Unknown keys are KEPT. A theme written for a later engine may carry a
 * property this one has never heard of, and the right thing to do with it is
 * nothing: pass it through, write it back unchanged. That is what
 * `passthrough()` on every object below is for, and why this file never
 * builds a new object from an allowlist of fields.
 */
import { z } from "zod"

import { CONTROL_TYPES, controlFor, holdsValue, resolveControlType } from "../controls/registry"
import { readLanguageVersion } from "../language"
import { LIMITS, SECTION_SCHEMA_VERSION, type Result, type SectionSchema, type ThemeError } from "../types"

const ID = /^[a-z][a-z0-9_]*$/
const TYPE = /^[a-z][a-z0-9_-]*$/

const option = z.object({ label: z.string(), value: z.string() }).passthrough()

const setting = z
  .object({
    type: z.string(),
    id: z.string(),
    label: z.string().optional(),
    default: z.unknown().optional(),
    info: z.string().optional(),
    placeholder: z.string().optional(),
    options: z.array(option).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().max(8).optional(),
    responsive: z.boolean().optional(),
    content: z.string().optional(),
  })
  .passthrough()

const block = z
  .object({
    type: z.string(),
    name: z.string(),
    settings: z.array(setting).default([]),
    limit: z.number().int().positive().optional(),
  })
  .passthrough()

const preset = z
  .object({
    name: z.string(),
    settings: z.record(z.unknown()).optional(),
    blocks: z.array(z.object({ type: z.string(), settings: z.record(z.unknown()).optional() }).passthrough()).optional(),
  })
  .passthrough()

export const sectionSchemaShape = z
  .object({
    schema_version: z.number().int().optional(),
    language_version: z.number().int().optional(),
    type: z.string(),
    name: z.string().min(1).max(80),
    category: z.string().optional(),
    version: z.string().optional(),
    description: z.string().optional(),
    icon: z.string().optional(),
    settings: z.array(setting).default([]),
    blocks: z.array(block).optional(),
    max_blocks: z.number().int().positive().optional(),
    presets: z.array(preset).optional(),
    allowed_templates: z.array(z.string()).optional(),
    disabled_templates: z.array(z.string()).optional(),
    capabilities: z.array(z.string()).optional(),
    migrations: z.array(z.object({ from: z.string(), to: z.string(), since: z.string() }).passthrough()).optional(),
  })
  .passthrough()

export interface ValidateOptions {
  file?: string
  /** The line the schema block starts on, so paths can be turned into lines. */
  line?: number
  /** The raw JSON text, for locating a path's line. */
  text?: string
}

/**
 * Where a dotted path lands in the JSON text, as a file line. Best effort:
 * finds the Nth `"id"` occurrence for `settings[N]` and so on. Good enough to
 * put the cursor on the right setting, which is what matters.
 */
function lineOf(path: string, opts: ValidateOptions): number | undefined {
  if (!opts.text || !opts.line) return opts.line
  const m = path.match(/^(settings|blocks|presets)\[(\d+)\](?:\.settings\[(\d+)\])?/)
  if (!m) return opts.line
  const key = `"${m[1]}"`
  const start = opts.text.indexOf(key)
  if (start < 0) return opts.line
  // Count opening braces of array items from the key onwards.
  let depth = 0, item = -1, pos = start, sub = -1
  const wantItem = Number(m[2])
  const wantSub = m[3] !== undefined ? Number(m[3]) : -1
  for (; pos < opts.text.length; pos++) {
    const ch = opts.text[pos]
    if (ch === "[") depth++
    else if (ch === "]") { depth--; if (depth === 0) break }
    else if (ch === "{") {
      if (depth === 1) { item++; if (item === wantItem && wantSub < 0) break }
      if (depth === 2 && item === wantItem) { sub++; if (sub === wantSub) break }
    }
  }
  const before = opts.text.slice(0, pos)
  return opts.line + (before.match(/\n/g)?.length ?? 0)
}

export function validateSectionSchema(input: unknown, opts: ValidateOptions = {}): Result<SectionSchema> {
  const errors: ThemeError[] = []
  const err = (path: string, message: string) =>
    errors.push({ stage: "schema", file: opts.file, path, line: lineOf(path, opts), message })

  const parsed = sectionSchemaShape.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("").replace(/^\./, "")
      err(path || "(root)", issue.message)
    }
    return { ok: false, errors }
  }
  const s = parsed.data

  /**
   * Which language the file is written in, as distinct from which shape its
   * schema is. A file that names a version this engine does not have is
   * refused rather than guessed at: better "this theme is newer than this
   * Storelib" than a section that renders almost right.
   */
  {
    const lang = readLanguageVersion((s as { language_version?: number }).language_version)
    if (lang.ok === false) err("language_version", lang.message)
  }

  if (s.schema_version !== undefined && s.schema_version > SECTION_SCHEMA_VERSION) {
    err("schema_version", `schema_version ${s.schema_version} is newer than this engine understands (${SECTION_SCHEMA_VERSION})`)
  }
  if (!TYPE.test(s.type)) err("type", `"${s.type}" is not a section type: lowercase letters, digits, - and _`)
  if (s.settings.length > LIMITS.settingsPerSchema) err("settings", `${s.settings.length} settings; the limit is ${LIMITS.settingsPerSchema}`)

  const checkSettings = (list: typeof s.settings, at: string, seen = new Set<string>()) => {
    list.forEach((f, i) => {
      const p = `${at}[${i}]`
      const control = controlFor(f.type)
      if (!control) {
        err(`${p}.type`, `"${f.type}" is not a Storelib control. Use one of: ${CONTROL_TYPES.join(", ")}`)
        return
      }
      if (!ID.test(f.id)) err(`${p}.id`, `"${f.id}" is not a setting id: lowercase letters, digits and _`)
      if (seen.has(f.id)) err(`${p}.id`, `"${f.id}" is used twice; setting ids are unique within a section`)
      seen.add(f.id)

      const canonical = resolveControlType(f.type)!
      if ((canonical === "select" || canonical === "radio") && !(f.options && f.options.length)) {
        err(`${p}.options`, `a ${canonical} needs options`)
      }
      if (f.responsive && !control.responsive) err(`${p}.responsive`, `a ${canonical} cannot be responsive`)
      if (canonical === "range" && (f.min === undefined || f.max === undefined)) err(p, `a range needs min and max`)
      if (f.min !== undefined && f.max !== undefined && f.min >= f.max) err(p, `min ${f.min} is not below max ${f.max}`)

      if (f.default !== undefined && holdsValue(f.type)) {
        // A responsive default may be per breakpoint.
        const candidates = f.responsive && isPlainObject(f.default) ? Object.values(f.default as object) : [f.default]
        for (const v of candidates) {
          const r = control.schema.safeParse(v)
          if (!r.success) err(`${p}.default`, `default ${JSON.stringify(v)} is not a ${canonical}: ${r.error.issues[0]?.message ?? "wrong type"}`)
        }
        if ((canonical === "select" || canonical === "radio") && f.options && !f.options.some((o) => o.value === f.default)) {
          err(`${p}.default`, `default "${String(f.default)}" is not one of the options`)
        }
      }
      if (!holdsValue(f.type) && f.default !== undefined) err(`${p}.default`, `a ${canonical} holds no value and takes no default`)
    })
  }
  checkSettings(s.settings, "settings")

  const blockTypes = new Set<string>()
  s.blocks?.forEach((b, i) => {
    const p = `blocks[${i}]`
    if (!TYPE.test(b.type)) err(`${p}.type`, `"${b.type}" is not a block type`)
    if (blockTypes.has(b.type)) err(`${p}.type`, `block type "${b.type}" is declared twice`)
    blockTypes.add(b.type)
    checkSettings(b.settings, `${p}.settings`)
  })
  if (s.max_blocks !== undefined && s.max_blocks > LIMITS.blocksPerSection) {
    err("max_blocks", `${s.max_blocks} is above the limit of ${LIMITS.blocksPerSection}`)
  }

  const settingIds = new Set(s.settings.filter((f) => holdsValue(f.type)).map((f) => f.id))
  s.presets?.forEach((pr, i) => {
    const p = `presets[${i}]`
    for (const key of Object.keys(pr.settings ?? {})) {
      if (!settingIds.has(key)) err(`${p}.settings.${key}`, `preset sets "${key}", which is not a setting of this section`)
    }
    pr.blocks?.forEach((pb, j) => {
      if (!blockTypes.has(pb.type)) err(`${p}.blocks[${j}].type`, `preset adds a "${pb.type}" block, which this section does not declare`)
    })
  })

  for (const list of ["allowed_templates", "disabled_templates"] as const) {
    if (s.allowed_templates && s.disabled_templates) {
      err(list, `use allowed_templates or disabled_templates, not both`)
      break
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true, value: { ...s, schema_version: s.schema_version ?? SECTION_SCHEMA_VERSION } as SectionSchema }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
