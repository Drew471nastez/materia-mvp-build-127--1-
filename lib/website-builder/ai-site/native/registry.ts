/**
 * ===========================================================================
 *  THE NATIVE REGISTRY: STORELIB'S REAL SECTIONS, AS A GENERATOR READS THEM
 * ===========================================================================
 * Round R (R2), after OpenPage's block registry (docs/ai-builder/openpage-
 * study.md): one typed description of every built-in section the AI may
 * place, so a single structured call can compose whole pages of REAL,
 * editable Storelib sections and a validator can hold every value to what
 * the editor itself accepts.
 *
 * GENERATED, NOT WRITTEN BY HAND. Every type, setting, allowed value, range,
 * default and block type is read from the section schemas the editor draws
 * its panels from (SECTION_SCHEMAS: the default theme's .storelib files and
 * JSON schemas) for the types Add section offers (ADDABLE_SECTIONS), and the
 * theme tokens from Theme settings' own controls (THEME_SETTINGS_GROUPS) and
 * the design presets. What is curated here is small and named:
 *
 *   EXCLUDED     types the generator must not place, each with its reason;
 *   OVERRIDES    a setting whose control type does not say what it binds
 *                (native_form's form_url is the creator's form);
 *   PEOPLE       settings that are real people's words or faces, never
 *                generated (a quote, a name, an avatar);
 *   ALIASES      block names other builders use (OpenPage's "hero",
 *                "testimonials"...) mapped to a real type, recorded when used.
 *
 * tests/native-engine-r2.test.ts regenerates the registry, checks it field by
 * field against the schemas, and compares its fingerprint with
 * ./registry-snapshot.ts, so a schema change that would alter what the
 * generator may write fails a test until it is looked at.
 */
import { SECTION_SCHEMAS, ADDABLE_SECTIONS } from "../../section-schemas"
import { THEME_SETTINGS_GROUPS } from "../../theme-settings-schema"
import { DESIGN_PRESETS, type DesignPreset } from "../../design-presets"
import { ADJUSTABLE_SETTINGS } from "../../agent/site-plan"
import type { SchemaField, SectionSchema, ThemeSettingsGroup } from "../../types"

export const NATIVE_REGISTRY_VERSION = "native-registry-1"

/** What a setting is for, as the generator and the validator treat it. */
export type SettingRole = "copy" | "link" | "layout" | "spacing" | "style" | "image" | "binding" | "fixed"
/** What a binding setting points at: one of THIS creator's real things. */
export type BindingKind = "image" | "video" | "product" | "product_list" | "collection" | "collection_list" | "community" | "form"

export interface NativeSetting {
  id: string
  label: string
  /** The control type in the schema, as written there. */
  fieldType: string
  role: SettingRole
  binding: BindingKind | null
  /** Whether the generator writes it (fixed and style settings keep their preset value). */
  generated: boolean
  default?: unknown
  values?: string[]
  min?: number
  max?: number
  step?: number
  unit?: string
  responsive?: boolean
  /** Text: the longest value accepted. */
  maxLength?: number
  /** Rich text: limited HTML is allowed (and sanitised); any other text holds no markup at all. */
  html?: boolean
}

export interface NativeBlockDef {
  type: string
  name: string
  /** How many of this block the section holds, when the schema says. */
  limit: number | null
  settings: NativeSetting[]
}

export interface NativeSectionDef {
  type: string
  name: string
  description: string
  category: string
  settings: NativeSetting[]
  blocks: NativeBlockDef[]
  maxBlocks: number | null
  /** The preset's block count: how many items the section is designed around. */
  presetBlocks: number
  bindings: BindingKind[]
}

export interface NativeThemeTokens {
  presets: { id: string; name: string; mood: string[] }[]
  /** The palette keys the plan's palette is written from (plan-apply.ts schemeColors). */
  palette: readonly string[]
  fonts: { heading: string[]; body: string[] }
  /** Theme settings a site may set on top of its preset, with their controls. */
  settings: NativeSetting[]
  /** Colour scheme keys a section can sit on. */
  schemes: string[]
}

