/**
 * ===========================================================================
 *  A SCHEMA KEY STORELIB DOES NOT READ IS A SETTING THAT DOES NOTHING
 * ===========================================================================
 * The schema validator keeps keys it has never heard of, on purpose: a theme
 * written for a later engine passes through this one unchanged
 * (lib/storelib-theme/schema/validate.ts). That is right for a theme a
 * person imports and wrong for a file a model just wrote, because a model
 * invents keys with confidence: "responsive_size" on a text setting,
 * "placeholder" on an image_picker, "required": true, a section-level
 * "animations" object. Each compiles, each is kept, and each does nothing,
 * so the sidebar lies about what the section can do.
 *
 * So a file an AGENT writes is held to the registry
 * (lib/storelib-theme/controls/registry.ts, `accepts`): every key of every
 * setting, block, preset and the section itself is one Storelib reads, and
 * every capability is one the script sandbox has. Each finding names the key,
 * where it is, and the fix, one line each, so the model's next attempt is the
 * right one. Called from checkSectionIntegration (strict saves only); a
 * person in the code editor is not held to it.
 *
 * PURE: source text in, findings out.
 */

import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { controlFor, resolveControlType } from "@/lib/storelib-theme/controls/registry"
import { CAPABILITIES } from "@/lib/storelib-theme/storelib/script"
import { ANIMATION_SETTING_ID, SECTION_ANIMATIONS } from "@/lib/storelib-theme/schema/normalise"
import type { QualityFinding } from "./quality"

/** What a section's schema may hold at its top level. `shopify` is an imported theme's own schema, kept beside the builder's. */
export const SECTION_KEYS = [
  "schema_version",
  "language_version",
  "type",
  "name",
  "category",
  "version",
  "description",
  "icon",
  "settings",
  "blocks",
  "max_blocks",
  "presets",
  "allowed_templates",
  "disabled_templates",
  "enabled_on",
  "disabled_on",
  "kind",
  "capabilities",
  "migrations",
  "tag",
  "class",
  "supports_typography_overrides",
  "shopify",
] as const

/** Every setting reads these, whatever its type. */
const SETTING_BASE = ["type", "id", "label", "default", "info", "visible_if"]
/**
 * A block the section declares, and a theme block it accepts (`{ "type": "@theme" }`, only a type).
 * `min_blocks` (round P): how many of the type a placed section needs, read by the agent's checks
 * (lib/ai-builder/agent/content-check.ts blockRules).
 */
const BLOCK_KEYS = ["type", "name", "settings", "limit", "min_blocks"]
const PRESET_KEYS = ["name", "category", "settings", "blocks", "block_order"]
const PRESET_BLOCK_KEYS = ["type", "settings", "static", "id", "blocks", "block_order"]
const PLACEMENT_KEYS = ["groups", "templates"]

/** The fix for the keys models reach for most, said instead of the generic line. */
const HINTS: Record<string, string> = {
  required: "Storelib settings are never required: give it a default the section draws well with.",
  responsive_size: "A size per screen is a range with \"responsive\": true, or two ranges (desktop and mobile).",
  breakpoints: "Layout per screen is @container rules in the CSS, not a schema key.",
  placeholder_image: "An empty image_picker is drawn by the template: {% if settings.image %}…{% elsif page.in_editor %}a placeholder{% endif %}.",
  animations: `The entrance animation is one setting: { "type": "select", "id": "${ANIMATION_SETTING_ID}", "label": "Animation", "options": [...], "default": "theme" } with values from ${SECTION_ANIMATIONS.join(", ")}.`,
  animation: `The entrance animation is a setting, not a schema key: { "type": "select", "id": "${ANIMATION_SETTING_ID}", ... } with values from ${SECTION_ANIMATIONS.join(", ")}.`,
  locales: "Storelib keeps a section's words in its settings and blocks, not in a locales object.",
  templates: "Where a section may go is \"enabled_on\": { \"templates\": [...] } or \"allowed_templates\".",
  limit: "Only a product_list, a collection_list and a block entry take a limit.",
  multiple: "A list of things is blocks, or a product_list / collection_list / image_gallery setting.",
  hidden: "A setting is shown or hidden with \"visible_if\", read from another setting.",
  group: "Settings are grouped with a { \"type\": \"header\", \"content\": \"…\" } setting above them.",
}

