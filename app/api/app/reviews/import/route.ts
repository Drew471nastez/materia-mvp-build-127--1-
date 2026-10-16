import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { MAX_IMPORT_BYTES, guessMapping, importKey, parseCsv, planMappedImport, readMapping, type ImportProduct } from "@/lib/reviews/import-csv"
import { refreshReviewStats } from "@/lib/reviews/store"
import { missingColumn } from "@/lib/reviews/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * ===========================================================================
 *  REVIEWS › IMPORT
 * ===========================================================================
 *   POST { csv, mapping?, commit?, fileName? }
 *
 * Without `commit`: the plan, and nothing written. The header, the column
 * each field was found in (lib/reviews/import-csv.ts guessMapping, or the
 * mapping the store chose), the first rows as they read, and every row's
 * result: the product it matched, or why it cannot be used.
 *
 * With `commit`: the same plan, written. Each imported review is published,
 * marked imported, never "Verified buyer", and can be hidden or deleted like
 * any other. A reply in the file is the store's reply. An address in the
 * file is kept apart from the review (review_authors), so that address is
 * never sent a request for a product it already reviewed. A review the store
 * already has (the same product, words and author, importKey) is skipped, so
 * the same file imported twice adds nothing. With run-now part 204 the
 * import is kept (review_import_batches) with its report, and each review
 * names it, so a whole import can be taken back; before it the import works
 * the same and the report is only on the page.
 *
 * The store's own products only, matched by id, handle, a variant's SKU or
 * the exact title. Ratings are counted again for every product that got
 * one.
 */
type Db = any // eslint-disable-line @typescript-eslint/no-explicit-any

async function importProducts(db: Db, creatorId: string): Promise<ImportProduct[]> {
  const { data } = await db.from("products").select("id, slug, title").eq("creator_id", creatorId).neq("status", "deleted").limit(1000)
  const products = ((data ?? []) as ImportProduct[]).map((p) => ({ ...p, skus: [] as string[] }))
  if (!products.length) return products
  /* SKUs live on the variants (part 78); without that table, products match by handle and title. */
  const { data: variants, error } = await db.from("product_variants").select("product_id, sku").in("product_id", products.map((p) => p.id)).not("sku", "is", null).limit(1000)
  if (!error) {
    const byId = new Map(products.map((p) => [p.id, p]))
    for (const v of (variants ?? []) as { product_id: string; sku: string | null }[]) if (v.sku) byId.get(v.product_id)?.skus?.push(v.sku)
  }
  return products
}

