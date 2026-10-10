import { NextResponse } from "next/server"
import { isUuid, physicalJson, shopCaller } from "@/lib/physical/auth"
import { deleteTaxOverride, loadTaxSetup } from "@/lib/tax/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const done = await deleteTaxOverride(c.db, c.creatorId, id)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}
