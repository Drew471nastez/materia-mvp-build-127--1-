/**
 * GET ?after=<id>  What connected agents wrote to this site since `after`.
 *
 * The builder asks every few seconds while it is open, so a section Claude
 * Code or Codex writes appears on the page being edited. Without `after` it
 * answers with a cursor only: opening the builder does not replay what
 * agents did yesterday.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  /* Row-level security scopes these rows to the creator's own installs. */
  const afterRaw = new URL(req.url).searchParams.get("after")
  const after = afterRaw !== null && /^\d{1,18}$/.test(afterRaw) ? Number(afterRaw) : null

  if (after === null) {
    const { data, error } = await supabase
      .from("theme_agent_activity")
      .select("id")
      .eq("install_id", installId)
      .order("id", { ascending: false })
      .limit(1)
    if (error) return NextResponse.json({ ready: false, cursor: 0, events: [] })
    return NextResponse.json({ ready: true, cursor: data?.[0]?.id ?? 0, events: [] })
  }

  const { data, error } = await supabase
    .from("theme_agent_activity")
    .select("id, agent_name, path, action, created_at")
    .eq("install_id", installId)
    .gt("id", after)
    .order("id", { ascending: true })
    .limit(20)
  if (error) return NextResponse.json({ ready: false, cursor: after, events: [] })
  const events = data ?? []
  return NextResponse.json({ ready: true, cursor: events.length ? events[events.length - 1].id : after, events })
}
