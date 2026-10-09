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

import { CONTROL_TYPES, UNSUPPORTED_TYPES, controlFor, holdsValue, resolveControlType } from "../controls/registry"
import { VIDEO_HOSTS } from "../values"
import { FILE_KINDS, acceptEntryProblem } from "../file-kinds"
import { parseCondition } from "../storelib/template"
import { readLanguageVersion } from "../language"
import { LIMITS, MAX_BLOCK_DEPTH, SECTION_SCHEMA_VERSION, type Result, type SectionSchema, type ThemeBlockSchema, type ThemeError } from "../types"
import { ANIMATION_SETTING_ID, SECTION_ANIMATIONS, SECTION_GROUPS, SECTION_KINDS, normaliseSettings, numberedLinkPairs, type NormaliseNote } from "./normalise"

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
    visible_if: z.string().max(300).optional(),
  })
  .passthrough()

/**
 * An entry in `blocks`: a block the section declares for itself (it has a
 * name), or a theme block it accepts (it has only a type: `"@theme"`, or the
 * name of a file in blocks/). Shopify writes both in the same list, so this
 * reads both, and the validator separates them.
 */
const block = z
  .object({
    type: z.string(),
    name: z.string().optional(),
    settings: z.array(setting).optional(),
    limit: z.number().int().positive().optional(),
  })
  .passthrough()

type PresetBlockShape = {
  type: string
  settings?: Record<string, unknown>
  static?: boolean
  id?: string
  blocks?: PresetBlockShape[] | Record<string, PresetBlockShape>
  block_order?: string[]
}

const presetBlock: z.ZodType<PresetBlockShape> = z.lazy(() =>
  z
    .object({
      type: z.string(),
      settings: z.record(z.unknown()).optional(),
      static: z.boolean().optional(),
      id: z.string().optional(),
      blocks: z.union([z.array(presetBlock), z.record(presetBlock)]).optional(),
      block_order: z.array(z.string()).optional(),
    })
    .passthrough(),
) as z.ZodType<PresetBlockShape>

const preset = z
  .object({
    name: z.string(),
    category: z.string().optional(),
    settings: z.record(z.unknown()).optional(),
    blocks: z.union([z.array(presetBlock), z.record(presetBlock)]).optional(),
    block_order: z.array(z.string()).optional(),
  })
  .passthrough()

/** `enabled_on` / `disabled_on`: which section groups, and which page templates. */
const placement = z
  .object({
    groups: z.array(z.string()).optional(),
    templates: z.array(z.string()).optional(),
  })
  .passthrough()

/** The `<schema>` of a theme block file, blocks/<type>.storelib. */
export const themeBlockSchemaShape = z
  .object({
    schema_version: z.number().int().optional(),
    language_version: z.number().int().optional(),
    name: z.string().min(1).max(80),
    description: z.string().optional(),
    settings: z.array(setting).default([]),
    blocks: z.array(block).optional(),
    max_blocks: z.number().int().positive().optional(),
    presets: z.array(preset).optional(),
    tag: z.string().nullable().optional(),
    class: z.string().max(200).optional(),
    capabilities: z.array(z.string()).optional(),
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
    enabled_on: placement.optional(),
    disabled_on: placement.optional(),
    kind: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
    migrations: z.array(z.object({ from: z.string(), to: z.string(), since: z.string() }).passthrough()).optional(),
  })
  .passthrough()

/**
 * A zod complaint in words a person can act on. zod says "Required" and
 * "Expected string, received number"; the path says which key, and this
 * says what is wrong with it.
 */
