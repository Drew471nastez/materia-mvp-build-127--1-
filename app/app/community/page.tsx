import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { loadCreatorCommunities } from "@/lib/communities/server/creator"
import { CommunityList } from "@/components/community/creator/community-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Community" }

/** /app/community: the creator's communities, and the ones they help run. A 404 while communities are switched off. */
export default async function CreatorCommunitiesPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/app")
  const list = await loadCreatorCommunities(admin(), creator.id, user.id)
  return <CommunityList available={list.available} rows={list.rows} />
}
