/**
 * ===========================================================================
 *  A PRODUCT'S OWN FIELDS: MATERIAL, CARE, LENGTH, ISBN
 * ===========================================================================
 * Shopify calls them metafields. Here a product holds up to MAX_FIELDS named
 * values in `products.custom_fields` (supabase/sql/run-now/107), written in
 * the product editor's Custom fields card and read by every section that
 * shows the product as `fields`: `{{ block.settings.fields.material }}` on a
 * shop card, `{{ settings.product.fields.material }}` through a picker, and
 * `{{ page.product.fields.material }}` on the product page. Imported Shopify
 * themes read the same values as `product.metafields.custom.material`.
 *
 * One cleaner for the editor, the save and the storefront, so a name the
 * editor accepts is the name a template reads: lower case letters, digits and
 * underscores, from the label the creator typed ("Care instructions" is
 * `care_instructions`). Values are plain words, never markup.
 *
 * WHAT A FIELD IS. A label, a value, a type and whether buyers see it:
 *
 *   type   text (one line), multiline (keeps its line breaks), number, or
 *          url (a link, https or http), each checked by fieldProblem
 *   show   listed under Details on the product page (the website's Details
 *          block and the creator page's product view); off, it is only
 *          there for a theme that prints it
 *
 * Stored as `{ key: { value, label, type, show, pos } }`. A field saved before
 * types were added is a bare string, read as a text field that is not listed
 * (it never was). `cleanCustomFields` reads either shape as `{ key: value }`,
 * so every template keeps reading `fields.key` as the plain value.
 */

export const MAX_FIELDS = 20
export const MAX_FIELD_VALUE = 500

export const FIELD_TYPES = ["text", "multiline", "number", "url"] as const
export type FieldType = (typeof FIELD_TYPES)[number]
export const FIELD_TYPE_LABEL: Record<FieldType, string> = { text: "Text", multiline: "Long text", number: "Number", url: "Link" }

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

/** One row of the editor's card. `key` is the label as typed; its template name is fieldKey(key). */
export interface CustomField {
  key: string
  value: string
  type?: FieldType
  /** Listed under Details on the product page. */
  show?: boolean
}

/** What one field is stored as. */
export interface StoredField {
  value: string
  label: string
  type: FieldType
  show: boolean
  pos: number
}

const RESERVED = new Set(["__proto__", "constructor", "prototype"])
const isType = (t: unknown): t is FieldType => typeof t === "string" && (FIELD_TYPES as readonly string[]).includes(t)

/** A value made safe for its type: no control characters, trimmed, at most MAX_FIELD_VALUE; line breaks kept for long text. */
function cleanValue(raw: unknown, type: FieldType): string {
  if (typeof raw !== "string" && typeof raw !== "number") return ""
  const text = String(raw)
  if (type === "multiline") {
    return text
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
      .split("\n")
      .map((l) => l.replace(/\s+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MAX_FIELD_VALUE)
  }
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD_VALUE)
}

/** What a stored entry, old or new, says. */
function readEntry(raw: unknown, key: string, i: number): StoredField | null {
  if (typeof raw === "string" || typeof raw === "number") {
    const value = cleanValue(raw, "text")
    return value ? { value, label: labelOf(key), type: "text", show: false, pos: 1000 + i } : null
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const type = isType(r.type) ? r.type : "text"
  const value = cleanValue(r.value, type)
  if (!value) return null
  const label = typeof r.label === "string" && r.label.trim() ? cleanValue(r.label, "text").slice(0, 40) : labelOf(key)
  return { value, label, type, show: r.show === true, pos: typeof r.pos === "number" && Number.isFinite(r.pos) ? r.pos : 1000 + i }
}

/** "care_instructions" → "Care instructions", for a field saved before labels were kept. */
export function labelOf(key: string): string {
  const words = key.replace(/_+/g, " ").trim()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ""
}

/** Every field, read from whatever was stored, in the creator's order, first of each name kept. */
export function readCustomFields(stored: unknown): (StoredField & { key: string })[] {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return []
  const out: (StoredField & { key: string })[] = []
  const seen = new Set<string>()
  Object.entries(stored as Record<string, unknown>).forEach(([rawKey, raw], i) => {
    const key = fieldKey(rawKey)
    if (!key || seen.has(key) || RESERVED.has(key)) return
    const entry = readEntry(raw, key, i)
    if (!entry) return
    seen.add(key)
    out.push({ key, ...entry })
  })
  return out.sort((a, b) => a.pos - b.pos).slice(0, MAX_FIELDS)
}

/**
 * Whatever was stored or sent, as at most MAX_FIELDS named plain values,
 * first of each name kept: what templates read as `fields`. Rows from the
 * editor (an array of `{ key, value }`) are read too.
 */
export function cleanCustomFields(input: unknown): Record<string, string> {
  if (Array.isArray(input)) {
    const out: Record<string, string> = {}
    for (const f of input as Partial<CustomField>[]) {
      if (Object.keys(out).length >= MAX_FIELDS) break
      const key = fieldKey(String(f?.key ?? ""))
      if (!key || key in out || RESERVED.has(key)) continue
      const value = cleanValue(f?.value, isType(f?.type) ? f.type : "text")
      if (value) out[key] = value
    }
    return out
  }
  return Object.fromEntries(readCustomFields(input).map((f) => [f.key, f.value]))
}

/** What is wrong with a row before it is saved, in words, or null. An empty row is fine: it is left out. */
export function fieldProblem(f: CustomField): string | null {
  const label = f.key.trim()
  const value = (f.value ?? "").trim()
  if (!label && !value) return null
  if (!label || !fieldKey(label)) return "Give every custom field a name"
  if (!value) return `Fill in ${label}, or remove it`
  if (f.type === "number" && !/^-?\d+([.,]\d+)?$/.test(value.replace(/\s/g, ""))) return `${label} should be a number`
  if (f.type === "url") {
    try {
      const u = new URL(value)
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error()
    } catch {
      return `${label} should be a link starting with https://`
    }
  }
  return null
}

/** The editor's rows as they are saved: typed, ordered, the empty ones left out. Rows with a problem should be stopped before this (fieldProblem). */
export function storedCustomFields(rows: CustomField[]): Record<string, StoredField> {
  const out: Record<string, StoredField> = {}
  let pos = 0
  for (const f of rows) {
    if (Object.keys(out).length >= MAX_FIELDS) break
    const key = fieldKey(f.key)
    if (!key || key in out || RESERVED.has(key)) continue
    const type = isType(f.type) ? f.type : "text"
    let value = cleanValue(f.value, type)
    if (type === "number") value = value.replace(/\s/g, "").replace(",", ".")
    if (!value) continue
    out[key] = { value, label: cleanValue(f.key, "text").slice(0, 40), type, show: f.show !== false, pos: pos++ }
  }
  return out
}

/** The stored object as editor rows. */
export function fieldRows(stored: unknown): CustomField[] {
  return readCustomFields(stored).map((f) => ({ key: f.label, value: f.value, type: f.type, show: f.show }))
}

/** The fields a buyer is shown under Details: label, value and type, in order. */
export function shownCustomFields(stored: unknown): { key: string; label: string; value: string; type: FieldType }[] {
  return readCustomFields(stored)
    .filter((f) => f.show)
    .map(({ key, label, value, type }) => ({ key, label, value, type }))
}