export interface NativeRegistry {
  version: string
  sections: Record<string, NativeSectionDef>
  /** Addable types left out, with why. */
  excluded: Record<string, string>
  theme: NativeThemeTokens
}

/* ── the curated part ──────────────────────────────────────────────────── */

export const EXCLUDED: Record<string, string> = {
  breadcrumbs: "drawn from the page's own path",
  page_content: "a system page's body",
  blocks_section: "holds theme blocks (@theme) composed in the editor",
  back_to_top: "a site-wide control, the creator's choice",
  mobile_bottom_bar: "a site-wide overlay, the creator's choice",
  popup: "an overlay, the creator's choice",
  reviews_product: "belongs on the product page, bound to its product",
  promo_countdown: "needs a real end date from the creator",
  media_video: "needs the creator's own video",
  media_map: "needs the creator's real address",
}

/** Settings whose control type does not say what they bind. Keyed "type.setting". */
export const OVERRIDES: Record<string, Partial<Pick<NativeSetting, "role" | "binding" | "generated">>> = {
  "native_form.form_url": { role: "binding", binding: "form", generated: true },
}

/** Sections about real people: who they are and what they said is never generated. */
const PEOPLE_SECTION = /testimonial|proof|founder|team|quote/
const PEOPLE_FIELD = /^(quote|name|role|author|person|signature|avatar|photo|rating)$/

/** Names other builders give their blocks (OpenPage's among them), mapped to the closest real type. */
export const ALIASES: Record<string, string> = {
  hero: "hero_centered",
  features: "features_grid",
  feature: "features_grid",
  pricing: "pricing_table",
  cta: "cta_simple",
  testimonials: "proof_testimonials",
  stats: "stats_band",
  faq: "faq_accordion",
  team: "team_grid",
  contact: "contact",
  newsletter: "promo_newsletter",
  logocloud: "logo_cloud",
  logos: "logo_cloud",
  content: "text_rich",
  text: "text_rich",
  image: "text_image",
  gallery: "media_gallery",
  banner: "promo_announcement",
  products: "product_grid",
  collections: "collections_grid",
  about: "about_image",
  timeline: "about_timeline",
  steps: "sticky_story",
}

/** Chrome other builders put in a page's block list: here the header and footer are the site's frame, never a page section. */
export const CHROME_ALIASES = new Set(["navbar", "nav", "header", "footer", "menu", "divider", "spacer"])

/* ── reading a schema ──────────────────────────────────────────────────── */

const NOT_SETTINGS = new Set(["header", "paragraph", "divider"])
const TEXT_MAX: Record<string, number> = { text: 240, inline_richtext: 400, textarea: 1200, richtext: 4000, html: 4000 }

const BINDING_OF: Record<string, BindingKind> = {
  image_picker: "image",
  image: "image",
  video_picker: "video",
  video_url: "video",
  video: "video",
  product_picker: "product",
  product: "product",
  product_list: "product_list",
  collection_picker: "collection",
  collection: "collection",
  collection_list: "collection_list",
  community_picker: "community",
  form_picker: "form",
}

function roleOf(f: SchemaField): { role: SettingRole; binding: BindingKind | null } {
  const binding = BINDING_OF[f.type] ?? null
  if (binding === "image") return { role: "image", binding }
  if (binding) return { role: "binding", binding }
  /* An address kept in a plain text control ("link", "cta_url", "action"): held to the site's links like any link. */
  if (f.type === "text" && /(^|_)(url|link|href|action)$/.test(f.id)) return { role: "link", binding: null }
  switch (f.type) {
    case "text":
    case "textarea":
    case "richtext":
    case "inline_richtext":
      return { role: "copy", binding: null }
    case "url":
    case "link":
      return { role: "link", binding: null }
    case "select":
    case "radio":
    case "toggle":
    case "checkbox":
    case "alignment":
    case "text_alignment":
      return { role: "layout", binding: null }
    case "range":
    case "number":
      return { role: /padding|margin|gap|spacing/.test(f.id) ? "spacing" : "layout", binding: null }
    case "color":
    case "color_background":
    case "color_scheme":
      return { role: "style", binding: null }
    default:
      return { role: "fixed", binding: null }
  }
}

