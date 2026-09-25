import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { takeBackup } from "@/lib/website-builder/backups"

type Params = { params: Promise<{ installId: string }> }

/**
 * The same ownership check every theme route makes: signed in, a creator,
 * and this install is theirs. A backup route that trusted the install id in
 * the URL would let anyone list anyone's history.
 */
async function ownInstall(installId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized", status: 401, supabase: null }

  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return { error: "Creator not found", status: 404, supabase: null }

  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (!install) return { error: "Theme not found", status: 404, supabase: null }

  return { error: null, status: 200, supabase }
}

// GET /api/website-builder/themes/[installId]/backups
// Newest first. The list never carries the snapshots themselves.
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const { data, error: fetchErr } = await supabase
    .from("store_theme_backups")
    .select("id, label, source, created_at")
    .eq("install_id", installId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (fetchErr) {
    // The table is created by RUN_THEME_BACKUPS.sql. Until it has been run,
    // say so rather than pretend there are no backups.
    const missing = /store_theme_backups/.test(fetchErr.message) && /relation|does not exist|schema cache/i.test(fetchErr.message)
    return NextResponse.json(
      { error: missing ? "Backups are not set up yet. Run RUN_THEME_BACKUPS.sql." : fetchErr.message },
      { status: missing ? 503 : 500 },
    )
  }

  return NextResponse.json({ backups: data ?? [] })
}

/**
 * The editor labels the backup it takes after an AI task with the prompt,
 * which may be 2000 characters, and this used to refuse anything over 400:
 * the backup was never taken and nothing said so, because the editor does
 * not wait for the answer. A long label is shortened instead (takeBackup
 * trims it further for display), by characters, so an emoji is not cut in
 * half.
 */
const LABEL_MAX = 400

const PostSchema = z.object({
  label: z.string().transform((s) => Array.from(s).slice(0, LABEL_MAX).join("")).optional(),
  source: z.enum(["ai", "manual"]).optional(),
})

// POST /api/website-builder/themes/[installId]/backups
// body: { label?: string, source?: "ai" | "manual" }
// Only the two sources a client may claim. "publish" and "restore" are
// written by the server from the routes that do those things.
export async function POST(req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  let body: unknown = {}
  try {
    body = await req.json()
  } catch {
    /* an empty body is a manual backup */
  }
  const parsed = PostSchema.safeParse(body ?? {})
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const source = parsed.data.source ?? "manual"
  const label = parsed.data.label ?? (source === "ai" ? "Storelib AI finished a task" : "Manual backup")

  const result = await takeBackup(supabase, installId, { label, source })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ backup: result.backup, skipped: result.skipped })
}
