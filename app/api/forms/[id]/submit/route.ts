import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { UUID, actionHref, actionLabel, type NativeAction } from "@/lib/forms/actions"
import { validateDefinition, validateAnswers, pickResult, fillTemplate, validTimeZone, answerText, type Answer, type FormDefinition } from "@/lib/forms/definition"
import { expireUnpaidBookings } from "@/lib/forms/booking-payment"
import { PUBLIC_HEADERS, formError, boundedJson, isMissingSchema, NEEDS_SQL } from "@/lib/forms/server"
import { MAX_SUBMIT_BYTES, SUBMIT_LIMITS, formSubject, spamVerdict } from "@/lib/forms/spam"
import { slotOffered, type Interval } from "@/lib/forms/slots"
import { filesForSubmission } from "@/lib/forms/uploads-server"
import { jobsFor, queueJobs, runFormJobs, type IntegrationSettings } from "@/lib/forms/delivery-server"
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
    if (readError) return formError(new Error("The form could not be read. Try again."), 503, PUBLIC_HEADERS)
    if (!form?.published) return formError(new Error("This form is not available."), 404, PUBLIC_HEADERS)
    if (body.revision !== form.revision) return formError(new Error("This form has changed. Reload it before sending."), 409, PUBLIC_HEADERS)
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
    let booked: { id?: string; starts_at: string; status: string } | null = null
    if (definition.booking) {
      const settings = definition.booking
      const slot = typeof body.slot === "string" ? body.slot : ""
      const start = Date.parse(slot)
      if (!Number.isFinite(start)) return formError(new Error("Choose a time."), 400, PUBLIC_HEADERS)
      /* Unpaid holds past their time are released first, so their slots count as free (lib/forms/booking-payment.ts). */
      if (settings.payment_product_id) await expireUnpaidBookings(db, new Date().toISOString(), form.owner_id).catch(() => 0)
      const { data: busyRows, error: busyError } = await db
        .from("form_bookings")
        .select("starts_at,hold_until")
        .eq("owner_id", form.owner_id)
        .in("status", ["pending", "confirmed"])
        .lt("starts_at", new Date(start + 2 * 86_400_000).toISOString())
        .gt("hold_until", new Date(start - 2 * 86_400_000).toISOString())
      if (busyError) return formError(new Error(isMissingSchema(busyError) ? "Bookings are not available yet." : "Times could not be checked. Try again."), 503, PUBLIC_HEADERS)
      const busy: Interval[] = ((busyRows || []) as { starts_at: string; hold_until: string }[]).map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.hold_until) }))
      const offered = slotOffered(settings, slot, Date.now(), busy)
      if (!offered) return json({ error: "That time is no longer available. Choose another.", slot_taken: true }, 409)
      const status = settings.approval || settings.payment_product_id ? "pending" : "confirmed"
      const { data, error } = await db.rpc("native_form_book", {
        p_submission: row,
        p_starts_at: offered.start,
        p_ends_at: offered.end,
        p_hold_until: new Date(Date.parse(offered.end) + settings.buffer * 60_000).toISOString(),
        p_visitor_timezone: validTimeZone(body.timezone) ? body.timezone : null,
        p_status: status,
        p_payment_product_id: settings.payment_product_id || null,
      })
      if (error) {
        /* 23505: the same start is held. 23P01: an overlapping booking holds it. Both mean someone was quicker. */
        if (error.code === "23505" || error.code === "23P01") return json({ error: "That time was just taken. Choose another.", slot_taken: true }, 409)
        if (isMissingSchema(error)) return formError(new Error("Bookings are not available yet."), 503, PUBLIC_HEADERS)
        return formError(new Error("Your booking was not saved. Please try again."), 503, PUBLIC_HEADERS)
      }
      const first = (Array.isArray(data) ? data[0] : data) as { submission_id: string; booking_id: string | null; duplicate: boolean } | undefined
      leadId = first?.submission_id || null
      duplicate = first?.duplicate === true
      booked = { id: first?.booking_id || undefined, starts_at: offered.start, status }
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
      const jobs = await queueJobs(db, { ownerId: form.owner_id, formId: id, submissionId: lead, jobs: jobsFor(form.integration_settings as IntegrationSettings) })
      after(async () => {
        const notify = {
          userId: form.owner_id,
          kind: "system" as const,
          source: "system" as const,
          title: booked ? "New booking request" : "New form response",
          body: `${valid.name || valid.email || "Someone"} sent ${definition.title}`.slice(0, 200),
          url: `/app/audience/leads?lead=${lead}`,
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
  booking: { id?: string; starts_at: string; status: string } | null,
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
    href: actionHref(action),
    action_type: action?.type || null,
    action_label: action ? actionLabel(action) : null,
    gated: gated ? { url: gated.url, label: gated.label } : null,
    booking: booking ? { starts_at: booking.starts_at, status: booking.status } : null,
    payment_href: booking ? pay : null,
  }
}
