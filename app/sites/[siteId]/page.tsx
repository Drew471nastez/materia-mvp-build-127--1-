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

import { notFound, redirect } from "next/navigation"

import { EditorShell } from "@/components/sites/editor/editor-shell"
import { getSite, readProject } from "@/lib/sites/projects"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const site = await getSite(siteId)
  return { title: site ? `${site.name} — Storelib AI` : "Storelib AI" }
}

export default async function SiteEditorPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirect=/sites/${siteId}`)

  /**
   * RLS decides. A site somebody else owns comes back null here exactly as a
   * site that does not exist does, which is the right answer to both — there is
   * no version of this page that should confirm a stranger's site is real.
   */
  const site = await getSite(siteId)
  if (!site) notFound()

  return <EditorShell site={site} initialFiles={await readProject(siteId)} />
}
