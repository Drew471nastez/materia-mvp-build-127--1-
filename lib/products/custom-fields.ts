/**
 * ===========================================================================
 *  A PRODUCT'S OWN FIELDS: MATERIAL, CARE, LENGTH, ISBN
 * ===========================================================================
 * Shopify calls them metafields. Here a product holds up to MAX_FIELDS named
 * values in `products.custom_fields` (supabase/sql/run-now/107), written in
 * the product editor's Custom fields card and read by every section that
 * shows the product as `fields`: `{{ block.settings.fields.material }}` on a
 * shop card, `{{ settings.product.fields.material }}` through a picker, and
 * `{{ page.product.fields.material }}` on the product page.
 *
 * One cleaner for the editor, the save and the storefront, so a name the
 * editor accepts is the name a template reads: lower case letters, digits and
 * underscores, from the label the creator typed ("Care instructions" is
 * `care_instructions`). Values are plain words, never markup.
 */

export const MAX_FIELDS = 20
export const MAX_FIELD_VALUE = 500

/** "Care instructions" → "care_instructions"; "" when nothing usable is left. */
export function fieldKey(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
}

export interface CustomField {
  key: string
  value: string
}

/** Whatever was stored or sent, as at most MAX_FIELDS named plain values, first of each name kept. */
export function cleanCustomFields(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const pairs: [string, unknown][] = Array.isArray(input)
    ? (input as { key?: unknown; value?: unknown }[]).map((f) => [String(f?.key ?? ""), f?.value])
    : input && typeof input === "object"
      ? Object.entries(input as Record<string, unknown>)
      : []
  for (const [rawKey, rawValue] of pairs) {
    if (Object.keys(out).length >= MAX_FIELDS) break
    const key = fieldKey(rawKey)
    if (!key || key in out || key === "__proto__" || key === "constructor" || key === "prototype") continue
    const value = typeof rawValue === "string" || typeof rawValue === "number" ? String(rawValue).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_VALUE) : ""
    if (value) out[key] = value
  }
  return out
}

/** The stored object as editor rows. */
export function fieldRows(stored: unknown): CustomField[] {
  return Object.entries(cleanCustomFields(stored)).map(([key, value]) => ({ key, value }))
}
