/**
 * ===========================================================================
 *  STORELIB REVIEWS: REVIEWS BROUGHT IN FROM A SPREADSHEET
 * ===========================================================================
 * A CSV of reviews from another app (Judge.me's and Shopify Product Reviews'
 * exports both work) or typed by hand. One row a review. The columns are
 * found by name, in any order, under any of the names those apps use:
 *
 *   product    product_handle, handle, product, product_id, product_title, sku
 *   rating     rating, stars, score
 *   body       body, review, content, text, review_body
 *   title      title, review_title
 *   name       reviewer_name, author, name
 *   date       review_date, date, created_at
 *
 * THE STORE CAN MAP THEM ITSELF (round K5): the Reviews tab shows the
 * columns it found and lets the store point each field at another column
 * (readMapping), then previews every row before anything is written.
 *
 * A row is matched to one of the store's own products by its id, its
 * address (handle, or a product link), one of its variants' SKUs, or its
 * exact title. A row is skipped, with a sentence saying why, when it matches
 * no product, has no whole rating from one to five, has no words, or is the
 * same review as an earlier row of the file or one already on the store. An
 * imported review is never "Verified buyer" and never counts in a Storelib
 * rating: nothing here proves a purchase.
 *
 * Pure: the route does the reading and the writing.
 */
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, cleanLine, cleanReviewText, publicName } from "./app-settings"

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

/** RFC 4180, as spreadsheets write it: quoted fields, "" inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  const src = text.replace(/^﻿/, "")
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === "") quoted = true
    else if (ch === ",") {
      row.push(field)
      field = ""
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.some((c) => c.trim() !== "")) rows.push(row)
      row = []
      if (rows.length > MAX_IMPORT_ROWS + 1) break
    } else field += ch
  }
  if (field !== "" || row.length) {
    row.push(field)
    if (row.some((c) => c.trim() !== "")) rows.push(row)
  }
  return rows
}

export const IMPORT_FIELDS = ["product", "rating", "body", "title", "name", "date"] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export const REQUIRED_FIELDS: readonly ImportField[] = ["product", "rating", "body"]

const NAMES: Record<ImportField, string[]> = {
  product: ["product_handle", "handle", "product", "product_id", "product_title", "product_url", "product_sku", "sku"],
  rating: ["rating", "stars", "score", "review_score"],
  body: ["body", "review", "content", "text", "review_body", "review_content"],
  title: ["title", "review_title"],
  name: ["reviewer_name", "author", "name", "customer_name"],
  date: ["review_date", "date", "created_at", "submitted_at"],
}

const key = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

/** A field to the column it is read from (0 based); a field with no column is left out. */
export type ColumnMap = Partial<Record<ImportField, number>>

/** The columns found by their names, the way Judge.me's and Shopify's exports name them. */
export function guessMapping(header: readonly string[]): ColumnMap {
  const keys = header.map(key)
  const out: ColumnMap = {}
  for (const f of IMPORT_FIELDS) {
    const at = keys.findIndex((h) => NAMES[f].includes(h))
    if (at >= 0) out[f] = at
  }
  return out
}

/** A mapping the page sent: each field a column the file has, no column used twice. Anything else is left out. */
export function readMapping(raw: unknown, columns: number): ColumnMap | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const out: ColumnMap = {}
  const used = new Set<number>()
  for (const f of IMPORT_FIELDS) {
    const v = (raw as Record<string, unknown>)[f]
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
    if (!Number.isInteger(n) || n < 0 || n >= columns || used.has(n)) continue
    used.add(n)
    out[f] = n
  }
  return out
}

export interface ImportProduct {
  id: string
  slug: string | null
  title: string | null
  /** Its variants' SKUs, when it has any. */
  skus?: (string | null)[] | null
}

export interface ImportedReview {
  productId: string
  rating: number
  title: string
  content: string
  name: string | null
  createdAt: string | null
  /** The file's row number (the header is row 1). */
  row: number
}

export type SkipWhy = "no_product" | "bad_rating" | "no_words" | "duplicate"
export type MatchedBy = "id" | "handle" | "sku" | "title"

/** What happens to one row, as the preview and the result list it. */
export interface RowOutcome {
  row: number
  ok: boolean
  why?: SkipWhy
  /** One sentence a store can act on. */
  message?: string
  /** Something kept but changed: a date that could not be read, words cut to fit. */
  note?: string
  /** The same, as codes the page words in the store's language. */
  notes?: ("bad_date" | "cut")[]
  /** The cell that did not match or read, for the page's own sentence. */
  raw?: string
  /** The earlier row this one repeats. */
  dupOf?: number
  productId?: string
  productTitle?: string
  matchedBy?: MatchedBy
  rating?: number
  title?: string
  /** The words, cut short for the preview. */
  excerpt?: string
  name?: string | null
  createdAt?: string | null
}

export interface ImportPlan {
  reviews: ImportedReview[]
  skipped: { row: number; why: SkipWhy }[]
  missingColumns: string[]
  /** The file's header, as written. */
  header: string[]
  mapping: ColumnMap
  rows: RowOutcome[]
  /** More rows than one import takes: the rest were not read. */
  truncated: boolean
}

const FIELD_WORDS: Record<ImportField, string> = { product: "product", rating: "rating", body: "review text", title: "title", name: "name", date: "date" }
export const fieldWord = (f: ImportField) => FIELD_WORDS[f]

