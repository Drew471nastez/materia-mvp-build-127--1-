import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { loadLocations, loadSettings, text } from "@/lib/physical/config-server"
import { adjustStock, inventoryRows, saveStockSettings } from "@/lib/physical/inventory-server"
import { queueLowStockAlerts } from "@/lib/physical/jobs-server"
import type { AdjustField, AdjustMode } from "@/lib/physical/inventory-rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const settings = await loadSettings(c.db, c.creatorId)
  const [rows, locations] = await Promise.all([inventoryRows(c.db, c.creatorId, settings.lowStockDefault), loadLocations(c.db, c.creatorId)])
  return physicalJson({ rows, locations, lowStockDefault: settings.lowStockDefault })
}

/** The way a change is asked for: `mode` and `quantity`, or the page before round V's `delta` and `set`. */
function readChange(body: Record<string, unknown>): { field: AdjustField; mode: AdjustMode; quantity: unknown } | null {
  const field: AdjustField = body.field === "incoming" ? "incoming" : "on_hand"
  if (body.mode === "add" || body.mode === "remove" || body.mode === "set") return { field, mode: body.mode, quantity: body.quantity }
  if (body.set !== undefined && body.set !== null && body.set !== "") return { field, mode: "set", quantity: typeof body.set === "string" ? body.set.trim() : body.set }
  const d = Number(body.delta)
  if (!Number.isInteger(d) || d === 0) return null
  return { field, mode: d > 0 ? "add" : "remove", quantity: Math.abs(d) }
}

/**
 * One stock change at one location: add, remove or set on hand (or units
 * on order), with a reason and a note. Worked out and written under the
 * level's lock (lib/physical/inventory-server adjustStock); the key makes a
 * double press one change.
 */
export async function POST(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.variantId) || !isUuid(body.locationId)) return physicalJson({ error: "Choose a product and a location." }, 400)
  const change = readChange(body)
  if (!change) return physicalJson({ error: "Enter how many units." }, 400)
  const key = typeof body.key === "string" && body.key.length >= 8 && body.key.length <= 120 ? `adjust:${c.creatorId}:${body.key}` : null
  const done = await adjustStock(c.db, {
    creatorId: c.creatorId,
    userId: c.userId,
    variantId: body.variantId as string,
    locationId: body.locationId as string,
    ...change,
    reason: body.reason,
    note: text(body.note, 500),
    key,
  })
  if (done.ok === false) return physicalJson({ error: done.error }, done.status ?? 400)
  if (done.applied) {
    readinessChanged(c, { recheck: false })
    /* Taken down to or under its low stock line by hand (damaged, lost): the day's low stock email names it too. */
    if (change.field === "on_hand" && done.after < done.before) await queueLowStockAlerts(c.db, c.creatorId, [body.variantId as string]).catch(() => undefined)
  }
  return physicalJson({ level: done.level, applied: done.applied, unchanged: done.unchanged, before: done.before, after: done.after })
}

/** The settings beside a count: Track stock and Keep selling (the product's), the low stock line (the variant's). */
export async function PATCH(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.variantId)) return physicalJson({ error: "Choose a product." }, 400)
  const saved = await saveStockSettings(c.db, c.creatorId, body.variantId as string, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  readinessChanged(c, { recheck: false })
  return physicalJson({ ok: true })
}
