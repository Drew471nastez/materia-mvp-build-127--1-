import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { MAX_IMPORT_BYTES, parseCsv, planImport, readMapping, reviewFingerprint, type ImportProduct, type RowOutcome } from "@/lib/reviews/import-csv"
import { refreshReviewStats } from "@/lib/reviews/store"
import { forgetReviewsManage, listImports, undoImport } from "@/lib/reviews/manage-server"
import { ROW_ERRORS } from "@/lib/reviews/import"
import { MAX_ROWS_PER_CHUNK, addToImport, finishImport, importCatalog, importRows, readPlatform, startImport } from "@/lib/reviews/import-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Reviews › Import: a CSV of reviews (lib/reviews/import-csv.ts says which
 * columns), for the signed in store's own products only, in two steps:
 *
 *   POST { csv, mapping?, preview: true }
 *        → { header, mapping, rows: [{ row, ok, why, message, ... }], counts }
 *          nothing written: every row read, matched and checked, so the
 *          store sees exactly what will happen before it does
 *   POST { csv, mapping?, fileName? }
 *        → { imported, skipped: [...], skippedCount, rows, importId }
 *          read and checked again here (the preview is never trusted), then
 *          written. A batch the database refuses marks its rows not imported.
 *   POST { action: "start", platform, fileName, totalRows } → { importId }
 *   POST { action: "rows", importId, rows: [...], copyPhotos }
 *                                         → { imported, duplicates, errors }
 *   POST { action: "finish", importId, productIds } → { import }
 *        the import screen's way (components/reviews/manage/import-dialog):
 *        the file read in the browser by the review import engine
 *        (lib/reviews/import: Judge.me, Yotpo, Loox, Stamped.io, Okendo,
 *        Shopify, Reviews.io, Trustpilot, Google, Etsy, Amazon, WooCommerce,
 *        Fera, Ali Reviews, Rivyo or any CSV, JSON or WordPress XML), sent
 *        in chunks of at most 250 rows, each read again here
 *        (lib/reviews/import-server.ts)
 *   GET  → { imports: [...], products } the last ten, to undo one, and the
 *          store's products (with their SKUs) to match rows against
 *   DELETE ?id= → that import's reviews deleted (only its own: unverified,
 *          imported, from that file)
 *
 * Each imported review is published, marked imported, never "Verified
 * buyer", and never counted in a Storelib rating (the ratings count verified
 * buyers' reviews only, part 134). The ratings are counted again for every
 * product that got one.
 */
async function storeProducts(db: any, creatorId: string): Promise<ImportProduct[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: products } = await db.from("products").select("id, slug, title").eq("creator_id", creatorId).neq("status", "deleted").limit(5000)
  const list = ((products ?? []) as ImportProduct[]).map((p) => ({ ...p, skus: [] as string[] }))
  if (list.length) {
    /* SKUs live on variants (part 78). A store without them matches by handle and title. */
    const { data: variants } = await db.from("product_variants").select("product_id, sku").in("product_id", list.map((p) => p.id).slice(0, 1000)).not("sku", "is", null).limit(10000)
    const byId = new Map(list.map((p) => [p.id, p]))
    for (const v of (variants ?? []) as { product_id: string; sku: string | null }[]) if (v.sku) byId.get(v.product_id)?.skus.push(v.sku)
  }
  return list
}

/** Fingerprints of the imported and visitor reviews already on these products, so a file imported twice skips its rows the second time. */
async function existingFingerprints(db: any, creatorId: string, productIds: string[]): Promise<Set<string>> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const out = new Set<string>()
  if (!productIds.length) return out
  const { data } = await db.from("reviews").select("product_id, rating, content, reviewer_name").eq("creator_id", creatorId).in("product_id", productIds.slice(0, 1000)).eq("source", "import").limit(10000)
  for (const r of (data ?? []) as { product_id: string; rating: number; content: string; reviewer_name: string | null }[]) out.add(reviewFingerprint({ productId: r.product_id, rating: r.rating, content: r.content, name: r.reviewer_name }))
  return out
}

