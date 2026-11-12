import { NextResponse } from "next/server"
import { copyName, signedInCreator } from "@/lib/automations/flow-io"
import { normalizeSteps, serializeSteps } from "@/lib/automations/flow-model"

export const runtime = "nodejs"

/**
 * DUPLICATE: a copy of this flow, with its trigger, its rules and every
 * step, always OFF. A copy that started live would send the same emails a
 * second time to everyone the original already reaches, so it waits as a
 * draft until it is changed and turned on. Nothing about who went through
 * the original (runs, sends, numbers) comes with it.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await signedInCreator()
  if (me instanceof Response) return me
  const { data: flow } = await me.supabase
    .from("email_flows")
    .select("id, name, trigger_type, trigger_config, steps")
    .eq("id", id)
    .eq("creator_id", me.creatorId)
    .maybeSingle()
  if (!flow) return NextResponse.json({ error: "This flow no longer exists." }, { status: 404 })

  const { data, error } = await me.supabase
    .from("email_flows")
    .insert({
      creator_id: me.creatorId,
      name: copyName(flow.name),
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config ?? {},
      status: "draft",
      steps: serializeSteps(normalizeSteps(flow.steps)),
    })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[automations] could not copy a flow:", error?.code, error?.message)
    return NextResponse.json({ error: "Could not make a copy. Try again." }, { status: 500 })
  }
  return NextResponse.json({ id: data.id })
}