/** The keys of the reviews the store already has, so a row it has is skipped. Imported ones first, any source after, up to twenty thousand. */
async function existingKeys(db: Db, creatorId: string): Promise<Set<string>> {
  const keys = new Set<string>()
  for (let i = 0; i < 20; i++) {
    const { data, error } = await db.from("reviews").select("product_id, content, reviewer_name").eq("creator_id", creatorId).order("created_at", { ascending: true }).range(i * 1000, i * 1000 + 999)
    if (error) break
    for (const r of (data ?? []) as { product_id: string; content: string; reviewer_name: string | null }[]) keys.add(importKey({ productId: r.product_id, content: r.content ?? "", name: r.reviewer_name }))
    if ((data ?? []).length < 1000) break
  }
  return keys
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  let body: { csv?: unknown; mapping?: unknown; commit?: unknown; fileName?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return physicalJson({ error: "Bad request." }, 400)
  }
  const csv = typeof body?.csv === "string" ? body.csv : ""
  const commit = body?.commit === true
  if (!csv.trim()) return physicalJson({ error: "Choose a CSV file." }, 400)
  if (csv.length > MAX_IMPORT_BYTES) return physicalJson({ error: "That file is too large. Split it into files under 4 MB." }, 413)
  const limited = await rateLimit({ bucket: commit ? "review-import" : "review-import-check", subjects: [`creator:${c.creatorId}`], windows: [{ limit: commit ? 10 : 60, seconds: 3600 }] })
  if (limited) return limited

  const rows = parseCsv(csv)
  const header = (rows[0] ?? []).map((h) => h.trim().slice(0, 80))
  if (rows.length < 2) return physicalJson({ error: "The file has no rows under its header." }, 400)
  const mapping = body?.mapping ? readMapping(body.mapping, header.length) : guessMapping(header)
  const [products, existing] = await Promise.all([importProducts(c.db, c.creatorId), existingKeys(c.db, c.creatorId)])
  const plan = planMappedImport(rows, mapping, products, existing)
  const sample = rows.slice(1, 4).map((r) => header.map((_, i) => String(r[i] ?? "").slice(0, 120)))
  const summary = { header, mapping, sample, rows: plan.rows, missingFields: plan.missingFields, total: plan.rows.length, ready: plan.reviews.length }
  if (!commit || plan.missingFields.length || plan.reviews.length === 0) return physicalJson({ ...summary, imported: 0, batchId: null })

  /* The import, kept with its report (part 204); before it, the reviews import without a batch. */
  const fileName = typeof body.fileName === "string" ? body.fileName.replace(/[\u0000-\u001f]/g, "").slice(0, 120) : null
  const skippedRows = plan.rows.filter((r) => !r.ok).map((r) => ({ row: r.row, why: r.problem }))
  const batch = await c.db
    .from("review_import_batches")
    .insert({ creator_id: c.creatorId, file_name: fileName, total: plan.rows.length, imported: 0, skipped: skippedRows.length, report: { skipped: skippedRows.slice(0, 500) } })
    .select("id")
    .maybeSingle()
  const batchId: string | null = batch.error ? null : ((batch.data as { id?: string } | null)?.id ?? null)

  const now = new Date().toISOString()
  const toRow = (r: (typeof plan.reviews)[number], withBatch: boolean) => ({
    product_id: r.productId,
    creator_id: c.creatorId,
    buyer_id: null,
    order_id: null,
    rating: r.rating,
    title: r.title || null,
    content: r.content,
    reviewer_name: r.name,
    status: "published",
    verified: false,
    source: "import",
    published_at: r.createdAt ?? now,
    ...(r.createdAt ? { created_at: r.createdAt } : {}),
    ...(r.reply ? { seller_reply: r.reply, seller_reply_at: r.createdAt ?? now } : {}),
    ...(withBatch && batchId ? { import_batch_id: batchId } : {}),
  })
  let imported = 0
  let withBatch = !!batchId
  for (let i = 0; i < plan.reviews.length; i += 200) {
    const chunk = plan.reviews.slice(i, i + 200)
    let res = await c.db.from("reviews").insert(chunk.map((r) => toRow(r, withBatch))).select("id, product_id, content, reviewer_name")
    if (res.error && withBatch && missingColumn(res.error)) {
      withBatch = false
      res = await c.db.from("reviews").insert(chunk.map((r) => toRow(r, false))).select("id, product_id, content, reviewer_name")
    }
    if (res.error) {
      const code = String((res.error as { code?: string }).code ?? "")
      const later = code === "42703" || code === "PGRST204" || code === "23514"
      if (imported === 0) return physicalJson({ error: later ? "Import turns on after the database update (SQL part 134)." : "The reviews did not import. Try again." }, later ? 409 : 500)
      break
    }
    const made = (res.data ?? []) as { id: string; product_id: string; content: string; reviewer_name: string | null }[]
    imported += made.length
    /* The addresses, apart from the public rows. */
    const byKey = new Map(chunk.map((r) => [r.key, r.email]))
    const authors = made.map((m) => ({ m, email: byKey.get(importKey({ productId: m.product_id, content: m.content, name: m.reviewer_name })) })).filter((a) => a.email)
    if (authors.length) await c.db.from("review_authors").insert(authors.map((a) => ({ review_id: a.m.id, creator_id: c.creatorId, product_id: a.m.product_id, email: a.email }))).then(() => undefined, () => undefined)
  }
  if (batchId) await c.db.from("review_import_batches").update({ imported }).eq("id", batchId)
  for (const productId of new Set(plan.reviews.map((r) => r.productId))) await refreshReviewStats(c.db, { productId })
  await refreshReviewStats(c.db, { creatorId: c.creatorId })
  return physicalJson({ ...summary, imported, batchId, skippedCount: skippedRows.length, skipped: skippedRows.slice(0, 50) })
}

/**
 *   DELETE ?batch=<id>   take a whole import back: every review it made is
 *                        deleted, with the import kept as undone (part 204).
 *                        Ratings are counted again.
 */
export async function DELETE(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const batch = new URL(request.url).searchParams.get("batch") ?? ""
  if (!/^[0-9a-f-]{36}$/i.test(batch)) return physicalJson({ error: "Bad request." }, 400)
  const { data: owned } = await c.db.from("review_import_batches").select("id").eq("id", batch).eq("creator_id", c.creatorId).maybeSingle()
  if (!owned) return physicalJson({ error: "That import is not there any more." }, 404)
  const { data: gone, error } = await c.db.from("reviews").delete().eq("creator_id", c.creatorId).eq("import_batch_id", batch).eq("source", "import").select("product_id")
  if (error) return physicalJson({ error: "The import was not taken back. Try again." }, 500)
  await c.db.from("review_import_batches").update({ undone_at: new Date().toISOString() }).eq("id", batch)
  for (const productId of new Set(((gone ?? []) as { product_id: string }[]).map((r) => r.product_id))) await refreshReviewStats(c.db, { productId })
  await refreshReviewStats(c.db, { creatorId: c.creatorId })
  return physicalJson({ removed: (gone ?? []).length })
}

/**
 *   GET   the last ten imports (part 204): when, the file, how many came in,
 *         how many were skipped, whether it was taken back. Empty before it.
 */
export async function GET() {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const { data, error } = await c.db.from("review_import_batches").select("id, file_name, total, imported, skipped, created_at, undone_at").eq("creator_id", c.creatorId).order("created_at", { ascending: false }).limit(10)
  return physicalJson({ batches: error ? [] : (data ?? []), ready: !error })
}
