import { NextResponse } from "next/server"
import { signedInCreator } from "@/lib/automations/flow-io"
import { stopFlowRuns } from "@/lib/automations/flow-admin"
import { normalizeSteps, problemsOf } from "@/lib/automations/flow-model"

export const runtime = "nodejs"

/**
 * THE SWITCH.
 *
 * On: only a complete flow (problemsOf in lib/automations/flow-model), and
 * only people who trigger it from now on enter. Nobody who joined or bought
 * before is sent anything.
 *
 * Off: nobody new enters, and everyone partway through is taken out with
 * their waiting emails cancelled (lib/automations/flow-admin stopFlowRuns).
 * The reply says how many, so the builder can say so.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await signedInCreator()
  if (me instanceof Response) return me

  let on: boolean
  try {
    const body = await request.json()
    if (typeof body?.on !== "boolean") throw new Error()
    on = body.on
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }

  const { data: flow } = await me.supabase.from("email_flows").select("id, status, trigger_type, steps").eq("id", id).eq("creator_id", me.creatorId).maybeSingle()
  if (!flow) return NextResponse.json({ error: "This flow no longer exists." }, { status: 404 })

  if (on) {
    const problems = problemsOf(flow.trigger_type, normalizeSteps(flow.steps))
    if (problems.length > 0) return NextResponse.json({ error: "Fix these before turning it on.", problems }, { status: 422 })
    if (flow.status !== "active") {
      const { error } = await me.supabase.from("email_flows").update({ status: "active" }).eq("id", id).eq("creator_id", me.creatorId)
      if (error) return NextResponse.json({ error: "Could not turn it on. Try again." }, { status: 500 })
    }
    return NextResponse.json({ status: "active", stopped: 0 })
  }

  const { error } = await me.supabase.from("email_flows").update({ status: "paused" }).eq("id", id).eq("creator_id", me.creatorId)
  if (error) return NextResponse.json({ error: "Could not turn it off. Try again." }, { status: 500 })
  const stopped = await stopFlowRuns(id, "The flow was turned off.")
  return NextResponse.json({ status: "paused", stopped })
}
