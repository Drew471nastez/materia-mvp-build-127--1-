/**
 * The site's history.
 *
 * Snapshots have been taken before every agent run since the agent existed;
 * until now the only way to reach one was the Undo button on the exchange that
 * created it, which disappears the moment the page reloads. This is the list.
 *
 * The snapshot BODIES are deliberately not returned — a version is a few dozen
 * files and a busy site has fifty versions, so a list that carried them would
 * be megabytes to render a sidebar. Restoring fetches the one that was chosen.
 */

import { type NextRequest, NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params
  const supabase = await createClient()

  const { data } = await supabase
    .from("site_versions")
    .select("id, label, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(50)

  return NextResponse.json({ versions: data ?? [] })
}
