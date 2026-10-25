/**
 * ===========================================================================
 *  THE PERSONALIZATION BLOCK: WHAT THE BUYER WRITES OR SENDS, AS LINE PROPERTIES
 * ===========================================================================
 * The Storelib theme's product section takes Personalization blocks
 * (themes/default/sections/product.json): a text field, a picture upload or
 * both, each with its own label, a required switch and, for text, a longest
 * length. What the buyer gives becomes the cart line's properties, named by
 * the block's labels ("Name": "Ana", "Photo": the upload's value,
 * lib/cart-uploads/rules), exactly as an imported Shopify theme's
 * `properties[Name]` are: kept on the order line, shown in the cart, at
 * checkout, on the receipt, in the emails, on the order page and on the
 * packing slip, and never read for a price.
 *
 * Pure: the block, the product section's Add to cart and the tests read it.
 */
import { LINE_PROPERTY_NAME_MAX, LINE_PROPERTY_VALUE_MAX, lineProperties } from "@/lib/physical/cart-link"
import { isUploadValue } from "@/lib/cart-uploads/rules"

export type PersonalizationKind = "text" | "image" | "text_and_image"

export interface PersonalizationField {
  /** The block's id: its values are kept under `<id>:text` and `<id>:image`. */
  id: string
  kind: PersonalizationKind
  /** The text's property name and label. */
  label: string
  /** The picture's property name and label. */
  uploadLabel: string
  placeholder: string
  required: boolean
  maxLength: number
}

const str = (v: unknown, d: string): string => (typeof v === "string" && v.trim() ? v.trim() : d)

/** A label as a property name: plain, at most 64, and never a hidden one (a name starting with "_" is the theme's own). */
function nameOf(label: string, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const n = label.replace(/[\u0000-\u001f\u007f\[\]]/g, " ").replace(/\s+/g, " ").trim().replace(/^_+/, "").slice(0, LINE_PROPERTY_NAME_MAX).trim()
  return n || fallback
}

/** The section's Personalization blocks, as fields. A hidden block asks nothing. */
export function personalizationFields(blocks: { id: string; type: string; hidden?: boolean; settings?: Record<string, unknown> }[] | undefined): PersonalizationField[] {
  return (blocks ?? [])
    .filter((b) => b.type === "personalization" && !b.hidden)
    .slice(0, 5)
    .map((b) => {
      const s = b.settings ?? {}
      const kind: PersonalizationKind = s.kind === "image" || s.kind === "text_and_image" ? s.kind : "text"
      const max = Math.round(Number(s.max_length))
      return {
        id: b.id,
        kind,
        label: nameOf(str(s.label, "Personalization"), "Personalization"),
        uploadLabel: nameOf(str(s.upload_label, "Photo"), "Photo"),
        placeholder: typeof s.placeholder === "string" ? s.placeholder.slice(0, 120) : "",
        required: s.required === true,
        maxLength: Number.isFinite(max) && max >= 1 ? Math.min(LINE_PROPERTY_VALUE_MAX, max) : 40,
      }
    })
}

export const textKey = (f: Pick<PersonalizationField, "id">) => `${f.id}:text`
export const imageKey = (f: Pick<PersonalizationField, "id">) => `${f.id}:image`

/**
 * The line's properties from what the buyer gave, and the first thing a
 * required field is still missing ("Enter Name", "Add photo"), or null.
 * Text is trimmed and held to its block's length; a picture is only ever an
 * upload's value.
 */
export function personalizationProperties(fields: PersonalizationField[], values: Record<string, string>): { properties?: Record<string, string>; missing: string | null } {
  const props: Record<string, string> = {}
  let missing: string | null = null
  for (const f of fields) {
    if (f.kind !== "image") {
      const text = String(values[textKey(f)] ?? "").replace(/\s+/g, " ").trim().slice(0, f.maxLength)
      if (text) props[f.label] = text
      else if (f.required && !missing) missing = `Enter ${f.label}`
    }
    if (f.kind !== "text") {
      const v = values[imageKey(f)]
      if (v && isUploadValue(v)) props[f.uploadLabel] = v
      else if (f.required && !missing) missing = `Add ${f.uploadLabel.charAt(0).toLowerCase()}${f.uploadLabel.slice(1)}`
    }
  }
  const properties = lineProperties(props)
  return { ...(properties ? { properties } : {}), missing }
}
