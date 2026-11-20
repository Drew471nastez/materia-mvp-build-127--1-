import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { addressSubject, rateLimit } from "@/lib/api/rate-limit"
import { platformOrigin } from "@/lib/onepage/return-address"
import { HOOK_ID, MAX_HOOK_BYTES, isExternalProvider } from "@/lib/bookings/external/providers"
import { connectionByHook } from "@/lib/bookings/external/server"
import { takeExternalEvent } from "@/lib/bookings/external/hook-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  A BOOKING MADE OR CHANGED ON CALENDLY OR CAL.COM
 * ===========================================================================
 * POST /api/bookings/external/hook/<calendly|calcom>/<hook>
 *
 * The address Storelib gave the provider when the store connected it
 * (lib/bookings/external). In order, before anything is read from the body:
 *
 *   the rate     per address and per hook, so a flood is refused at the door
 *   the address  the hook names one store's connection; any other is a 404
 *   the size     at most MAX_HOOK_BYTES, read as text, never parsed yet
 *   the body     Calendly-Webhook-Signature (with its time) or
 *                X-Cal-Signature-256, against the secret sealed for that
 *                store. Only then is the JSON parsed; a Cal.com body's
 *                createdAt must be recent too.
 *
 * The booking is written before the answer (idempotent, a single upsert or
 * update) and the creator is told after it (the bell, their email), so the
 * provider has its 200 quickly. A 401 for a signature that does not hold.
 */
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request, { params }: { params: Promise<{ provider: string; hook: string }> }) {
  const { provider, hook } = await params
  if (!isExternalProvider(provider) || !HOOK_ID.test(hook)) return json({ error: "Not found." }, 404)
  const limited = await rateLimit({ bucket: "external-booking-hook", subjects: [addressSubject(request), `hook:${provider}:${hook.slice(0, 64)}`], windows: [{ limit: 120, seconds: 60 }, { limit: 5000, seconds: 86400 }] })
  if (limited) return limited
  const length = Number(request.headers.get("content-length") || 0)
  if (length > MAX_HOOK_BYTES) return json({ error: "Too large." }, 413)
  const raw = await request.text().catch(() => "")
  if (!raw || raw.length > MAX_HOOK_BYTES) return json({ error: "Send a JSON body." }, 400)
  const db = createAdminClient()
  const conn = await connectionByHook(db, provider, hook)
  if (!conn) return json({ error: "Not found." }, 404)
  const out = await takeExternalEvent(db, conn, { raw, headers: request.headers }, { origin: platformOrigin(), later: (fn) => after(fn) })
  return json(out.body, out.status)
}
