/**
 * GET  Whether this site has anything to publish, and what its last GitHub
 *      sync did, in words the builder shows (lib/github-sync/editor-status.ts).
 *
 * The builder asks when it opens, when a connected agent or a push writes
 * (its activity follow, components/website-builder/site-connections.tsx),
 * and after Publish. Signed in, and only for a site that is this creator's:
 * the id in the address is a claim until ownInstall says otherwise. Never a
 * token, a key, an installation id or a stack trace: the report is built
 * from the link's saved sync result, and its words are cleaned.
 */
import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { ownInstall } from "@/lib/github-sync/own-install"
import { editorReport, readPending } from "@/lib/github-sync/editor-status"
import type { GitHubLink } from "@/lib/github-sync/sync"
import { rateLimit } from "@/lib/api/rate-limit"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ installId: string }> }

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(_req: Request, { params }: Params) {
  const { installId } = await params
  const own = await ownInstall(installId)
  if (!own) return NextResponse.json({ error: "Not found" }, { status: 404 })

  /* Generous: the builder asks a few times a minute at most, two tabs included. */
  const limited = await rateLimit({
    bucket: "site-sync-status",
    subjects: [`install:${own.installId}`],
    windows: [{ limit: 60, seconds: 60 }],
    message: "Checking too often. Wait a moment.",
  })
  if (limited) return limited

  const db = createAdminClient()
  const [pending, linkRead] = await Promise.all([
    readPending(db, own.installId),
    db
      .from("theme_github_links")
      .select("repo_full_name, branch, root_path, last_error, sync_state, updated_at")
      .eq("install_id", own.installId)
      .maybeSingle()
      .then(
        (r: { data: unknown; error: { message?: string } | null }) => r,
        () => ({ data: null, error: { message: "unreachable" } }),
      ),
  ])
  const link = linkRead.error ? null : ((linkRead.data as (GitHubLink & { updated_at?: string }) | null) ?? null)
  return NextResponse.json(
    {
      pending,
      github: link ? editorReport(link) : null,
      linked: !!link?.repo_full_name,
      syncAt: link?.updated_at ?? null,
    },
    { headers: NO_STORE },
  )
}
