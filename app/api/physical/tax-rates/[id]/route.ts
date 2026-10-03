import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson } from "@/lib/physical/auth"
import { loadTaxRates } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  await c.db.from("commerce_tax_rates").delete().eq("id", id).eq("creator_id", c.creatorId)
  return physicalJson({ taxRates: await loadTaxRates(c.db, c.creatorId) })
}
