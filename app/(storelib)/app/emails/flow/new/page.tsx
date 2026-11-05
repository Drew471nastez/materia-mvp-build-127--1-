import { redirect } from "next/navigation"
import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import { FlowChooser } from "./chooser"
import { pageUser } from "@/lib/auth/page-user"
import { getServerTt } from "@/lib/i18n/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New automation") }
}
export const dynamic = "force-dynamic"

/** The templates, and which of them this creator already made (to open, not copy). */
export default async function NewFlowPage() {
  const supabase = await createClient()
  const user = await pageUser("/login?next=/app/emails/flow/new")
  /* Supabase did not answer in time: the layout's gate recovers the
     session in the browser. Not /login (lib/auth/page-user.ts). */
  if (!user) return null
  /* The store, for its owner or a team member given Marketing (lib/team). */
  const access = await teamPageStore("marketing")
  if (access.kind === "signed_out") return null
  if (access.kind === "denied") return <TeamAreaClosed area="marketing" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "none") redirect("/app")
  const creator = { id: access.creatorId }
  const db = access.isOwner ? supabase : (createAdminClient() as unknown as typeof supabase)
  const { data: flows } = await db.from("email_flows").select("id, trigger_type, trigger_config").eq("creator_id", creator.id).order("created_at", { ascending: true })
  const existing: Record<string, string> = {}
  for (const f of (flows ?? []) as Array<{ id: string; trigger_type: string; trigger_config: { template?: string } | null }>) {
    /* A flow made before templates had a name for it was the welcome email
       or the thank you, one per trigger: it is that template, so choosing it
       again opens it rather than making a second one that would also send. */
    const t = f.trigger_config?.template ?? (f.trigger_type === "new_subscriber" ? "welcome" : f.trigger_type === "purchase" ? "thank_you" : null)
    if (t && !existing[t]) existing[t] = f.id
  }
  return <FlowChooser existing={existing} />
}
