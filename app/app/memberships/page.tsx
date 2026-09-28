import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { creatorForRequest } from "@/lib/auth/request-scope"
import { pageUser } from "@/lib/auth/page-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadCreatorMemberships } from "@/lib/memberships/creator"
import { CreatorMembershipsList } from "@/components/memberships/creator-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Memberships" }

/** /app/memberships: the creator's memberships (lib/memberships/creator.ts). SELLER ACCESS: the creator row, as every /app page reads it. */
export default async function CreatorMembershipsPage() {
  const user = await pageUser()
  /* Supabase did not answer in time: the layout's gate recovers the session in the browser (lib/auth/page-user.ts). */
  if (!user) return null
  const creator = await creatorForRequest(user.id)
  if (!creator) redirect("/app")
  const list = await loadCreatorMemberships(createAdminClient(), creator.id)
  return <CreatorMembershipsList available={list.available} rows={list.available ? list.rows : []} />
}