const counts = (rows: RowOutcome[]) => ({ ok: rows.filter((r) => r.ok).length, skipped: rows.filter((r) => !r.ok).length })

export async function POST(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  if (typeof body.action === "string") return chunked(c, body)
  const preview = body.preview === true
  if (!preview) {
    const limited = await rateLimit({ bucket: "review-import", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 10, seconds: 3600 }] })
    if (limited) return limited
  }
  const csv = typeof body.csv === "string" ? body.csv : ""
  if (!csv.trim()) return physicalJson({ error: "Choose a CSV file." }, 400)
  if (csv.length > MAX_IMPORT_BYTES) return physicalJson({ error: "That file is too large. Split it into files under 4 MB." }, 413)

  const header = parseCsv(csv.slice(0, 20_000))[0] ?? []
  const mapping = body.mapping === undefined ? null : readMapping(body.mapping, header.length)
  const products = await storeProducts(c.db, c.creatorId)
  const first = planImport(csv, products, mapping)
  if (first.missingColumns.length) {
    const words: Record<string, string> = { product: "product", rating: "rating", body: "review text" }
    return physicalJson({ error: `Pick a column for: ${first.missingColumns.map((m) => words[m] ?? m).join(", ")}.`, missingColumns: first.missingColumns, header: first.header, mapping: first.mapping }, 400)
  }
  const plan = planImport(csv, products, mapping, await existingFingerprints(c.db, c.creatorId, [...new Set(first.reviews.map((r) => r.productId))]))
  if (preview) return physicalJson({ header: plan.header, mapping: plan.mapping, rows: plan.rows, counts: counts(plan.rows), truncated: plan.truncated })
  if (plan.reviews.length === 0) return physicalJson({ imported: 0, skipped: plan.skipped.slice(0, 50), skippedCount: plan.skipped.length, rows: plan.rows, importId: null })

  /* The import's own row (part 215), so it can be listed and undone. Before that part, the reviews go in without one. */
  const fileName = typeof body.fileName === "string" ? body.fileName.replace(/[\u0000-\u001f]/g, "").slice(0, 200) : null
  const made = await c.db.from("review_imports").insert({ creator_id: c.creatorId, file_name: fileName, imported: 0, skipped: plan.skipped.length }).select("id").single()
  const importId: string | null = made.error ? null : (made.data?.id ?? null)

  const rows = plan.reviews.map((r) => ({
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
    published_at: r.createdAt ?? new Date().toISOString(),
    ...(r.createdAt ? { created_at: r.createdAt } : {}),
    ...(importId ? { import_id: importId } : {}),
  }))
  const outcome = new Map(plan.rows.map((r) => [r.row, r]))
  let imported = 0
  let firstError: string | null = null
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200)
    const { data, error } = await c.db.from("reviews").insert(batch).select("id")
    if (error) {
      const code = String((error as { code?: string }).code ?? "")
      firstError ??= code === "42703" || code === "PGRST204" || code === "23514" ? "Import turns on after the database update (SQL part 134)." : "The reviews did not import. Try again."
      for (const r of plan.reviews.slice(i, i + 200)) {
        const o = outcome.get(r.row)
        if (o) Object.assign(o, { ok: false, message: "The database did not take this row. Try the import again." })
      }
      continue
    }
    imported += (data ?? []).length
  }
  if (imported === 0 && firstError) {
    if (importId) await c.db.from("review_imports").delete().eq("id", importId)
    return physicalJson({ error: firstError }, firstError.includes("part 134") ? 409 : 500)
  }
  const report = plan.rows.map((r) => ({ row: r.row, ok: r.ok, ...(r.ok ? {} : { message: r.message ?? null }) })).slice(0, 2000)
  if (importId) await c.db.from("review_imports").update({ imported, skipped: plan.rows.length - imported, report }).eq("id", importId)
  for (const productId of new Set(plan.reviews.map((r) => r.productId))) await refreshReviewStats(c.db, { productId })
  await refreshReviewStats(c.db, { creatorId: c.creatorId })
  forgetReviewsManage(c.creatorId)
  const skippedRows = plan.rows.filter((r) => !r.ok)
  return physicalJson({ imported, skipped: plan.skipped.slice(0, 50), skippedCount: skippedRows.length, rows: plan.rows, importId })
}

