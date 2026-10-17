/**
 * ===========================================================================
 *  STORELIB REVIEWS: A CSV IMPORTED IN ONE GO
 * ===========================================================================
 * The short way in, kept for a plain `{ csv }` post to the import route: the
 * file is read by the review import engine (lib/reviews/import), its app
 * detected and its columns mapped automatically, with no mapping step and
 * no product assignment. A row whose product is not the store's, whose
 * rating is not one to five, or that has no words is skipped and counted.
 *
 * The import screen (Reviews › Import) uses the engine directly: it shows
 * the mapping, lets the creator assign unmatched products, and sends the
 * rows in chunks.
 *
 * Pure: the route does the reading and the writing.
 */
import { publicName } from "./app-settings"
import { autoMapping, detectPlatform, PRODUCT_FIELDS, type PlatformId } from "./import/platforms"
import { parseDelimited, readImportFile } from "./import/parse"
import { planReviews, ROW_ERRORS, type ImportRow } from "./import/plan"

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024

/** RFC 4180, as spreadsheets write it: quoted fields, "" inside quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  return parseDelimited(text, ",", MAX_IMPORT_ROWS).rows
}

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
  /** The rows as the engine read them, for the route to write. */
  rows: ImportRow[]
  platform: PlatformId
}

export function planImport(text: string, products: ImportProduct[]): ImportPlan {
  const table = readImportFile(text, "reviews.csv", MAX_IMPORT_ROWS)
  const headers = table?.headers ?? []
  const platform = detectPlatform(headers).platform
  const mapping = autoMapping(headers, platform)
  const missingColumns = [
    ...(PRODUCT_FIELDS.every((f) => mapping[f] < 0) ? ["product"] : []),
    ...(mapping.rating < 0 ? ["rating"] : []),
    ...(mapping.body < 0 ? ["body"] : []),
  ]
  if (!table || missingColumns.length) return { reviews: [], skipped: [], missingColumns: missingColumns.length ? missingColumns : ["product", "rating", "body"], rows: [], platform }

  const plan = planReviews(table, mapping, { platform, products })
  const skipped: ImportPlan["skipped"] = [
    ...plan.errors.map((e) => ({ row: e.line, why: e.error === ROW_ERRORS.rating ? ("bad_rating" as const) : ("no_words" as const) })),
    ...plan.unmatched.flatMap((g) => g.lines.map((row) => ({ row, why: "no_product" as const }))),
  ].sort((a, b) => a.row - b.row)
  return {
    reviews: plan.rows.map((r) => ({ productId: r.productId, rating: r.rating, title: r.title, content: r.body, name: publicName(r.author), createdAt: r.date })),
    skipped,
    missingColumns: [],
    rows: plan.rows,
    platform,
  }
}
