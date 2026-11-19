import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { typedMailAllowed } from "@/lib/api/typed-mail"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { UUID, actionHref, actionLabel, formVars, slotVars, type NativeAction } from "@/lib/forms/actions"
import { validateDefinition, validateAnswers, pickResult, fillTemplate, validTimeZone, answerText, bookingDurations, type Answer, type BookingLocation, type FormDefinition } from "@/lib/forms/definition"
import { expireUnpaidBookings } from "@/lib/forms/booking-payment"
import { PUBLIC_HEADERS, formError, boundedJson, isMissingSchema, NEEDS_SQL, logFormsError, noteFormsTables } from "@/lib/forms/server"
import { MAX_SUBMIT_BYTES, SUBMIT_LIMITS, formSubject, spamVerdict } from "@/lib/forms/spam"
import { ownerDay, ownerDayBounds, slotOffered } from "@/lib/forms/slots"
import { readBusy, readOwnedBooking } from "@/lib/bookings/server"
import { announce } from "@/lib/bookings/announce-server"
import { locationWords } from "@/lib/bookings/calendar-file"
import { bookingManagePath } from "@/lib/bookings/manage-token"
import { filesForSubmission } from "@/lib/forms/uploads-server"
import { jobsFor, queueJobs, runFormJobs, type IntegrationSettings, type JobProvider } from "@/lib/forms/delivery-server"
import { bookingCheckoutToken } from "@/lib/forms/booking-payment"
import { platformOrigin } from "@/lib/onepage/return-address"

