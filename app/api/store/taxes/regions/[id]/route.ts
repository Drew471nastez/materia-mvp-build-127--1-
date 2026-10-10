import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { deleteTaxRegion, loadTaxSetup, updateTaxRegion } from "@/lib/tax/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const done = await updateTaxRegion(c.db, c.creatorId, id, body)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}

/* Its product overrides go with it (ON DELETE CASCADE). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const done = await deleteTaxRegion(c.db, c.creatorId, id)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}