export async function GET() {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const [history, products] = await Promise.all([listImports(c.db, c.creatorId), importCatalog(c.db, c.creatorId)])
  return physicalJson({ ...history, products })
}

/** The import screen's chunks: start, rows, finish (lib/reviews/import-server.ts). */
async function chunked(c: { creatorId: string; userId: string; db: any }, body: Record<string, unknown>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const importId = typeof body.importId === "string" ? body.importId : null
  if (body.action === "start") {
    const limited = await rateLimit({ bucket: "review-import", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 3600 }] })
    if (limited) return limited
    const started = await startImport(c.db, { creatorId: c.creatorId, userId: c.userId, platform: readPlatform(body.platform), fileName: typeof body.fileName === "string" ? body.fileName : "", totalRows: Number(body.totalRows) || 0 }).catch(() => null)
    if (!started) return physicalJson({ error: "The import did not start. Try again." }, 500)
    return physicalJson({ importId: started.id, level: started.level })
  }
  if (body.action === "rows") {
    const limited = await rateLimit({ bucket: "review-import-rows", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 600, seconds: 3600 }] })
    if (limited) return limited
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length > MAX_ROWS_PER_CHUNK) return physicalJson({ error: `Send at most ${MAX_ROWS_PER_CHUNK} rows at a time.` }, 413)
    const result = await importRows(c.db, { creatorId: c.creatorId, importId, rows, copyPhotos: body.copyPhotos === true, platform: readPlatform(body.platform) })
    if ("error" in result) return physicalJson({ error: result.error }, result.status)
    /* What the browser set aside before sending (lib/reviews/import planReviews), counted with the first chunk: only numbers and known errors. */
    const count = (v: unknown) => Math.max(0, Math.min(1_000_000, Math.floor(Number(v) || 0)))
    const known = new Set<string>(Object.values(ROW_ERRORS))
    const planErrors = (Array.isArray(body.planErrors) ? body.planErrors : [])
      .slice(0, 50)
      .map((e) => ({ line: count((e as { line?: unknown })?.line), error: String((e as { error?: unknown })?.error ?? "") }))
      .filter((e) => known.has(e.error))
    await addToImport(c.db, c.creatorId, importId, { imported: result.imported, duplicates: result.duplicates + count(body.duplicates), skipped: count(body.skipped), errors: [...planErrors, ...result.errors], extraErrors: Math.max(0, count(body.planErrorCount) - planErrors.length) })
    return physicalJson(result)
  }
  if (body.action === "finish") {
    const productIds = Array.isArray(body.productIds) ? (body.productIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5000) : []
    const record = await finishImport(c.db, c.creatorId, importId, productIds)
    forgetReviewsManage(c.creatorId)
    return physicalJson({ import: record })
  }
  return physicalJson({ error: "Bad request." }, 400)
}

export async function DELETE(request: Request) {
  const c = await shopCaller("products")
  if (c instanceof NextResponse) return c
  const id = new URL(request.url).searchParams.get("id")
  if (!isUuid(id)) return physicalJson({ error: "Bad request." }, 400)
  const out = await undoImport(c.db, c.creatorId, id)
  if (!out.ok) return physicalJson({ error: out.error }, out.status)
  for (const productId of out.productIds) await refreshReviewStats(c.db, { productId })
  await refreshReviewStats(c.db, { creatorId: c.creatorId })
  return physicalJson({ removed: out.removed })
}
