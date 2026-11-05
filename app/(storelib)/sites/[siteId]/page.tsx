/**
 * The editor route.
 *
 * OUTSIDE /app on purpose. This is a full-viewport tool with its own chrome,
 * and /app's sidebar and mobile nav would take a third of the screen from the
 * thing the page exists to show.
 *
 * Files are loaded on the server and handed down whole. The project is a few
 * dozen small files; fetching them from the client would mean the editor opens
 * empty and fills in, which reads as a slow tool for no gain.
 */

import { notFound } from "next/navigation"

import { EditorShell } from "@/components/sites/editor/editor-shell"
import { getSite, readProject, siteRevisions } from "@/lib/sites/projects"
import { createClient } from "@/lib/supabase/server"
import { pageUser } from "@/lib/auth/page-user"
import { SessionRecovery } from "@/components/auth/session-recovery"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const site = await getSite(siteId)
  return { title: site ? `${site.name} — Storelib AI` : "Storelib AI" }
}

export default async function SiteEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>
  searchParams: Promise<{ brief?: string }>
}) {
  const { siteId } = await params
  /**
   * The brief from the New Site flow. Present exactly once, on the first
   * arrival, and the editor sends it as the opening message — which is what
   * makes "describe your site" produce a site rather than a stored string.
   */
  const { brief } = await searchParams

  const supabase = await createClient()
  const user = await pageUser(`/login?redirect=/sites/${siteId}`)
  /* Supabase did not answer in time. This route has no layout with a gate,
     so it renders the gate itself: the session is recovered in the browser
     rather than thrown away (lib/auth/page-user.ts). */
  if (!user) return <SessionRecovery />

  /**
   * RLS decides. A site somebody else owns comes back null here exactly as a
   * site that does not exist does, which is the right answer to both — there is
   * no version of this page that should confirm a stranger's site is real.
   */
  const site = await getSite(siteId)
  if (!site) notFound()

  const [files, revisions] = await Promise.all([readProject(siteId), siteRevisions(siteId)])

  /**
   * IS WHAT IS LIVE BEHIND WHAT IS ON SCREEN?
   *
   * The editor used to assume "no" on every load — staleness was only ever set
   * by an edit made in the current session. So editing, closing the tab and
   * coming back showed a button reading "Live" over a draft that had never
   * been published, which is precisely how somebody ends up staring at a
   * hero in the editor that the live site has never seen.
   *
   * Both numbers already existed: `revision` moves on every write,
   * `published_revision` records what the last publish was built from. Nothing
   * had ever compared them.
   */
  const behind =
    revisions.publishedRevision !== null && revisions.revision !== revisions.publishedRevision

  return (
    <EditorShell
      site={site}
      initialFiles={files}
      initialRevision={revisions.revision}
      initiallyBehind={behind}
      openingBrief={brief}
    />
  )
}
