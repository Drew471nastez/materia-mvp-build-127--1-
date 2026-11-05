import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { creatorForRequest, profileForRequest } from "@/lib/auth/request-scope"
import { teamPageStore } from "@/lib/team/server"
import { storeHandle } from "@/lib/team/store-handle"
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
  /* Whose store (round 41): the owner's own, or the store a team member with Products works in, with the store owner's handle. */
  const access = await teamPageStore("products")
  if (access.kind === "signed_out" || access.kind === "denied") return null
  if (access.kind === "none") redirect("/app")
  const handle = access.isOwner ? await ownHandle(access.userId) : await storeHandle(createAdminClient(), access.creatorId, access.ownerUserId)
  if (handle === undefined) redirect("/app")
  const read = await loadCreatorMembership(createAdminClient(), access.creatorId, id, handle)
  if (read.state === "not-found") notFound()
  if (read.state === "missing-tables") redirect("/app/memberships")
  const tab = query.tab === "members" || query.tab === "settings" || query.tab === "updates" ? query.tab : null
  return <CreatorMembershipScreenView screen={read.screen} initialTab={tab} isNew={query.new === "1"} />
}

/** The owner's own handle, as before: their username, else their store's address. undefined when they have no store. */
async function ownHandle(userId: string): Promise<string | null | undefined> {
  const [creator, profile] = await Promise.all([creatorForRequest(userId), profileForRequest(userId)])
  if (!creator) return undefined
  return profile?.username || creator.slug || null
}
