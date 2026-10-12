import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadPhysicalProduct, savePhysicalProduct } from "@/lib/physical/catalog-server"
import { loadLocations, loadProfiles, loadSettings } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** What the product editor's physical cards show: the product's shipping, options, variants, stock, and the shop's locations and profiles to choose from. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
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
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await savePhysicalProduct(c.db, c.creatorId, id, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status ?? 400)
  readinessChanged(c)
  return physicalJson({ product: saved.data })
}
