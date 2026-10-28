import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { loadCreatorCommunities } from "@/lib/communities/server/creator"
import { CommunityList } from "@/components/community/creator/community-list"
import { getServerTt } from "@/lib/i18n/server"
import { teamPageStore } from "@/lib/team/server"
import { TeamAreaClosed } from "@/components/app/team-area-closed"

export const dynamic = "force-dynamic"
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Community") }
}

/** /app/community: the creator's communities, and the ones they help run. A 404 while communities are switched off. */
export default async function CreatorCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  /* Round 40: a store's team member with Community lists the store's communities (lib/communities/server/team.ts). */
  const access = await teamPageStore("community")
  if (access.kind === "denied") return <TeamAreaClosed area="community" store={access.acting.name} permissions={access.acting.permissions} />
  if (access.kind === "store" && !access.isOwner) {
    const list = await loadCreatorCommunities(admin(), access.creatorId, user.id, { team: true })
    return <CommunityList available={list.available} rows={list.rows} limit={list.limit} canCreate={false} />
  }
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/app")
  const list = await loadCreatorCommunities(admin(), creator.id, user.id)
  return <CommunityList available={list.available} rows={list.rows} limit={list.limit} />
}
