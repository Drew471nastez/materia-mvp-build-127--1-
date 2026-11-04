import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadIntegrationStates, loadLocations, loadPackages, loadProfiles, loadSettings, loadShippingProducts, loadStoreOrigin, loadTaxRates, saveSettings } from "@/lib/physical/config-server"
import { providerInfo } from "@/lib/physical/providers"
import { CARRIER_RATE_APPS } from "@/lib/integrations/shipping/checkout-rates-server"
import { recordActivity } from "@/lib/activity/log-server"
import { followNewDefault, storeFulfilmentFor } from "@/lib/physical/fulfilment-default-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Everything Shipping and delivery and Locations show, in one read.
 *
 * Integrations are read as connected or not and nothing more: this used to
 * send the whole Integrations view (loadIntegrations), opening every sealed
 * key twice per row for a field no screen read. `carrierApps` is the one
 * thing asked of them here: which apps can price a Carrier calculated rate
 * and whether each is connected. `origin` is the store's country and
 * business address, what Quick setup starts from.
 */
export async function GET() {
  const c = await physicalCaller("store", { read: true })
  if (c instanceof NextResponse) return c
  const [settings, locations, profiles, packages, taxRates, states, shippingProducts, origin] = await Promise.all([
    loadSettings(c.db, c.creatorId),
    loadLocations(c.db, c.creatorId),
    loadProfiles(c.db, c.creatorId),
    loadPackages(c.db, c.creatorId),
    loadTaxRates(c.db, c.creatorId),
    loadIntegrationStates(c.db, c.creatorId),
    loadShippingProducts(c.db, c.creatorId),
    loadStoreOrigin(c.db, c.creatorId),
  ])
  const carrierApps = CARRIER_RATE_APPS.map((id) => ({ id, name: providerInfo(id)?.name ?? id, connected: states.some((s) => s.provider === id && s.connected) }))
  return physicalJson({ settings, locations, profiles, packages, taxRates, carrierApps, shippingProducts, origin })
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
  readinessChanged(c)
  return physicalJson({ settings: await loadSettings(c.db, c.creatorId) })
}
