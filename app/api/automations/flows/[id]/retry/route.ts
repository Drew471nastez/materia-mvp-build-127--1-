import { NextResponse } from "next/server"
import { signedInCreator } from "@/lib/automations/flow-io"
import { retryFailedJobs } from "@/lib/automations/flow-admin"
import { processSoon } from "@/lib/automations/run"

export const runtime = "nodejs"

/** "Try again" on the failed runs of a flow that is on. See retryFailedJobs. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const me = await signedInCreator()
  if (me instanceof Response) return me
  const { data: flow } = await me.supabase.from("email_flows").select("id, status").eq("id", id).eq("creator_id", me.creatorId).maybeSingle()
  if (!flow) return NextResponse.json({ error: "This flow no longer exists." }, { status: 404 })
  if (flow.status !== "active") return NextResponse.json({ error: "Turn the flow on to try again." }, { status: 409 })
  const retried = await retryFailedJobs(id)
  if (retried > 0) processSoon()
  return NextResponse.json({ retried })
}
