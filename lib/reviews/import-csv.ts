/**
 * ===========================================================================
 *  STORELIB REVIEWS: REVIEWS BROUGHT IN FROM A SPREADSHEET
 * ===========================================================================
 * A CSV of reviews from another app (Judge.me's and Shopify Product Reviews'
 * exports both work) or typed by hand. One row a review. The columns are
 * found by name, in any order, under any of the names those apps use:
 *
 *   product    product_handle, handle, product, product_id, product_title
 *   rating     rating, stars, score
 *   body       body, review, content, text, review_body
 *   title      title, review_title
 *   name       reviewer_name, author, name
 *   date       review_date, date, created_at
 *
 * A row is matched to one of the store's own products by its id, its
 * address (slug) or its exact title; a row that matches none, or has no
 * whole rating from one to five, or no words, is skipped and counted. An
 * imported review is never "Verified buyer": nothing here proves a purchase.
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

const NAMES: Record<string, string[]> = {
  product: ["product_handle", "handle", "product", "product_id", "product_title", "product_url"],
  rating: ["rating", "stars", "score", "review_score"],
  body: ["body", "review", "content", "text", "review_body", "review_content"],
  title: ["title", "review_title"],
  name: ["reviewer_name", "author", "name", "customer_name"],
  date: ["review_date", "date", "created_at", "submitted_at"],
}

const key = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")

export interface ImportProduct {
  id: string
  slug: string | null
  title: string | null
}

export interface ImportedReview {
  productId: string
  rating: number
  title: string
  content: string
  name: string | null
  createdAt: string | null
}

export interface ImportPlan {
  reviews: ImportedReview[]
  skipped: { row: number; why: "no_product" | "bad_rating" | "no_words" }[]
  missingColumns: string[]
}

export function planImport(text: string, products: ImportProduct[]): ImportPlan {
  const rows = parseCsv(text)
  const header = (rows[0] ?? []).map(key)
  const col = (what: string) => header.findIndex((h) => NAMES[what].includes(h))
  const at = { product: col("product"), rating: col("rating"), body: col("body"), title: col("title"), name: col("name"), date: col("date") }
  const missingColumns = (["product", "rating", "body"] as const).filter((c) => at[c] < 0)
  if (missingColumns.length) return { reviews: [], skipped: [], missingColumns }

  const byId = new Map(products.map((p) => [p.id.toLowerCase(), p.id]))
  const bySlug = new Map(products.filter((p) => p.slug).map((p) => [String(p.slug).toLowerCase(), p.id]))
  const byTitle = new Map(products.filter((p) => p.title).map((p) => [String(p.title).trim().toLowerCase(), p.id]))
  const match = (raw: string): string | null => {
    const v = raw.trim().toLowerCase()
    if (!v) return null
    const handle = v.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(products|p)\//, "").replace(/[/?#].*$/, "")
    return byId.get(v) ?? bySlug.get(v) ?? bySlug.get(handle) ?? byTitle.get(v) ?? null
  }

  const reviews: ImportedReview[] = []
  const skipped: ImportPlan["skipped"] = []
  rows.slice(1, MAX_IMPORT_ROWS + 1).forEach((r, i) => {
    const line = i + 2
    const productId = match(r[at.product] ?? "")
    if (!productId) return void skipped.push({ row: line, why: "no_product" })
    const rating = Number(String(r[at.rating] ?? "").trim())
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return void skipped.push({ row: line, why: "bad_rating" })
    const content = cleanReviewText(r[at.body], MAX_BODY_CHARS)
    if (!content) return void skipped.push({ row: line, why: "no_words" })
    const date = at.date >= 0 ? Date.parse(String(r[at.date] ?? "").trim()) : NaN
    reviews.push({
      productId,
      rating,
      title: at.title >= 0 ? cleanLine(r[at.title], MAX_TITLE_CHARS) : "",
      content,
      name: at.name >= 0 ? publicName(r[at.name]) : null,
      createdAt: Number.isFinite(date) && date < Date.now() + 86_400_000 ? new Date(date).toISOString() : null,
    })
  })
  return { reviews, skipped, missingColumns: [] }
}
