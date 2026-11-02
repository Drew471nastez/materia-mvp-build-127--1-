import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { createTransfer } from "@/lib/physical/inventory-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller("products", { read: true })
  if (c instanceof NextResponse) return c
  const { data } = await c.db
    .from("inventory_transfers")
    .select("id, origin_location_id, destination_location_id, status, reference, note, expected_at, shipped_at, received_at, created_at, inventory_transfer_items(id, variant_id, quantity, received_quantity)")
    .eq("creator_id", c.creatorId)
    .order("created_at", { ascending: false })
    .limit(100)
  return physicalJson({ transfers: data ?? [] })
}

export async function POST(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.originId) || !isUuid(body.destinationId)) return physicalJson({ error: "Choose where the stock goes from and to." }, 400)
  const items = Array.isArray(body.items)
    ? body.items.filter((i): i is { variantId: string; quantity: number } => isUuid((i as Record<string, unknown>)?.variantId)).map((i) => ({ variantId: i.variantId, quantity: Math.floor(Number(i.quantity) || 0) }))
    : []
  const made = await createTransfer(c.db, c.creatorId, {
    originId: body.originId as string,
    destinationId: body.destinationId as string,
    items,
    reference: typeof body.reference === "string" ? body.reference : null,
    note: typeof body.note === "string" ? body.note : null,
    expectedAt: typeof body.expectedAt === "string" ? body.expectedAt : null,
  })
  if (made.ok === false) return physicalJson({ error: made.error }, 400)
  return physicalJson({ id: made.id })
}
