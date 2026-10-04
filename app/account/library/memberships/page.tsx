import type { Metadata } from "next"
import { currentUserForRequest } from "@/lib/auth/request-scope"
import { createAdminClient } from "@/lib/supabase/admin"
import { loadLibraryMemberships } from "@/lib/memberships/library"
import { NOT_SET_UP, viewerOf } from "@/lib/memberships/server"
import { MembershipsList } from "@/components/memberships/library-list"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Memberships" }

/**
 * /library/memberships: every membership this person has, from any creator
 * (lib/memberships/library.ts). Signed in only; the library layout sees to
 * that, and in the app its gate restores the session first.
 */
export default async function LibraryMembershipsPage() {
  const { user } = await currentUserForRequest()
  const viewer = viewerOf(user)
  if (!viewer) return null
  const list = await loadLibraryMemberships(createAdminClient(), viewer)
  const count = list.available ? list.current.length : 0
  return (
    <div data-page-memberships="" className="space-y-3 pb-4">
      {/* One heading on the screen: "Library" above the pills is the page's. This is the line under it. */}
      {list.available && count > 0 ? (
        <p className="text-[14px] text-[#6b7280]">
          {count} {count === 1 ? "membership" : "memberships"} · posts from creators you support
        </p>
      ) : null}
      {list.available ? (
        <MembershipsList current={list.current} ended={list.ended} />
      ) : (
        <div className={`rounded-2xl border border-[#e4e7ec]/80 bg-white px-6 py-10 text-center text-[14px] text-[#6b7280] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_3px_8px_-2px_rgba(16,24,40,0.05)]`}>{NOT_SET_UP}</div>
      )}
    </div>
  )
}
