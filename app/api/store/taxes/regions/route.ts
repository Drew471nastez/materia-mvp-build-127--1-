import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { addTaxRegion, loadTaxSetup } from "@/lib/tax/server"
import { recordActivity, taxRegionLabel } from "@/lib/activity/log-server"
import { readinessChanged } from "@/lib/physical/readiness-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** A new tax region: a country, or a state inside one, and its rate. */
export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const done = await addTaxRegion(c.db, c.creatorId, body)
  if (!done.ok) return physicalJson({ error: done.error }, done.status)
  /* Tax on with no rate is on the checklist (lib/physical/readiness): asked again now. */
  readinessChanged(c)
  const setup = await loadTaxSetup(c.db, c.creatorId)
  await recordActivity(c.db, c, { action: "tax.region_added", subjectType: "tax_region", subjectLabel: taxRegionLabel(body) })
  return physicalJson(setup)
}
