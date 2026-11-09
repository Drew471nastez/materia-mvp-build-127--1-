import { websiteInstallCaller } from "@/lib/team/website"
import { recordTeamAction } from "@/lib/team/areas"
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { restoreBackup } from "@/lib/website-builder/restore-backup"

type Params = { params: Promise<{ installId: string; backupId: string }> }

/*
  A restore of an imported theme writes hundreds of files. It has the whole
  of what the platform allows, and stops itself well before that: a restore
  the platform cut off would be one nobody could undo cleanly.
*/
export const maxDuration = 300
const STOP_AFTER_MS = 240_000

/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
async function ownInstall(installId: string) {
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null, who: null }
  return { error: null, status: 200, supabase: c.supabase, who: c }
}

/**
 * POST /api/website-builder/themes/[installId]/backups/[backupId]/restore
 *
 * Puts the backup back as the DRAFT, after taking a safety copy of the draft
 * it is about to replace. So a restore is never a one-way door: the state
 * you had a moment ago is the newest row in the same list. Nothing goes
 * live until the creator publishes.
 *
 * ROUND M: pages and ai_ files an AI job added after the backup, never
 * published, are removed with it, so the site is really as it was
 * (lib/website-builder/added-since.ts); anything else added since is listed
 * in `added.kept` and stays unless the body names it:
 *   body (optional): { removeAdded: ["page:<key>" | "file:<path>", ...] }
 * The steps are lib/website-builder/restore-backup.ts, shared with the AI
 * job's Undo.
 */
export async function POST(req: Request, { params }: Params) {
  const startedAt = Date.now()
  const { installId, backupId } = await params
  const { error, status, supabase, who } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })
  const asked = (await req.json().catch(() => null)) as { removeAdded?: unknown } | null

  // Scoped to the install as well as the id (restore-backup.ts), so a backup id
  // from one website cannot be restored into another even by its owner.
  const r = await restoreBackup(supabase, createAdminClient(), installId, backupId, { deadlineAt: startedAt + STOP_AFTER_MS, removeAdded: asked?.removeAdded })
  if (r.ok === false) {
    const failed = r as { status: number; error: string; rolledBack?: boolean }
    return NextResponse.json(failed.rolledBack === undefined ? { error: failed.error } : { error: failed.error, rolledBack: failed.rolledBack }, { status: failed.status })
  }

  /* A team member's restore is on the record with their name (lib/team/areas). */
  if (who) await recordTeamAction(who, who.userId, "website", "website_restored", { install_id: installId, backup_id: r.restored.id })

  return NextResponse.json({ ok: true, restored: r.restored, changed: r.changed, added: r.added })
}
