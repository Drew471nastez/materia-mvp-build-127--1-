/**
 * ===========================================================================
 *  A COMPONENT'S MANIFEST, WRITTEN AS THE <schema> THE EDITOR ALREADY DRAWS
 * ===========================================================================
 * The agent describes what a person may change about a component as
 * `EditableProp`s (lib/ai-builder/types.ts). The editor does not need a new
 * control set for that: every kind is one of the control types the sidebar
 * already draws (lib/storelib-theme/controls/registry.ts), so the manifest is
 * written into the component's `.storelib` `<schema>` and the existing
 * FieldEditor shows it. The one new control is `form_picker` (L4 resolves it,
 * L5 draws it).
 *
 * THE FILE IS THE TRUTH. `schemaToManifest` reads a manifest back out of a
 * file, including one a person edited by hand in the code editor, and
 * `withManifest` writes a manifest into a file by replacing its schema's
 * settings and blocks only: the template, the style, the script, the presets
 * and every setting the manifest does not describe stay exactly as they were.
 * Nothing is ever flattened into settings.
 *
 * Kinds that share a control (spacing, radius, size and border are all a
 * `range`) carry `"prop": "<kind>"` on their setting, a key the schema reader
 * passes through, so the round trip is exact. A file written by hand without
 * it is read by the control alone.
 *
 * Pure. Tested in tests/ai-builder-editor.test.ts.
 */
import {
  ANIMATION_STYLES,
  SECTION_ANIMATION_VALUES,
  SHADOW_LEVELS,
  VISIBILITY_VALUES,
  type BindingProp,
  type ComponentManifest,
  type DataBindingKind,
  type EditableProp,
  type EditablePropKind,
  type ItemManifest,
  type ManifestControlType,
  type ScriptCapability,
  type SectionAnimationValue,
  type SizeUnit,
} from "./types"

export { tokensToThemeSettings, themeSettingsToTokens } from "./tokens"

/** The control type each prop kind is drawn with (before per-prop options such as `inline` or `slider`). */
export const PROP_CONTROL: Record<Exclude<EditablePropKind, "binding">, ManifestControlType> = {
  text: "text",
  textarea: "textarea",
  richtext: "richtext",
  image: "image_picker",
  video: "video_picker",
  color: "color",
  color_scheme: "color_scheme",
  font: "font_picker",
  spacing: "range",
  number: "number",
  select: "select",
  boolean: "checkbox",
  link: "url",
  icon: "icon_picker",
  alignment: "alignment",
  animation: "select",
  radius: "range",
  size: "range",
  shadow: "select",
  border: "range",
  background: "color_background",
  visibility: "select",
}

export const BINDING_CONTROL = {
  product: "product_picker",
  products: "product_list",
  collection: "collection_picker",
  collections: "collection_list",
  community: "community_picker",
  page: "page_picker",
  menu: "link_list",
  form: "form_picker",
} as const satisfies Record<DataBindingKind, ManifestControlType>

/**
 * The controls that may hold a value per breakpoint (the registry's
 * `responsive: true`, held to it by the test). `responsive` on any other prop
 * is dropped rather than written, because the schema validator refuses it.
 */
export const RESPONSIVE_CONTROLS: ReadonlySet<ManifestControlType> = new Set<ManifestControlType>(["range", "number", "alignment"])

/** One `<schema>` setting, as the .storelib format writes it. */
export interface SchemaSetting {
  type: ManifestControlType
  id: string
  label: string
  default?: unknown
  options?: { label: string; value: string }[]
  min?: number
  max?: number
  step?: number
  unit?: string
  info?: string
  placeholder?: string
  responsive?: boolean
  visible_if?: string
  limit?: number
  accept?: string[]
  image?: string
  /** Which prop kind wrote it, where the control alone is ambiguous. Passed through by the schema reader. */
  prop?: EditablePropKind
}

/* ── animation ────────────────────────────────────────────────────────── */

const ANIMATION_LABELS: Record<SectionAnimationValue, string> = {
  theme: "Same as site",
  none: "None",
  fade: "Fade",
  fade_up: "Fade up",
  rise: "Rise",
  slide_right: "From the left",
  slide_left: "From the right",
  zoom: "Zoom",
  blur: "Blur in",
}