type ZodIssueLike = { code: string; message: string; path: (string | number)[]; expected?: unknown; received?: unknown; minimum?: unknown; maximum?: unknown; type?: unknown }
export function plainIssue(issue: ZodIssueLike): string {
  const last = issue.path[issue.path.length - 1]
  const name = last === undefined ? "the schema" : typeof last === "number" ? "this entry" : `"${last}"`
  if (issue.code === "invalid_type") {
    if (issue.received === "undefined") return `${name} is missing`
    const article = (w: unknown) => (/^[aeiou]/.test(String(w)) ? `an ${String(w)}` : `a ${String(w)}`)
    return `${name} should be ${article(issue.expected)}, not ${article(issue.received)}`
  }
  if (issue.code === "too_small" && issue.type === "string") return `${name} is empty`
  if (issue.code === "too_big" && issue.type === "string") return `${name} is longer than ${String(issue.maximum)} characters`
  if (issue.code === "too_small" && issue.type === "number") return `${name} is below ${String(issue.minimum)}`
  return issue.message
}

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
  const warnings: ThemeError[] = []
  const err = (path: string, message: string) =>
    errors.push({ stage: "schema", file: opts.file, path, line: lineOf(path, opts), message })
  const warn = (path: string, message: string) =>
    warnings.push({ stage: "schema", file: opts.file, path, line: lineOf(path, opts), message })

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    err("(root)", `The schema is one JSON object: { "name": "...", "settings": [...] }`)
    return { ok: false, errors }
  }
  const parsed = sectionSchemaShape.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("").replace(/^\./, "")
      err(path || "(root)", plainIssue(issue as unknown as ZodIssueLike))
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

  /**
   * A `visible_if` may read the section's settings, and a block's may also
   * read its own block's. Anything else is a condition about nothing, which
   * would hide its setting for good, so it is refused where it is written.
   */
  const sectionValueIds = new Set(s.settings.filter((f) => holdsValue(f.type)).map((f) => f.id))
  const { checkSettings } = settingChecks(err, sectionValueIds)
  checkSettings(s.settings, "settings")

  /* Its own blocks, or the theme blocks it accepts: never both. */
  const local = (s.blocks ?? []).filter((b) => b.name !== undefined || b.settings !== undefined)
  const refs = (s.blocks ?? []).filter((b) => b.name === undefined && b.settings === undefined)
  const blockTypes = new Set<string>()
  local.forEach((b) => {
    const i = (s.blocks ?? []).indexOf(b)
    const p = `blocks[${i}]`
    if (!TYPE.test(b.type)) err(`${p}.type`, `"${b.type}" is not a block type`)
    if (b.name === undefined) err(`${p}.name`, `a block this section declares for itself needs a name. To accept a theme block, write only its type: { "type": "${b.type}" }`)
    if (blockTypes.has(b.type)) err(`${p}.type`, `block type "${b.type}" is declared twice`)
    blockTypes.add(b.type)
    const list = b.settings ?? []
    checkSettings(list, `${p}.settings`, new Set<string>(), new Set(list.filter((f) => holdsValue(f.type)).map((f) => f.id)))
  })
  const accepts = checkAccepts(refs as { type: string }[], (s.blocks ?? []) as { type: string }[], err)
  if (local.length && refs.length) {
    err("blocks", `this section declares its own blocks and accepts theme blocks. A section does one or the other: move the block into blocks/${local[0].type}.storelib, or drop { "type": "${refs[0].type}" }`)
  }
  if (s.max_blocks !== undefined && s.max_blocks > LIMITS.blocksPerSection) {
    err("max_blocks", `${s.max_blocks} is above the limit of ${LIMITS.blocksPerSection}`)
  }

  const settingIds = new Set(s.settings.filter((f) => holdsValue(f.type)).map((f) => f.id))
  s.presets?.forEach((pr, i) => {
    const p = `presets[${i}]`
    for (const key of Object.keys(pr.settings ?? {})) {
      if (!settingIds.has(key)) err(`${p}.settings.${key}`, `preset sets "${key}", which is not a setting of this section`)
    }
    checkPresetBlocks(pr, p, err, {
      local: local.length ? blockTypes : null,
      accepts,
    })
  })

  for (const list of ["allowed_templates", "disabled_templates"] as const) {
    if (s.allowed_templates && s.disabled_templates) {
      err(list, `use allowed_templates or disabled_templates, not both`)
      break
    }
  }

  checkPlacement(s as unknown as Record<string, unknown>, err)
  checkAnimation(s.settings as Parameters<typeof checkAnimation>[0], "settings", warn)
  ;(s.blocks ?? []).forEach((b, i) => { if (b.settings) checkAnimation(b.settings as Parameters<typeof checkAnimation>[0], `blocks[${i}].settings`, warn) })
  checkHabits(s.settings as Parameters<typeof checkHabits>[0], "settings", warn)

  if (errors.length) return { ok: false, errors }
  const value = { ...s, schema_version: s.schema_version ?? SECTION_SCHEMA_VERSION } as SectionSchema
  if (refs.length) {
    delete value.blocks
    value.accepts = accepts
  } else if (s.blocks) {
    value.blocks = local.map((b) => ({ ...b, name: b.name ?? b.type, settings: b.settings ?? [] })) as SectionSchema["blocks"]
  }
  /* Pictures declared as text are read as pictures (./normalise.ts): the panel draws a picker, the stored value is kept. */
  const notes: NormaliseNote[] = []
  value.settings = normaliseSettings(value.settings, "settings", notes)
  if (value.blocks) {
    value.blocks = value.blocks.map((b, i) => {
      const settings = normaliseSettings(b.settings, `blocks[${(s.blocks ?? []).indexOf(local[i])}].settings`, notes)
      return settings === b.settings ? b : { ...b, settings }
    })
  }
  for (const n of notes) warn(n.path, n.message)
  return warnings.length ? { ok: true, value, warnings } : { ok: true, value }
}

