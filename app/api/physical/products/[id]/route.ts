import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { currencyRefusal } from "@/lib/store/currency-guard"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadPhysicalProduct, savePhysicalProduct } from "@/lib/physical/catalog-server"
import { loadLocations, loadProfiles, loadSettings } from "@/lib/physical/config-server"
import { translationsChanged } from "@/lib/markets/translate-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** What the product editor's physical cards show: the product's shipping, options, variants, stock, and the shop's locations and profiles to choose from. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const [product, locations, profiles, settings] = await Promise.all([
    loadPhysicalProduct(c.db, c.creatorId, id),
    loadLocations(c.db, c.creatorId),
    loadProfiles(c.db, c.creatorId),
    loadSettings(c.db, c.creatorId),
  ])
  if (!product) return physicalJson({ error: "Not found." }, 404)
  return physicalJson({ product, locations, profiles: profiles.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })), settings })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  /* Prices typed before the store's currency was converted are never saved over the converted ones (lib/store/currency-guard). */
  const moved = await currencyRefusal(c.db, c.creatorId, body.formCurrency)
  if (moved) return physicalJson({ error: moved, code: "currency_changed" }, 409)
  const saved = await savePhysicalProduct(c.db, c.creatorId, id, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status ?? 400)
  readinessChanged(c)
  /* Its option names and values, translated in a few minutes (lib/markets/translate-queue.ts). */
  translationsChanged(c.creatorId)
  return physicalJson({ product: saved.data })
}