/** Theme settings' spelling of a style (ANIMATION_STYLES), as the page plays it. */
const STYLE_TO_SECTION: Record<string, SectionAnimationValue> = {
  "fade-up": "fade_up",
  "fade-in": "fade",
  "zoom-in": "zoom",
  "slide-left": "slide_left",
  "slide-right": "slide_right",
  "blur-in": "blur",
  rise: "rise",
}

/** Any spelling of an animation, as the value the page plays. Unknown is "theme". */
export function sectionAnimationValue(v: unknown): SectionAnimationValue {
  if (typeof v !== "string") return "theme"
  if ((SECTION_ANIMATION_VALUES as readonly string[]).includes(v)) return v as SectionAnimationValue
  return STYLE_TO_SECTION[v] ?? "theme"
}

/** Said under every animation control: the page already honours the device setting (section-motion.ts installReveal). */
export const REDUCED_MOTION_NOTE = "Visitors who turn off motion on their device see it without the animation."

/** The animation's two timing settings, by the animation's own id. */
export const animationTimingIds = (id: string) => ({ duration: `${id}_duration`, delay: `${id}_delay` })

/* ── the other fixed option lists ─────────────────────────────────────── */

const SHADOW_LABELS: Record<(typeof SHADOW_LEVELS)[number], string> = { none: "None", sm: "Small", md: "Medium", lg: "Large" }
const VISIBILITY_LABELS: Record<(typeof VISIBILITY_VALUES)[number], string> = { both: "Both", desktop: "Desktop", mobile: "Phone" }

const optionsOf = <T extends string>(values: readonly T[], labels: Record<T, string>) => values.map((value) => ({ label: labels[value], value }))
const sameValues = (options: { value: string }[] | undefined, values: readonly string[]) =>
  !!options && options.length === values.length && options.every((o) => values.includes(o.value))

/* ── manifest to schema ───────────────────────────────────────────────── */

function controlOf(p: EditableProp): ManifestControlType {
  switch (p.kind) {
    case "binding":
      return BINDING_CONTROL[p.binding]
    case "richtext":
      return p.inline ? "inline_richtext" : "richtext"
    case "video":
      return p.source === "url" ? "video_url" : "video_picker"
    case "number":
      return p.slider ? "range" : "number"
    case "select":
      return p.style === "radio" ? "radio" : "select"
    default:
      return PROP_CONTROL[p.kind]
  }
}

/** Kinds whose control another kind also uses, so the setting says which it is. */
const NEEDS_HINT: ReadonlySet<EditablePropKind> = new Set<EditablePropKind>(["spacing", "radius", "size", "border", "shadow", "visibility", "animation"])

/** `visible_if` for a setting that shows only while another of the same section or block has a value. */
function showWhile(scope: "section" | "block", id: string, test: string): string {
  return `{{ ${scope}.settings.${id} ${test} }}`
}

/**
 * The settings one prop becomes: itself, and for a picture its alt text and
 * focal point, for a border its colour, for an animation with timing its
 * duration and delay. `scope` is "block" for an item's props, so a
 * condition reads `block.settings`.
 */
