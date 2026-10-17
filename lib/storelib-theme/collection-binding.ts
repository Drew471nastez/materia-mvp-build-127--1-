/**
 * ===========================================================================
 *  A PICTURE OR A TITLE THAT IS THE PICKED COLLECTION'S UNTIL SOMEBODY SETS ONE
 * ===========================================================================
 * A collection card used to need its picture uploaded and its name typed,
 * beside the collection that already has both, and both went stale the day
 * the collection changed. Shopify connects such a setting to the collection
 * (a dynamic source) and lets the merchant disconnect it. Here a setting
 * says where its value comes from:
 *
 *   { "type": "collection_picker", "id": "collection", "label": "Collection" },
 *   { "type": "image_picker", "id": "image", "label": "Image", "from": "collection.image" },
 *   { "type": "text", "id": "title", "label": "Title", "from": "collection.title" }
 *
 * While the setting holds nothing it IS the collection's: its picture (or its
 * first product's, when it has none), its title, its description, its
 * address, read when the page is drawn, never copied, so a renamed
 * collection or a new picture is on the page at once. Set it and that value
 * is drawn instead; clear it (Reset to collection, in the sidebar) and the
 * collection's is back. `settings.collection` itself still carries every
 * field of the collection.
 *
 * Pure and browser safe: the engine resolves it (./resolve.ts), the
 * validator checks it (./schema/validate.ts), the sidebar draws it
 * (components/website-builder/editor/controls/collection-bound-field.tsx).
 */
import { resolveControlType } from "./controls/types"

/** What a setting may take from a collection, and the controls that can hold each. */
export const COLLECTION_BINDINGS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  image: ["image_picker"],
  title: ["text", "textarea", "inline_richtext"],
  description: ["text", "textarea", "inline_richtext", "richtext"],
  url: ["url"],
})

export type BindingField = keyof typeof COLLECTION_BINDINGS

/** `"collection.image"` as its two halves, or null when it is not one. */
export function parseFrom(from: unknown): { picker: string; field: BindingField } | null {
  if (typeof from !== "string") return null
  const m = /^([a-z][a-z0-9_]*)\.([a-z_]+)$/.exec(from.trim())
  if (!m || !(m[2] in COLLECTION_BINDINGS)) return null
  return { picker: m[1], field: m[2] as BindingField }
}

/** Why a setting's `from` cannot be read, in words, or null. `siblings` are the settings declared beside it. */
export function fromProblem(setting: { id: string; type: string; from?: unknown }, siblings: readonly { id: string; type: string }[]): string | null {
  if (setting.from === undefined) return null
  const parsed = parseFrom(setting.from)
  if (!parsed) return `"from" names a collection_picker beside this setting and what to take from it: "collection.image", "collection.title", "collection.description" or "collection.url"`
  const picker = siblings.find((s) => s.id === parsed.picker)
  if (!picker || resolveControlType(picker.type) !== "collection_picker") return `"${parsed.picker}" is not a collection_picker setting beside this one`
  const kind = resolveControlType(setting.type) ?? setting.type
  const takes = COLLECTION_BINDINGS[parsed.field]
  if (!takes.includes(kind)) return `a ${kind} cannot hold the collection's ${parsed.field}; that takes ${takes.join(" or ")}`
  return null
}

const empty = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "")

/** A field of a resolved collection setting: the engine's Linked value, or a plain object. */
function fieldOf(picked: unknown, field: BindingField): unknown {
  if (!picked || typeof picked !== "object") return undefined
  const fields = (picked as { fields?: Record<string, unknown> }).fields ?? (picked as Record<string, unknown>)
  return fields[field]
}

/**
 * Resolved settings with every empty bound setting filled from its picked
 * collection. A setting with a value of its own keeps it.
 */
export function withCollectionBindings(defs: readonly { id: string; from?: unknown }[], settings: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null
  for (const def of defs) {
    const parsed = parseFrom(def.from)
    if (!parsed || !empty(settings[def.id])) continue
    const value = fieldOf(settings[parsed.picker], parsed.field)
    if (typeof value !== "string" || value === "") continue
    out ??= { ...settings }
    out[def.id] = value
  }
  return out ?? settings
}

/** One of the creator's collections as the sidebar knows it. */
export interface BindableCollection {
  id: string
  title: string
  image: string
  description?: string
  url?: string
}

/**
 * What the sidebar shows for a bound setting: the collection it follows (or
 * null when none is picked, or the picked one is gone), the value it draws
 * from it, and whether a value of its own is set over it.
 */
export function boundState(
  field: { from?: unknown },
  value: unknown,
  siblings: Record<string, unknown> | null | undefined,
  collections: readonly BindableCollection[] | null | undefined,
): { collection: BindableCollection | null; fromCollection: string; overridden: boolean } | null {
  const parsed = parseFrom(field.from)
  if (!parsed) return null
  const id = siblings?.[parsed.picker]
  const key = typeof id === "string" ? id.trim().toLowerCase() : ""
  const collection = (key && collections?.find((c) => c.id.toLowerCase() === key)) || null
  const raw = collection ? (collection as unknown as Record<string, unknown>)[parsed.field] : undefined
  return { collection, fromCollection: typeof raw === "string" ? raw : "", overridden: !empty(value) }
}
