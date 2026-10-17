import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin } from "@/lib/communities/server/db"
import { communityRoom } from "@/lib/communities/server/creator-policies"
import { peopleOf } from "@/lib/communities/server/moderation"
import { CreateCommunity } from "@/components/community/creator/create-flow"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New community") }
}

/**
 * /app/community/new: the wizard (round 27: name and address, logo and cover,
 * who can join and the price, review and Create, then the welcome post in the
 * feed's own composer, written as the person signed in); then its Overview. On the Free plan with two communities made, the
 * page opens on the upgrade sheet (lib/communities/plan-limit.ts).
 */
export default async function NewCommunityPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/app")
  const [room, people] = await Promise.all([communityRoom(admin(), creator.id), peopleOf(admin(), [user.id]).catch(() => null)])
  const person = people?.get(user.id)
  return <CreateCommunity limitReached={!room.ok} me={{ userId: user.id, name: person?.name ?? creator.display_name ?? "", avatarUrl: person?.avatarUrl ?? null }} />
}