type Json = Record<string, unknown>
const an = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`)
const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v)

/**
 * Every key in the schema Storelib would ignore, and every capability the
 * sandbox does not have. Empty for a file that will not parse: the compiler
 * reports that.
 */
export function checkSchemaKeys(source: string): QualityFinding[] {
  const parsed = parseStorelib(source, "section.storelib")
  if (parsed.ok === false) return []
  let schema: unknown
  try {
    schema = JSON.parse(parsed.value.schema.text)
  } catch {
    return []
  }
  if (!isObject(schema)) return []
  const out: QualityFinding[] = []
  const unknown = (where: string, key: string, reads: readonly string[], what: string) => {
    const hint = HINTS[key] ?? `Remove it, or use one of the keys ${what} reads: ${reads.join(", ")}.`
    out.push({
      id: `schema-key:${where}.${key}`,
      severity: "error",
      message: `${where === "schema" ? "The schema" : where} has "${key}", which Storelib does not read, so it would do nothing. ${hint}`,
    })
  }

  for (const key of Object.keys(schema)) {
    if (!(SECTION_KEYS as readonly string[]).includes(key)) unknown("schema", key, SECTION_KEYS, "a section schema")
  }
  for (const key of ["enabled_on", "disabled_on"] as const) {
    const v = schema[key]
    if (isObject(v)) for (const k of Object.keys(v)) if (!PLACEMENT_KEYS.includes(k)) unknown(key, k, PLACEMENT_KEYS, key)
  }

  const caps = Array.isArray(schema.capabilities) ? schema.capabilities : []
  for (const c of caps) {
    if (!(CAPABILITIES as readonly string[]).includes(String(c))) {
      out.push({ id: `schema-capability:${String(c)}`, severity: "error", message: `"${String(c)}" is not a capability a section's script can have. Use one of: ${CAPABILITIES.join(", ")}, or remove it.` })
    }
  }

  const settingsAt = (list: unknown, where: string) => {
    if (!Array.isArray(list)) return
    list.forEach((raw, i) => {
      if (!isObject(raw)) return
      const type = String(raw.type ?? "")
      const control = controlFor(type)
      /* An unknown type is the compiler's refusal, with the list of types. */
      if (!control) return
      const label = `${where}[${i}] ("${String(raw.id ?? type)}", ${an(String(resolveControlType(type)))})`
      const reads = [...SETTING_BASE, ...(control.responsive ? ["responsive"] : []), ...control.accepts]
      for (const key of Object.keys(raw)) if (!reads.includes(key)) unknown(label, key, reads, `${an(String(resolveControlType(type)))} setting`)
      /* The runtime plays a section's animation by its value: an option it has no motion for plays nothing. */
      if (raw.id === ANIMATION_SETTING_ID && Array.isArray(raw.options)) {
        const off = (raw.options as unknown[]).map((o) => (isObject(o) ? String(o.value ?? "") : "")).filter((v) => v && !(SECTION_ANIMATIONS as readonly string[]).includes(v))
        if (off.length) {
          out.push({ id: `schema-animation:${where}`, severity: "error", message: `The "${ANIMATION_SETTING_ID}" setting offers ${off.map((v) => `"${v}"`).join(", ")}, which the page has no animation for. Its values are ${SECTION_ANIMATIONS.join(", ")}.` })
        }
      }
    })
  }
  settingsAt(schema.settings, "settings")

  if (Array.isArray(schema.blocks)) {
    schema.blocks.forEach((raw, i) => {
      if (!isObject(raw)) return
      const where = `blocks[${i}] ("${String(raw.type ?? "")}")`
      for (const key of Object.keys(raw)) if (!BLOCK_KEYS.includes(key)) unknown(where, key, BLOCK_KEYS, "a block")
      settingsAt(raw.settings, `${where}.settings`)
    })
  }

  const presetBlocks = (blocks: unknown, where: string) => {
    const list = Array.isArray(blocks) ? blocks : isObject(blocks) ? Object.values(blocks) : []
    list.forEach((raw, i) => {
      if (!isObject(raw)) return
      const at = `${where}.blocks[${i}]`
      for (const key of Object.keys(raw)) if (!PRESET_BLOCK_KEYS.includes(key)) unknown(at, key, PRESET_BLOCK_KEYS, "a preset block")
      presetBlocks(raw.blocks, at)
    })
  }
  if (Array.isArray(schema.presets)) {
    schema.presets.forEach((raw, i) => {
      if (!isObject(raw)) return
      const where = `presets[${i}]`
      for (const key of Object.keys(raw)) if (!PRESET_KEYS.includes(key)) unknown(where, key, PRESET_KEYS, "a preset")
      presetBlocks(raw.blocks, where)
    })
  }
  return out
}