/*
  POST /api/forms/<id>/submit, the only way a response is kept.

  Before the database: two rate limits (per address, and per address on
  this form), the body capped at MAX_SUBMIT_BYTES, the honeypot (a bot is
  thanked and nothing is kept) and the time the form was open. Then the
  published revision is read and the answers are checked against it on
  the server (types, lengths, options, required, and only the questions
  the visitor's own answers make visible). The browser's submission UUID
  makes a retry return the first result rather than a second response.

  A booking is checked against the same slot rules the slots route used
  and kept together with its response by native_form_book in one
  transaction; a slot taken in the meantime is a 409 with new times to
  choose from. Ownership always comes from the form row, never the body.
*/

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS })
}

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: PUBLIC_HEADERS })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404, PUBLIC_HEADERS)
  const address = addressSubject(request)
  for (const [bucket, subject, windows] of [
    ["native-form-submit", address, SUBMIT_LIMITS.address],
    ["native-form-submit-form", formSubject(address, id), SUBMIT_LIMITS.addressForm],
  ] as const) {
    const limited = await rateLimit({ bucket, subjects: [subject], windows, message: "That is a lot of responses from one place. Try again in a few minutes." })
    if (limited) {
      for (const [key, value] of Object.entries(PUBLIC_HEADERS)) limited.headers.set(key, value)
      return limited
    }
  }
  try {
    const body = await boundedJson(request, MAX_SUBMIT_BYTES)
    const spam = spamVerdict(body)
    if (spam.kind === "trap") return json({ ok: true, message: "Thanks. Your answers have been received.", href: null, action_type: null }, 201)
    if (spam.kind === "refuse") return formError(new Error((spam as { error: string }).error), 400, PUBLIC_HEADERS)
    const token = typeof body.submission_id === "string" ? body.submission_id.toLowerCase() : ""
    if (!UUID.test(token)) return formError(new Error("Reload the form and try again."), 400, PUBLIC_HEADERS)
    if (body.consent !== true) return formError(new Error("Please accept the consent notice to send this form."), 400, PUBLIC_HEADERS)
    const db = createAdminClient()
    const { data: form, error: readError } = await db
      .from("native_forms")
      .select("id,owner_id,title,published,revision,integration_settings")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle()
    if (noteFormsTables(readError)) return NextResponse.json({ error: "This form is not available.", code: "forms_missing" }, { status: 404, headers: PUBLIC_HEADERS })
    if (readError) {
      logFormsError("submit read", readError)
      return formError(new Error("The form could not be read. Try again."), 503, PUBLIC_HEADERS)
    }
    if (!form?.published) return formError(new Error("This form is not available."), 404, PUBLIC_HEADERS)
    /* `form_changed`: the page reads the new version and sends the same answers once more (components/forms/public-form). */
    if (body.revision !== form.revision) return json({ error: "This form has changed. Reload it before sending.", form_changed: true }, 409)
    const definition = validateDefinition(form.published)
    const valid = validateAnswers(definition, body.answers)

    /* The same token sent again: the first response's result, nothing new kept. */
    const { data: existing } = await db.from("form_submissions").select("id,answers,form_revision").eq("form_id", id).eq("dedupe_key", token).maybeSingle()
    if (existing) {
      const same = existing.form_revision === form.revision && sameAnswers(existing.answers as Answer[], valid.answers)
      if (!same) return formError(new Error("This response was already received. Reload the form to send different answers."), 409, PUBLIC_HEADERS)
      const { data: kept } = await db.from("form_bookings").select("id,starts_at,status").eq("submission_id", existing.id).maybeSingle()
      return json(completion(definition, valid, kept || null), 200)
    }

    const files = await filesForSubmission(db, { formId: id, token, files: valid.files })
    if (files.ok === false) return formError(new Error((files as { error: string }).error), 400, PUBLIC_HEADERS)
    const answers: Answer[] = valid.answers.map((a) => {
      if (a.type !== "file" || !a.value) return a
      const ref = valid.files.find((f) => f.field_id === a.field_id)
      const row = ref ? files.rows.find((r) => r.field_id === a.field_id) : undefined
      return row ? { ...a, value: row.file_name, file: { id: row.id, name: row.file_name, type: row.content_type, size: row.bytes } } : a
    })
    if (files.rows.some((r) => r.submission_id)) return formError(new Error("Upload your file again."), 400, PUBLIC_HEADERS)

    const source = ["onepage", "website", "creator_page"].includes(body.source) ? body.source : "form"
    let sourceUrl: string | null = null
    try {
      const u = new URL(body.source_url)
      if (["https:", "http:"].includes(u.protocol)) sourceUrl = (u.origin + u.pathname).slice(0, 2048)
    } catch {}
    const sourceBlock = typeof body.source_block === "string" ? body.source_block.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 160) || null : null
    const row = {
      owner_id: form.owner_id,
      form_id: id,
      form_revision: form.revision,
      form_title: definition.title,
      answers,
      contact_name: valid.name,
      contact_email: valid.email,
      contact_phone: valid.phone,
      score: valid.score,
      consent: {
        accepted: true,
        text: definition.consent_text,
        privacy_url: definition.privacy_url || null,
        marketing: definition.marketing_opt_in && body.marketing === true,
        at: new Date().toISOString(),
      },
      source_kind: source,
      source_url: sourceUrl,
      source_block: sourceBlock,
      dedupe_key: token,
    }

    let leadId: string | null = null
    let duplicate = false
    let booked: { id?: string; starts_at: string; ends_at?: string; status: string; location?: BookingLocation | null } | null = null
    if (definition.booking) {
      const settings = definition.booking
      const slot = typeof body.slot === "string" ? body.slot : ""
      const start = Date.parse(slot)
      if (!Number.isFinite(start)) return formError(new Error("Choose a time."), 400, PUBLIC_HEADERS)
      /* Round AR: one of the lengths the form offers, the first when none is named. */
      const length = typeof body.duration === "number" ? body.duration : settings.duration
      if (!bookingDurations(settings).includes(length)) return formError(new Error("Choose how long the meeting is."), 400, PUBLIC_HEADERS)
      /* Unpaid holds past their time are released first, so their slots count as free (lib/forms/booking-payment.ts). */
      if (settings.payment_product_id) await expireUnpaidBookings(db, new Date().toISOString(), form.owner_id).catch(() => 0)
      /* Every active booking of this owner, the form's count per day, and Google busy times when Google Calendar is connected (lib/bookings/server.ts). */
      const read = await readBusy(db, { ownerId: form.owner_id, formId: id, settings, fromMs: start, toMs: start + 1 })
      if (read.error) return formError(new Error("Times could not be checked. Try again."), 503, PUBLIC_HEADERS)
      const offered = slotOffered(settings, slot, Date.now(), read.busy, { perDay: read.perDay, duration: length })
      if (!offered) return json({ error: "That time is no longer available. Choose another.", slot_taken: true }, 409)
      const status = settings.approval || settings.payment_product_id ? "pending" : "confirmed"
      const location = settings.location && settings.location.kind !== "none" ? settings.location : null
      const args = {
        p_submission: row,
        p_starts_at: offered.start,
        p_ends_at: offered.end,
        p_hold_until: new Date(Date.parse(offered.end) + settings.buffer * 60_000).toISOString(),
        p_visitor_timezone: validTimeZone(body.timezone) ? body.timezone : null,
        p_status: status,
        p_payment_product_id: settings.payment_product_id || null,
      }
      /* Part 410: the same booking under a per owner lock, with the daily limit, its length and where it happens. Before 410, the booking as part 375 keeps it. */
      const day = ownerDayBounds(settings.timezone, ownerDay(settings.timezone, Date.parse(offered.start)))
      let { data, error } = await db.rpc("native_form_book_capped", {
        ...args,
        p_max_per_day: settings.max_per_day || 0,
        p_day_start: new Date(day.start).toISOString(),
        p_day_end: new Date(day.end).toISOString(),
        p_duration_minutes: length,
        p_location: location,
      })
      if (error && isMissingSchema(error)) ({ data, error } = await db.rpc("native_form_book", args))
      if (error) {
        /* 23505: the same start is held. 23P01: an overlapping booking holds it. Both mean someone was quicker. 23514: the day filled up a moment ago. */
        if (error.code === "23505" || error.code === "23P01") return json({ error: "That time was just taken. Choose another.", slot_taken: true }, 409)
        if (error.code === "23514") return json({ error: "That day just filled up. Choose another day.", slot_taken: true }, 409)
        if (isMissingSchema(error)) return formError(new Error("Bookings are not available yet."), 503, PUBLIC_HEADERS)
        return formError(new Error("Your booking was not saved. Please try again."), 503, PUBLIC_HEADERS)
      }
      const first = (Array.isArray(data) ? data[0] : data) as { submission_id: string; booking_id: string | null; duplicate: boolean } | undefined
      leadId = first?.submission_id || null
      duplicate = first?.duplicate === true
      booked = { id: first?.booking_id || undefined, starts_at: offered.start, ends_at: offered.end, status, location }
    } else {
      const { data: lead, error } = await db.from("form_submissions").insert(row).select("id").single()
      if (error?.code === "23505") duplicate = true
      else if (error && isMissingSchema(error)) {
        /* Before part 375 there is no source_block column: keep the response without it. */
        const { source_block: _dropped, ...older } = row
        void _dropped
        const retry = await db.from("form_submissions").insert(older).select("id").single()
        if (retry.error && retry.error.code !== "23505") return formError(new Error("Your answers were not saved. Please try again."), 503, PUBLIC_HEADERS)
        leadId = retry.data?.id || null
        duplicate = retry.error?.code === "23505"
      } else if (error) return formError(new Error("Your answers were not saved. Please try again."), 503, PUBLIC_HEADERS)
      else leadId = lead.id
    }

    if (leadId && !duplicate) {
      const lead = leadId
      if (files.rows.length)
        await db
          .from("form_uploads")
          .update({ submission_id: lead, claimed_at: new Date().toISOString() })
          .in("id", files.rows.map((r) => r.id))
          .is("submission_id", null)
      /* Round AR: the visitor's own email, retried until sent: confirmed at once, or their request received (a paid booking hears when the payment confirms it). */
      /* Round AY: counted per recipient and per network across every store (lib/api/typed-mail.ts); over it, the booking is kept and only this mail is held back. */
      const mailVisitor = booked && valid.email && !definition.booking?.payment_product_id ? await typedMailAllowed(request, valid.email) : false
      const visitorJob = booked && mailVisitor ? [{ provider: (booked.status === "confirmed" ? "booking_confirmed" : "visitor_email") as JobProvider, state: "ready" }] : []
      const jobs = await queueJobs(db, { ownerId: form.owner_id, formId: id, submissionId: lead, jobs: [...jobsFor(form.integration_settings as IntegrationSettings), ...visitorJob] })
      const bookingId = booked?.id
      after(async () => {
        if (bookingId) {
          /* The bell, the phone and Google Calendar, in one place (lib/bookings/announce.ts). */
          const row = await readOwnedBooking(db, form.owner_id, bookingId).catch(() => null)
          if (row) await announce(db, row, "new", "visitor")
          if (jobs.length) await runFormJobs(db as never, { ids: jobs, until: Date.now() + 20_000 }).catch(() => null)
          return
        }
        const notify = {
          userId: form.owner_id,
          kind: "system" as const,
          source: "system" as const,
          title: booked ? "New booking request" : "New form response",
          body: `${valid.name || valid.email || "Someone"} sent ${definition.title}`.slice(0, 200),
          /* Round 51: the response open in Contacts › Forms. */
          url: `/app/contacts/forms?form=${id}&view=responses&response=${lead}`,
          dedupeKey: `form-response:${lead}`,
        }
        if ((await notifyUser(db as never, notify)) === "unavailable") await notifyUser(db as never, notify)
        if (jobs.length) await runFormJobs(db as never, { ids: jobs, until: Date.now() + 20_000 }).catch(() => null)
      })
    }
    return json(completion(definition, { ...valid, answers }, booked), duplicate ? 200 : 201)
  } catch (error) {
    return formError(error, 400, PUBLIC_HEADERS)
  }
}

