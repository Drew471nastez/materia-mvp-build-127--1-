import { NextResponse } from "next/server"
import { formActor, NO_STORE, formError, boundedJson } from "@/lib/forms/server"
import { UUID } from "@/lib/forms/actions"
import { clientIntegrations, type StoredIntegrations } from "@/lib/forms/integrations"
import { newWebhookSecret, signWebhook, webhookUrlProblem } from "@/lib/forms/webhook"
import { sealSecret, openSecret, secretHint } from "@/lib/physical/secrets"
import { postSigned } from "@/lib/forms/delivery-server"

/*
  POST { action: "secret" }  a new signing secret, sealed and stored; the
                             plain value is in this answer and nowhere else.
  POST { action: "test" }    a signed form.test delivery to the saved address.
*/
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID.test(id)) return formError(new Error("Form not found."), 404)
  const actor = await formActor()
  if (actor instanceof NextResponse) return actor
  try {
    const body = await boundedJson(request, 1000)
    const { data: form, error } = await actor.db.from("native_forms").select("id,title,integration_settings").eq("id", id).eq("owner_id", actor.user.id).maybeSingle()
    if (error) return formError(new Error("The form could not be read."), 503)
    if (!form) return formError(new Error("Form not found."), 404)
    const stored = (form.integration_settings || {}) as StoredIntegrations
    if (body.action === "secret") {
      const secret = newWebhookSecret()
      const next: StoredIntegrations = { ...stored, webhook: { ...(stored.webhook || {}), secret_sealed: sealSecret(secret), secret_hint: secretHint(secret) || undefined } }
      const updated_at = new Date().toISOString()
      const { error: saveError } = await actor.db.from("native_forms").update({ integration_settings: next, updated_at }).eq("id", id).eq("owner_id", actor.user.id)
      if (saveError) return formError(new Error("The secret was not saved. Try again."), 503)
      return NextResponse.json({ secret, updated_at, integrations: clientIntegrations(next) }, { headers: NO_STORE })
    }
    if (body.action === "test") {
      const url = stored.webhook?.url || ""
      const problem = webhookUrlProblem(url)
      if (problem) return formError(new Error(`Save a webhook address first. ${problem}`))
      const secret = openSecret(stored.webhook?.secret_sealed)
      if (!secret) return formError(new Error("Create a signing secret first."))
      const payload = JSON.stringify({ event: "form.test", form: { id, title: form.title }, sent_at: new Date().toISOString() })
      const timestamp = Math.floor(Date.now() / 1000)
      try {
        const status = await postSigned(url, payload, { "x-storelib-timestamp": String(timestamp), "x-storelib-signature": signWebhook(secret, timestamp, payload), "x-storelib-event": "form.test", "x-storelib-delivery": "test" })
        return status >= 200 && status < 300
          ? NextResponse.json({ ok: true, status }, { headers: NO_STORE })
          : formError(new Error(`Your address answered ${status}. It should answer with a 2xx status.`), 502)
      } catch (e) {
        return formError(new Error(`Your address could not be reached (${e instanceof Error ? e.message : "no answer"}).`), 502)
      }
    }
    return formError(new Error("Unknown action."))
  } catch (error) {
    return formError(error)
  }
}
