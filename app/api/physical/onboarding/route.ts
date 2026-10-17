import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { MODEL_LOCATION, ensureDefaultLocation, ensureDefaultProfile, loadSettings, loadStoreOrigin, saveSettings } from "@/lib/physical/config-server"
import { unitSystemFor } from "@/lib/physical/quick-setup"
import { FULFILLMENT_MODELS, type FulfillmentModel } from "@/lib/physical/types"
import { emit } from "@/lib/notify/outbox"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * "How do you fulfil your physical orders?" answered once: the answer is
 * kept, a first location of the right kind and a default shipping profile
 * are made if the shop has none. Rates are never invented: the merchant
 * adds them in Shipping and delivery, or presses "Use this setup" there
 * with every price typed in front of them (Quick setup,
 * app/api/physical/shipping/quick-setup).
 *
 * Units follow the store's country without a question: pounds and inches
 * in the US, Liberia and Myanmar, kilograms and centimetres elsewhere
 * (lib/physical/quick-setup.ts unitSystemFor). Switchable in the settings.
 */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const model = body?.model as FulfillmentModel
  if (!FULFILLMENT_MODELS.includes(model)) return physicalJson({ error: "Choose how you fulfil orders." }, 400)
  /* Only the first time: a store answering again keeps the units it has. */
  const [before, origin] = await Promise.all([loadSettings(c.db, c.creatorId), loadStoreOrigin(c.db, c.creatorId)])
  const units = !before.onboardedAt && origin.country ? { unitSystem: unitSystemFor(origin.country) } : {}
  const saved = await saveSettings(c.db, c.creatorId, { fulfillmentModel: model, markOnboarded: true, ...units })
  if (saved.ok === false) return physicalJson({ error: saved.error }, 400)
  await ensureDefaultLocation(c.db, c.creatorId, MODEL_LOCATION[model])
  await ensureDefaultProfile(c.db, c.creatorId)
  /* Selling things that ship has begun: the reminders that follow it up if the store is still not ready in two days (lib/notify/workflows/unfinished.ts). Once per store, whatever is answered after. */
  await emit({ name: "physical_setup.started", key: `physical_setup.started:${c.creatorId}`, userId: c.userId, creatorId: c.creatorId, entityType: "creator", entityId: c.creatorId, payload: { model } }, { db: c.db }).catch(() => undefined)
  readinessChanged(c)
  return physicalJson({ settings: await loadSettings(c.db, c.creatorId) })
}
