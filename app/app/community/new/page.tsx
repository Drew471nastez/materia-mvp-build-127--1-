import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { communityRoom } from "@/lib/communities/server/creator"
import { CreateCommunity } from "@/components/community/creator/create-flow"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "New community" }

/**
 * /app/community/new: name, description, logo, cover, who can join, the
 * price; then its Overview. On the Free plan with two communities made, the
 * page opens on the upgrade sheet (lib/communities/plan-limit.ts).
 */
export default async function NewCommunityPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/app")
  const room = await communityRoom(admin(), creator.id)
  return <CreateCommunity limitReached={!room.ok} />
}
