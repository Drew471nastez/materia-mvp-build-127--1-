import { NextResponse } from "next/server"
import { physicalJson, shopCaller } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { MAX_IMPORT_BYTES, planImport, type ImportProduct } from "@/lib/reviews/import-csv"
import { refreshReviewStats } from "@/lib/reviews/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Reviews › Import: a CSV of reviews (lib/reviews/import-csv.ts says which
 * columns), for the signed in store's own products only. Each imported
 * review is published, marked imported, never "Verified buyer", and can be
 * hidden or deleted like any other. The ratings are counted again for every
 * product that got one.
 *
 *   POST { csv }   → { imported, skipped: [{ row, why }], missingColumns }
 */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const limited = await rateLimit({ bucket: "review-import", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 10, seconds: 3600 }] })
  if (limited) return limited
  let csv = ""
  try {
    const body = (await request.json()) as { csv?: unknown }
    csv = typeof body?.csv === "string" ? body.csv : ""
  } catch {
    return physicalJson({ error: "Bad request." }, 400)
  }
  if (!csv.trim()) return physicalJson({ error: "Choose a CSV file." }, 400)
  if (csv.length > MAX_IMPORT_BYTES) return physicalJson({ error: "That file is too large. Split it into files under 4 MB." }, 413)

  const { data: products } = await c.db.from("products").select("id, slug, title").eq("creator_id", c.creatorId).neq("status", "deleted").limit(5000)
  const plan = planImport(csv, (products ?? []) as ImportProduct[])
  if (plan.missingColumns.length) return physicalJson({ error: `The file needs these columns: ${plan.missingColumns.join(", ")}.`, missingColumns: plan.missingColumns }, 400)

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
  }))
  let imported = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await c.db.from("reviews").insert(rows.slice(i, i + 200)).select("id")
    if (error) {
      const code = String((error as { code?: string }).code ?? "")
      if (imported === 0) return physicalJson({ error: code === "42703" || code === "PGRST204" || code === "23514" ? "Import turns on after the database update (SQL part 134)." : "The reviews did not import. Try again." }, code === "42703" || code === "PGRST204" || code === "23514" ? 409 : 500)
      break
    }
    imported += (data ?? []).length
  }
  for (const productId of new Set(plan.reviews.map((r) => r.productId))) await refreshReviewStats(c.db, { productId })
  await refreshReviewStats(c.db, { creatorId: c.creatorId })
  return physicalJson({ imported, skipped: plan.skipped.slice(0, 50), skippedCount: plan.skipped.length })
}
