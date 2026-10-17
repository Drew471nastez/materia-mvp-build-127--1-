import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { cancelTransfer, receiveTransfer, shipTransfer } from "@/lib/physical/inventory-server"
import { readinessChanged } from "@/lib/physical/readiness-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** ship, receive (all or some) or cancel a transfer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  const action = body?.action
  if (action === "ship") {
    const r = await shipTransfer(c.db, c.creatorId, id, c.userId)
    if (r.ok) readinessChanged(c, { recheck: false })
    return r.ok ? physicalJson({ ok: true }) : physicalJson({ error: r.error }, 400)
  }
  if (action === "receive") {
    const items = Array.isArray(body?.items) ? (body!.items as { itemId: string; quantity: number }[]).filter((i) => isUuid(i?.itemId)).slice(0, 200) : []
    const r = await receiveTransfer(c.db, c.creatorId, id, items, c.userId)
    return r.ok ? physicalJson({ ok: true, status: r.status }) : physicalJson({ error: r.error }, 400)
  }
  if (action === "cancel") {
    const r = await cancelTransfer(c.db, c.creatorId, id, c.userId)
    return r.ok ? physicalJson({ ok: true }) : physicalJson({ error: r.error }, 400)
  }
  return physicalJson({ error: "Unknown action." }, 400)
}
