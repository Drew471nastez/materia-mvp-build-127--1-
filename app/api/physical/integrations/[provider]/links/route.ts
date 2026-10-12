import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { isLinkedProvider, loadLinkRows, saveLink, scheduleStockSync, setStockSync, syncCjStock } from "@/lib/integrations/fulfilment/links-server"
import { realStockDeps } from "@/lib/integrations/fulfilment/stock-deps-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * /api/physical/integrations/<gelato|cj_dropshipping>/links
 *
 *   GET    the shop's physical variants, each with the partner product it is
 *          matched to (lib/integrations/fulfilment/links-server.ts)
 *   PUT    { variantId, providerVariantId, fileUrl?, label? }: a match,
 *          checked with the partner first; an empty providerVariantId
 *          removes it
 *   POST   { productId, stockSync }: CJ's stock for that product on or off
 *          (synced now when on), or { syncNow: true }: every product that
 *          asks for it, now
 *
 * The owner only. Saves ask the partner, so they are rate limited.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (!isLinkedProvider(provider)) return physicalJson({ error: "Not found." }, 404)
  const out = await loadLinkRows(c.db, c.creatorId, provider)
  return out.ok ? physicalJson({ rows: out.rows, locationId: out.locationId }) : physicalJson({ error: out.error }, 400)
}

export async function PUT(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (!isLinkedProvider(provider)) return physicalJson({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "partner-link-save", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 40, seconds: 60 }, { limit: 2000, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveLink(c.db, c.creatorId, provider, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  const out = await loadLinkRows(c.db, c.creatorId, provider)
  return out.ok ? physicalJson({ rows: out.rows, locationId: out.locationId }) : physicalJson({ error: out.error }, 400)
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { provider } = await params
  if (provider !== "cj_dropshipping") return physicalJson({ error: "Stock comes from CJ Dropshipping only." }, 404)
  const limited = await rateLimit({ bucket: "partner-stock-sync", subjects: [`creator:${c.creatorId}`], windows: [{ limit: 6, seconds: 60 }, { limit: 200, seconds: 86400 }] })
  if (limited) return limited
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const out =
    body.syncNow === true
      ? await syncCjStock(c.db, c.creatorId, realStockDeps)
      : typeof body.productId === "string" && typeof body.stockSync === "boolean"
        ? await setStockSync(c.db, c.creatorId, body.productId, body.stockSync, realStockDeps)
        : ({ ok: false, error: "Bad request." } as const)
  if (out.ok === false) return physicalJson({ error: out.error }, 400)
  if (body.stockSync === true || body.syncNow === true) await scheduleStockSync(c.db, c.creatorId, Date.now())
  const rows = await loadLinkRows(c.db, c.creatorId, "cj_dropshipping")
  return rows.ok ? physicalJson({ rows: rows.rows, locationId: rows.locationId, synced: out.synced }) : physicalJson({ error: rows.error }, 400)
}
