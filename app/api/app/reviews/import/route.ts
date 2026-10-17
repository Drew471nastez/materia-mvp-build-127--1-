import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { MAX_IMPORT_BYTES, planImport } from "@/lib/reviews/import-csv"
import { ROW_ERRORS } from "@/lib/reviews/import"
import { IMPORT_NEEDS_PART, MAX_ROWS_PER_CHUNK, addToImport, finishImport, importCatalog, importRows, listImports, readPlatform, startImport } from "@/lib/reviews/import-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * ===========================================================================
 *  REVIEWS › IMPORT
 * ===========================================================================
 * Reviews from another app, for the signed in store's own products only
 * (lib/reviews/import-server.ts says how each step writes).
 *
 *   GET                                   → { products, imports, ready }
 *        the store's products to match rows against, its last imports, and
 *        whether import history (run-now part 212) is there
 *   POST { action: "start", platform, fileName, totalRows } → { importId }
 *   POST { action: "rows", importId, rows: [...], copyPhotos, skipped }
 *                                         → { imported, duplicates, errors }
 *        at most 250 rows a call, each read again on the server
 *   POST { action: "finish", importId, productIds } → { import }
 *   POST { csv }                          → { imported, duplicates, skipped, skippedCount }
 *        the short way: a CSV imported in one go with its columns found by
 *        name (lib/reviews/import-csv.ts)
 *
 * Undo is DELETE /api/app/reviews/import/<id>.
 */
const MAX_REQUEST_BYTES = 6 * 1024 * 1024

export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const [products, history] = await Promise.all([importCatalog(c.db, c.creatorId), listImports(c.db, c.creatorId)])
  return physicalJson({ products, imports: history.imports, ready: history.ready, needs: history.ready ? null : IMPORT_NEEDS_PART })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  if (Number(request.headers.get("content-length") ?? 0) > MAX_REQUEST_BYTES) return physicalJson({ error: "That is too much for one request." }, 413)
  let body: Record<string, unknown> = {}
  try {
    const parsed = await request.json()
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return physicalJson({ error: "Bad request." }, 400)
  }

  if (typeof body.csv === "string" || !body.action) return importCsv(c, body)

  if (body.action === "start") {
    const limited = await rateLimit({ bucket: "review-import", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 3600 }] })
    if (limited) return limited
    const started = await startImport(c.db, { creatorId: c.creatorId, userId: c.userId, platform: readPlatform(body.platform), fileName: typeof body.fileName === "string" ? body.fileName : "", totalRows: Number(body.totalRows) || 0 }).catch(() => null)
    if (!started) return physicalJson({ error: "The import did not start. Try again." }, 500)
    return physicalJson({ importId: started.id, ready: started.ready, needs: started.ready ? null : IMPORT_NEEDS_PART })
  }

  if (body.action === "rows") {
    const limited = await rateLimit({ bucket: "review-import-rows", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 600, seconds: 3600 }] })
    if (limited) return limited
    const rows = Array.isArray(body.rows) ? body.rows : []
    if (rows.length > MAX_ROWS_PER_CHUNK) return physicalJson({ error: `Send at most ${MAX_ROWS_PER_CHUNK} rows at a time.` }, 413)
    const importId = typeof body.importId === "string" ? body.importId : null
    const result = await importRows(c.db, { creatorId: c.creatorId, importId, rows, copyPhotos: body.copyPhotos === true })
    if ("error" in result) return physicalJson({ error: result.error }, result.status)
    /* What the browser set aside before sending (lib/reviews/import planReviews), counted with the first chunk: only numbers and known errors. */
    const count = (v: unknown) => Math.max(0, Math.min(1_000_000, Math.floor(Number(v) || 0)))
    const known = new Set<string>(Object.values(ROW_ERRORS))
    const planErrors = (Array.isArray(body.planErrors) ? body.planErrors : [])
      .slice(0, 50)
      .map((e) => ({ line: count((e as { line?: unknown })?.line), error: String((e as { error?: unknown })?.error ?? "") }))
      .filter((e) => known.has(e.error))
    const otherErrors = Math.max(0, count(body.planErrorCount) - planErrors.length)
    await addToImport(c.db, c.creatorId, importId, { imported: result.imported, duplicates: result.duplicates + count(body.duplicates), skipped: count(body.skipped), errors: [...planErrors, ...result.errors], extraErrors: otherErrors })
    return physicalJson(result)
  }

  if (body.action === "finish") {
    const importId = typeof body.importId === "string" ? body.importId : null
    const productIds = Array.isArray(body.productIds) ? (body.productIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 5000) : []
    const record = await finishImport(c.db, c.creatorId, importId, productIds)
    return physicalJson({ import: record })
  }

  return physicalJson({ error: "Bad request." }, 400)
}

async function importCsv(c: { creatorId: string; userId: string; db: unknown }, body: Record<string, unknown>) {
  const db = c.db as never
  const limited = await rateLimit({ bucket: "review-import", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 3600 }] })
  if (limited) return limited
  const csv = typeof body.csv === "string" ? body.csv : ""
  if (!csv.trim()) return physicalJson({ error: "Choose a CSV file." }, 400)
  if (csv.length > MAX_IMPORT_BYTES) return physicalJson({ error: "That file is too large. Split it into files under 4 MB." }, 413)

  const products = await importCatalog(db, c.creatorId)
  const plan = planImport(csv, products)
  if (plan.missingColumns.length) return physicalJson({ error: `The file needs these columns: ${plan.missingColumns.join(", ")}.`, missingColumns: plan.missingColumns }, 400)

  const started = await startImport(db, { creatorId: c.creatorId, userId: c.userId, platform: plan.platform, fileName: typeof body.fileName === "string" ? body.fileName : "reviews.csv", totalRows: plan.rows.length + plan.skipped.length }).catch(() => ({ id: null, ready: false }))
  let imported = 0
  let duplicates = 0
  const errors: { line: number; error: string }[] = []
  for (let i = 0; i < plan.rows.length; i += MAX_ROWS_PER_CHUNK) {
    const result = await importRows(db, { creatorId: c.creatorId, importId: started.id, rows: plan.rows.slice(i, i + MAX_ROWS_PER_CHUNK), copyPhotos: false })
    if ("error" in result) {
      if (imported === 0) return physicalJson({ error: result.error }, result.status)
      break
    }
    imported += result.imported
    duplicates += result.duplicates
    errors.push(...result.errors)
  }
  await addToImport(db, c.creatorId, started.id, { imported, duplicates, skipped: plan.skipped.length, errors })
  await finishImport(db, c.creatorId, started.id, plan.rows.map((r) => r.productId))
  return physicalJson({ imported, duplicates, importId: started.id, skipped: plan.skipped.slice(0, 50), skippedCount: plan.skipped.length })
}