export function propToSettings(p: EditableProp, scope: "section" | "block" = "section"): SchemaSetting[] {
  const type = controlOf(p)
  const base: SchemaSetting = { type, id: p.id, label: p.label }
  if (NEEDS_HINT.has(p.kind) || (p.kind === "number" && p.slider)) base.prop = p.kind
  if (p.info) base.info = p.info
  if (p.responsive && RESPONSIVE_CONTROLS.has(type)) base.responsive = true
  if (p.visibleIf) base.visible_if = p.visibleIf
  const out: SchemaSetting[] = [base]
  switch (p.kind) {
    case "text":
      if (p.placeholder) base.placeholder = p.placeholder
      if (p.default !== undefined) base.default = p.default
      break
    case "spacing":
      Object.assign(base, { min: p.min, max: p.max, step: p.step ?? 4, unit: "px" })
      if (p.default !== undefined) base.default = p.default
      break
    case "radius":
      Object.assign(base, { min: 0, max: p.max ?? 48, step: 1, unit: "px" })
      if (p.default !== undefined) base.default = p.default
      break
    case "size":
      Object.assign(base, { min: p.min, max: p.max, step: p.step ?? 1, unit: p.unit })
      if (p.default !== undefined) base.default = p.default
      break
    case "border":
      Object.assign(base, { min: 0, max: 8, step: 1, unit: "px" })
      base.default = p.default ?? 0
      out.push({ type: "color", id: `${p.id}_color`, label: `${p.label} color`, ...(p.colorDefault ? { default: p.colorDefault } : {}), visible_if: showWhile(scope, p.id, "> 0") })
      break
    case "shadow":
      base.options = optionsOf(SHADOW_LEVELS, SHADOW_LABELS)
      base.default = p.default ?? "none"
      break
    case "visibility":
      base.options = optionsOf(VISIBILITY_VALUES, VISIBILITY_LABELS)
      base.default = p.default ?? "both"
      break
    case "number":
      if (p.min !== undefined) base.min = p.min
      if (p.max !== undefined) base.max = p.max
      if (p.step !== undefined) base.step = p.step
      if (p.unit) base.unit = p.unit
      if (p.default !== undefined) base.default = p.default
      break
    case "select":
      base.options = p.options
      if (p.default !== undefined) base.default = p.default
      break
    case "animation": {
      base.options = optionsOf(SECTION_ANIMATION_VALUES, ANIMATION_LABELS)
      base.default = sectionAnimationValue(p.default)
      if (!p.info) base.info = REDUCED_MOTION_NOTE
      if (p.timing) {
        const ids = animationTimingIds(p.id)
        const playing = showWhile(scope, p.id, "!= 'none'")
        out.push({ type: "range", id: ids.duration, label: "Duration", min: 150, max: 1500, step: 50, unit: "ms", default: 600, visible_if: playing })
        out.push({ type: "range", id: ids.delay, label: "Delay", min: 0, max: 1000, step: 50, unit: "ms", default: 0, visible_if: playing })
      }
      break
    }
    case "binding":
      if (p.limit !== undefined) base.limit = p.limit
      break
    case "image":
      if (p.default !== undefined) base.default = p.default
      out.push({ type: "text", id: p.altId ?? `${p.id}_alt`, label: `${p.label} description`, info: "Read aloud by screen readers." })
      if (p.focalPoint) out.push({ type: "focal_point", id: `${p.id}_focus`, label: `${p.label} focus`, image: p.id })
      break
    default:
      if ("default" in p && p.default !== undefined) base.default = p.default
  }
  return out
}

const headerId = (group: string) => `hdr_${group.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "group"}`

/** Props in order, with a `header` field each time the group changes. */
export function propsToSettings(props: EditableProp[], scope: "section" | "block" = "section"): SchemaSetting[] {
  const out: SchemaSetting[] = []
  let group: string | undefined
  for (const p of props) {
    if (p.group && p.group !== group) {
      group = p.group
      out.push({ type: "header", id: headerId(p.group), label: p.group })
    }
    out.push(...propToSettings(p, scope))
  }
  return out
}

/** The `<schema>` JSON of a component: what `write_file` puts between the schema tags. */
export function manifestToSchema(m: ComponentManifest): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    schema_version: 1,
    type: m.type,
    name: m.name,
    ...(m.category ? { category: m.category } : {}),
    ...(m.description ? { description: m.description } : {}),
    settings: propsToSettings(m.props),
  }
  if (m.items?.length) {
    schema.blocks = m.items.map((i: ItemManifest) => ({ type: i.type, name: i.name, ...(i.limit ? { limit: i.limit } : {}), ...(typeof i.min === "number" ? { min_blocks: i.min } : {}), settings: propsToSettings(i.props, "block") }))
    if (m.maxItems) schema.max_blocks = m.maxItems
  }
  /* Round P: the filled items a placement starts with (lib/ai-builder/agent/content-check.ts). */
  if (m.preset?.blocks?.length) schema.presets = [{ name: m.name, ...(m.preset.settings ? { settings: m.preset.settings } : {}), blocks: m.preset.blocks.map((b) => ({ type: b.type, ...(b.settings ? { settings: b.settings } : {}) })) }]
  if (m.capabilities.length) schema.capabilities = [...m.capabilities]
  const groups = m.placement.groups.filter((g) => g !== "body")
  if (groups.length) schema.enabled_on = { groups }
  if (m.placement.kind) schema.kind = m.placement.kind
  if (m.tokens?.length) schema.tokens = [...m.tokens]
  return schema
}

