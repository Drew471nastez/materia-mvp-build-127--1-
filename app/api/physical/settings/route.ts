import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadLocations, loadPackages, loadProfiles, loadSettings, loadShippingProducts, loadTaxRates, saveSettings } from "@/lib/physical/config-server"
import { loadIntegrations } from "@/lib/physical/integrations-server"
import { recordActivity } from "@/lib/activity/log-server"
import { followNewDefault, storeFulfilmentFor } from "@/lib/physical/fulfilment-default-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Everything the Shipping, Locations and Integrations settings show, in one read. */
export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const [settings, locations, profiles, packages, taxRates, integrations, shippingProducts] = await Promise.all([
    loadSettings(c.db, c.creatorId),
    loadLocations(c.db, c.creatorId),
    loadProfiles(c.db, c.creatorId),
    loadPackages(c.db, c.creatorId),
    loadTaxRates(c.db, c.creatorId),
    loadIntegrations(c.db, c.creatorId),
    loadShippingProducts(c.db, c.creatorId),
  ])
  return physicalJson({ settings, locations, profiles, packages, taxRates, integrations, shippingProducts })
}

export async function PUT(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Who ships by default: products that follow it follow a change to it (lib/physical/fulfilment-default.ts). */
  const fulfilmentChange = "fulfillmentModel" in body || "defaultLocationId" in body
  const before = fulfilmentChange ? await storeFulfilmentFor(c.db, c.creatorId) : null
  const saved = await saveSettings(c.db, c.creatorId, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  if (before) await followNewDefault(c.db, c.creatorId, before, await storeFulfilmentFor(c.db, c.creatorId))
  await recordActivity(c.db, c, { action: "settings.shipping" })
  return physicalJson({ settings: await loadSettings(c.db, c.creatorId) })
}
