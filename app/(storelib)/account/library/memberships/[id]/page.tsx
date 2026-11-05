import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { fullUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadMembershipPage } from "@/lib/memberships/library"
import { NOT_SET_UP, viewerOf } from "@/lib/memberships/server"
import { MemberPage } from "@/components/memberships/member-page"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Membership" }

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ welcome?: string; card?: string }>
}

/**
 * /library/memberships/<id>: one membership, its creator's posts first
 * (lib/memberships/library.ts loadMembershipPage, components/memberships/member-page).
 * Only the member's own, by their account or the confirmed address they
 * paid with; anybody else gets the not found page, never a hint that it
 * exists. `?welcome=1` after joining, `?card=updated` back from changing
 * the card on Stripe's page.
 */
export default async function MembershipPageRoute({ params, searchParams }: Props) {
  const [{ id }, query, { user }] = await Promise.all([params, searchParams, fullUserForRequest()])
  const viewer = viewerOf(user)
  if (!viewer) return null
  const read = await loadMembershipPage(createAdminClient(), viewer, id)
  if (read.state === "missing-tables") {
    return <div className="mx-auto max-w-3xl rounded-2xl border border-[#e5e7eb]/70 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280]">{NOT_SET_UP}</div>
  }
  if (read.state === "not-found") notFound()
  return <MemberPage page={read.page} welcome={query.welcome === "1"} cardUpdated={query.card === "updated"} />
}
