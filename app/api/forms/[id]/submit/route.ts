import { NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { rateLimit, addressSubject } from "@/lib/api/rate-limit"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { UUID, actionHref, type NativeAction } from "@/lib/forms/actions"
import { validateDefinition, validateAnswers } from "@/lib/forms/definition"
import { PUBLIC_HEADERS, formError, boundedJson } from "@/lib/forms/server"
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS })
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!UUID.test(id))
    return formError(new Error("Form not found."), 404, PUBLIC_HEADERS)
  const limited = await rateLimit({
    bucket: "native-form-submit",
    subjects: [addressSubject(request)],
    windows: [
      { limit: 30, seconds: 600 },
      { limit: 200, seconds: 86400 },
    ],
  })
  if (limited) {
    for (const [key, value] of Object.entries(PUBLIC_HEADERS))
      limited.headers.set(key, value)
    return limited
  }
  try {
    const body = await boundedJson(request)
    if (
      body.website ||
      typeof body.started_at !== "number" ||
      !Number.isFinite(body.started_at) ||
      Date.now() - body.started_at < 700
    )
      return formError(
        new Error("Please wait a moment and try again."),
        400,
        PUBLIC_HEADERS,
      )
    if (!UUID.test(body.submission_id || ""))
      return formError(
        new Error("Reload the form and try again."),
        400,
        PUBLIC_HEADERS,
      )
    if (body.consent !== true)
      return formError(
        new Error("Please accept the consent notice to send this form."),
        400,
        PUBLIC_HEADERS,
      )
    const db = createAdminClient()
    const { data: form, error: readError } = await db
      .from("native_forms")
      .select("id,owner_id,title,published,revision,integration_settings")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle()
    if (readError)
      return formError(
        new Error("The form could not be read. Try again."),
        503,
        PUBLIC_HEADERS,
      )
    if (!form?.published)
      return formError(
        new Error("This form is not available."),
        404,
        PUBLIC_HEADERS,
      )
    if (body.revision !== form.revision)
      return formError(
        new Error("This form has changed. Reload it before sending."),
        409,
        PUBLIC_HEADERS,
      )
    const definition = validateDefinition(form.published),
      valid = validateAnswers(definition, body.answers)
    const source = ["onepage", "website", "creator_page"].includes(body.source)
      ? body.source
      : "form"
    let sourceUrl: string | null = null
    try {
      const u = new URL(body.source_url)
      if (["https:", "http:"].includes(u.protocol))
        sourceUrl = (u.origin + u.pathname).slice(0, 2048)
    } catch {}
    const { data: lead, error } = await db
      .from("form_submissions")
      .insert({
        owner_id: form.owner_id,
        form_id: id,
        form_revision: form.revision,
        form_title: definition.title,
        answers: valid.answers,
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
        dedupe_key: body.submission_id,
      })
      .select("id")
      .single()
    if (error && error.code !== "23505")
      return formError(
        new Error("Your answers were not saved. Please try again."),
        503,
        PUBLIC_HEADERS,
      )
    if (error?.code === "23505") {
      const { data: existing } = await db
        .from("form_submissions")
        .select("answers,form_revision")
        .eq("form_id", id)
        .eq("dedupe_key", body.submission_id)
        .maybeSingle()
      if (
        !existing ||
        existing.form_revision !== form.revision ||
        JSON.stringify(existing.answers) !== JSON.stringify(valid.answers)
      )
        return formError(
          new Error(
            "This response was already received. Reload the form to send different answers.",
          ),
          409,
          PUBLIC_HEADERS,
        )
    }
    if (lead?.id)
      after(async () => {
        const notify = {
          userId: form.owner_id,
          kind: "system" as const,
          source: "system" as const,
          title: "New form response",
          body: `A response to ${definition.title}`,
          url: `/app/audience/leads?form=${id}`,
          dedupeKey: `form-response:${lead.id}`,
        }
        if ((await notifyUser(db as never, notify)) === "unavailable")
          await notifyUser(db as never, notify)
        const providers = ["webhook", "google_sheets"].filter(
          (key) => form.integration_settings?.[key]?.prepared === true,
        )
        if (providers.length)
          await db.from("form_integration_jobs").upsert(
            providers.map((provider) => ({
              owner_id: form.owner_id,
              form_id: id,
              submission_id: lead.id,
              provider,
              state: "pending_setup",
            })),
            { onConflict: "submission_id,provider", ignoreDuplicates: true },
          )
      })
    let action = definition.completion.action
    if (action?.type === "whatsapp" && definition.completion.include_answers) {
      action = {
        ...action,
        message: [
          action.message,
          ...valid.answers.map(
            (a) =>
              `${a.label}: ${Array.isArray(a.value) ? a.value.join(", ") : a.value}`,
          ),
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000),
      } as NativeAction
    }
    return NextResponse.json(
      {
        ok: true,
        message: definition.completion.message,
        href: actionHref(action),
        action_type: action?.type || null,
      },
      { status: error ? 200 : 201, headers: PUBLIC_HEADERS },
    )
  } catch (error) {
    return formError(error, 400, PUBLIC_HEADERS)
  }
}
