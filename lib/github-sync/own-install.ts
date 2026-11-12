/**
 * The signed-in creator's own site, or null. Every GitHub route that acts on
 * a site starts here: a site id in a request is only a claim.
 *
 * Round rel2-auth: "unavailable" when it could not be told, Supabase Auth not
 * answering about the session or the creator or site read failing. It was
 * null, "Not found", which told a signed in person their site was gone. The
 * routes answer it 503 Try again; nothing is allowed on it.
 */
export async function ownInstall(installId: string): Promise<{ creatorId: string; installId: string; name: string } | null | "unavailable"> {
  if (!/^[0-9a-f-]{36}$/i.test(installId)) return null
  const who = await routeUser({ fresh: true })
  if (who.kind === "unavailable") return "unavailable"
  if (who.kind !== "user") return null
  const supabase = await createClient()
  const { data: creator, error: creatorError } = await supabase.from("creators").select("id").eq("user_id", who.user.id).maybeSingle()
  if (creatorError) return "unavailable"
  if (!creator) return null
  const { data: install, error } = await supabase
    .from("store_theme_installs")
    .select("id, name")
    .eq("id", installId)
    .eq("creator_id", creator.id)
    .maybeSingle()
  if (error) return "unavailable"
  return install ? { creatorId: creator.id as string, installId: install.id as string, name: (install.name as string) || "Site" } : null
}

/** True when the error is the table not existing yet: the SQL has not been run. */
export function linksNotSetUp(message: string | undefined) {
  return /theme_github_links|does not exist|schema cache/i.test(message ?? "")
}
