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
 * Pure. The reverse (schemaToManifest, reading a file a person edited by
 * hand) is L5's, in this file.
 */
import { ANIMATION_STYLES, type ComponentManifest, type EditableProp, type EditablePropKind, type ItemManifest, type ManifestControlType } from "./types"

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
} as const satisfies Record<string, ManifestControlType>

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
}

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

/** The settings one prop becomes: itself, and for a picture its alt text and focal point. */
export function propToSettings(p: EditableProp): SchemaSetting[] {
  const base: SchemaSetting = { type: controlOf(p), id: p.id, label: p.label }
  if (p.info) base.info = p.info
  if (p.responsive) base.responsive = true
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
    case "animation":
      base.options = [{ label: "None", value: "none" }, ...ANIMATION_STYLES.map((v) => ({ label: v, value: v }))]
      base.default = p.default ?? "none"
      break
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

/** Props in order, with a `header` field each time the group changes. */
export function propsToSettings(props: EditableProp[]): SchemaSetting[] {
  const out: SchemaSetting[] = []
  let group: string | undefined
  for (const p of props) {
    if (p.group && p.group !== group) {
      group = p.group
      out.push({ type: "header", id: `hdr_${p.group.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "group"}`, label: p.group })
    }
    out.push(...propToSettings(p))
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
    schema.blocks = m.items.map((i: ItemManifest) => ({ type: i.type, name: i.name, ...(i.limit ? { limit: i.limit } : {}), settings: propsToSettings(i.props) }))
    if (m.maxItems) schema.max_blocks = m.maxItems
  }
  if (m.capabilities.length) schema.capabilities = [...m.capabilities]
  const groups = m.placement.groups.filter((g) => g !== "body")
  if (groups.length) schema.enabled_on = { groups }
  if (m.placement.kind) schema.kind = m.placement.kind
  return schema
}
