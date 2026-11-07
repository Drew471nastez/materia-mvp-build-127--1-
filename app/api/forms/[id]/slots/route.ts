import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { UUID } from "@/lib/forms/actions"
import { validateDefinition } from "@/lib/forms/definition"
import { expireUnpaidBookings } from "@/lib/forms/booking-payment"
import { PUBLIC_HEADERS, formError, isMissingSchema, noteFormsTables } from "@/lib/forms/server"
import { generateSlots, type Interval } from "@/lib/forms/slots"

/*
  GET /api/forms/<id>/slots?from=<ISO>&days=<1..14>

  The free appointment times of a published booking form, as exact
  instants: the browser shows them in the visitor's own zone. Only free
  times are listed; nothing about other bookings (who, which form) leaves
  the server.
*/

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS })
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404, PUBLIC_HEADERS)
  const limited = await rateLimit({ bucket: "native-form-slots", subjects: [addressSubject(request)], windows: [{ limit: 120, seconds: 600 }], memoryFirst: true })
  if (limited) {
    for (const [key, value] of Object.entries(PUBLIC_HEADERS)) limited.headers.set(key, value)
    return limited
  }
  const url = new URL(request.url)
  const now = Date.now()
  const fromParam = Date.parse(url.searchParams.get("from") || "")
  const from = Number.isFinite(fromParam) ? Math.max(now, fromParam) : now
  const days = Math.max(1, Math.min(14, Number(url.searchParams.get("days")) || 7))
  const to = from + days * 86_400_000
  const db = createAdminClient()
  const { data: form, error } = await db.from("native_forms").select("owner_id,published").eq("id", id).eq("status", "published").maybeSingle()
  if (noteFormsTables(error)) return NextResponse.json({ error: "This form is not available.", code: "forms_missing" }, { status: 404, headers: PUBLIC_HEADERS })
  if (error) return formError(new Error("Times could not be loaded. Try again."), 503, PUBLIC_HEADERS)
  if (!form?.published) return formError(new Error("This form is not available."), 404, PUBLIC_HEADERS)
  let settings
  try {
    settings = validateDefinition(form.published).booking
  } catch {
    settings = undefined
  }
  if (!settings) return formError(new Error("This form takes no bookings."), 404, PUBLIC_HEADERS)
  /* Unpaid holds past their time are released first, so their slots count as free (lib/forms/booking-payment.ts). */
  if (settings.payment_product_id) await expireUnpaidBookings(db, new Date().toISOString(), form.owner_id).catch(() => 0)
  const { data: rows, error: busyError } = await db
    .from("form_bookings")
    .select("starts_at,hold_until")
    .eq("owner_id", form.owner_id)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", new Date(to + 86_400_000).toISOString())
    .gt("hold_until", new Date(from - 86_400_000).toISOString())
    .limit(2000)
  if (busyError) return formError(new Error(isMissingSchema(busyError) ? "Bookings are not available yet." : "Times could not be loaded. Try again."), 503, PUBLIC_HEADERS)
  const busy: Interval[] = ((rows || []) as { starts_at: string; hold_until: string }[]).map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.hold_until) }))
  const slots = generateSlots(settings, { fromMs: from, toMs: to, nowMs: now, busy, limit: 500 })
  const horizon = now + settings.days_ahead * 86_400_000
  return NextResponse.json(
    { duration: settings.duration, owner_timezone: settings.timezone, slots, next: to < horizon ? new Date(to).toISOString() : null },
    { headers: PUBLIC_HEADERS },
  )
}