function sameAnswers(kept: Answer[], now: Answer[]): boolean {
  const plain = (list: Answer[]) => JSON.stringify(list.map((a) => [a.field_id, a.type === "file" ? !!a.value : a.value]))
  return plain(kept || []) === plain(now)
}

/** What the visitor sees next. The gated address and quiz results leave the server only here. */
function completion(
  definition: FormDefinition,
  valid: { answers: Answer[]; name: string | null; email: string | null; phone: string | null; score: number },
  booking: { id?: string; starts_at: string; ends_at?: string; status: string; location?: BookingLocation | null } | null,
) {
  const result = definition.mode === "quiz" ? pickResult(definition.results, valid.score) : null
  let action: NativeAction | undefined = result?.action || (definition.completion.kind === "action" ? definition.completion.action : undefined)
  if (action?.type === "whatsapp") {
    const filled = fillTemplate(action.message || "", { ...valid, result: result?.title || null })
    const extra = definition.completion.include_answers ? valid.answers.filter((a) => a.type !== "file").map((a) => `${a.label}: ${answerText(a)}`) : []
    action = { ...action, message: [filled, ...extra].filter(Boolean).join("\n").slice(0, 4000) }
  }
  const gated = definition.completion.kind === "gated" && definition.completion.gated?.url ? definition.completion.gated : null
  /* The product checkout, carrying the booking signed for that product: paying confirms it (lib/forms/booking-payment.ts). */
  const product = definition.booking?.payment_product_id
  const pay = product && booking?.id ? `${platformOrigin()}/checkout?productId=${encodeURIComponent(product)}&booking=${encodeURIComponent(bookingCheckoutToken(booking.id, product))}` : null
  return {
    ok: true,
    message: definition.completion.message,
    score: definition.mode === "quiz" ? valid.score : null,
    result: result ? { title: result.title, message: result.message } : null,
    /* AK5's {name}, {email} and {question_id} are filled above; the action's own {visitor_name}, {service} and {answer:id} here (lib/forms/actions). The two never share a token. */
    /* {date} and {time} are the booked slot, in the booking's own time zone, when there is one (lib/forms/actions slotVars). */
    href: actionHref(action, { ...formVars(definition.fields, Object.fromEntries(valid.answers.map((a) => [a.field_id, a.type === "file" ? "" : a.value]))), visitor_name: valid.name || null, ...(booking ? slotVars(booking.starts_at, definition.booking?.timezone) : {}) }),
    action_type: action?.type || null,
    action_label: action ? actionLabel(action) : null,
    gated: gated ? { url: gated.url, label: gated.label } : null,
    /* Round AR: the end, where it happens (a video link is told now, once booked) and the visitor's own link to change or cancel. */
    booking: booking
      ? {
          starts_at: booking.starts_at,
          ...(booking.ends_at ? { ends_at: booking.ends_at } : {}),
          status: booking.status,
          location: booking.location ? locationWords(booking.location) : null,
          manage_url: booking.id ? manageUrlFor(booking.id) : null,
        }
      : null,
    payment_href: booking ? pay : null,
  }
}

/** The visitor's signed link to change or cancel (lib/bookings/manage-token.ts), or null when no signing key is set. */
function manageUrlFor(bookingId: string): string | null {
  try {
    return `${platformOrigin()}${bookingManagePath(bookingId)}`
  } catch {
    return null
  }
}