/**
 * ===========================================================================
 *  WHERE A SECTION MAY GO, AND WHETHER IT IS THE HEADER
 * ===========================================================================
 * `enabled_on` and `disabled_on` are Shopify's: `{ "groups": ["header"] }`
 * for an announcement bar. `kind` says the section IS the site's header or
 * footer. Their spelling is checked where it is written, because a group
 * name with a typo is a section that never appears anywhere.
 */
function checkPlacement(s: Record<string, unknown>, err: (path: string, message: string) => void): void {
  if (s.enabled_on !== undefined && s.disabled_on !== undefined) {
    err("enabled_on", `use enabled_on or disabled_on, not both`)
  }
  for (const key of ["enabled_on", "disabled_on"] as const) {
    const v = s[key] as { groups?: unknown[] } | undefined
    if (!v) continue
    ;(v.groups ?? []).forEach((g, i) => {
      if (g === "*" || (SECTION_GROUPS as readonly unknown[]).includes(g)) return
      err(`${key}.groups[${i}]`, `"${String(g)}" is not a section group. The groups are ${SECTION_GROUPS.map((x) => `"${x}"`).join(", ")}, or "*" for all three`)
    })
  }
  if (s.kind === undefined) return
  if (!(SECTION_KINDS as readonly unknown[]).includes(s.kind)) {
    err("kind", `kind is "header" or "footer", for a section that replaces the site's own header or footer. Leave it out for any other section`)
    return
  }
  const kind = String(s.kind)
  const on = (s.enabled_on as { groups?: unknown[] } | undefined)?.groups
  if (Array.isArray(on) && !on.includes(kind) && !on.includes("*")) {
    err("enabled_on.groups", `a section of kind "${kind}" sits in the ${kind} group. Add "${kind}" to enabled_on.groups, or leave enabled_on out`)
  }
  const off = (s.disabled_on as { groups?: unknown[] } | undefined)?.groups
  if (Array.isArray(off) && (off.includes(kind) || off.includes("*"))) {
    err("disabled_on.groups", `a section of kind "${kind}" cannot be disabled in the ${kind} group`)
  }
}

/**
 * A setting called `animation` is the section's own entrance animation, read
 * by the runtime, and it overrides Theme settings › Animations. A value the
 * runtime does not know plays as "theme", so it is said here.
 */
