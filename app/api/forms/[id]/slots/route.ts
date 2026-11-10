import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { UUID } from "@/lib/forms/actions"
import { bookingDurations, validateDefinition } from "@/lib/forms/definition"
import { expireUnpaidBookings } from "@/lib/forms/booking-payment"
import { PUBLIC_HEADERS, formError, noteFormsTables } from "@/lib/forms/server"
import { generateSlots } from "@/lib/forms/slots"
import { readBusy } from "@/lib/bookings/server"

/*
  GET /api/forms/<id>/slots?from=<ISO>&days=<1..42>&duration=<minutes>

  The free appointment times of a published booking form, as exact
  instants: the browser shows them in the visitor's own zone and draws its
  month from them (a date with a time is choosable, every other is not).
  Only free times are listed; nothing about other bookings (who, which
  form, a Google event) leaves the server. Round AR: up to six weeks at a
  time for the month view, the visitor's chosen length, and Google busy
  times when the creator connected Google Calendar.
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
  const days = Math.max(1, Math.min(42, Number(url.searchParams.get("days")) || 7))
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
  const asked = Number(url.searchParams.get("duration"))
  const lengths = bookingDurations(settings)
  const duration = lengths.includes(asked) ? asked : settings.duration
  /* Unpaid holds past their time are released first, so their slots count as free (lib/forms/booking-payment.ts). */
  if (settings.payment_product_id) await expireUnpaidBookings(db, new Date().toISOString(), form.owner_id).catch(() => 0)
  const read = await readBusy(db, { ownerId: form.owner_id, formId: id, settings, fromMs: from, toMs: to })
  if (read.error) return formError(new Error("Times could not be loaded. Try again."), 503, PUBLIC_HEADERS)
  const slots = generateSlots(settings, { fromMs: from, toMs: to, nowMs: now, busy: read.busy, perDay: read.perDay, duration, limit: 1500 })
  const horizon = now + settings.days_ahead * 86_400_000
  return NextResponse.json(
    {
      duration,
      durations: lengths,
      owner_timezone: settings.timezone,
      slots,
      /* The last instant a time can be booked, so the month knows where its choosable dates end. */
      horizon: new Date(horizon).toISOString(),
      next: to < horizon ? new Date(to).toISOString() : null,
    },
    { headers: PUBLIC_HEADERS },
  )
}
