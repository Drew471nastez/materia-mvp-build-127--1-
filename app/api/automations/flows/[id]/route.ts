import { NextResponse } from "next/server"
import { TRIGGER_NOT_READY, UNTITLED, cleanName, cleanSteps, cleanTrigger, cleanTriggerConfig, signedInCreator, triggerNotReady } from "@/lib/automations/flow-io"
import { stopFlowRuns } from "@/lib/automations/flow-admin"
import { isTriggerType, problemsOf, type TriggerType } from "@/lib/automations/flow-model"

export const runtime = "nodejs"

type Params = { params: Promise<{ id: string }> }

/**
 * Saving a flow. Saving never turns it on or off (that is the switch, and
 * only the switch). A flow that is on can be edited, but not into one that
 * could not be turned on: the save is refused with the problems in words, and
 * nothing already sent is touched. What starts it can change only while it
 * is off, because the people already in it entered for the old reason.
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params
  const me = await signedInCreator()
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const { data: flow } = await me.supabase.from("email_flows").select("id, status, trigger_type, trigger_config").eq("id", id).eq("creator_id", me.creatorId).maybeSingle()
  if (!flow) return NextResponse.json({ error: "This flow no longer exists." }, { status: 404 })

  const on = flow.status === "active"
  const wanted = cleanTrigger(body.trigger_type)
  if (wanted && wanted !== flow.trigger_type && on) {
    return NextResponse.json({ error: "Turn the flow off to change what starts it." }, { status: 409 })
  }
  const trigger: TriggerType = wanted ?? (isTriggerType(flow.trigger_type) ? flow.trigger_type : "new_subscriber")
  const steps = cleanSteps(body.steps)
  if (on) {
    const problems = problemsOf(trigger, steps)
    if (problems.length > 0) return NextResponse.json({ error: "Fix these first. The flow is on, so it can only be saved complete.", problems }, { status: 422 })
  }

  const patch = {
    name: cleanName(body.name) ?? UNTITLED,
    trigger_type: trigger,
    trigger_config: cleanTriggerConfig(trigger, body.trigger_config, flow.trigger_config),
    steps,
    updated_at: new Date().toISOString(),
  }
  const { data: saved, error } = await me.supabase.from("email_flows").update(patch).eq("id", id).eq("creator_id", me.creatorId).select("id, name, trigger_type, trigger_config, status, steps, updated_at").single()
  if (triggerNotReady(error)) return NextResponse.json({ error: TRIGGER_NOT_READY }, { status: 409 })
  if (error || !saved) {
    console.error("[automations] could not save a flow:", error?.code, error?.message)
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 })
  }
  return NextResponse.json({ flow: saved })
}

/** Deleting takes everyone out first, then the flow and its history go. */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params
  const me = await signedInCreator()
  if (!me) return NextResponse.json({ error: "Sign in again." }, { status: 401 })
  const { data: flow } = await me.supabase.from("email_flows").select("id").eq("id", id).eq("creator_id", me.creatorId).maybeSingle()
  if (!flow) return NextResponse.json({ ok: true })
  await me.supabase.from("email_flows").update({ status: "paused" }).eq("id", id).eq("creator_id", me.creatorId)
  await stopFlowRuns(id, "The flow was deleted.")
  const { error } = await me.supabase.from("email_flows").delete().eq("id", id).eq("creator_id", me.creatorId)
  if (error) {
    console.error("[automations] could not delete a flow:", error.code, error.message)
    return NextResponse.json({ error: "Could not delete. Try again." }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
