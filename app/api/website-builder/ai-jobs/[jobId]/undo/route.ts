import { NextResponse } from "next/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { websiteCaller } from "@/lib/team/website"
import { createAdminClient } from "@/lib/supabase/admin"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { isUuid } from "@/lib/site-blog/http"
import { JOBS_TABLE } from "@/lib/website-builder/ai-site/server"
import { isTerminal } from "@/lib/website-builder/ai-site/agent-runner"
import { redesignState } from "@/lib/website-builder/ai-site/redesign"
import { restoreBackup } from "@/lib/website-builder/restore-backup"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
/* A restore of a large website writes many rows (as the Backups restore route). */
export const maxDuration = 300
const STOP_AFTER_MS = 240_000

type Params = { params: Promise<{ jobId: string }> }

/**
 * POST /api/website-builder/ai-jobs/[jobId]/undo
 *
 * "Undo this AI job" for a Redesign with AI job (round M): restores the
 * backup the redesign route took before the job wrote anything, exactly as
 * Backups restores one (lib/website-builder/restore-backup.ts: a safety copy
 * of the draft first, so the undo can itself be undone from Backups; all or
 * nothing), and removes the pages and ai_ files the AI added and never
 * published (lib/website-builder/added-since.ts). Pages or files the person
 * added since are kept and listed in `added.kept`.
 *
 *   409  the job is still running (cancel it first), or it has no backup
 *        (not a redesign job).
 *   200  { ok, restored, changed, added: { removed, kept } }, or
 *        { ok, already: true } when it was undone before.
 *
 * The owner's only; the job is read with the owner's own client and their
 * store, and the backup with the job's own install.
 */
export async function POST(_req: Request, { params }: Params) {
  const startedAt = Date.now()
  const { jobId } = await params
  if (!isUuid(jobId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const site = await websiteCaller()
  if (site.error !== null) return NextResponse.json({ error: site.error }, { status: site.status })
  if (!site.isOwner) return NextResponse.json({ error: "Only the store owner can do this." }, { status: 403 })
  const limited = await rateLimit({ bucket: "site-ai-undo", subjects: [`user:${site.userId}`], windows: LIMITS.siteAction, message: "Too many tries in a short time. Wait a minute, then try again." })
  if (limited) return limited

  const { data, error } = await site.supabase.from(JOBS_TABLE).select("id, install_id, status, options, state").eq("id", jobId).eq("creator_id", site.creatorId).maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const row = data as { id: string; install_id: string; status: string; options: unknown; state: Record<string, unknown> | null }
  const redesign = redesignState(row.options, row.state?.undo)
  if (!redesign?.backupId) return NextResponse.json({ error: "This AI job has no backup to go back to.", code: "no_backup" }, { status: 409 })
  if (!isTerminal(row.status)) return NextResponse.json({ error: "The AI is still working. Cancel it first, then undo.", code: "job_running" }, { status: 409 })
  if (redesign.undone) return NextResponse.json({ ok: true, already: true, undone: redesign.undone })

  const admin = createAdminClient()
  const r = await restoreBackup(site.supabase as unknown as SupabaseClient, admin as unknown as SupabaseClient, row.install_id, redesign.backupId, {
    deadlineAt: startedAt + STOP_AFTER_MS,
    safetyLabel: () => "Before undoing an AI job",
  })
  if (r.ok === false) {
    const failed = r as { status: number; error: string; rolledBack?: boolean }
    const words = failed.status === 404 ? "The backup taken before this AI job is gone (only the newest 30 are kept), so it cannot be undone here. Pick an older version in Backups." : failed.error
    return NextResponse.json(failed.rolledBack === undefined ? { error: words } : { error: words, rolledBack: failed.rolledBack }, { status: failed.status === 404 ? 410 : failed.status })
  }

  /* Said on the job, so the panel and a reload show it as undone and Undo is not offered twice. */
  const undo = { at: new Date().toISOString(), backupId: redesign.backupId, removed: r.added.removed.length, kept: r.added.kept.length }
  const { error: markErr } = await admin.from(JOBS_TABLE).update({ state: { ...(row.state ?? {}), undo } }).eq("id", jobId).eq("creator_id", site.creatorId)
  if (markErr) console.error("[ai-jobs/undo] undone, but not marked on the job", { code: markErr.code })

  return NextResponse.json({ ok: true, restored: r.restored, changed: r.changed, added: r.added, undone: undo })
}
