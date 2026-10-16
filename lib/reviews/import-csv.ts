/**
 * ===========================================================================
 *  STORELIB REVIEWS: REVIEWS BROUGHT IN FROM A SPREADSHEET
 * ===========================================================================
 * A CSV of reviews from another app (Judge.me's, Shopify Product Reviews'
 * and Yotpo's exports all work) or typed into the template. One row a
 * review. Reviews › Import reads the header, guesses which column is which
 * (guessMapping, under any of the names those apps use) and lets the store
 * change any of it before anything is written:
 *
 *   product    product_handle, handle, product, product_id, product_title,
 *              product_url, product_sku, sku
 *   rating     rating, stars, score
 *   body       body, review, content, text, review_body
 *   title      title, review_title
 *   name       reviewer_name, author, name
 *   email      reviewer_email, email
 *   date       review_date, date, created_at
 *   reply      reply, store_reply, merchant_reply
 *
 * A row is matched to one of the store's own products by its id, its handle
 * (or a link to it), a variant's SKU, or its exact title, in that order. A
 * title two products share matches neither. Every row the plan cannot use
 * says why, in words a store can act on (ROW_PROBLEMS), and so does every
 * row that is already in the store: a review is the same review when its
 * product, its words and its author are (importKey), so importing the same
 * file twice adds nothing the second time, and a file that repeats a row
 * imports it once.
 *
 * An imported review is never "Verified buyer": nothing here proves a
 * purchase. Pure: the route does the reading and the writing.
 */
import { MAX_BODY_CHARS, MAX_TITLE_CHARS, cleanEmail, cleanLine, cleanReviewText, publicName } from "./app-settings"
import { MAX_REPLY_CHARS } from "./rules"

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

/** The delimiter a spreadsheet wrote: a comma, or the semicolon Excel uses where a comma is the decimal mark. */
export function sniffDelimiter(text: string): "," | ";" | "\t" {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? ""
  const count = (c: string) => first.split(c).length - 1
  const tabs = count("\t")
  const semis = count(";")
  const commas = count(",")
  if (tabs > commas && tabs > semis) return "\t"
  return semis > commas ? ";" : ","
}

/** RFC 4180, as spreadsheets write it: quoted fields, "" inside quotes, CRLF or LF. */
export function parseCsv(text: string, delimiter: string = sniffDelimiter(text)): string[][] {
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
    else if (ch === delimiter) {
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

export const IMPORT_FIELDS = ["product", "rating", "body", "title", "name", "email", "date", "reply"] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
/** The three a review cannot do without. */
export const REQUIRED_FIELDS: readonly ImportField[] = ["product", "rating", "body"]

const NAMES: Record<ImportField, string[]> = {
  product: ["product_handle", "handle", "product", "product_id", "product_title", "product_url", "product_sku", "sku", "product_name"],
  rating: ["rating", "stars", "score", "review_score", "review_rating"],
  body: ["body", "review", "content", "text", "review_body", "review_content", "review_text", "comment"],
  title: ["title", "review_title", "headline"],
  name: ["reviewer_name", "author", "name", "customer_name", "display_name", "reviewer"],
  email: ["reviewer_email", "email", "customer_email", "author_email"],
  date: ["review_date", "date", "created_at", "submitted_at", "published_at"],
  reply: ["reply", "store_reply", "merchant_reply", "reply_content", "shop_reply"],
}

const key = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

/** Which column holds what, by the column's place in the header. */
export type ColumnMapping = Partial<Record<ImportField, number>>

/** The header read the way the apps name their columns. A column is used once; the first name in each list wins. */
export function guessMapping(header: readonly string[]): ColumnMapping {
  const keys = header.map(key)
  const used = new Set<number>()
  const out: ColumnMapping = {}
  for (const field of IMPORT_FIELDS) {
    for (const name of NAMES[field]) {
      const at = keys.findIndex((k, i) => k === name && !used.has(i))
      if (at >= 0) {
        out[field] = at
        used.add(at)
        break
      }
    }
  }
  return out
}

/** A mapping sent by the page, kept only where it names a real column, each column once. */
export function readMapping(raw: unknown, columns: number): ColumnMapping {
  const out: ColumnMapping = {}
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out
  const used = new Set<number>()
  for (const field of IMPORT_FIELDS) {
    const v = (raw as Record<string, unknown>)[field]
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN
    if (Number.isInteger(n) && n >= 0 && n < columns && !used.has(n)) {
      out[field] = n
      used.add(n)
    }
  }
  return out
}

export interface ImportProduct {
  id: string
  slug: string | null
  title: string | null
  /** Its variants' SKUs (product_variants.sku). */
  skus?: string[] | null
}

export interface ImportedReview {
  productId: string
  rating: number
  title: string
  content: string
  name: string | null
  createdAt: string | null
  /** Kept apart from the public row (review_authors), so the address is never asked for a review it already wrote. */
  email?: string | null
  reply?: string | null
  /** The same review, whichever file it came from (importKey). */
  key?: string
}

export type RowProblem = "no_product" | "ambiguous_product" | "bad_rating" | "no_words" | "duplicate_in_file" | "already_imported"

/** What each problem means, as the result report says it. */
export const ROW_PROBLEMS: Record<RowProblem, string> = {
  no_product: "No product with that handle, SKU, id or title",
  ambiguous_product: "Two products have that title. Use the handle or SKU",
  bad_rating: "The rating is not a whole number from 1 to 5",
  no_words: "The review text is empty",
  duplicate_in_file: "The same review is on an earlier row",
  already_imported: "This review is already in your store",
}

export interface RowResult {
  /** The row's line in the file, the header being line 1. */
  row: number
  ok: boolean
  problem?: RowProblem
  /** What the row said, for the report: the product as written, and the rating as written. */
  product?: string
  rating?: string
  productId?: string
  /** Imported with a note: a date that could not be read, words cut to the length a review takes. */
  notes?: ("bad_date" | "cut")[]
}

export interface MappedPlan {
  reviews: ImportedReview[]
  rows: RowResult[]
  missingFields: ImportField[]
}

/** A short stable hash (FNV-1a, 64 bits as hex): the key fits a column and an index. */
function hash(text: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x811c9dc5) >>> 0
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
}

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, " ").trim()

