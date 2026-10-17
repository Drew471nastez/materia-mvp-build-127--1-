import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { recordActivity } from "@/lib/activity/log-server"
import { applyImport, bulkFulfil, loadBulk, previewImport, type BulkResult } from "@/lib/physical/bulk-fulfil-server"
import { BULK_MAX_ORDERS, IMPORT_MAX_BYTES } from "@/lib/physical/bulk-fulfil"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Many orders at once, from the Orders list (lib/physical/bulk-fulfil-server.ts):
 *   load     the selected orders, what each has left to ship or why it can't be
 *   fulfil   mark each fulfilled with what it has left, its own carrier and tracking; answered order by order
 *   preview  what a tracking CSV would do, row by row; writes nothing
 *   import   the CSV's orders without an error, each fulfilled in its parcels
 * Owner, or a team member whose role has Orders. A CSV is capped in size and rows.
 */
export async function POST(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  /* Read with a cap: a tracking CSV rides in the body, and nothing larger than one is read. */
  const declared = Number(request.headers.get("content-length") || 0)
  if (declared > IMPORT_MAX_BYTES + 64 * 1024) return physicalJson({ error: "That file is larger than 512 KB. Split it and import each part." }, 413)
  let body: Record<string, unknown>
  try {
    const text = await request.text()
    if (text.length > IMPORT_MAX_BYTES + 64 * 1024) return physicalJson({ error: "That file is larger than 512 KB. Split it and import each part." }, 413)
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return physicalJson({ error: "Bad request." }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return physicalJson({ error: "Bad request." }, 400)
  }
  const action = body.action
  const writes = action === "fulfil" || action === "import"
  /*
    Per shop. A bulk press can email a hundred buyers, so writes are counted
    on their own and tighter than reading; the per-order limit of the order
    route still stands beside it for single presses.
  */
  const limited = writes
    ? await rateLimit({ bucket: "physical-order-bulk", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 20, seconds: 600 }, { limit: 200, seconds: 86400 }], message: "That is a lot of orders at once. Wait a few minutes and try again." })
    : await rateLimit({ bucket: "physical-order-bulk-read", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 60, seconds: 600 }, { limit: 1000, seconds: 86400 }], message: "That is a lot at once. Wait a minute and try again." })
  if (limited) return limited
  const key = typeof body.key === "string" && /^[A-Za-z0-9_-]{6,80}$/.test(body.key) ? body.key : null

  switch (action) {
    case "load": {
      const ids = (Array.isArray(body.ids) ? body.ids : []).filter(isUuid).slice(0, BULK_MAX_ORDERS)
      if (ids.length === 0) return physicalJson({ error: "Choose at least one order." }, 400)
      return physicalJson({ orders: await loadBulk(c.db, c.creatorId, ids) })
    }
    case "fulfil": {
      if (!key) return physicalJson({ error: "Bad request." }, 400)
      const orders = (Array.isArray(body.orders) ? body.orders : [])
        .map((o) => (o && typeof o === "object" ? (o as Record<string, unknown>) : {}))
        .filter((o) => isUuid(o.id))
        .slice(0, BULK_MAX_ORDERS)
        .map((o) => ({ id: o.id as string, carrier: o.carrier, trackingNumber: o.trackingNumber, trackingUrl: o.trackingUrl }))
      if (orders.length === 0) return physicalJson({ error: "Choose at least one order." }, 400)
      const results = await bulkFulfil(c.db, c.creatorId, { orders, notifyBuyer: body.notifyBuyer !== false, key })
      await logFulfilled(c, results)
      return physicalJson({ results })
    }
    case "preview": {
      if (typeof body.csv !== "string") return physicalJson({ error: "Choose a CSV file." }, 400)
      const preview = await previewImport(c.db, c.creatorId, body.csv)
      return physicalJson({ preview }, preview.error ? 400 : 200)
    }
    case "import": {
      if (!key) return physicalJson({ error: "Bad request." }, 400)
      if (typeof body.csv !== "string") return physicalJson({ error: "Choose a CSV file." }, 400)
      const { preview, results } = await applyImport(c.db, c.creatorId, body.csv, { notifyBuyer: body.notifyBuyer !== false, key })
      if (preview.error) return physicalJson({ error: preview.error, preview }, 400)
      await logFulfilled(c, results)
      return physicalJson({ preview, results })
    }
    default:
      return physicalJson({ error: "Unknown action." }, 400)
  }
}

async function logFulfilled(c: { db: unknown; creatorId: string; userId: string }, results: BulkResult[]) {
  for (const r of results) if (r.ok && r.checkoutId) await recordActivity(c.db, c, { action: "order.fulfilled", subjectType: "order", subjectId: r.checkoutId, subjectLabel: r.number })
}