/** The same review, as far as a file can tell: product, stars, words and name, ignoring case and spacing. */
export function reviewFingerprint(r: { productId: string; rating: number; content: string; name?: string | null }): string {
  const squash = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim()
  return `${r.productId}|${r.rating}|${squash(r.name)}|${squash(r.content).slice(0, 500)}`
}

const quoteOf = (v: string) => (v.length > 40 ? `${v.slice(0, 40)}...` : v)

/**
 * Every row of the file, read with the store's mapping (or the guessed one),
 * matched and checked. `existing` holds the fingerprints of reviews already
 * on the store (reviewFingerprint), so importing the same file twice skips
 * every row the second time.
 */
export function planImport(text: string, products: ImportProduct[], mapping?: ColumnMap | null, existing: ReadonlySet<string> = new Set()): ImportPlan {
  const rows = parseCsv(text)
  const header = rows[0] ?? []
  const at = mapping ?? guessMapping(header)
  const missingColumns = REQUIRED_FIELDS.filter((c) => at[c] === undefined)
  const empty = { reviews: [], skipped: [], header, mapping: at, rows: [], truncated: false }
  if (missingColumns.length) return { ...empty, missingColumns: missingColumns.map(String) }

  const byId = new Map(products.map((p) => [p.id.toLowerCase(), p]))
  const bySlug = new Map(products.filter((p) => p.slug).map((p) => [String(p.slug).toLowerCase(), p]))
  const bySku = new Map<string, ImportProduct>()
  for (const p of products) for (const s of p.skus ?? []) if (s && s.trim() && !bySku.has(s.trim().toLowerCase())) bySku.set(s.trim().toLowerCase(), p)
  const byTitle = new Map(products.filter((p) => p.title).map((p) => [String(p.title).trim().toLowerCase(), p]))
  const match = (raw: string): { product: ImportProduct; by: MatchedBy } | null => {
    const v = raw.trim().toLowerCase()
    if (!v) return null
    const handle = v.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(products|p)\//, "").replace(/[/?#].*$/, "")
    const id = byId.get(v)
    if (id) return { product: id, by: "id" }
    const slug = bySlug.get(v) ?? bySlug.get(handle)
    if (slug) return { product: slug, by: "handle" }
    const sku = bySku.get(v)
    if (sku) return { product: sku, by: "sku" }
    const title = byTitle.get(v)
    return title ? { product: title, by: "title" } : null
  }
  const cell = (r: string[], f: ImportField) => (at[f] === undefined ? "" : String(r[at[f]!] ?? ""))

  const reviews: ImportedReview[] = []
  const skipped: ImportPlan["skipped"] = []
  const outcomes: RowOutcome[] = []
  const seen = new Map<string, number>()
  const skip = (row: number, why: SkipWhy, message: string, extra: Partial<RowOutcome> = {}) => {
    skipped.push({ row, why })
    outcomes.push({ row, ok: false, why, message, ...extra })
  }
  rows.slice(1, MAX_IMPORT_ROWS + 1).forEach((r, i) => {
    const line = i + 2
    const rawProduct = cell(r, "product").trim()
    const found = match(rawProduct)
    if (!found) return skip(line, "no_product", rawProduct ? `No product matches "${quoteOf(rawProduct)}". Use its handle, SKU or exact title.` : "The product is empty.", rawProduct ? { raw: quoteOf(rawProduct) } : {})
    const base = { productId: found.product.id, productTitle: found.product.title ?? undefined, matchedBy: found.by }
    const rawRating = cell(r, "rating").trim()
    const rating = Number(rawRating)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return skip(line, "bad_rating", rawRating ? `The rating "${quoteOf(rawRating)}" isn't a whole number from 1 to 5.` : "The rating is empty.", { ...base, ...(rawRating ? { raw: quoteOf(rawRating) } : {}) })
    const whole = cleanReviewText(cell(r, "body"), MAX_BODY_CHARS + 1)
    if (!whole) return skip(line, "no_words", "The review text is empty.", { ...base, rating })
    const content = whole.slice(0, MAX_BODY_CHARS)
    const rawDate = cell(r, "date").trim()
    const date = rawDate ? Date.parse(rawDate) : NaN
    const createdAt = Number.isFinite(date) && date < Date.now() + 86_400_000 ? new Date(date).toISOString() : null
    const title = cleanLine(cell(r, "title"), MAX_TITLE_CHARS)
    const name = publicName(cell(r, "name"))
    const fp = reviewFingerprint({ productId: found.product.id, rating, content, name })
    const extra = { ...base, rating, title, excerpt: content.length > 140 ? `${content.slice(0, 140)}...` : content, name, createdAt }
    if (existing.has(fp)) return skip(line, "duplicate", "This review is already on your store.", extra)
    const earlier = seen.get(fp)
    if (earlier) return skip(line, "duplicate", `Same review as row ${earlier}.`, { ...extra, dupOf: earlier })
    seen.set(fp, line)
    const codes = [...(rawDate && !createdAt ? (["bad_date"] as const) : []), ...(whole.length > MAX_BODY_CHARS ? (["cut"] as const) : [])]
    const notes = codes.map((c) => (c === "bad_date" ? "The date couldn't be read, so today's date is used." : `The text is cut to ${MAX_BODY_CHARS} characters.`))
    reviews.push({ productId: found.product.id, rating, title, content, name, createdAt, row: line })
    outcomes.push({ row: line, ok: true, ...extra, ...(notes.length ? { note: notes.join(" "), notes: codes } : {}) })
  })
  return { reviews, skipped, missingColumns: [], header, mapping: at, rows: outcomes, truncated: rows.length - 1 > MAX_IMPORT_ROWS }
}