/** One review, whichever file brought it: its product, its words and its author, with case, spacing and punctuation set aside. */
export function importKey(r: { productId: string; content: string; name?: string | null }): string {
  return `imp_${hash(`${r.productId}\n${norm(r.content)}\n${norm(r.name)}`)}`
}

/** A rating as files write it: 4, "4", "4.0", "4/5", "4 stars", "★★★★". Null when it is not a whole star from one to five. */
export function readRating(raw: unknown): number | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  if (/^★{1,5}☆*$/.test(s)) return s.replace(/☆/g, "").length
  const m = s.match(/^(\d+(?:[.,]0+)?)\s*(?:\/\s*5|stars?|out of 5)?$/i)
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null
}

/** A date as files write it, in the past or today. Null when it cannot be read. */
export function readImportDate(raw: unknown, now = Date.now()): string | null {
  const s = String(raw ?? "").trim()
  if (!s) return null
  /* 31/12/2025 and 31.12.2025, which Date.parse reads as months first or not at all. */
  const eu = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  const t = eu && Number(eu[1]) > 12 ? Date.UTC(Number(eu[3]), Number(eu[2]) - 1, Number(eu[1])) : Date.parse(s)
  return Number.isFinite(t) && t < now + 86_400_000 && t > Date.UTC(2000, 0, 1) ? new Date(t).toISOString() : null
}

/** Finds the store's product a cell names: id, handle or a link to it, a SKU, the exact title. */
export function productMatcher(products: readonly ImportProduct[]): (raw: string) => { id: string } | { problem: "no_product" | "ambiguous_product" } {
  const byId = new Map(products.map((p) => [p.id.toLowerCase(), p.id]))
  const bySlug = new Map(products.filter((p) => p.slug).map((p) => [String(p.slug).toLowerCase(), p.id]))
  const bySku = new Map<string, string | null>()
  for (const p of products) for (const sku of p.skus ?? []) {
    const k = String(sku).trim().toLowerCase()
    if (!k) continue
    bySku.set(k, bySku.has(k) && bySku.get(k) !== p.id ? null : p.id)
  }
  const byTitle = new Map<string, string | null>()
  for (const p of products) {
    const k = String(p.title ?? "").trim().toLowerCase()
    if (!k) continue
    byTitle.set(k, byTitle.has(k) && byTitle.get(k) !== p.id ? null : p.id)
  }
  return (raw: string) => {
    const v = raw.trim().toLowerCase()
    if (!v) return { problem: "no_product" }
    const handle = v.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(?:collections\/[^/]+\/)?(products|p)\//, "").replace(/[/?#].*$/, "")
    const direct = byId.get(v) ?? bySlug.get(v) ?? bySlug.get(handle)
    if (direct) return { id: direct }
    for (const map of [bySku, byTitle]) {
      if (!map.has(v)) continue
      const id = map.get(v)
      return id ? { id } : { problem: "ambiguous_product" }
    }
    return { problem: "no_product" }
  }
}