function checkAnimation(list: { id: string; type: string; options?: { value: string }[] }[], at: string, warn: (path: string, message: string) => void): void {
  const i = list.findIndex((f) => f.id === ANIMATION_SETTING_ID)
  if (i < 0) return
  const f = list[i]
  const known = SECTION_ANIMATIONS as readonly string[]
  const t = resolveControlType(f.type)
  if (t !== "select" && t !== "radio") {
    warn(`${at}[${i}].type`, `"animation" is the section's own entrance animation: a select with the values ${known.map((v) => `"${v}"`).join(", ")}. As a ${f.type} it is not played`)
    return
  }
  const odd = (f.options ?? []).map((o) => o.value).filter((v) => !known.includes(v))
  if (odd.length) warn(`${at}[${i}].options`, `the section animation knows ${known.map((v) => `"${v}"`).join(", ")}. ${odd.map((v) => `"${v}"`).join(", ")} plays as "theme"`)
}

/**
 * Things that compile and draw, and still leave the creator worse off. Said
 * as warnings, never refused: each has a reason it might be meant.
 */
function checkHabits(list: { id: string; type: string; default?: unknown; min?: number }[], at: string, warn: (path: string, message: string) => void): void {
  const pairs = numberedLinkPairs(list)
  if (pairs >= 2) {
    warn(at, `This section types out ${pairs} links as numbered label and address settings. A menu is one setting: { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" }, which lets the creator pick one of the site's menus (Website settings, Navigation); loop {% for link in settings.menu.links %}`)
  }
  list.forEach((f, i) => {
    if (resolveControlType(f.type) === "range" && f.default === undefined && typeof f.min === "number" && f.min > 0) {
      warn(`${at}[${i}].default`, `"${f.id}" has no default, so it starts at its lowest value, ${f.min}. Give it the value it should have`)
    }
  })
}

const BLOCK_REF = /^_?[a-z][a-z0-9_-]*$/
const BLOCK_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The theme blocks a `blocks` list accepts: "@theme", or types by name. */
function checkAccepts(refs: { type: string }[], all: { type: string }[], err: (path: string, message: string) => void): string[] {
  const out: string[] = []
  for (const r of refs) {
    const p = `blocks[${all.indexOf(r)}].type`
    if (r.type === "@app") { err(p, `Storelib has no app blocks. Accept theme blocks with { "type": "@theme" }`); continue }
    if (r.type !== "@theme" && !BLOCK_REF.test(r.type)) { err(p, `"${r.type}" is not a theme block: "@theme", or the name of a file in blocks/`); continue }
    if (out.includes(r.type)) { err(p, `"${r.type}" is listed twice`); continue }
    out.push(r.type)
  }
  return out
}

/** May a block of this type sit where `accepts` says what may? A private block (`_slide`) only by name. */
export function acceptsType(accepts: readonly string[], type: string): boolean {
  if (accepts.includes(type)) return true
  return accepts.includes("@theme") && !type.startsWith("_")
}

/**
 * ===========================================================================
 *  A PRESET'S BLOCKS, AS A TREE
 * ===========================================================================
 * Either spelling (the keyed one Shopify writes, or a list) is walked the
 * same way. What is refused is what would add a block nobody could see or
 * find again: an id in `block_order` with no block behind it, a block that
 * is in neither `block_order` nor static, a static block without an id, a
 * block of a type the owner does not accept, and a tree deeper than blocks
 * may nest.
 */
