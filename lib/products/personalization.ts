/**
 * ===========================================================================
 *  PERSONALIZATION FIELDS: WHAT A BUYER TYPES OR UPLOADS FOR ONE ITEM
 * ===========================================================================
 * A product that ships can ask the buyer for something when they buy it: a
 * name to engrave, a message for a card, a photo to print. The creator sets
 * the fields in the product editor's Personalization card; they are stored
 * as a list in `products.personalization` (supabase/sql/run-now/307).
 *
 * WHAT A FIELD IS
 *   label        what the buyer is asked ("Name to engrave"). Shown exactly
 *                as typed, and the name the answer is kept under on the cart
 *                line, the order, the emails and the packing slip.
 *   type         text (one line), multiline (keeps its line breaks), image
 *                (a photo the buyer uploads: JPG, PNG or WEBP, up to 10 MB)
 *   required     the item cannot go in the cart or be paid for without it.
 *                Checked in the browser AND on the server (the cart of an
 *                imported theme, and every checkout's start).
 *   maxLength    for text: at most this many characters (1 to 250)
 *   placeholder  the grey hint in an empty box
 *   help         one short line under the box
 *
 * HOW AN ANSWER TRAVELS. As a line item property, named by the label, the
 * way Shopify themes have always sent them: `properties[Name to engrave]`.
 * The same name on the native website's cart line, the imported theme's
 * cart cookie, the checkout link, the checkout's line and the order the
 * merchant reads (lib/physical/cart-link lineProperties). Two of the same
 * item with different answers are two lines all the way to the order.
 * An uploaded photo's answer is the cart upload's value (lib/cart-uploads):
 * `/api/cart/uploads/<id>.<signature>/<name>`, the picture checked by its
 * bytes, drawn again without its metadata and kept privately for that
 * browser and that store; the checkout takes only this browser's own, and
 * once paid it is copied to the order, where the store opens and downloads
 * it. This file checks the shape; lib/cart-uploads checks whose it is.
 *
 * Pure: the editor, the website's product blocks, the buy box, the imported
 * theme's markup, the cart and the checkout all read fields with these.
 */

import { CART_UPLOAD_ACCEPT, CART_UPLOAD_MAX_BYTES, CART_UPLOAD_TYPES, isUploadValue } from "@/lib/cart-uploads/rules"

export const PERSONALIZATION_TYPES = ["text", "multiline", "image"] as const
export type PersonalizationType = (typeof PERSONALIZATION_TYPES)[number]
export const PERSONALIZATION_TYPE_LABEL: Record<PersonalizationType, string> = { text: "Text", multiline: "Long text", image: "Photo upload" }

/** Fields one product may ask for. A form longer than this is an order form, not a product. */
export const MAX_PERSONALIZATION_FIELDS = 5
/** The longest label. It is also the property's name. */
export const MAX_LABEL = 40
/** The longest answer. */
export const MAX_ANSWER = 250
export const MAX_PLACEHOLDER = 60
export const MAX_HELP = 120

/** The photos a buyer may upload, and how big: the cart uploads' own rules (lib/cart-uploads/rules). */
export const UPLOAD_TYPES = CART_UPLOAD_TYPES
export const UPLOAD_ACCEPT = CART_UPLOAD_ACCEPT
export const MAX_UPLOAD_BYTES = CART_UPLOAD_MAX_BYTES

export interface PersonalizationField {
  /** Stable across renames: what an upload names the field by. Four to sixteen letters and digits. */
  id: string
  label: string
  type: PersonalizationType
  required: boolean
  /** Text only: at most this many characters; null is MAX_ANSWER. */
  maxLength: number | null
  placeholder: string
  help: string
}

const isType = (t: unknown): t is PersonalizationType => typeof t === "string" && (PERSONALIZATION_TYPES as readonly string[]).includes(t)
const RESERVED = new Set(["__proto__", "constructor", "prototype"])