/**
 * Every row of the file, against the store's products and the keys of the
 * reviews it already has. Rows past MAX_IMPORT_ROWS are not read.
 */
export function planMappedImport(rows: readonly string[][], mapping: ColumnMapping, products: readonly ImportProduct[], existing: ReadonlySet<string> = new Set(), now = Date.now()): MappedPlan {
  const missingFields = REQUIRED_FIELDS.filter((f) => mapping[f] === undefined)
  if (missingFields.length) return { reviews: [], rows: [], missingFields }
  const cell = (r: readonly string[], f: ImportField) => (mapping[f] === undefined ? "" : String(r[mapping[f] as number] ?? ""))
  const match = productMatcher(products)
  const seen = new Set<string>()
  const reviews: ImportedReview[] = []
  const results: RowResult[] = []
  rows.slice(1, MAX_IMPORT_ROWS + 1).forEach((r, i) => {
    const line = i + 2
    const product = cell(r, "product").trim().slice(0, 120)
    const ratingRaw = cell(r, "rating").trim().slice(0, 20)
    const base = { row: line, product, rating: ratingRaw }
    const found = match(product)
    if ("problem" in found) return void results.push({ ...base, ok: false, problem: found.problem })
    const rating = readRating(ratingRaw)
    if (rating === null) return void results.push({ ...base, ok: false, problem: "bad_rating", productId: found.id })
    const full = cleanReviewText(cell(r, "body"), MAX_BODY_CHARS + 1)
    if (!full) return void results.push({ ...base, ok: false, problem: "no_words", productId: found.id })
    const notes: RowResult["notes"] = []
    const content = full.slice(0, MAX_BODY_CHARS)
    if (full.length > MAX_BODY_CHARS) notes.push("cut")
    const name = publicName(cell(r, "name"))
    const dateRaw = cell(r, "date").trim()
    const createdAt = readImportDate(dateRaw, now)
    if (dateRaw && !createdAt) notes.push("bad_date")
    const k = importKey({ productId: found.id, content, name })
    if (existing.has(k)) return void results.push({ ...base, ok: false, problem: "already_imported", productId: found.id })
    if (seen.has(k)) return void results.push({ ...base, ok: false, problem: "duplicate_in_file", productId: found.id })
    seen.add(k)
    const reply = cleanReviewText(cell(r, "reply"), MAX_REPLY_CHARS)
    reviews.push({
      productId: found.id,
      rating,
      title: cleanLine(cell(r, "title"), MAX_TITLE_CHARS),
      content,
      name,
      createdAt,
      email: cleanEmail(cell(r, "email")),
      reply: reply || null,
      key: k,
    })
    results.push({ ...base, ok: true, productId: found.id, ...(notes.length ? { notes } : {}) })
  })
  return { reviews, rows: results, missingFields: [] }
}

export interface ImportPlan {
  reviews: ImportedReview[]
  skipped: { row: number; why: RowProblem }[]
  missingColumns: string[]
}

/** The whole file with the guessed columns: what the import did before the mapping step, and what the tests read. */
export function planImport(text: string, products: ImportProduct[], existing: ReadonlySet<string> = new Set()): ImportPlan {
  const rows = parseCsv(text)
  const plan = planMappedImport(rows, guessMapping(rows[0] ?? []), products, existing)
  return { reviews: plan.reviews, skipped: plan.rows.filter((r) => !r.ok).map((r) => ({ row: r.row, why: r.problem as RowProblem })), missingColumns: plan.missingFields }
}

/** Reviews › Import › Download the template: every column the import reads, and two rows to copy. */
export const IMPORT_TEMPLATE_CSV = [
  "product_handle,rating,title,body,reviewer_name,reviewer_email,review_date,reply",
  'linen-apron,5,Exactly right,"Thick linen, deep pockets and it washes well.",Maya Rivers,maya@example.com,2026-03-14,Thank you Maya!',
  "LA-NAT-M,4,,Good apron. The straps run a little long.,Jonas,,2026-02-02,",
].join("\r\n") + "\r\n"