function checkPresetBlocks(
  owner: { blocks?: PresetBlockShape[] | Record<string, PresetBlockShape>; block_order?: string[] },
  at: string,
  err: (path: string, message: string) => void,
  rules: { local: Set<string> | null; accepts: string[] },
): void {
  let count = 0
  const walk = (node: typeof owner, p: string, depth: number, top: boolean) => {
    const blocks = node.blocks
    if (blocks === undefined) {
      if (node.block_order?.length) err(`${p}.block_order`, `block_order names blocks, but there is no "blocks" beside it`)
      return
    }
    if (depth > MAX_BLOCK_DEPTH) { err(`${p}.blocks`, `blocks nest ${MAX_BLOCK_DEPTH} deep at most`); return }
    const entries: [string, PresetBlockShape, string][] = Array.isArray(blocks)
      ? blocks.map((b, i) => [b.id ?? "", b, `${p}.blocks[${i}]`])
      : Object.entries(blocks).map(([id, b]) => [id, b, `${p}.blocks.${id}`])
    if (!Array.isArray(blocks)) {
      const order = node.block_order ?? []
      for (const id of order) {
        if (!blocks[id]) err(`${p}.block_order`, `block_order names "${id}", which is not in blocks`)
        else if (blocks[id].static) err(`${p}.block_order`, `"${id}" is static: the template places it, so it is not in block_order`)
      }
      for (const [id, b] of Object.entries(blocks)) {
        if (!b.static && !order.includes(id)) err(`${p}.blocks.${id}`, `"${id}" is in blocks but not in block_order, so it would never be drawn`)
      }
    } else if (node.block_order) {
      err(`${p}.block_order`, `block_order goes with blocks written as an object keyed by id; a list is already in order`)
    }
    const ids = new Set<string>()
    for (const [id, b, bp] of entries) {
      count++
      if (id) {
        if (!BLOCK_ID.test(id)) err(bp, `"${id}" is not a block id: letters, digits, - and _`)
        if (ids.has(id)) err(bp, `the id "${id}" is used twice here`)
        ids.add(id)
      }
      if (b.static && !id) err(bp, `a static block needs the id its template places it under: { "type": "${b.type}", "static": true, "id": "…" }`)
      if (top && rules.local) {
        if (!rules.local.has(b.type)) err(`${bp}.type`, `preset adds a "${b.type}" block, which this section does not declare`)
        if (b.blocks !== undefined) err(`${bp}.blocks`, `a block the section declares for itself holds no blocks. Blocks inside blocks are theme blocks, in blocks/`)
        if (b.static) err(`${bp}.static`, `a static block is a theme block, placed with {% content_for "block" %}`)
        continue
      }
      if (!BLOCK_REF.test(b.type)) { err(`${bp}.type`, `"${b.type}" is not a theme block`); continue }
      if (top && !b.static) {
        if (!rules.accepts.length) err(`${bp}.type`, `preset adds a "${b.type}" block, and this ${at.startsWith("presets") ? "section" : "block"} accepts none`)
        else if (!acceptsType(rules.accepts, b.type)) err(`${bp}.type`, `"${b.type}" is not one of the blocks accepted here: ${rules.accepts.join(", ")}`)
      }
      walk(b, bp, depth + 1, false)
    }
  }
  walk(owner, at, 1, true)
  if (count > LIMITS.blocksPerSection) err(`${at}.blocks`, `${count} blocks; a section holds ${LIMITS.blocksPerSection}`)
}

/*
  What a block may be wrapped in. A name from this list, never the file's
  own text, so nothing can be written into the tag. Round 25 added the
  elements a header, a drawer, a mega menu, a filter panel or an accordion is
  built from: a block can be the <nav> of a menu, a <details> of a filter
  group, a <dialog> of a drawer, a <form> of a search.
*/
const BLOCK_TAGS = new Set([
  "div", "section", "article", "aside", "figure", "li", "ul", "ol", "span", "blockquote", "p",
  "nav", "header", "footer", "main", "details", "dialog", "form", "fieldset", "label", "dl", "dt", "dd", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "button", "menu", "address", "small", "strong", "em", "picture",
])

/**
 * ===========================================================================
 *  IS THIS A THEME BLOCK
 * ===========================================================================
 * The `<schema>` of blocks/<type>.storelib. The same setting rules as a
 * section's, plus what only a block has: the blocks it may hold (theme
 * blocks only, by "@theme" or by name), its presets for the Add block menu,
 * and the element it is wrapped in.
 */
