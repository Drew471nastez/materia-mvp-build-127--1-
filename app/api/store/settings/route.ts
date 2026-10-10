import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { detectedCountry, loadStoreSettings, saveStoreSettings } from "@/lib/store/settings-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Settings › Store details and Settings › Checkout. Every shop has them,
 * whatever it sells, so the owner check alone (no physical commerce switch).
 * `detectedCountry` is where the request came from, for suggesting a
 * country the person has not chosen yet.
 */
export async function GET() {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const [settings, h, creator] = await Promise.all([
    loadStoreSettings(c.db, c.creatorId),
    headers(),
    c.db.from("creators").select("support_email, payout_currency").eq("id", c.creatorId).maybeSingle(),
  ])
  return physicalJson({ settings, detectedCountry: detectedCountry(h), supportEmail: creator?.data?.support_email ?? null, currency: creator?.data?.payout_currency ?? null })
}

export async function PUT(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveStoreSettings(c.db, c.creatorId, body)
  if (!saved.ok) return physicalJson({ error: saved.error }, saved.status)
  return physicalJson({ settings: saved.settings })
}
