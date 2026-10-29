import { websiteInstallCaller } from "@/lib/team/website"
import { NextResponse } from "next/server"
import { z } from "zod"
import { takeBackup } from "@/lib/website-builder/backups"
import { LIMITS, rateLimit } from "@/lib/api/rate-limit"
import { BODY_LIMITS, readEditorBody } from "@/lib/website-builder/request-body"

type Params = { params: Promise<{ installId: string }> }

/**
 * The same ownership check every theme route makes: signed in, a creator,
 * and this install is theirs. A backup route that trusted the install id in
 * the URL would let anyone list anyone's history.
 */
/* The owner, or a team member with Website working in the store (lib/team/website): the site in the URL must be the store's. */
async function ownInstall(installId: string) {
  const c = await websiteInstallCaller(installId)
  if (c.error !== null) return { error: c.error, status: c.status, supabase: null }
  return { error: null, status: 200, supabase: c.supabase, userId: c.userId }
}

// GET /api/website-builder/themes/[installId]/backups
// Newest first. The list never carries the snapshots themselves.
export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const { error, status, supabase, userId } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  const limited = await rateLimit({ bucket: "site-backups-read", subjects: [`user:${userId}`], windows: LIMITS.siteRead })
  if (limited) return limited

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
  const { error, status, supabase, userId } = await ownInstall(installId)
  if (error || !supabase) return NextResponse.json({ error }, { status })

  /* One after each AI task and one per press: LIMITS.siteAction is far above both. */
  const limited = await rateLimit({
    bucket: "site-backup",
    subjects: [`user:${userId}`],
    windows: LIMITS.siteAction,
    message: "Too many backups in a short time. Wait a minute and try again.",
  })
  if (limited) return limited

  /* A label and a source, so a small cap: lib/website-builder/request-body.ts. */
  const read = await readEditorBody(req, BODY_LIMITS.small)
  if (read.ok === false) return read.response
  /* an empty body is a manual backup */
  const parsed = PostSchema.safeParse(read.invalid ? {} : (read.json ?? {}))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  const source = parsed.data.source ?? "manual"
  const label = parsed.data.label ?? (source === "ai" ? "Storelib AI finished a task" : "Manual backup")

  const result = await takeBackup(supabase, installId, { label, source })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ backup: result.backup, skipped: result.skipped })
}