export function validateBlockSchema(input: unknown, opts: ValidateOptions & { type: string }): Result<ThemeBlockSchema> {
  const errors: ThemeError[] = []
  const err = (path: string, message: string) =>
    errors.push({ stage: "schema", file: opts.file, path, line: lineOf(path, opts), message })

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    err("(root)", `The schema is one JSON object: { "name": "...", "settings": [...] }`)
    return { ok: false, errors }
  }
  const parsed = themeBlockSchemaShape.safeParse(input)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const path = issue.path.map((p) => (typeof p === "number" ? `[${p}]` : `.${p}`)).join("").replace(/^\./, "")
      err(path || "(root)", plainIssue(issue as unknown as ZodIssueLike))
    }
    return { ok: false, errors }
  }
  const s = parsed.data
  const lang = readLanguageVersion(s.language_version)
  if (lang.ok === false) err("language_version", lang.message)
  if (s.schema_version !== undefined && s.schema_version > SECTION_SCHEMA_VERSION) {
    err("schema_version", `schema_version ${s.schema_version} is newer than this engine understands (${SECTION_SCHEMA_VERSION})`)
  }
  if (!BLOCK_REF.test(opts.type)) err("(root)", `"${opts.type}" is not a block file name: lowercase letters, digits, - and _, optionally after one _`)
  if (s.settings.length > LIMITS.settingsPerSchema) err("settings", `${s.settings.length} settings; the limit is ${LIMITS.settingsPerSchema}`)

  const own = new Set(s.settings.filter((f) => holdsValue(f.type)).map((f) => f.id))
  settingChecks(err, null).checkSettings(s.settings, "settings", new Set<string>(), own)

  const list = s.blocks ?? []
  list.forEach((b, i) => {
    if (b.name !== undefined || b.settings !== undefined) {
      err(`blocks[${i}]`, `a theme block holds theme blocks: write { "type": "@theme" } or the name of one, and give it a file in blocks/`)
    }
  })
  const accepts = checkAccepts(list.filter((b) => b.name === undefined && b.settings === undefined) as { type: string }[], list as { type: string }[], err)
  if (s.max_blocks !== undefined && s.max_blocks > LIMITS.blocksPerSection) err("max_blocks", `${s.max_blocks} is above the limit of ${LIMITS.blocksPerSection}`)

  s.presets?.forEach((pr, i) => {
    const p = `presets[${i}]`
    for (const key of Object.keys(pr.settings ?? {})) {
      if (!own.has(key)) err(`${p}.settings.${key}`, `preset sets "${key}", which is not a setting of this block`)
    }
    checkPresetBlocks(pr, `block ${p}`, err, { local: null, accepts })
  })

  if (s.tag !== undefined && s.tag !== null && !BLOCK_TAGS.has(s.tag)) {
    err("tag", `"${s.tag}" cannot wrap a block. Use one of ${[...BLOCK_TAGS].join(", ")}, or null to print {{ block.storelib_attributes }} yourself`)
  }
  if (s.class !== undefined && !/^[A-Za-z0-9_ -]*$/.test(s.class)) err("class", `class is class names: letters, digits, - and _, separated by spaces`)
  for (const c of s.capabilities ?? []) {
    if (c !== "embed") err("capabilities", `a block may declare "embed" for a player. "${c}" belongs to a section, whose script can use it`)
  }

  if (errors.length) return { ok: false, errors }
  const value = { ...s, type: opts.type, schema_version: s.schema_version ?? SECTION_SCHEMA_VERSION } as ThemeBlockSchema
  delete (value as { blocks?: unknown }).blocks
  if (accepts.length) value.accepts = accepts
  const notes: NormaliseNote[] = []
  value.settings = normaliseSettings(value.settings, "settings", notes)
  if (notes.length) {
    return { ok: true, value, warnings: notes.map((n) => ({ stage: "schema" as const, file: opts.file, path: n.path, line: lineOf(n.path, opts), message: n.message.replace(/settings\./g, "block.settings.") })) }
  }
  return { ok: true, value }
}