/* eslint-disable no-control-regex */
/** One line of plain text: no control characters, single spaces, trimmed. */
export function oneLine(raw: unknown, max: number): string {
  if (typeof raw !== "string" && typeof raw !== "number") return ""
  return String(raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
}

/** Text that keeps its line breaks (at most two in a row): no other control characters, each line trimmed. */
export function manyLines(raw: unknown, max: number): string {
  if (typeof raw !== "string" && typeof raw !== "number") return ""
  return String(raw)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}
/* eslint-enable no-control-regex */

/** A label as it is kept: one line, no leading underscore (Shopify hides those from the buyer), at most MAX_LABEL. */
export function cleanLabel(raw: unknown): string {
  return oneLine(raw, MAX_LABEL + 10).replace(/^_+/, "").trim().slice(0, MAX_LABEL)
}

function cleanId(raw: unknown, i: number, taken: Set<string>): string {
  let id = typeof raw === "string" && /^[a-z0-9]{4,16}$/i.test(raw) ? raw.toLowerCase() : ""
  if (!id || taken.has(id)) {
    let n = i
    do id = `f${(n++).toString(36).padStart(3, "0")}`
    while (taken.has(id))
  }
  taken.add(id)
  return id
}

function cleanMax(raw: unknown): number | null {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.min(MAX_ANSWER, Math.floor(n)) : null
}

/** Whatever was stored or sent, as at most MAX_PERSONALIZATION_FIELDS clean fields with unique labels, in order. Never throws. */
export function readPersonalization(stored: unknown): PersonalizationField[] {
  let list = stored
  if (list && typeof list === "object" && !Array.isArray(list) && Array.isArray((list as { fields?: unknown }).fields)) list = (list as { fields: unknown[] }).fields
  if (!Array.isArray(list)) return []
  const out: PersonalizationField[] = []
  const labels = new Set<string>()
  const ids = new Set<string>()
  list.forEach((raw, i) => {
    if (out.length >= MAX_PERSONALIZATION_FIELDS || !raw || typeof raw !== "object") return
    const r = raw as Record<string, unknown>
    const label = cleanLabel(r.label)
    const key = label.toLowerCase()
    if (!label || labels.has(key) || RESERVED.has(label)) return
    labels.add(key)
    const type = isType(r.type) ? r.type : "text"
    out.push({
      id: cleanId(r.id, i, ids),
      label,
      type,
      required: r.required === true,
      maxLength: type === "image" ? null : cleanMax(r.maxLength ?? r.max_length ?? r.max),
      placeholder: type === "image" ? "" : oneLine(r.placeholder, MAX_PLACEHOLDER),
      help: oneLine(r.help ?? r.help_text, MAX_HELP),
    })
  })
  return out
}

/** A new field's id: random, so two fields added in one session never share one. */
export function newFieldId(): string {
  const bytes = new Uint8Array(6)
  try {
    crypto.getRandomValues(bytes)
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => (b % 36).toString(36)).join("").padEnd(8, "0").slice(0, 8)
}

/** A blank row for the editor. */
export function blankField(type: PersonalizationType = "text"): PersonalizationField {
  return { id: newFieldId(), label: "", type, required: false, maxLength: null, placeholder: "", help: "" }
}

/** What is wrong with the editor's rows before saving, in words, or null. A row with no label and nothing else set is left out. */
export function personalizationProblem(rows: PersonalizationField[]): string | null {
  const seen = new Set<string>()
  for (const f of rows) {
    const label = cleanLabel(f.label)
    const touched = label || f.placeholder.trim() || f.help.trim() || f.required || f.maxLength
    if (!touched) continue
    if (!label) return "Give every personalization field a name"
    if (/^_/.test(f.label.trim())) return `${label} cannot start with _`
    const key = label.toLowerCase()
    if (seen.has(key)) return "Two personalization fields have the same name"
    seen.add(key)
    if (f.type !== "image" && f.maxLength !== null && (!Number.isFinite(f.maxLength) || f.maxLength < 1 || f.maxLength > MAX_ANSWER)) return `The character limit for ${label} should be 1 to ${MAX_ANSWER}`
  }
  return null
}

/** The editor's rows as they are saved: clean, ordered, the empty ones left out. */
export function storedPersonalization(rows: PersonalizationField[]): PersonalizationField[] {
  return readPersonalization(rows.filter((f) => cleanLabel(f.label)))
}

/** The longest answer a text field takes. */
export function answerLimit(f: Pick<PersonalizationField, "type" | "maxLength">): number {
  return f.type === "image" ? MAX_ANSWER : Math.min(MAX_ANSWER, f.maxLength ?? MAX_ANSWER)
}

/* ── An uploaded photo's answer ───────────────────────────────────────── */

/** Whether a property's value is a buyer's uploaded picture (lib/cart-uploads/rules): drawn as a picture rather than as words. */
export { isUploadValue }

/* ── Checking what the buyer gave ─────────────────────────────────────── */

export type AnswerProblem = { fieldId: string; label: string; code: "required" | "too_long" | "not_an_upload"; message: string }

/** The words for a problem, the same everywhere it is said. */
export function problemMessage(code: AnswerProblem["code"], label: string, limit = MAX_ANSWER): string {
  switch (code) {
    case "required":
      return `Fill in ${label}`
    case "too_long":
      return `${label} can be at most ${limit} characters`
    case "not_an_upload":
      return `Upload the photo for ${label} again`
  }
}

/**
 * A line's properties checked against its product's fields: each answer
 * cleaned for its type (one line, or kept line breaks), the required ones
 * there, none too long, a photo's answer a cart upload's value (whose it
 * is, this browser's on this store, lib/cart-uploads checkLineFiles says). Properties the fields do not name (an imported
 * theme's own, a gift message) are kept as they are, after the defined
 * ones, as the order has always kept them.
 */
export function checkAnswers(
  fields: PersonalizationField[],
  properties: Record<string, string> | null | undefined,
): { ok: true; properties: Record<string, string> } | { ok: false; problem: AnswerProblem; properties: Record<string, string> } {
  const given = properties ?? {}
  const out: Record<string, string> = {}
  let problem: AnswerProblem | null = null
  const byLabel = new Map(Object.entries(given).map(([k, v]) => [k.trim().toLowerCase(), v]))
  for (const f of fields) {
    const raw = given[f.label] ?? byLabel.get(f.label.toLowerCase()) ?? ""
    const limit = answerLimit(f)
    let value = ""
    if (f.type === "multiline") value = manyLines(raw, MAX_ANSWER + 1)
    else value = oneLine(raw, MAX_ANSWER + 1)
    if (!value) {
      if (f.required && !problem) problem = { fieldId: f.id, label: f.label, code: "required", message: problemMessage("required", f.label) }
      continue
    }
    if (f.type === "image") {
      if (!isUploadValue(value)) {
        if (!problem) problem = { fieldId: f.id, label: f.label, code: "not_an_upload", message: problemMessage("not_an_upload", f.label) }
        continue
      }
    } else if (value.length > limit) {
      if (!problem) problem = { fieldId: f.id, label: f.label, code: "too_long", message: problemMessage("too_long", f.label, limit) }
      value = value.slice(0, limit)
    }
    out[f.label] = value
  }
  const defined = new Set(fields.map((f) => f.label.toLowerCase()))
  for (const [k, v] of Object.entries(given)) {
    if (defined.has(k.trim().toLowerCase()) || k in out) continue
    out[k] = v
  }
  return problem ? { ok: false, problem, properties: out } : { ok: true, properties: out }
}

/** The answers worth keeping on a line: empty ones left out. */
export function filledAnswers(values: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(values)) if (typeof v === "string" && v.trim()) out[k] = v
  return Object.keys(out).length ? out : undefined
}

