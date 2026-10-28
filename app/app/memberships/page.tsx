import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { teamPageStore } from "@/lib/team/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadCreatorMemberships } from "@/lib/memberships/creator"
import { communitiesEnabled } from "@/lib/communities/flag"
import { CreatorMembershipsList } from "@/components/memberships/creator-list"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Memberships") }
}

/**
 * /app/memberships: the memberships a creator already sells, on their own
 * (lib/memberships/creator.ts leaves out the ones that sell a community's
 * access). SELLER ACCESS: the creator row, as every /app page reads it.
 *
 * MEMBERSHIPS ARE COMMUNITIES NOW. Nothing in the menu or the search points
 * here any more and nothing here makes a new one; the page stays so a
 * creator who sells one can still reach it, its members and its billing.
 * A creator with none (or before the memberships tables exist, when nobody
 * can have one) is sent to Community, or to Products while communities are
 * switched off, where /app/community would be a 404.
 */
export default async function CreatorMembershipsPage() {
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in (memberships are products; their routes ask requireCreator("products")). Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") redirect("/app")
  const list = await loadCreatorMemberships(createAdminClient(), access.creatorId)
  if (!list.available || list.rows.length === 0) redirect((await communitiesEnabled().catch(() => false)) ? "/app/community" : "/app/products")
  return <CreatorMembershipsList rows={list.rows} />
}
