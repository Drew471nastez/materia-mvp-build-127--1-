import { NextResponse } from "next/server"
import { readTwice, UNREACHABLE } from "@/lib/website-builder/owned-install"
import { createClient } from "@/lib/supabase/server"
import { applySnapshot, takeBackup, type BackupSnapshot } from "@/lib/website-builder/backups"

type Params = { params: Promise<{ installId: string; backupId: string }> }

async function ownInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null }

  const { data: creator, error: creatorReadErr } = await readTwice(() => supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle())
  if (creatorReadErr) return { error: UNREACHABLE, status: 503, supabase: null }
  if (!creator) return { error: "Creator not found", status: 404, supabase: null }

  const { data: install, error: installReadErr } = await readTwice(() => supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle())
  if (installReadErr) return { error: UNREACHABLE, status: 503, supabase: null }
  if (!install) return { error: "Theme not found", status: 404, supabase: null }

  return { error: null, status: 200, supabase }
}

/**
 * POST /api/website-builder/themes/[installId]/backups/[backupId]/restore
 *
 * Puts the backup back as the DRAFT, after taking a safety copy of the draft
 * it is about to replace. So a restore is never a one-way door: the state
 * you had a moment ago is the newest row in the same list. Nothing goes
 * live until the creator publishes.
 */
export async function POST(_req: Request, { params }: Params) {
  const { installId, backupId } = await params
  const { error, status, supabase } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  // Scoped to the install as well as the id, so a backup id from one website
  // cannot be restored into another even by its owner.
  const { data: backup, error: readErr } = await supabase
    .from("store_theme_backups")
    .select("id, label, snapshot, created_at")
    .eq("id", backupId)
    .eq("install_id", installId)
    .maybeSingle()

  /* The database's own words go to the log, never to the browser. */
  if (readErr) {
    console.error("[backups/restore] failed", { code: readErr.code })
    return NextResponse.json({ error: "Could not load that. Try again." }, { status: 500 })
  }
  if (!backup) return NextResponse.json({ error: "Backup not found" }, { status: 404 })

  const snapshot = backup.snapshot as BackupSnapshot
  if (!snapshot || typeof snapshot !== "object" || !Array.isArray(snapshot.pages)) {
    return NextResponse.json({ error: "This backup cannot be read" }, { status: 422 })
  }

  const safety = await takeBackup(supabase, installId, {
    label: `Before restoring "${backup.label}"`,
    source: "restore",
  })
  if (safety.error) return NextResponse.json({ error: safety.error }, { status: 500 })

  const applied = await applySnapshot(supabase, installId, snapshot)
  if (applied.error) return NextResponse.json({ error: applied.error }, { status: 500 })

  return NextResponse.json({ ok: true, restored: { id: backup.id, label: backup.label, created_at: backup.created_at } })
}
