import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { pageUser } from "@/lib/auth/page-user"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { communitiesEnabled } from "@/lib/communities/flag"
import { CreateCommunity } from "@/components/community/creator/create-flow"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "New community" }

/** /app/community/new: name, description, logo, cover, who can join, the price; then its Overview. */
export default async function NewCommunityPage() {
  if (!(await communitiesEnabled())) notFound()
  const user = await pageUser()
  if (!user) return null
  if (!(await creatorForRequest(user.id))) redirect("/app")
  return <CreateCommunity />
}
