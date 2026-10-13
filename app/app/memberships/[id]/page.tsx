import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { creatorForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadCreatorMembership } from "@/lib/memberships/creator"
import { CreatorMembershipScreenView } from "@/components/memberships/creator-screen"
import { getServerTt } from "@/lib/i18n/server"

export const dynamic = "force-dynamic"
export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("Membership") }
}

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; new?: string }>
}

/**
 * /app/memberships/<id>: one membership, for its creator. Updates (post one,
 * and what was posted), Members (who, where each stands) and Settings (the
 * page, the prices, what members get). SELLER ACCESS: the creator row, as
 * every /app page reads it.
 */
export default async function CreatorMembershipPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const user = await pageUser()
  if (!user) return null
  const [creator, profile] = await Promise.all([creatorForRequest(user.id), profileForRequest(user.id)])
  if (!creator) redirect("/app")
  const read = await loadCreatorMembership(createAdminClient(), creator.id, id, profile?.username || creator.slug || null)
  if (read.state === "not-found") notFound()
  if (read.state === "missing-tables") redirect("/app/memberships")
  const tab = query.tab === "members" || query.tab === "settings" || query.tab === "updates" ? query.tab : null
  return <CreatorMembershipScreenView screen={read.screen} initialTab={tab} isNew={query.new === "1"} />
}
