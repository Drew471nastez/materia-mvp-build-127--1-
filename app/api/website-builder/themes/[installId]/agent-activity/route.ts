/**
 * GET             What this site is connected to, and a cursor. The editor asks
 *                 once when it opens and again when Website settings closes.
 * GET ?after=<id> What connected agents and GitHub pushes wrote since `after`.
 *
 * The builder asks the second while a connection exists and the tab is on
 * screen, quickly while changes arrive and slower while nothing does (see
 * lib/agent-access/connection-mark.ts). It is one indexed read of at most
 * twenty rows, by (install_id, id). Without `after` nothing is replayed:
 * opening the builder does not show what agents did yesterday.
 *
 * Both answers carry `sync_at`, when the GitHub link last changed (a push
 * taken, a file refused, a send that failed), so the builder asks for the
 * sync report (../sync-status) only when there is something new in it.
 *
 * The first answer also carries the brief the top bar draws its mark from:
 * the live agent connections' names and last use, the GitHub repository, and
 * who wrote last. Three small reads, side by side. Never a token, a prefix or
 * a hash.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isMissingActivityTable, type ConnectionsBrief } from "@/lib/agent-access/connection-mark"
import { lateRows } from "@/lib/website-builder/live-follow"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(req: Request, { params }: Params) {
  const { installId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(installId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const supabase = await createClient()
  const { data: { user }, unavailable } = await readUserForRoute()
  if (unavailable) return authUnavailableResponse()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  /* Row-level security scopes every one of these rows to the creator's own installs. */
  const afterRaw = new URL(req.url).searchParams.get("after")
  const after = afterRaw !== null && /^\d{1,18}$/.test(afterRaw) ? Number(afterRaw) : null

  if (after === null) {
    const [latest, tokens, link] = await Promise.all([
      supabase
        .from("theme_agent_activity")
        .select("id, agent_name, created_at")
        .eq("install_id", installId)
        .order("id", { ascending: false })
        .limit(1),
      supabase
        .from("theme_agent_tokens")
        .select("name, last_used_at")
        .eq("install_id", installId)
        .is("revoked_at", null)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("theme_github_links").select("repo_full_name, updated_at").eq("install_id", installId).maybeSingle(),
    ])
    const row = latest.data?.[0] as { id: number; agent_name: string; created_at: string } | undefined
    const connections: ConnectionsBrief = {
      agents: tokens.error
        ? []
        : ((tokens.data ?? []) as { name: string; last_used_at: string | null }[]).map((t) => ({ name: t.name, lastUsedAt: t.last_used_at })),
      github: link.error || !link.data ? null : { repo: (link.data as { repo_full_name: string | null }).repo_full_name ?? null },
      latest: row ? { name: row.agent_name, at: row.created_at } : null,
    }
    /* Without the activity log there is nothing to follow; the mark can still be drawn.
       A blip is not that: the editor asks again. Only a missing table stops it. */
    const syncAt = link.error || !link.data ? null : ((link.data as { updated_at?: string | null }).updated_at ?? null)
    const missing = isMissingActivityTable(latest.error)
    return NextResponse.json({ ready: !latest.error, missing, cursor: row?.id ?? 0, events: [], connections, sync_at: syncAt }, { headers: NO_STORE })
  }

  /* `detail` (an agent's page operations) arrived with RUN_AGENT_MCP.sql; without it, the rows as before. */
  const log = (cols: string) => supabase.from("theme_agent_activity").select(cols).eq("install_id", installId)
  const read = (cols: string) => log(cols).gt("id", after).order("id", { ascending: true }).limit(20)
  /* One more indexed read by the link's key, beside the log's. */
  const linkRead = supabase.from("theme_github_links").select("updated_at").eq("install_id", installId).maybeSingle()
  /*
    ?lookback=1: also the newest rows at or below `after`, the ones young
    enough to have committed after a later id was read (lib/website-builder/
    live-follow.ts lateRows). Twenty rows down the same index, every few
    seconds; the editor applies only the ones it has not.
  */
  const lookback = new URL(req.url).searchParams.get("lookback") === "1"
  const behind = (cols: string) =>
    log(cols).lte("id", after).order("id", { ascending: false }).limit(20)
  let cols = "id, agent_name, path, action, created_at, detail"
  let { data, error } = await read(cols)
  if (error) {
    cols = "id, agent_name, path, action, created_at"
    ;({ data, error } = await read(cols))
  }
  if (error) {
    if (isMissingActivityTable(error)) return NextResponse.json({ ready: false, missing: true, cursor: after, events: [] }, { headers: NO_STORE })
    return NextResponse.json({ ready: true, retry: true, cursor: after, events: [] }, { status: 503, headers: NO_STORE })
  }
  const events = (data ?? []) as unknown as { id: number }[]
  /* A look back that fails is no late rows: the new ones still go. */
  const back = lookback ? await behind(cols) : null
  const late = back && !back.error ? lateRows((back.data ?? []) as unknown as { id: number; created_at?: string | null }[], Date.now()) : []
  const linked = await linkRead
  const syncAt = linked.error || !linked.data ? null : ((linked.data as { updated_at?: string | null }).updated_at ?? null)
  return NextResponse.json({ ready: true, cursor: events.length ? events[events.length - 1].id : after, events, late, sync_at: syncAt }, { headers: NO_STORE })
}