/** One schema field as a registry setting. Pure. */
export function settingFrom(sectionType: string, f: SchemaField, inBlock = false): NativeSetting {
  let { role, binding } = roleOf(f)
  let generated = role !== "fixed" && role !== "style" && binding !== "video"
  if (PEOPLE_SECTION.test(sectionType) && PEOPLE_FIELD.test(f.id)) {
    role = "fixed"
    binding = null
    generated = false
  }
  const over = inBlock ? undefined : OVERRIDES[`${sectionType}.${f.id}`]
  if (over) {
    role = over.role ?? role
    binding = over.binding ?? binding
    generated = over.generated ?? generated
  }
  const s: NativeSetting = { id: f.id, label: f.label ?? "", fieldType: f.type, role, binding, generated }
  if (f.default !== undefined) s.default = f.default
  if ((f.type === "select" || f.type === "radio") && f.options?.length) s.values = f.options.map((o) => String(o.value))
  if (f.min !== undefined) s.min = f.min
  if (f.max !== undefined) s.max = f.max
  if (f.step !== undefined) s.step = f.step
  if (f.unit !== undefined) s.unit = f.unit
  if (f.responsive) s.responsive = true
  if (TEXT_MAX[f.type]) s.maxLength = TEXT_MAX[f.type]
  if (f.type === "richtext" || f.type === "inline_richtext" || f.type === "html") s.html = true
  return s
}

/** One section schema as a registry entry. Pure. */
export function sectionFrom(schema: SectionSchema): NativeSectionDef {
  const settings = (schema.fields ?? []).filter((f) => !NOT_SETTINGS.has(f.type)).map((f) => settingFrom(schema.type, f))
  const blocks = (schema.blocks ?? []).map((b) => ({
    type: b.type,
    name: b.name,
    limit: typeof b.limit === "number" ? b.limit : null,
    settings: (b.fields ?? []).filter((f) => !NOT_SETTINGS.has(f.type)).map((f) => settingFrom(schema.type, f, true)),
  }))
  const bindings = [...new Set([...settings, ...blocks.flatMap((b) => b.settings)].map((s) => s.binding).filter((b): b is BindingKind => !!b))]
  return {
    type: schema.type,
    name: schema.name,
    description: schema.description ?? "",
    category: schema.category ?? "",
    settings,
    blocks,
    maxBlocks: typeof schema.max_blocks === "number" ? schema.max_blocks : null,
    presetBlocks: schema.presets?.[0]?.blocks?.length ?? 0,
    bindings,
  }
}

const PALETTE_KEYS = ["background", "surface", "text", "heading", "accent", "button", "button_text"] as const

/** The theme tokens: presets, palette keys, fonts and the adjustable Theme settings, from their real controls. Pure. */
export function themeTokensFrom(groups: ThemeSettingsGroup[], presets: readonly DesignPreset[]): NativeThemeTokens {
  const fields = groups.flatMap((g) => g.fields ?? [])
  const font = (id: string) => (fields.find((f) => f.id === id)?.options ?? []).map((o) => String(o.value)).filter(Boolean)
  const adjustable = new Set<string>(ADJUSTABLE_SETTINGS)
  const settings = fields.filter((f) => adjustable.has(f.id) && f.id !== "font_heading" && f.id !== "font_body").map((f) => settingFrom("theme", f))
  const schemes = new Set<string>()
  for (const p of presets) for (const k of Object.keys(((p.settings as { color_schemes?: Record<string, unknown> }).color_schemes ?? {}) as Record<string, unknown>)) schemes.add(k)
  return {
    presets: presets.map((p) => ({ id: p.id, name: p.name, mood: [...p.mood] })),
    palette: PALETTE_KEYS,
    fonts: { heading: font("font_heading"), body: font("font_body") },
    settings,
    schemes: [...schemes],
  }
}

