import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { FlowBuilder, type BuilderData, type RunView, type StepStats } from "./builder"
import { pageUser } from "@/lib/auth/page-user"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"
import { supabaseStore } from "@/lib/automations/supabase-store"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Identity } from "@/lib/automations/engine"
import { getServerTt } from "@/lib/i18n/server"
import { displayEmail } from "@/lib/businesses/email-alias"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Automation") }
}
export const dynamic = "force-dynamic"

/**
 * One automation: read here, drawn by builder.tsx, so the page's first frame
 * is the flow itself with nothing to load after it (no skeleton, nothing that
 * moves when it arrives). The owner reads with their own session, so row
 * level security decides what is theirs; a team member given Marketing
 * (lib/team) reads the store they work in through the service role, and the
 * flow is the store's or the page goes back to the list. The run history and numbers
 * come from the engine's tables and are simply empty before its SQL has run
 * (`tracking: false`).
 *
 * ONE ROUND AFTER SIGN IN. The flow, its numbers and its history are read by
 * the flow's id, all at once, beside the creator's row (the /app layout's
 * own cached read, so not a query of its own); the products follow the
 * creator inside the same round. It used to be four rounds one after
 * another: the user, the creator, the flow, then the rest.
 */
export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await pageUser(`/login?next=${encodeURIComponent(`/app/emails/flow/${id}`)}`)
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/app/emails?tab=flows")

  /* The store, from the same cached reads the /app layout makes for this request: no second query. */
  const access = await teamPageStore("marketing")
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="marketing" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") redirect("/app")
  const creatorRead = Promise.resolve({ id: access.creatorId })
  /* A member's own session cannot read the store's rows; every read below is by this flow, checked to be the store's before anything is drawn. */
  const db = access.isOwner ? supabase : (createAdminClient() as unknown as typeof supabase)
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0, () => 0)
  const [creator, flowRes, products, stats, runs, active, finished, left, failed, failedJobs, starts, look] = await Promise.all([
    creatorRead,
    db.from("email_flows").select("id, creator_id, name, trigger_type, trigger_config, status, steps, updated_at").eq("id", id).maybeSingle(),
    creatorRead.then(async (data): Promise<{ data: Array<{ id: string; title: string }> | null }> =>
      data ? await db.from("products").select("id, title").eq("creator_id", data.id).order("created_at", { ascending: false }).limit(200) : { data: [] },
    ),
    db.rpc("email_flow_step_stats", { p_flow_id: id }),
    db
      .from("email_flow_runs")
      .select("id, email, name, status, exit_reason, started_at, finished_at, current_step_id, source_detail, trigger_type")
      .eq("flow_id", id)
      .order("started_at", { ascending: false })
      .limit(50),
    count(db.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "active")),
    count(db.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "completed")),
    count(db.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).in("status", ["exited", "cancelled"])),
    count(db.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "failed")),
    count(db.from("email_flow_jobs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("state", "failed")),
    /* Whether started checkouts are recorded yet (RUN_CHECKOUT_CONTACTS.sql). */
    db.from("checkout_starts").select("id", { head: true }).limit(1),
    /* The creator as a send reads them (name, store, logo, colour, photo), for the preview: the same read, not a copy. */
    creatorRead.then(
      (c): Promise<Identity | null> => (c ? supabaseStore(createAdminClient()).identity(c.id) : Promise.resolve(null)),
      () => null,
    ).catch(() => null),
  ])

  if (!creator) redirect("/app")
  const flow = flowRes.data
  /* Row level security keeps other creators' flows out for the owner; for a member this is the check. */
  if (!flow || flow.creator_id !== creator.id) redirect("/app/emails?tab=flows")

  const tracking = !runs.error
  const stepStats: Record<string, StepStats> = {}
  for (const row of (Array.isArray(stats.data) ? stats.data : []) as Array<StepStats & { step_id: string }>) {
    stepStats[row.step_id] = { sent: Number(row.sent) || 0, opened: Number(row.opened) || 0, clicked: Number(row.clicked) || 0, failed: Number(row.failed) || 0 }
  }

  const data: BuilderData = {
    flow: {
      id: flow.id,
      name: flow.name,
      trigger_type: flow.trigger_type,
      trigger_config: flow.trigger_config ?? null,
      status: flow.status,
      steps: flow.steps,
      updated_at: flow.updated_at,
    },
    products: (products.data ?? []) as Array<{ id: string; title: string }>,
    stats: stepStats,
    runs: tracking ? ((runs.data ?? []) as RunView[]) : [],
    counts: { active, finished, left, failed },
    failedJobs,
    tracking,
    startsRecorded: !starts.error,
    accountEmail: displayEmail(user.email),
    look: look ? { fromName: look.fromName, replyTo: "", storeUrl: look.storeUrl, brand: look.brand, avatarUrl: look.avatarUrl ?? null } : null,
  }
  return <FlowBuilder data={data} />
}