/**
 * ===========================================================================
 *  THE SETTINGS OF A SECTION OR A BLOCK, AGAINST THE REGISTRY
 * ===========================================================================
 * One set of rules for every list of settings, wherever it is declared: a
 * section's, a block it declares, a theme block file's. `sectionIds` is null
 * for a theme block, which can sit in any section and so cannot make a
 * setting depend on a section's.
 */
function settingChecks(err: (path: string, message: string) => void, sectionValueIds: Set<string> | null) {
  type Setting = z.infer<typeof setting>
  const checkCondition = (f: Setting, p: string, blockIds: Set<string> | null) => {
    if (f.visible_if === undefined) return
    const parsed = parseCondition(f.visible_if)
    if (parsed.ok === false) {
      err(`${p}.visible_if`, `visible_if does not read: ${parsed.message}`)
      return
    }
    for (const segs of parsed.paths) {
      const [root, group, id] = segs
      const owner = root === "section" ? sectionValueIds : root === "block" ? blockIds : null
      if (group !== "settings" || !owner || !id) {
        const may = [sectionValueIds ? "section.settings.<id>" : "", blockIds ? "block.settings.<id>" : ""].filter(Boolean).join(" or ")
        err(`${p}.visible_if`, `visible_if reads "${segs.join(".")}"; it may read ${may}`)
      } else if (!owner.has(id)) {
        err(`${p}.visible_if`, `visible_if reads ${root}.settings.${id}, which is not a setting of this ${root}`)
      } else if (id === f.id) {
        err(`${p}.visible_if`, `a setting cannot be shown or hidden by its own value`)
      }
    }
  }

  const checkSettings = (list: Setting[], at: string, seen = new Set<string>(), blockIds: Set<string> | null = null) => {
    list.forEach((f, i) => {
      const p = `${at}[${i}]`
      const control = controlFor(f.type)
      if (!control) {
        const why = UNSUPPORTED_TYPES[f.type]
        err(`${p}.type`, why ? `"${f.type}" is a Shopify type Storelib does not have. ${why}` : `"${f.type}" is not a Storelib control. Use one of: ${CONTROL_TYPES.join(", ")}`)
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
      /* The keys the newer controls read, checked where they are declared
         rather than discovered as a blank control in the panel. */
      if ((canonical === "product_list" || canonical === "collection_list") && f.limit !== undefined) {
        const n = f.limit as unknown
        if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 24) err(`${p}.limit`, `a ${canonical}'s limit is a whole number from 1 to 24`)
      }
      if (canonical === "video_url" && f.accept !== undefined) {
        const hosts = f.accept as unknown
        if (!Array.isArray(hosts) || hosts.length === 0 || !hosts.every((h) => (VIDEO_HOSTS as readonly unknown[]).includes(h))) {
          err(`${p}.accept`, `accept lists the hosts to allow: ${VIDEO_HOSTS.map((h) => `"${h}"`).join(", ")}`)
        }
      }
      /* A file setting may say what it takes: kinds ("pdf", "document") or extensions (".zip"). */
      if (canonical === "file_picker" && f.accept !== undefined) {
        const list = f.accept as unknown
        if (!Array.isArray(list) || list.length === 0) err(`${p}.accept`, `accept lists what the file may be: kinds (${Object.keys(FILE_KINDS).join(", ")}) or extensions like ".pdf"`)
        else for (const entry of list) {
          const problem = acceptEntryProblem(entry)
          if (problem) err(`${p}.accept`, problem)
        }
      }
      if (canonical === "focal_point" && f.image !== undefined) {
        const target = list.find((o) => o.id === f.image)
        if (!target || resolveControlType(target.type) !== "image_picker") err(`${p}.image`, `"${String(f.image)}" is not an image_picker setting beside this one`)
      }

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
      checkCondition(f, p, blockIds)
    })
  }
  return { checkSettings }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}