/** The registry, built from schemas. Pure: the tests build it from the same inputs and compare. */
export function buildNativeRegistry(input: { schemas: Record<string, SectionSchema>; addable: readonly string[]; groups: ThemeSettingsGroup[]; presets: readonly DesignPreset[] }): NativeRegistry {
  const sections: Record<string, NativeSectionDef> = {}
  const excluded: Record<string, string> = {}
  for (const type of input.addable) {
    const schema = input.schemas[type]
    if (!schema) {
      excluded[type] = "no schema"
      continue
    }
    if (EXCLUDED[type]) {
      excluded[type] = EXCLUDED[type]
      continue
    }
    sections[type] = sectionFrom(schema)
  }
  return { version: NATIVE_REGISTRY_VERSION, sections, excluded, theme: themeTokensFrom(input.groups, input.presets) }
}

let cached: NativeRegistry | null = null

/** Storelib's registry: the default theme's sections Add section offers, and Theme settings. Built once per process. */
export function nativeRegistry(): NativeRegistry {
  if (!cached) cached = buildNativeRegistry({ schemas: SECTION_SCHEMAS, addable: ADDABLE_SECTIONS, groups: THEME_SETTINGS_GROUPS, presets: DESIGN_PRESETS })
  return cached
}

/* ── fingerprints, for the drift test ──────────────────────────────────── */

function fnv(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

const settingKey = (s: NativeSetting) => [s.id, s.fieldType, s.role, s.binding ?? "", s.generated ? 1 : 0, (s.values ?? []).join("|"), s.min ?? "", s.max ?? "", s.responsive ? 1 : 0].join(":")

/** What the generator may write for one type, as a short hash. */
export function sectionFingerprint(def: NativeSectionDef): string {
  return fnv(JSON.stringify([def.settings.map(settingKey), def.blocks.map((b) => [b.type, b.limit, b.settings.map(settingKey)]), def.maxBlocks]))
}

/** Every type's fingerprint, plus the theme tokens' and the exclusions'. */
export function registryFingerprints(reg: NativeRegistry): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [type, def] of Object.entries(reg.sections)) out[type] = sectionFingerprint(def)
  out["@theme"] = fnv(JSON.stringify([reg.theme.presets.map((p) => p.id), reg.theme.palette, reg.theme.fonts, reg.theme.settings.map(settingKey), reg.theme.schemes]))
  out["@excluded"] = fnv(JSON.stringify(Object.keys(reg.excluded).sort()))
  return out
}

/* ── the registry as the model reads it ────────────────────────────────── */

function describeSetting(s: NativeSetting): string {
  if (s.values) return `${s.id}(${s.values.join("|")})`
  if (s.fieldType === "range" || s.fieldType === "number") return `${s.id}(${s.min ?? ""}-${s.max ?? ""}${s.unit ?? ""}${s.responsive ? ', or {"desktop":n,"mobile":n}' : ""})`
  if (s.fieldType === "toggle" || s.fieldType === "checkbox") return `${s.id}(true|false)`
  if (s.role === "image") return `${s.id}[image]`
  if (s.role === "binding") return `${s.id}[${s.binding}]`
  if (s.role === "link") return `${s.id}[link]`
  return `${s.id}${s.html ? "[html]" : ""}`
}

/** One line per type: what it is, its writable settings, its blocks. Compact on purpose (it is in every generation call). */
export function describeRegistry(reg: NativeRegistry, types: string[]): string {
  return types
    .map((t) => reg.sections[t])
    .filter((d): d is NativeSectionDef => !!d)
    .map((d) => {
      const sets = d.settings.filter((s) => s.generated).map(describeSetting).join(" ")
      const blocks = d.blocks
        .map((b) => {
          const bs = b.settings.filter((s) => s.generated).map(describeSetting).join(" ")
          return `${b.type}${b.limit ? `(max ${b.limit})` : ""}{${bs}}`
        })
        .join(" ")
      const items = d.blocks.length ? ` | blocks (up to ${d.maxBlocks ?? 12}, aim for ${Math.max(2, d.presetBlocks || 3)}): ${blocks}` : ""
      return `- ${d.type}: ${d.name}${d.description ? `. ${d.description}` : ""} | settings: ${sets}${items}`
    })
    .join("\n")
}
