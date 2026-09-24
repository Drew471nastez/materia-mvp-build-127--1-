import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { FlowBuilder, type BuilderData, type RunView, type StepStats } from "./builder"

export const metadata: Metadata = { title: "Automation" }
export const dynamic = "force-dynamic"

/**
 * One automation: read here, drawn by builder.tsx. Everything is read with
 * the creator's own session, so row level security decides what is theirs;
 * the run history and numbers come from the engine's tables and are simply
 * empty before its SQL has run (`tracking: false`).
 */
export default async function FlowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/emails/flow/${id}`)}`)

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) redirect("/app")

  const { data: flow } = await supabase
    .from("email_flows")
    .select("id, name, trigger_type, trigger_config, status, steps, updated_at")
    .eq("id", id)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (!flow) redirect("/app/emails?tab=flows")

  const [products, stats, runs, active, finished, left, failed, failedJobs] = await Promise.all([
    supabase.from("products").select("id, title").eq("creator_id", creator.id).order("created_at", { ascending: false }).limit(200),
    supabase.rpc("email_flow_step_stats", { p_flow_id: id }),
    supabase
      .from("email_flow_runs")
      .select("id, email, name, status, exit_reason, started_at, finished_at, current_step_id, source_detail, trigger_type")
      .eq("flow_id", id)
      .order("started_at", { ascending: false })
      .limit(50),
    supabase.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "active"),
    supabase.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "completed"),
    supabase.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).in("status", ["exited", "cancelled"]),
    supabase.from("email_flow_runs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("status", "failed"),
    supabase.from("email_flow_jobs").select("id", { count: "exact", head: true }).eq("flow_id", id).eq("state", "failed"),
  ])

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
    counts: {
      active: active.count ?? 0,
      finished: finished.count ?? 0,
      left: left.count ?? 0,
      failed: failed.count ?? 0,
    },
    failedJobs: failedJobs.count ?? 0,
    tracking,
    accountEmail: user.email ?? null,
  }
  return <FlowBuilder data={data} />
}
