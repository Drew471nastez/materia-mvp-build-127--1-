import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { MODEL_LOCATION, ensureDefaultLocation, ensureDefaultProfile, loadSettings, saveSettings } from "@/lib/physical/config-server"
import { FULFILLMENT_MODELS, type FulfillmentModel } from "@/lib/physical/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * "How do you fulfil your physical orders?" answered once: the answer is
 * kept, a first location of the right kind and a default shipping profile
 * are made if the shop has none. Rates are never invented: the merchant
 * adds them in Shipping and delivery.
 */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const model = body?.model as FulfillmentModel
  if (!FULFILLMENT_MODELS.includes(model)) return physicalJson({ error: "Choose how you fulfil orders." }, 400)
  const saved = await saveSettings(c.db, c.creatorId, { fulfillmentModel: model, markOnboarded: true })
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  await ensureDefaultLocation(c.db, c.creatorId, MODEL_LOCATION[model])
  await ensureDefaultProfile(c.db, c.creatorId)
  return physicalJson({ settings: await loadSettings(c.db, c.creatorId) })
}
