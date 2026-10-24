import { NextResponse } from "next/server"
import { isUuid, physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { deleteTaxRegion, loadTaxSetup, updateTaxRegion } from "@/lib/tax/server"
import { recordActivity, taxRegionLabel } from "@/lib/activity/log-server"
import { readinessChanged } from "@/lib/physical/readiness-server"

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
  /* Tax on with no rate is on the checklist (lib/physical/readiness): asked again now. */
  readinessChanged(c)
  const setup = await loadTaxSetup(c.db, c.creatorId)
  await recordActivity(c.db, c, { action: "tax.region_updated", subjectType: "tax_region", subjectId: id, subjectLabel: taxRegionLabel(setup.regions.find((r) => r.id === id)) })
  return physicalJson(setup)
}

/* Its product overrides go with it (ON DELETE CASCADE). */
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const { id } = await ctx.params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const before = (await loadTaxSetup(c.db, c.creatorId)).regions.find((r) => r.id === id)
  const done = await deleteTaxRegion(c.db, c.creatorId, id)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  /* Tax on with no rate is on the checklist (lib/physical/readiness): asked again now. */
  readinessChanged(c)
  await recordActivity(c.db, c, { action: "tax.region_removed", subjectType: "tax_region", subjectId: id, subjectLabel: taxRegionLabel(before) })
  return physicalJson(await loadTaxSetup(c.db, c.creatorId))
}