/**
 * A priced cart's lines (one per product and option) given back the answers
 * the buyer's cart lines carried: a line whose cart lines had different
 * answers becomes those cart lines again, each with its own quantity and
 * answers, so a hand-off to the checkout (a link) loses none of them. The
 * checkout's server prices and checks them again.
 */
export function itemsWithAnswers<T extends { productId: string; variantId: string | null; quantity: number }>(priced: T[], sent: unknown): (T & { properties?: Record<string, string> })[] {
  const raw = (Array.isArray(sent) ? sent.slice(0, 50) : []) as { productId?: unknown; variantId?: unknown; quantity?: unknown; properties?: unknown }[]
  const out: (T & { properties?: Record<string, string> })[] = []
  for (const item of priced) {
    const mine = raw.filter((r) => r && r.productId === item.productId && ((r.variantId ?? null) === item.variantId || !r.variantId) && r.properties && typeof r.properties === "object" && Object.keys(r.properties as object).length)
    if (!mine.length) {
      out.push(item)
      continue
    }
    let left = item.quantity
    mine.forEach((r, i) => {
      const q = i === mine.length - 1 ? left : Math.max(1, Math.min(left, Math.floor(Number(r.quantity)) || 1))
      if (q <= 0) return
      left -= q
      out.push({ ...item, quantity: q, properties: r.properties as Record<string, string> })
    })
    if (left > 0 && out.length) out[out.length - 1] = { ...out[out.length - 1], quantity: out[out.length - 1].quantity + left }
  }
  return out
}

/* ── For imported themes ──────────────────────────────────────────────── */

/** The form name an answer is posted under: Shopify's line item property. */
export function inputName(label: string): string {
  return `properties[${label}]`
}

/** What `product.metafields.storelib.personalization.value` holds for a theme: one object per field (docs/theme-contracts/personalization-and-custom-fields.md). */
export function themeFieldObjects(fields: PersonalizationField[], productId: string): Record<string, unknown>[] {
  return fields.map((f, i) => ({
    id: f.id,
    product_id: productId,
    position: i + 1,
    label: f.label,
    type: f.type === "multiline" ? "textarea" : f.type,
    required: f.required,
    max_length: f.type === "image" ? null : answerLimit(f),
    placeholder: f.placeholder,
    help_text: f.help,
    name: inputName(f.label),
    accept: f.type === "image" ? UPLOAD_ACCEPT : null,
    max_size: f.type === "image" ? MAX_UPLOAD_BYTES : null,
  }))
}
