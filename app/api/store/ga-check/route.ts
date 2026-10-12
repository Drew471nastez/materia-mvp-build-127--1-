import { NextResponse } from "next/server"
import { physicalJson, readBody, shopCaller } from "@/lib/physical/auth"
import { loadGaStatus, loadTracking, recordGaSeen } from "@/lib/store/tracking-server"
import { GA_ID, gaCheckHtml } from "@/lib/store/ga"
import { storeIdentity } from "@/lib/store/identity-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  CHECK: DOES GOOGLE TAKE A HIT WITH THIS MEASUREMENT ID?
 * ===========================================================================
 * Settings › Integrations › Google Analytics runs this right after an ID is
 * saved, and again from Check again, in a hidden frame of the settings page
 * (?embedded=1, which proxy.ts lets this page be framed by Storelib alone):
 *
 *   GET   a blank page that loads Google's tag with the ID and sends one
 *         event, storelib_connected (it shows in Google's Realtime report),
 *         then tells the settings page what the browser saw: the tag
 *         loaded, and a /g/collect request with this ID left. Google's own
 *         tag cookies are kept to this address and this session only.
 *   POST  { id } once the hit was seen: kept as the time the tag was
 *         checked (store_settings.tracking_seen, SQL part 173).
 *
 * The owner's alone, like the rest of Settings.
 */
export async function GET(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const asked = new URL(request.url).searchParams.get("id")?.toUpperCase() ?? ""
  if (!GA_ID.test(asked)) return physicalJson({ error: "That isn't a Measurement ID." }, 400)
  const site = (await storeIdentity(c.db, c.creatorId).catch(() => null))?.websiteUrl ?? null
  const html = gaCheckHtml(asked, site)
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" } })
}

export async function POST(request: Request) {
  const c = await shopCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  const id = typeof body?.id === "string" ? body.id.toUpperCase() : ""
  const { tracking } = await loadTracking(c.db, c.creatorId)
  if (!GA_ID.test(id) || tracking.ga4 !== id) return physicalJson({ error: "Save this Measurement ID first." }, 409)
  await recordGaSeen(c.db, c.creatorId, id, "checkedAt")
  return physicalJson({ ga: await loadGaStatus(c.db, c.creatorId, id) })
}
