import { NextResponse } from "next/server"
import { TRIGGER_NOT_READY, UNTITLED, signedInCreator, triggerNotReady } from "@/lib/automations/flow-io"
import { BLANK_TEMPLATE, templateById } from "@/lib/automations/templates"
import { defaultEntry, isTriggerType, serializeSteps } from "@/lib/automations/flow-model"

export const runtime = "nodejs"

/**
 * A new flow, from a template or from scratch, always OFF. Choosing a
 * template you already made opens that one instead of making a second copy
 * of it: two "Thank you" flows would send two thank-you emails for every
 * order. From scratch is the trigger the creator chose and no steps: they
 * add every one themselves.
 */
export async function POST(request: Request) {
  const me = await signedInCreator()
  if (me instanceof Response) return me

  let body: { template?: unknown; trigger?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const templateId = typeof body.template === "string" ? body.template : BLANK_TEMPLATE
  const template = templateId === BLANK_TEMPLATE ? null : templateById(templateId)
  if (templateId !== BLANK_TEMPLATE && !template) return NextResponse.json({ error: "Unknown template" }, { status: 400 })

  if (template) {
    const { data: existing } = await me.supabase
      .from("email_flows")
      .select("id, trigger_config")
      .eq("creator_id", me.creatorId)
      .eq("trigger_type", template.trigger)
    /* A flow from before templates were named is the welcome or the thank
       you, as the chooser reads it (app/app/emails/flow/new/page.tsx). */
    const legacy = template.trigger === "new_subscriber" ? "welcome" : template.trigger === "purchase" ? "thank_you" : null
    const same = (existing ?? []).find(
      (f: { trigger_config?: { template?: string } | null }) => (f.trigger_config?.template ?? legacy) === template.id,
    )
    if (same) return NextResponse.json({ id: same.id, existing: true })
  }

  const trigger = template?.trigger ?? (isTriggerType(body.trigger) ? body.trigger : "new_subscriber")
  const { data, error } = await me.supabase
    .from("email_flows")
    .insert({
      creator_id: me.creatorId,
      name: template?.name ?? UNTITLED,
      trigger_type: trigger,
      trigger_config: {
        template: template?.id ?? BLANK_TEMPLATE,
        entry: template?.entry ?? defaultEntry(trigger),
        ...(template?.audience ? { audience: template.audience } : {}),
        ...(template?.productKinds ? { product_kinds: template.productKinds } : {}),
      },
      status: "draft",
      steps: serializeSteps(template?.steps ?? []),
    })
    .select("id")
    .single()

  if (triggerNotReady(error)) return NextResponse.json({ error: TRIGGER_NOT_READY }, { status: 409 })
  if (error || !data) {
    console.error("[automations] could not create a flow:", error?.code, error?.message)
    return NextResponse.json({ error: "Could not create the flow. Try again." }, { status: 500 })
  }
  return NextResponse.json({ id: data.id, existing: false })
}