/* ── schema to manifest (reading a file back) ─────────────────────────── */

type RawSetting = Record<string, unknown> & { type?: unknown; id?: unknown }

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined)
const BINDING_OF: Record<string, DataBindingKind> = Object.fromEntries(Object.entries(BINDING_CONTROL).map(([k, v]) => [v, k as DataBindingKind]))
/** The older and Shopify names a hand-written schema may use (lib/storelib-theme/controls/types.ts aliases). */
const ALIASES: Record<string, string> = { link: "url", image: "image_picker", video: "video_picker", icon: "icon_picker", font: "font_picker", spacing: "range", text_alignment: "alignment", product: "product_picker", page: "page_picker", collection: "collection_picker", toggle: "checkbox" }
const SIZE_UNITS: readonly string[] = ["px", "%", "vw", "vh", "rem"]

/** What a schema setting is, as a prop: null for a setting no prop kind describes (kept in `unmapped`). */
function propOf(s: RawSetting, scope: "section" | "block"): EditableProp | null {
  const rawType = str(s.type) ?? ""
  const type = ALIASES[rawType] ?? rawType
  const id = str(s.id)
  if (!id) return null
  const base = {
    id,
    label: str(s.label) ?? id,
    ...(str(s.info) ? { info: str(s.info)! } : {}),
    ...(s.responsive === true ? { responsive: true } : {}),
    ...(str(s.visible_if) ? { visibleIf: str(s.visible_if)! } : {}),
  }
  const def = s.default
  const hint = str(s.prop) as EditablePropKind | undefined
  const options = Array.isArray(s.options) ? (s.options as { label?: unknown; value?: unknown }[]).map((o) => ({ label: String(o?.label ?? o?.value ?? ""), value: String(o?.value ?? "") })) : undefined

  if (type === "range") {
    const min = num(s.min) ?? 0
    const max = num(s.max) ?? 100
    const unit = str(s.unit)
    if (hint === "radius") return { ...base, kind: "radius", ...(num(def) !== undefined ? { default: num(def) } : {}), ...(max !== 48 ? { max } : {}) }
    if (hint === "border") return { ...base, kind: "border", default: num(def) ?? 0 }
    if (hint === "size" || (!hint && unit && unit !== "px" && SIZE_UNITS.includes(unit))) {
      return { ...base, kind: "size", min, max, ...(num(s.step) !== undefined && num(s.step) !== 1 ? { step: num(s.step) } : {}), unit: (unit ?? "px") as SizeUnit, ...(num(def) !== undefined ? { default: num(def) } : {}) }
    }
    if (hint === "spacing" || (!hint && unit === "px")) {
      return { ...base, kind: "spacing", min, max, ...(num(s.step) !== undefined && num(s.step) !== 4 ? { step: num(s.step) } : {}), ...(num(def) !== undefined ? { default: num(def) } : {}) }
    }
    return {
      ...base,
      kind: "number",
      slider: true,
      ...(s.min !== undefined ? { min } : {}),
      ...(s.max !== undefined ? { max } : {}),
      ...(num(s.step) !== undefined ? { step: num(s.step) } : {}),
      ...(unit ? { unit } : {}),
      ...(num(def) !== undefined ? { default: num(def) } : {}),
    }
  }
  if (type === "select" || type === "radio") {
    if (hint === "animation" || (!hint && scope === "section" && id === "animation") || (!hint && sameValues(options, SECTION_ANIMATION_VALUES))) {
      const animation = { ...base, kind: "animation" as const, default: sectionAnimationValue(def) }
      if (animation.info === REDUCED_MOTION_NOTE) delete (animation as { info?: string }).info
      return animation
    }
    if (hint === "shadow" || (!hint && sameValues(options, SHADOW_LEVELS))) return { ...base, kind: "shadow", default: (str(def) ?? "none") as (typeof SHADOW_LEVELS)[number] }
    if (hint === "visibility" || (!hint && sameValues(options, VISIBILITY_VALUES))) return { ...base, kind: "visibility", default: (str(def) ?? "both") as (typeof VISIBILITY_VALUES)[number] }
    return { ...base, kind: "select", options: options ?? [], ...(str(def) !== undefined ? { default: str(def) } : {}), ...(type === "radio" ? { style: "radio" as const } : {}) }
  }
  switch (type) {
    case "text":
      return { ...base, kind: "text", ...(str(def) !== undefined ? { default: str(def) } : {}), ...(str(s.placeholder) ? { placeholder: str(s.placeholder) } : {}) }
    case "textarea":
      return { ...base, kind: "textarea", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "richtext":
    case "inline_richtext":
      return { ...base, kind: "richtext", ...(str(def) !== undefined ? { default: str(def) } : {}), ...(type === "inline_richtext" ? { inline: true } : {}) }
    case "image_picker":
      return { ...base, kind: "image", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "video_picker":
    case "video_url":
      return { ...base, kind: "video", source: type === "video_url" ? "url" : "upload", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "color":
      return { ...base, kind: "color", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "color_scheme":
      return { ...base, kind: "color_scheme", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "color_background":
      return { ...base, kind: "background", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "font_picker":
      return { ...base, kind: "font", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "number":
      return {
        ...base,
        kind: "number",
        ...(num(s.min) !== undefined ? { min: num(s.min) } : {}),
        ...(num(s.max) !== undefined ? { max: num(s.max) } : {}),
        ...(num(s.step) !== undefined ? { step: num(s.step) } : {}),
        ...(str(s.unit) ? { unit: str(s.unit) } : {}),
        ...(num(def) !== undefined ? { default: num(def) } : {}),
      }
    case "checkbox":
      return { ...base, kind: "boolean", ...(typeof def === "boolean" ? { default: def } : {}) }
    case "url":
      return { ...base, kind: "link", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "icon_picker":
      return { ...base, kind: "icon", ...(str(def) !== undefined ? { default: str(def) } : {}) }
    case "alignment":
      return { ...base, kind: "alignment", ...(def === "left" || def === "center" || def === "right" ? { default: def } : {}) }
  }
  const binding = BINDING_OF[type]
  if (binding) {
    const p: BindingProp = { ...base, kind: "binding", binding }
    if (num(s.limit) !== undefined) p.limit = num(s.limit)
    return p
  }
  return null
}

export interface ReadManifestProps {
  props: EditableProp[]
  /** Settings no prop kind describes (an html box, a gallery, a date): kept in the file as they are, listed here. */
  unmapped: Record<string, unknown>[]
}

/** A schema's `settings` (or a block's) as props, the inverse of propsToSettings. */
export function settingsToProps(list: unknown, scope: "section" | "block" = "section"): ReadManifestProps {
  const settings = (Array.isArray(list) ? list : []).filter((s): s is RawSetting => !!s && typeof s === "object")
  const props: EditableProp[] = []
  const unmapped: Record<string, unknown>[] = []
  const consumed = new Set<number>()
  let group: string | undefined
  settings.forEach((s, i) => {
    if (consumed.has(i)) return
    if (s.type === "header") {
      group = str(s.label)
      return
    }
    const p = propOf(s, scope)
    if (!p) {
      unmapped.push(s)
      return
    }
    if (group) p.group = group
    /* The settings a prop writes beside itself, read back into it. */
    const next = (j: number) => settings[i + j]
    if (p.kind === "image") {
      let j = 1
      const alt = next(j)
      if (alt && alt.type === "text" && (alt.id === `${p.id}_alt` || (typeof alt.label === "string" && alt.label === `${p.label} description`))) {
        if (alt.id !== `${p.id}_alt`) p.altId = String(alt.id)
        consumed.add(i + j)
        j++
      }
      const focus = next(j)
      if (focus && focus.type === "focal_point" && focus.image === p.id) {
        p.focalPoint = true
        consumed.add(i + j)
      }
    } else if (p.kind === "border") {
      const color = next(1)
      if (color && color.type === "color" && color.id === `${p.id}_color`) {
        if (typeof color.default === "string") p.colorDefault = color.default
        consumed.add(i + 1)
      }
    } else if (p.kind === "animation") {
      const ids = animationTimingIds(p.id)
      if (next(1)?.id === ids.duration && next(2)?.id === ids.delay) {
        p.timing = true
        consumed.add(i + 1)
        consumed.add(i + 2)
      }
    }
    props.push(p)
  })
  return { props, unmapped }
}

export interface ReadManifest {
  manifest: ComponentManifest
  /** Settings of the section or of an item that no prop kind describes, by where they are. */
  unmapped: { at: string; setting: Record<string, unknown> }[]
}

/** The `<schema>` block's JSON from a .storelib source, or null. */
export function schemaJsonOf(source: string): Record<string, unknown> | null {
  const m = source.match(/^[ \t]*<schema[^>]*>([\s\S]*?)^[ \t]*<\/schema>/m)
  if (!m) return null
  try {
    const v = JSON.parse(m[1])
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/**
 * A component's manifest, read from its file (or from its parsed schema).
 * What a person changed by hand in the code editor is what comes back: the
 * manifest is never kept anywhere else to go stale.
 */
export function schemaToManifest(input: string | Record<string, unknown>, opts: { type?: string } = {}): ReadManifest | null {
  const schema = typeof input === "string" ? schemaJsonOf(input) : input
  if (!schema) return null
  const type = (opts.type ?? str(schema.type) ?? "") as ComponentManifest["type"]
  const section = settingsToProps(schema.settings, "section")
  const unmapped = section.unmapped.map((setting) => ({ at: "settings", setting }))
  const items: ItemManifest[] = []
  for (const b of Array.isArray(schema.blocks) ? (schema.blocks as Record<string, unknown>[]) : []) {
    /* A theme block it accepts by name ("@theme", a blocks/ file) has no settings of its own here. */
    if (!b || typeof b !== "object" || typeof b.name !== "string") continue
    const read = settingsToProps(b.settings, "block")
    items.push({ type: String(b.type), name: b.name, props: read.props, ...(num(b.limit) ? { limit: num(b.limit) } : {}), ...(num(b.min_blocks) !== undefined ? { min: num(b.min_blocks) } : {}) })
    unmapped.push(...read.unmapped.map((setting) => ({ at: `blocks.${String(b.type)}`, setting })))
  }
  const enabled = schema.enabled_on && typeof schema.enabled_on === "object" ? (schema.enabled_on as { groups?: unknown }).groups : undefined
  const groups = Array.isArray(enabled) ? (enabled.filter((g) => g === "header" || g === "footer" || g === "overlay") as ("header" | "footer" | "overlay")[]) : []
  const manifest: ComponentManifest = {
    type,
    name: str(schema.name) ?? type,
    ...(str(schema.description) ? { description: str(schema.description) } : {}),
    ...(str(schema.category) ? { category: str(schema.category) } : {}),
    runtime: "storelib",
    props: section.props,
    ...(items.length ? { items } : {}),
    ...(num(schema.max_blocks) ? { maxItems: num(schema.max_blocks) } : {}),
    ...presetOf(schema),
    placement: { groups: groups.length ? groups : ["body"], ...(schema.kind === "header" || schema.kind === "footer" ? { kind: schema.kind } : {}) },
    capabilities: Array.isArray(schema.capabilities) ? (schema.capabilities.filter((c) => typeof c === "string") as ScriptCapability[]) : [],
    ...(Array.isArray(schema.tokens) ? { tokens: schema.tokens.filter((t): t is string => typeof t === "string") } : {}),
  }
  return { manifest, unmapped }
}

/** The first preset's flat item list, as a manifest's `preset` (round P). Empty when it has no items. */
function presetOf(schema: Record<string, unknown>): { preset?: ComponentManifest["preset"] } {
  const first = Array.isArray(schema.presets) ? (schema.presets[0] as Record<string, unknown> | undefined) : undefined
  if (!first || !Array.isArray(first.blocks) || !first.blocks.length) return {}
  const blocks = (first.blocks as Record<string, unknown>[]).filter((b) => b && typeof b.type === "string").map((b) => ({ type: String(b.type), ...(b.settings && typeof b.settings === "object" ? { settings: b.settings as Record<string, unknown> } : {}) }))
  if (!blocks.length) return {}
  return { preset: { ...(first.settings && typeof first.settings === "object" ? { settings: first.settings as Record<string, unknown> } : {}), blocks } }
}

/**
 * A manifest as the reader would hand it back: the group carried forward to
 * the props after it, defaults the writer fills in filled in, `responsive`
 * kept only where the control takes it. What the round trip is compared
 * against.
 */
export function normalizeManifest(m: ComponentManifest): ComponentManifest {
  const fix = (props: EditableProp[]): EditableProp[] => {
    let group: string | undefined
    return props.map((p) => {
      const q = { ...p } as EditableProp
      if (q.group) group = q.group
      else if (group) q.group = group
      if (q.responsive && !RESPONSIVE_CONTROLS.has(controlOf(q))) delete q.responsive
      if (q.kind === "animation") q.default = sectionAnimationValue(q.default)
      if (q.kind === "shadow" && q.default === undefined) q.default = "none"
      if (q.kind === "visibility" && q.default === undefined) q.default = "both"
      if (q.kind === "border" && q.default === undefined) q.default = 0
      if (q.kind === "spacing" && q.step === 4) delete q.step
      if (q.kind === "size" && q.step === 1) delete q.step
      if (q.kind === "radius" && q.max === 48) delete q.max
      if (q.kind === "image" && q.altId === `${q.id}_alt`) delete q.altId
      return q
    })
  }
  return {
    ...m,
    props: fix(m.props),
    ...(m.items ? { items: m.items.map((i) => ({ ...i, props: fix(i.props) })) } : {}),
  }
}

/* ── writing a manifest into a file, without flattening it ─────────────── */

/**
 * Merge a written settings list into the file's own: the manifest's settings
 * in its order, then every setting of the file no prop kind describes (an
 * html box, a gallery), exactly as it was. A hand-added html box survives
 * the agent rewriting the manifest; a prop the manifest dropped is dropped.
 */
function mergeSettings(written: SchemaSetting[], existing: unknown, scope: "section" | "block"): unknown[] {
  const mine = new Set(written.map((s) => s.id))
  const extras = (Array.isArray(existing) ? existing : []).filter((s): s is RawSetting => {
    if (!s || typeof s !== "object") return false
    const r = s as RawSetting
    return typeof r.id === "string" && !mine.has(r.id) && r.type !== "header" && propOf(r, scope) === null
  })
  return [...written, ...extras]
}

/**
 * The file with this manifest as its schema's settings and blocks. Every
 * other part of the file (template, style, script, presets, keys the
 * manifest does not have, settings no prop kind describes) is kept byte for
 * byte where it can be and by value where the schema JSON is rewritten.
 * Null when the file has no readable schema: nothing is guessed.
 */
export function withManifest(source: string, m: ComponentManifest): string | null {
  const match = source.match(/^([ \t]*<schema[^>]*>)([\s\S]*?)(^[ \t]*<\/schema>)/m)
  if (!match) return null
  const current = schemaJsonOf(source)
  if (!current) return null
  const written = manifestToSchema(m)
  const next: Record<string, unknown> = { ...current, ...written }
  next.settings = mergeSettings(written.settings as SchemaSetting[], current.settings, "section")
  if (Array.isArray(written.blocks)) {
    const old = Array.isArray(current.blocks) ? (current.blocks as Record<string, unknown>[]) : []
    const wroteTypes = new Set((written.blocks as { type: string }[]).map((b) => b.type))
    next.blocks = [
      ...(written.blocks as Record<string, unknown>[]).map((b) => {
        const before = old.find((o) => o?.type === b.type)
        return before ? { ...before, ...b, settings: mergeSettings(b.settings as SchemaSetting[], before.settings, "block") } : b
      }),
      /* A theme block it accepts, or a block the manifest does not name: kept. */
      ...old.filter((o) => o && !wroteTypes.has(String(o.type))),
    ]
  }
  const text = `\n${JSON.stringify(next, null, 2)}\n`
  const at = match.index ?? 0
  return source.slice(0, at) + match[1] + text + match[3] + source.slice(at + match[0].length)
}
