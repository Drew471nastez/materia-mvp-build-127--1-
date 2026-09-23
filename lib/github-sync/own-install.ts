/**
 * The signed-in creator's own site, or null. Every GitHub route that acts on
 * a site starts here: a site id in a request is only a claim.
 */
import "server-only"
import { createClient } from "@/lib/supabase/server"

export async function ownInstall(installId: string): Promise<{ creatorId: string; installId: string; name: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(installId)) return null
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator) return null
  const { data: install } = await supabase
    .from("store_theme_installs")
    .select("id, name")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  return install ? { creatorId: creator.id as string, installId: install.id as string, name: (install.name as string) || "Site" } : null
}

/** True when the error is the table not existing yet: the SQL has not been run. */
export function linksNotSetUp(message: string | undefined) {
  return /theme_github_links|does not exist|schema cache/i.test(message ?? "")
}
